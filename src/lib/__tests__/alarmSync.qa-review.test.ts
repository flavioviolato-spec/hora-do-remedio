/**
 * QA independente (2ª rodada, ceticismo total) sobre a fila por-AlarmPort de
 * alarmSync.ts (reconcileAlarms/runQueued com WeakMap<AlarmPort, PortQueue>).
 * Ataca ângulos novos, além dos 4 defeitos originais (ver alarmSync.edge-cases.test.ts):
 *
 *  1. 3+ chamadas empilhadas enquanto uma reconciliação está em andamento.
 *  2. reconcileOnce lançando uma exceção não tratada (bug futuro simulado).
 *  3. DEFEITO 5 (achado e corrigido nesta rodada): o parâmetro `now` era
 *     capturado na hora em que reconcileAlarms() era CHAMADO, não na hora em
 *     que a reconciliação de fato RODAVA — uma chamada que ficava na fila
 *     atrás de uma reconciliação lenta rodava mais tarde com um `now`
 *     desatualizado, esvaziando a proteção "skipped-imminent" bem na hora em
 *     que ela seria mais necessária. Corrigido: `now` só é lido de verdade
 *     (`now ?? new Date()`) dentro de `runQueued`, no instante em que a
 *     rodada realmente começa.
 */

import { describe, expect, it, jest } from '@jest/globals';

import type {
  AlarmAuthorization,
  AlarmPort,
  DailyAlarmRequest,
  FixedAlarmRequest,
} from '../alarm/port';
import { reconcileAlarms, type ReconcileResult } from '../alarmSync';
import * as scheduleModule from '../schedule';
import type { Medicine } from '../types';

/** Corre `promise` contra um timeout curto e limpa o timer nos dois casos
 * (evita "worker process has failed to exit gracefully" por timer solto). */
function raceWithTimeout(promise: Promise<ReconcileResult>): Promise<ReconcileResult | 'TIMEOUT'> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<'TIMEOUT'>((resolve) => {
    timer = setTimeout(() => resolve('TIMEOUT'), 500);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Remédio Teste 500mg',
    photoUri: null,
    times: ['08:00'],
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * Port controlável: cada chamada de scheduleDailyAlarm tem um índice
 * (1, 2, 3, ...). Índices em `blockedIndices` ficam presos até alguém
 * chamar `release(indice)`; os demais resolvem na hora.
 */
function createControllablePort() {
  const scheduled: { medicineId: string; time: string }[] = [];
  let stopAllCalls = 0;
  let callCount = 0;
  const gates = new Map<number, () => void>();
  const startedSignals = new Map<number, () => void>();
  const started = new Map<number, Promise<void>>();

  function armStarted(index: number) {
    let resolveFn!: () => void;
    const p = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });
    started.set(index, p);
    startedSignals.set(index, resolveFn);
  }
  armStarted(1);
  armStarted(2);
  armStarted(3);
  armStarted(4);

  const blockedIndices = new Set<number>();

  const port: AlarmPort = {
    isAvailable: () => false,
    getAuthorization: async (): Promise<AlarmAuthorization> => 'authorized',
    requestAuthorization: async (): Promise<AlarmAuthorization> => 'authorized',
    scheduleDailyAlarm: async (req: DailyAlarmRequest) => {
      callCount++;
      const myIndex = callCount;
      startedSignals.get(myIndex)?.();
      if (blockedIndices.has(myIndex)) {
        await new Promise<void>((resolve) => {
          gates.set(myIndex, resolve);
        });
      }
      scheduled.push({ medicineId: req.medicineId, time: req.time });
      return `daily-${scheduled.length}`;
    },
    scheduleFixedAlarm: async () => 'fixed-1',
    stopAlarm: async () => {},
    stopAllAlarms: async () => {
      stopAllCalls++;
      scheduled.length = 0;
    },
  };

  return {
    port,
    scheduled,
    getStopAllCalls: () => stopAllCalls,
    blockCall: (index: number) => blockedIndices.add(index),
    waitStarted: (index: number) => started.get(index)!,
    release: (index: number) => gates.get(index)?.(),
  };
}

describe('QA independente — 3+ chamadas empilhadas na fila (não só 2)', () => {
  it('B, C e D chegam enquanto A está rodando: todas resolvem juntas com o resultado da rodada unificada (dados de D, o último)', async () => {
    const { port, scheduled, blockCall, waitStarted, release } = createControllablePort();
    blockCall(1); // só a 1ª chamada de scheduleDailyAlarm (dentro da rodada de A) fica presa
    const now = new Date('2026-07-10T06:00:00');

    const medA = makeMedicine({ id: 'a', times: ['08:00'] });
    const medB = makeMedicine({ id: 'b', times: ['09:00'] });
    const medC = makeMedicine({ id: 'c', times: ['10:00'] });
    const medD = makeMedicine({ id: 'd', times: ['11:00'] });

    const pA = reconcileAlarms(port, [medA], now);
    await waitStarted(1); // A já entrou em scheduleDailyAlarm e está presa

    // B, C e D chegam em sequência rápida, todas com A ainda rodando.
    const pB = reconcileAlarms(port, [medA, medB], now);
    const pC = reconcileAlarms(port, [medA, medB, medC], now);
    const pD = reconcileAlarms(port, [medA, medB, medC, medD], now);

    release(1);
    const [rA, rB, rC, rD] = await Promise.all([pA, pB, pC, pD]);

    // A termina com o resultado da SUA própria rodada (só "a").
    expect(rA).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });

    // B, C, D NÃO rodam cada uma a sua própria reconciliação: são
    // mescladas numa ÚNICA rodada seguinte, que usa os dados mais
    // recentes (os de D, a última a chegar antes da rodada seguinte
    // começar). As três devem receber o MESMO resultado.
    expect(rB).toEqual(rC);
    expect(rC).toEqual(rD);
    expect(rD).toEqual({ status: 'ok', dailyCount: 4, futureCount: 0 });

    const keys = scheduled.map((s) => `${s.medicineId}@${s.time}`).sort();
    expect(keys).toEqual(['a@08:00', 'b@09:00', 'c@10:00', 'd@11:00']); // nada duplicado, nada sumiu
  });

  it('depois do estresse de 3+ chamadas, a fila NÃO trava: uma nova chamada logo em seguida funciona normalmente', async () => {
    const { port, blockCall, waitStarted, release, getStopAllCalls } = createControllablePort();
    blockCall(1);
    const now = new Date('2026-07-10T06:00:00');
    const med = makeMedicine({ id: 'a' });

    const pA = reconcileAlarms(port, [med], now);
    await waitStarted(1);
    const pB = reconcileAlarms(port, [med], now);
    const pC = reconcileAlarms(port, [med], now);
    release(1);
    await Promise.all([pA, pB, pC]);

    const stopAllBefore = getStopAllCalls();
    const rNext = await reconcileAlarms(port, [], now);
    expect(rNext).toEqual({ status: 'ok', dailyCount: 0, futureCount: 0 });
    expect(getStopAllCalls()).toBe(stopAllBefore + 1); // rodou de verdade, não travou
  });
});

describe('QA independente — reconcileOnce lança exceção não tratada (bug futuro simulado)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exceção na chamada INICIANTE (não enfileirada): a promessa rejeita, e a fila continua utilizável depois', async () => {
    const port = new (class implements AlarmPort {
      isAvailable() {
        return false;
      }
      async getAuthorization(): Promise<AlarmAuthorization> {
        return 'authorized';
      }
      async requestAuthorization(): Promise<AlarmAuthorization> {
        return 'authorized';
      }
      async scheduleDailyAlarm(): Promise<string> {
        return 'x';
      }
      async scheduleFixedAlarm(): Promise<string> {
        return 'x';
      }
      async stopAlarm(): Promise<void> {}
      async stopAllAlarms(): Promise<void> {}
    })();

    const spy = jest
      .spyOn(scheduleModule, 'computeDesiredAlarms')
      .mockImplementationOnce(() => {
        throw new Error('bug simulado: computeDesiredAlarms explodiu');
      });

    const med = makeMedicine();
    await expect(reconcileAlarms(port, [med], new Date('2026-07-10T06:00:00'))).rejects.toThrow(
      'bug simulado: computeDesiredAlarms explodiu',
    );

    spy.mockRestore();

    // Se `queue.running` tivesse ficado travado em `true`, esta chamada
    // ficaria PRESA (nunca resolveria) — usamos um timeout curto via
    // Promise.race para provar que ela resolve de verdade.
    const result = await raceWithTimeout(reconcileAlarms(port, [med], new Date('2026-07-10T06:00:00')));
    expect(result).not.toBe('TIMEOUT');
    expect(result).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
  });

  it('exceção na rodada ENFILEIRADA (a que roda automaticamente após a 1ª terminar): os waiters são REJEITADOS, e a fila continua utilizável depois', async () => {
    const { port, blockCall, waitStarted, release } = createControllablePort();
    blockCall(1);
    const now = new Date('2026-07-10T06:00:00');
    const medA = makeMedicine({ id: 'a' });
    const medB = makeMedicine({ id: 'b' });

    const pA = reconcileAlarms(port, [medA], now);
    await waitStarted(1);

    // A rodada de B só vai rodar DEPOIS que A liberar — configuramos o
    // spy para funcionar normalmente na 1ª chamada (dentro da rodada de A,
    // que já está em andamento) e explodir na 2ª chamada real a
    // computeDesiredAlarms, que só acontece quando a rodada de B começa.
    const real = scheduleModule.computeDesiredAlarms;
    let callNum = 0;
    const spy = jest
      .spyOn(scheduleModule, 'computeDesiredAlarms')
      .mockImplementation((...args) => {
        callNum++;
        // A já chamou computeDesiredAlarms de verdade ANTES do spy ser
        // instalado (a chamada é síncrona, dentro de reconcileOnce, antes
        // de qualquer await) — então a 1ª chamada que o spy realmente vê é
        // a da rodada enfileirada de B, disparada de dentro do `finally`
        // quando A libera.
        if (callNum === 1) {
          throw new Error('bug simulado: explode na rodada enfileirada');
        }
        return real(...args);
      });

    const pB = reconcileAlarms(port, [medA, medB], now);
    release(1);

    await expect(pA).resolves.toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    await expect(pB).rejects.toThrow('bug simulado: explode na rodada enfileirada');

    spy.mockRestore();

    // Fila não pode ter ficado travada por causa da exceção.
    const result = await raceWithTimeout(reconcileAlarms(port, [medA, medB], now));
    expect(result).not.toBe('TIMEOUT');
    expect(result).toEqual({ status: 'ok', dailyCount: 2, futureCount: 0 });
  });
});

describe('QA independente (corrigido) — "now" é lido de novo quando a rodada enfileirada REALMENTE roda', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('B NÃO passa `now` explícito (exatamente como alarm-sync-context.tsx faz) e fica presa na fila atrás de A; quando a rodada de B roda de fato — minutos reais depois —, ela lê o relógio NAQUELE instante, não no instante em que foi chamada — "skipped-imminent" continua protegendo mesmo depois de esperar na fila', async () => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date('2026-07-10T06:00:00'));

    const { port, blockCall, waitStarted, release, scheduled } = createControllablePort();
    blockCall(1); // prende a rodada de A dentro de scheduleDailyAlarm

    const medA = makeMedicine({ id: 'a', times: ['01:00'] }); // horário irrelevante p/ A
    // B tem alarme às 06:05. Às 06:00 (agora), isso está a 5 min de
    // distância — fora da janela de 2 min, corretamente "não iminente"
    // no instante em que a chamada é feita.
    const medB = makeMedicine({ id: 'b', times: ['06:05'] });

    const pA = reconcileAlarms(port, [medA]); // sem `now` — igual à produção: usa `new Date()` = 06:00 (fake)
    await waitStarted(1); // A já está presa dentro de scheduleDailyAlarm

    const pB = reconcileAlarms(port, [medA, medB]); // enfileira; `now` só será lido quando a rodada rodar de fato

    // Enquanto B espera na fila (A continua presa), o relógio real
    // avança 4 minutos — ex.: a rodada de A demorou porque tinha muitos
    // remédios com chamadas nativas lentas.
    jest.setSystemTime(new Date('2026-07-10T06:04:00'));

    release(1); // só agora A termina, e a rodada de B roda de fato — às 06:04 "reais"
    const [rA, rB] = await Promise.all([pA, pB]);
    expect(rA).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });

    // Corrigido: a rodada de B lê o relógio no instante em que REALMENTE
    // roda (06:04), não no instante em que foi chamada (06:00). Às 06:04,
    // "b@06:05" está a 1 min de disparar — dentro da janela de proteção —
    // e a reconciliação inteira é pulada (nada é cancelado/reagendado).
    expect(rB).toEqual({ status: 'skipped-imminent' });
    expect(scheduled.some((s) => s.medicineId === 'b')).toBe(false);
  });
});

describe('QA independente (confirmação final) — cadeia de 3+ rodadas (não só líder + 1 mesclada): a 3ª rodada também lê o relógio no PRÓPRIO instante em que começa, não no instante em que foi enfileirada nem herdado de rodadas anteriores', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('A (líder) → B (1ª mesclada) → D (2ª mesclada, formada enquanto B ainda rodava): a rodada de D só fica "skipped-imminent" por causa do horário real em que ELA começa (bem mais tarde), não por causa do horário em que foi enfileirada (bem antes, quando nem seria iminente)', async () => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date('2026-07-10T06:00:00'));

    const { port, blockCall, waitStarted, release, scheduled } = createControllablePort();
    blockCall(1); // prende a rodada de A (líder)
    blockCall(2); // prende a rodada de B (1ª mesclada)

    const medA = makeMedicine({ id: 'a', times: ['01:00'] }); // horário irrelevante
    const medB = makeMedicine({ id: 'b', times: ['02:00'] }); // horário irrelevante
    const medC = makeMedicine({ id: 'c', times: ['03:00'] }); // será descartado (C é sobrescrita por D antes de rodar)
    // medE às 06:10: às 06:03 (quando C e D são enfileiradas) está a 7 min
    // de distância — bem fora da janela de 2 min. Só fica "iminente" perto
    // das 06:08.
    const medE = makeMedicine({ id: 'e', times: ['06:10'] });

    const pA = reconcileAlarms(port, [medA]); // líder, sem `now` — igual à produção
    await waitStarted(1); // A presa dentro de scheduleDailyAlarm

    jest.setSystemTime(new Date('2026-07-10T06:01:00'));
    const pB = reconcileAlarms(port, [medA, medB]); // forma a rodada mesclada seguinte (ainda sem rodar)

    release(1); // A termina; a rodada de B começa a rodar de verdade agora (06:01)
    await waitStarted(2); // B já entrou em scheduleDailyAlarm e está presa

    // Enquanto B roda (presa), chegam MAIS DUAS chamadas — formam a 3ª
    // rodada (mesclada em cima da mesclada). C é sobrescrita por D antes
    // de qualquer uma delas rodar (só D importa, igual ao teste de 3+
    // chamadas acima) — mas isso é enfileiramento, não execução: nenhum
    // relógio é lido aqui, só os dados ficam guardados.
    jest.setSystemTime(new Date('2026-07-10T06:02:00'));
    const pC = reconcileAlarms(port, [medA, medB, medC]);
    jest.setSystemTime(new Date('2026-07-10T06:03:00'));
    const pD = reconcileAlarms(port, [medA, medB, medE]);

    // B continua presa por MAIS 5 minutos "reais" (ex.: chamada nativa
    // lenta) antes de ser liberada — só então a rodada de D (3ª rodada)
    // de fato começa a rodar.
    jest.setSystemTime(new Date('2026-07-10T06:08:30'));
    release(2); // B termina; a rodada de D começa a rodar agora (06:08:30)

    const [rA, rB, rC, rD] = await Promise.all([pA, pB, pC, pD]);

    expect(rA).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    expect(rB).toEqual({ status: 'ok', dailyCount: 2, futureCount: 0 });

    // C e D são mescladas na mesma 3ª rodada (mesmo resultado para as duas).
    expect(rC).toEqual(rD);

    // Se a 3ª rodada tivesse herdado ou "vazado" um `now` de qualquer
    // instante anterior (06:01, 06:02 ou 06:03 — todos > 2 min de
    // distância de 06:10), ela teria seguido em frente e agendado "e".
    // Como ela lê o relógio de verdade só ao começar a rodar (06:08:30,
    // a 1,5 min de "e@06:10" — dentro da janela de 2 min), o resultado
    // correto é "skipped-imminent", sem tocar em nenhum alarme.
    expect(rD).toEqual({ status: 'skipped-imminent' });
    expect(scheduled.some((s) => s.medicineId === 'e')).toBe(false);
    expect(scheduled.some((s) => s.medicineId === 'c')).toBe(false); // C nem chegou a rodar sozinha (foi sobrescrita por D)
  });
});

describe('QA independente (corrigido) — stopAllAlarms falha sem NENHUM remédio cadastrado', () => {
  it('lista de remédios vazia + stopAllAlarms falha: status "partial-failure" com failedCount 1 (nunca 0 num status de falha)', async () => {
    const port: AlarmPort = {
      isAvailable: () => false,
      getAuthorization: async (): Promise<AlarmAuthorization> => 'authorized',
      requestAuthorization: async (): Promise<AlarmAuthorization> => 'authorized',
      scheduleDailyAlarm: async () => 'x',
      scheduleFixedAlarm: async () => 'x',
      stopAlarm: async () => {},
      stopAllAlarms: async () => {
        throw new Error('falha simulada ao limpar alarmes antigos');
      },
    };

    const result = await reconcileAlarms(port, [], new Date('2026-07-10T06:00:00'));

    // Não é mais "ok" enganoso (o defeito original), e failedCount nunca
    // fica em 0 quando o status é "partial-failure" — mesmo sem nenhum
    // alarme desejado, falhar ao LIMPAR alarmes antigos (ex.: de um
    // remédio recém-excluído) conta como 1 falha real.
    expect(result).toEqual({
      status: 'partial-failure',
      dailyCount: 0,
      futureCount: 0,
      failedCount: 1,
    });
  });
});
