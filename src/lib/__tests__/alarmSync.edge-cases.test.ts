/**
 * Casos-limite adicionais do reconciliador (alarmSync), escritos em QA
 * independente da Etapa 4 (achou 4 defeitos reais, provados aqui) e depois
 * atualizados para provar as correções — ver ARQUITETURA.md → "Concorrência
 * no reconciliador de alarmes" para a decisão do Defeito 3 (fila por
 * AlarmPort dentro do próprio reconcileAlarms, não mutex no React context).
 */

import { describe, expect, it } from '@jest/globals';

import { MockAlarmAdapter } from '../alarm/mock';
import type {
  AlarmAuthorization,
  AlarmPort,
  DailyAlarmRequest,
  FixedAlarmRequest,
} from '../alarm/port';
import { reconcileAlarms } from '../alarmSync';
import type { Medicine } from '../types';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Remédio Teste 500mg',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

class FakeAlarmPort implements AlarmPort {
  scheduled: { kind: 'daily' | 'fixed'; medicineId: string; time?: string }[] = [];
  stopAllCalls = 0;
  authorization: AlarmAuthorization = 'authorized';
  failAllDaily = false;
  failAllFixed = false;

  isAvailable(): boolean {
    return false;
  }
  async getAuthorization(): Promise<AlarmAuthorization> {
    return this.authorization;
  }
  async requestAuthorization(): Promise<AlarmAuthorization> {
    return this.authorization;
  }
  async scheduleDailyAlarm(req: DailyAlarmRequest): Promise<string> {
    if (this.failAllDaily) throw new Error('AlarmKit indisponível (simulado)');
    this.scheduled.push({ kind: 'daily', medicineId: req.medicineId, time: req.time });
    return `daily-${this.scheduled.length}`;
  }
  async scheduleFixedAlarm(req: FixedAlarmRequest): Promise<string> {
    if (this.failAllFixed) throw new Error('AlarmKit indisponível (simulado)');
    this.scheduled.push({ kind: 'fixed', medicineId: req.medicineId });
    return `fixed-${this.scheduled.length}`;
  }
  async stopAlarm(): Promise<void> {}
  async stopAllAlarms(): Promise<void> {
    this.stopAllCalls++;
    this.scheduled = [];
  }
}

describe('DEFEITO 1 (corrigido) — isImminent trata a virada de meia-noite (alarme diário)', () => {
  it('now=23:59:30 e alarme diário JÁ AGENDADO às "00:00": dispara em 30s (amanhã) — skipped-imminent (não cancela o que já existe)', async () => {
    const port = new FakeAlarmPort();
    const med = makeMedicine({ times: ['00:00'] });

    // 1ª reconciliação, de manhã: "00:00" está a ~12h de distância — agenda
    // normalmente (a proteção só existe para o que JÁ está agendado).
    const first = await reconcileAlarms(port, [med], new Date('2026-07-10T12:00:00'));
    expect(first).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    expect(port.stopAllCalls).toBe(1);

    // 2ª reconciliação, perto da virada: o MESMO alarme já agendado dispara
    // em 30s (virada para amanhã) — a reconciliação é pulada, como já
    // acontecia para "10:02" visto às 10:00.
    const now = new Date('2026-07-10T23:59:30');
    const result = await reconcileAlarms(port, [med], now);

    expect(result).toEqual({ status: 'skipped-imminent' });
    expect(port.stopAllCalls).toBe(1); // não mexeu de novo
  });

  it('sanity check: now=00:00:30 e alarme "23:59" (do dia anterior) — não é iminente, correto', async () => {
    const port = new FakeAlarmPort();
    const med = makeMedicine({ times: ['23:59'] });
    const now = new Date('2026-07-11T00:00:30');

    const result = await reconcileAlarms(port, [med], now);

    // Este caso já funciona corretamente hoje: "23:59" de HOJE ainda está a
    // quase 24h de distância (não é o mesmo disparo que já passou ontem).
    expect(result.status).toBe('ok');
  });
});

describe('DEFEITO 4 (corrigido) — janela "imminent" também protege alarme de DATA FIXA (1ª dose futura)', () => {
  it('remédio começa amanhã às 00:00 e a 1ª dose JÁ está agendada; now=hoje 23:59:30 (30s para disparar) — skipped-imminent (não cancela o que já existe)', async () => {
    const port = new FakeAlarmPort();
    const med = makeMedicine({ startDate: '2026-07-11', times: ['00:00'] });

    // 1ª reconciliação, de manhã: a 1ª dose futura está a quase 1 dia de
    // distância — agenda normalmente.
    const first = await reconcileAlarms(port, [med], new Date('2026-07-10T12:00:00'));
    expect(first).toEqual({ status: 'ok', dailyCount: 0, futureCount: 1 });
    expect(port.stopAllCalls).toBe(1);

    // 2ª reconciliação, perto da hora: a MESMA dose já agendada dispara em 30s.
    const now = new Date('2026-07-10T23:59:30');
    const result = await reconcileAlarms(port, [med], now);

    expect(result).toEqual({ status: 'skipped-imminent' });
    expect(port.stopAllCalls).toBe(1); // não mexeu de novo
  });
});

describe('DEFEITO 2 (corrigido) — falha de agendamento não é mais reportada como sucesso pleno', () => {
  it('todos os alarmes diários falham ao agendar: status vira "partial-failure", contagens refletem a realidade (0)', async () => {
    const port = new FakeAlarmPort();
    port.failAllDaily = true;
    const a = makeMedicine({ id: 'a', times: ['08:00'] });
    const b = makeMedicine({ id: 'b', times: ['09:00'] });

    const result = await reconcileAlarms(port, [a, b], new Date('2026-07-10T06:00:00'));

    expect(port.scheduled).toEqual([]); // realidade: nenhum alarme existe
    expect(result).toEqual({
      status: 'partial-failure',
      dailyCount: 0,
      futureCount: 0,
      failedCount: 2,
    });
  });

  it('falha parcial (1 de 2): status também vira "partial-failure", com a contagem real de sucesso', async () => {
    const port = new FakeAlarmPort();
    const a = makeMedicine({ id: 'a', times: ['08:00'] });
    const b = makeMedicine({ id: 'b', times: ['09:00'] });
    const originalSchedule = port.scheduleDailyAlarm.bind(port);
    port.scheduleDailyAlarm = (req) => {
      if (req.medicineId === 'a') throw new Error('falha simulada só para "a"');
      return originalSchedule(req);
    };

    const result = await reconcileAlarms(port, [a, b], new Date('2026-07-10T06:00:00'));

    expect(result).toEqual({
      status: 'partial-failure',
      dailyCount: 1,
      futureCount: 0,
      failedCount: 1,
    });
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'b', time: '09:00' }]);
  });
});

describe('DEFEITO 3 (corrigido) — reconciliações sobrepostas não duplicam nem perdem alarme (fila por AlarmPort)', () => {
  /** A PRIMEIRA chamada de scheduleDailyAlarm feita através deste port fica
   * presa até `release()`; sinaliza via `started` assim que entra em espera.
   * Serve para provar, sem depender de timers reais, que a 2ª chamada de
   * reconcileAlarms NÃO roda ao mesmo tempo que a 1ª — ela fica na fila
   * (ver alarmSync.ts) até a 1ª terminar, e só então roda com a lista mais
   * recente. */
  function createGatedPort() {
    const scheduled: { medicineId: string; time: string }[] = [];
    let stopAllCalls = 0;
    let callCount = 0;
    let releaseGate: (() => void) | null = null;
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });

    const port: AlarmPort = {
      isAvailable: () => false,
      getAuthorization: async (): Promise<AlarmAuthorization> => 'authorized',
      requestAuthorization: async (): Promise<AlarmAuthorization> => 'authorized',
      scheduleDailyAlarm: async (req: DailyAlarmRequest) => {
        callCount++;
        if (callCount === 1) {
          resolveStarted();
          await new Promise<void>((resolve) => {
            releaseGate = resolve;
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
      started,
      getStopAllCalls: () => stopAllCalls,
      release: () => releaseGate?.(),
    };
  }

  it('edição rápida em sequência (cadastra "a", depois "b" antes da 1ª reconciliação terminar): a 2ª espera a 1ª e roda de novo com a lista atual — sem duplicar nem perder alarme', async () => {
    const { port, scheduled, started, release } = createGatedPort();
    const now = new Date('2026-07-10T06:00:00');
    const medA = makeMedicine({ id: 'a', times: ['08:00'] });
    const medB = makeMedicine({ id: 'b', times: ['09:00'] });

    // reconcile #1 nasce da lista [a] (medicamento recém-cadastrado) e fica
    // presa agendando "a" (já passou por stopAllAlarms()).
    const p1 = reconcileAlarms(port, [medA], now);
    await started;

    // usuário já cadastrou "b" antes de #1 terminar: reconcile #2 nasce da
    // lista [a, b], mas ENFILEIRA — não roda em paralelo com #1. Sem
    // release(), #2 nunca terminaria sozinha; por isso liberamos #1 antes
    // de esperar as duas (não dá deadlock).
    const p2 = reconcileAlarms(port, [medA, medB], now);
    release();
    const [r1, r2] = await Promise.all([p1, p2]);

    // #1 termina com o resultado da SUA própria passada (só "a").
    expect(r1).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    // #2 não roda junto com #1: espera #1 acabar e então reconcilia de novo
    // com os dados mais recentes — resultado reflete "a" e "b".
    expect(r2).toEqual({ status: 'ok', dailyCount: 2, futureCount: 0 });

    const keys = scheduled.map((s) => `${s.medicineId}@${s.time}`);
    expect(new Set(keys).size).toBe(keys.length); // sem alarme duplicado
    expect(keys.slice().sort()).toEqual(['a@08:00', 'b@09:00']); // nada sumiu
  });
});

describe('regressão positiva: múltiplos remédios no MESMO horário não se atropelam quando tudo dá certo', () => {
  it('3 remédios diferentes às 08:00 geram 3 alarmes diários distintos', async () => {
    const port = new MockAlarmAdapter();
    const meds = ['x', 'y', 'z'].map((id) => makeMedicine({ id, times: ['08:00'] }));

    const result = await reconcileAlarms(port, meds, new Date('2026-07-10T06:00:00'));

    expect(result).toEqual({ status: 'ok', dailyCount: 3, futureCount: 0 });
    expect(port.scheduled).toHaveLength(3);
    expect(port.scheduled.map((s) => s.medicineId).sort()).toEqual(['x', 'y', 'z']);
  });
});

describe('regressão positiva: acentuação e ç preservados em alarme de 1ª dose futura (data fixa)', () => {
  it('título com acentuação chega intacto ao scheduleFixedAlarm', async () => {
    const port = new MockAlarmAdapter();
    const med = makeMedicine({
      name: 'Conceição — Guaporé 500mg (não gaseificado)',
      startDate: '2026-08-01',
      times: ['09:00'],
    });

    await reconcileAlarms(port, [med], new Date('2026-07-10T06:00:00'));

    expect(port.scheduled[0].title).toBe('Conceição — Guaporé 500mg (não gaseificado)');
  });
});
