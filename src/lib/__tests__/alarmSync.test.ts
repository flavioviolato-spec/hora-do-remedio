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

type FakeScheduled =
  | { kind: 'daily'; medicineId: string; time: string }
  | { kind: 'fixed'; medicineId: string; fireDate: Date };

/** Fake com controle total (permissão, falhas simuladas) — o mock real
 * (alarm/mock.ts) é exercitado à parte, para garantir que a integração
 * com o adapter que roda de verdade no Expo Go também funciona. */
class FakeAlarmPort implements AlarmPort {
  scheduled: FakeScheduled[] = [];
  stopAllCalls = 0;
  requestCalls = 0;
  authorization: AlarmAuthorization = 'authorized';
  failDailyFor = new Set<string>();

  isAvailable(): boolean {
    return false;
  }
  async getAuthorization(): Promise<AlarmAuthorization> {
    return this.authorization;
  }
  async requestAuthorization(): Promise<AlarmAuthorization> {
    this.requestCalls++;
    return this.authorization;
  }
  async scheduleDailyAlarm(req: DailyAlarmRequest): Promise<string> {
    if (this.failDailyFor.has(req.medicineId)) throw new Error('falha simulada');
    this.scheduled.push({ kind: 'daily', medicineId: req.medicineId, time: req.time });
    return `daily-${this.scheduled.length}`;
  }
  async scheduleFixedAlarm(req: FixedAlarmRequest): Promise<string> {
    this.scheduled.push({ kind: 'fixed', medicineId: req.medicineId, fireDate: req.fireDate });
    return `fixed-${this.scheduled.length}`;
  }
  async stopAlarm(alarmId: string): Promise<void> {
    this.scheduled = this.scheduled.filter((a) => `${a.kind}-${a.medicineId}` !== alarmId);
  }
  async stopAllAlarms(): Promise<void> {
    this.stopAllCalls++;
    this.scheduled = [];
  }
}

const NOW = new Date('2026-07-10T10:00:00');

describe('reconcileAlarms', () => {
  it('agenda um alarme diário por (remédio ativo hoje, horário) e limpa tudo antes', async () => {
    const port = new FakeAlarmPort();
    const med = makeMedicine();
    const result = await reconcileAlarms(port, [med], NOW);

    expect(result).toEqual({ status: 'ok', dailyCount: 2, futureCount: 0 });
    expect(port.stopAllCalls).toBe(1);
    expect(port.scheduled).toEqual([
      { kind: 'daily', medicineId: 'med-1', time: '08:00' },
      { kind: 'daily', medicineId: 'med-1', time: '20:00' },
    ]);
  });

  it('ignora remédio pausado ou fora do período de tratamento', async () => {
    const port = new FakeAlarmPort();
    const pausado = makeMedicine({ id: 'pausado', active: false });
    const encerrado = makeMedicine({ id: 'encerrado', startDate: '2026-06-01', durationDays: 2 });
    const result = await reconcileAlarms(port, [pausado, encerrado], NOW);

    expect(result).toEqual({ status: 'ok', dailyCount: 0, futureCount: 0 });
    expect(port.scheduled).toEqual([]);
  });

  it('remédio com início no futuro ganha alarme FIXO para a 1ª dose, não diário', async () => {
    const port = new FakeAlarmPort();
    const futuro = makeMedicine({ startDate: '2026-08-01', times: ['09:00'] });
    const result = await reconcileAlarms(port, [futuro], NOW);

    expect(result).toEqual({ status: 'ok', dailyCount: 0, futureCount: 1 });
    expect(port.scheduled).toEqual([
      { kind: 'fixed', medicineId: 'med-1', fireDate: new Date('2026-08-01T09:00:00') },
    ]);
  });

  it('pula a reconciliação inteira quando falta 2 minutos ou menos para um alarme de hoje', async () => {
    const port = new FakeAlarmPort();
    const iminente = makeMedicine({ times: ['10:02'] }); // 2 min de diferença, no limite
    const result = await reconcileAlarms(port, [iminente], NOW);

    expect(result).toEqual({ status: 'skipped-imminent' });
    expect(port.stopAllCalls).toBe(0);
    expect(port.scheduled).toEqual([]);
  });

  it('não pula quando o alarme de hoje já passou ou está a mais de 2 minutos', async () => {
    const port = new FakeAlarmPort();
    const passou = makeMedicine({ times: ['09:59'] }); // 1 min atrás
    const distante = makeMedicine({ id: 'med-2', times: ['10:03'] }); // 3 min à frente
    const result = await reconcileAlarms(port, [passou, distante], NOW);

    expect(result.status).toBe('ok');
    expect(port.scheduled).toHaveLength(2);
  });

  it('permissão negada: pede autorização e não agenda nem cancela nada', async () => {
    const port = new FakeAlarmPort();
    port.authorization = 'denied';
    const result = await reconcileAlarms(port, [makeMedicine()], NOW);

    expect(result).toEqual({ status: 'permission-denied' });
    expect(port.requestCalls).toBe(1);
    expect(port.stopAllCalls).toBe(0);
    expect(port.scheduled).toEqual([]);
  });

  it('já autorizado: não pede permissão de novo', async () => {
    const port = new FakeAlarmPort();
    port.authorization = 'authorized';
    await reconcileAlarms(port, [makeMedicine()], NOW);

    expect(port.requestCalls).toBe(0);
  });

  it('resiliente: falha ao agendar um remédio não impede os outros, e o resultado avisa a falha', async () => {
    const port = new FakeAlarmPort();
    const falha = makeMedicine({ id: 'falha', times: ['08:00'] });
    const ok = makeMedicine({ id: 'ok', times: ['08:00'] });
    port.failDailyFor.add('falha');

    const result = await reconcileAlarms(port, [falha, ok], NOW);

    // dailyCount conta só os que realmente foram agendados (não os desejados) —
    // status 'partial-failure' avisa a UI de que nem tudo funcionou.
    expect(result).toEqual({
      status: 'partial-failure',
      dailyCount: 1,
      futureCount: 0,
      failedCount: 1,
    });
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'ok', time: '08:00' }]);
  });

  it('integração com o adapter mock real (Expo Go/testes)', async () => {
    const port = new MockAlarmAdapter();
    const result = await reconcileAlarms(port, [makeMedicine({ times: ['08:00'] })], NOW);

    expect(result).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    expect(port.scheduled).toHaveLength(1);
    expect(port.scheduled[0].kind).toBe('daily');
  });
});
