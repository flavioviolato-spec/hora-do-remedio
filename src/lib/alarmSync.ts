/**
 * Reconciliador de alarmes: mantém os alarmes do AlarmKit sincronizados
 * com os remédios cadastrados. Deve rodar no início do app, sempre que o
 * app volta ao primeiro plano e depois de qualquer cadastro/edição/exclusão
 * (quem chama isso é alarm-sync-context.tsx).
 *
 * Modelo (ver PLANO.md): um alarme DIÁRIO recorrente por (remédio ativo
 * hoje, horário) — nunca um por dia de tratamento (estouraria o limite do
 * sistema). A cada reconciliação: cancela tudo e reagenda do zero
 * (idempotente, sem acumular lixo). Remédio com início no futuro ganha,
 * além disso, um alarme de DATA FIXA para a 1ª dose — computeDesiredAlarms
 * só passa a incluí-lo quando ele fica ativo, e isso só acontece se o app
 * for reaberto naquele dia.
 *
 * Concorrência: `reconcileAlarms` é serializada por `AlarmPort` (fila por
 * instância, ver ARQUITETURA.md → "Concorrência no reconciliador de
 * alarmes"). Nunca roda duas reconciliações ao mesmo tempo contra o mesmo
 * alarme — duas chamadas rápidas em sequência (ex.: cadastrar 2 remédios
 * seguidos) poderiam duplicar ou perder alarme. Pedidos que chegam
 * enquanto uma reconciliação está em andamento são unificados num único
 * pedido seguinte, que roda com os dados mais recentes assim que a
 * reconciliação em curso termina.
 */

import { parseISO } from 'date-fns';

import type { AlarmPort } from './alarm/port';
import { computeDesiredAlarms, computeFutureFirstDoses, toDateISO } from './schedule';
import { doseKey, type Medicine } from './types';

/** Não reagenda se faltar menos que isto para um alarme disparar — evita
 * cancelar, mesmo que por um instante, um alarme prestes a tocar. */
const IMMINENT_WINDOW_MINUTES = 2;

export type ReconcileResult =
  | { status: 'ok'; dailyCount: number; futureCount: number }
  | { status: 'partial-failure'; dailyCount: number; futureCount: number; failedCount: number }
  | { status: 'skipped-imminent' }
  | { status: 'permission-denied' };

type Waiter = { resolve: (result: ReconcileResult) => void; reject: (error: unknown) => void };

type PortQueue = {
  running: boolean;
  pendingArgs: { medicines: Medicine[]; now: Date | undefined } | null;
  pendingWaiters: Waiter[];
  /** Chaves (ver dailyKey/fixedKey) dos alarmes que a última rodada bem
   * sucedida realmente deixou agendados no AlarmKit — usado em reconcileOnce
   * para a proteção "iminente" só travar um alarme que JÁ EXISTE de verdade,
   * nunca a primeira vez que um horário é agendado. */
  lastScheduledKeys: Set<string>;
};

const queues = new WeakMap<AlarmPort, PortQueue>();

function getQueue(port: AlarmPort): PortQueue {
  let queue = queues.get(port);
  if (!queue) {
    queue = { running: false, pendingArgs: null, pendingWaiters: [], lastScheduledKeys: new Set() };
    queues.set(port, queue);
  }
  return queue;
}

// Mesmo padrão de doseKey (types.ts) — chave estável para identificar um
// alarme específico dentro de lastScheduledKeys.
function dailyKey(medicineId: string, time: string): string {
  return `daily|${medicineId}|${time}`;
}

function fixedKey(medicineId: string, time: string, dateISO: string): string {
  return `fixed|${doseKey(medicineId, dateISO, time)}`;
}

export function reconcileAlarms(
  port: AlarmPort,
  medicines: Medicine[],
  now?: Date,
): Promise<ReconcileResult> {
  const queue = getQueue(port);
  if (queue.running) {
    // Já existe uma reconciliação em andamento: não roda em paralelo (isso
    // é o que causava alarme duplicado/perdido). Guarda só o pedido mais
    // recente — quando a que está em curso terminar, roda mais uma vez com
    // estes dados e avisa todo mundo que ficou esperando. Se `now` não foi
    // informado (uso normal em produção), o relógio só é lido quando essa
    // rodada seguinte REALMENTE começa a rodar (dentro de runQueued) — não
    // agora. Sem isso, um `now` antigo "vazaria" da fila e a proteção
    // "skipped-imminent" ficaria comparando contra um instante já passado.
    queue.pendingArgs = { medicines, now };
    return new Promise<ReconcileResult>((resolve, reject) => {
      queue.pendingWaiters.push({ resolve, reject });
    });
  }
  return runQueued(port, queue, medicines, now);
}

async function runQueued(
  port: AlarmPort,
  queue: PortQueue,
  medicines: Medicine[],
  now: Date | undefined,
): Promise<ReconcileResult> {
  queue.running = true;
  try {
    return await reconcileOnce(port, queue, medicines, now ?? new Date());
  } finally {
    queue.running = false;
    const nextArgs = queue.pendingArgs;
    const waiters = queue.pendingWaiters;
    queue.pendingArgs = null;
    queue.pendingWaiters = [];
    if (nextArgs && waiters.length > 0) {
      runQueued(port, queue, nextArgs.medicines, nextArgs.now).then(
        (result) => waiters.forEach((waiter) => waiter.resolve(result)),
        (error) => waiters.forEach((waiter) => waiter.reject(error)),
      );
    }
  }
}

async function reconcileOnce(
  port: AlarmPort,
  queue: PortQueue,
  medicines: Medicine[],
  now: Date,
): Promise<ReconcileResult> {
  const todayISO = toDateISO(now);
  const desiredDaily = computeDesiredAlarms(medicines, todayISO);
  const futureFirstDoses = computeFutureFirstDoses(medicines, todayISO);

  // Só trava por "iminente" um alarme que JÁ ESTÁ agendado de verdade (ver
  // lastScheduledKeys) — senão a 1ª vez que alguém cadastra um remédio com
  // horário próximo (ex.: testando "daqui a 3 minutos"), como não existe
  // nada para proteger ainda, a reconciliação inteira ficaria pulando pra
  // sempre e o alarme NUNCA seria criado, sem nenhum aviso na tela.
  const imminent =
    desiredDaily.some(
      (alarm) =>
        queue.lastScheduledKeys.has(dailyKey(alarm.medicineId, alarm.time)) &&
        isDailyImminent(alarm.time, now),
    ) ||
    futureFirstDoses.some(
      (dose) =>
        queue.lastScheduledKeys.has(fixedKey(dose.medicineId, dose.time, dose.dateISO)) &&
        isFixedImminent(dose.dateISO, dose.time, now),
    );
  if (imminent) {
    return { status: 'skipped-imminent' };
  }

  let authorized: boolean;
  try {
    authorized = await ensureAuthorized(port);
  } catch (error) {
    warnGeneric('verificação de permissão', error);
    return { status: 'permission-denied' };
  }
  if (!authorized) {
    return { status: 'permission-denied' };
  }

  try {
    await port.stopAllAlarms();
  } catch (error) {
    warnGeneric('stopAllAlarms', error);
    // Estado do AlarmKit agora é desconhecido (não sabemos se limpou) —
    // não fica reivindicando nenhum alarme como "existente" até a próxima
    // reconciliação bem sucedida confirmar de novo.
    queue.lastScheduledKeys = new Set();
    return {
      status: 'partial-failure',
      dailyCount: 0,
      futureCount: 0,
      // stopAllAlarms falhando é 1 falha real mesmo sem nenhum alarme
      // desejado (ex.: só restava limpar alarme de remédio já excluído) —
      // failedCount nunca fica em 0 num status de falha.
      failedCount: Math.max(1, desiredDaily.length + futureFirstDoses.length),
    };
  }

  // stopAllAlarms limpou tudo — a partir daqui, "o que está de verdade
  // agendado" é exatamente o que esta rodada conseguir criar com sucesso.
  const scheduledKeys = new Set<string>();

  let dailyOk = 0;
  let failedCount = 0;
  for (const alarm of desiredDaily) {
    try {
      await port.scheduleDailyAlarm(alarm);
      dailyOk++;
      scheduledKeys.add(dailyKey(alarm.medicineId, alarm.time));
    } catch (error) {
      failedCount++;
      warn('diário', alarm.medicineId, alarm.time, error);
    }
  }

  let futureOk = 0;
  for (const dose of futureFirstDoses) {
    try {
      await port.scheduleFixedAlarm({
        medicineId: dose.medicineId,
        title: dose.title,
        soundId: dose.soundId,
        fireDate: toFireDate(dose.dateISO, dose.time),
      });
      futureOk++;
      scheduledKeys.add(fixedKey(dose.medicineId, dose.time, dose.dateISO));
    } catch (error) {
      failedCount++;
      warn('1ª dose futura', dose.medicineId, dose.time, error);
    }
  }

  queue.lastScheduledKeys = scheduledKeys;

  if (failedCount > 0) {
    return { status: 'partial-failure', dailyCount: dailyOk, futureCount: futureOk, failedCount };
  }
  return { status: 'ok', dailyCount: dailyOk, futureCount: futureOk };
}

async function ensureAuthorized(port: AlarmPort): Promise<boolean> {
  const current = await port.getAuthorization();
  if (current === 'authorized') return true;
  return (await port.requestAuthorization()) === 'authorized';
}

/**
 * Horário diário: se já passou hoje, a próxima ocorrência real é AMANHÃ
 * (o alarme é recorrente). Sem tratar isso, um alarme "00:00" visto às
 * 23:59:30 escapava da janela de proteção — a virada da meia-noite É o
 * próprio disparo, só que a conta "hoje às 00:00" olhava para trás.
 */
function isDailyImminent(time: string, now: Date): boolean {
  const candidate = new Date(now);
  const [hour, minute] = time.split(':').map(Number);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() < now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime() - now.getTime() <= IMMINENT_WINDOW_MINUTES * 60_000;
}

/** Alarme de data fixa (1ª dose futura): a data já é exata, sem rollover. */
function isFixedImminent(dateISO: string, time: string, now: Date): boolean {
  const diffMs = toFireDate(dateISO, time).getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= IMMINENT_WINDOW_MINUTES * 60_000;
}

function toFireDate(dateISO: string, time: string): Date {
  const fireDate = parseISO(dateISO);
  const [hour, minute] = time.split(':').map(Number);
  fireDate.setHours(hour, minute, 0, 0);
  return fireDate;
}

// Logs sem nome do remédio (dado de saúde): id e horário bastam p/ depurar.
// A mensagem de erro em si vem do módulo nativo (terceiros) — truncada por
// precaução, caso ele algum dia inclua o título do alarme na própria mensagem.
function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'erro desconhecido';
  return error.message.slice(0, 120);
}

function warn(kind: string, medicineId: string, time: string, error: unknown): void {
  console.warn(
    `[alarmSync] falha ao agendar alarme ${kind} (medicineId=${medicineId}, ${time}):`,
    safeErrorMessage(error),
  );
}

function warnGeneric(step: string, error: unknown): void {
  console.warn(`[alarmSync] falha em ${step}:`, safeErrorMessage(error));
}
