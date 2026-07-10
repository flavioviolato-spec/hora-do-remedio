/**
 * Adapter falso do AlarmPort para Expo Go e testes.
 * Não toca nada — só registra em memória o que teria sido agendado,
 * para a UI e o reconciliador serem desenvolvidos sem build nativo.
 */

import type {
  AlarmAuthorization,
  AlarmPort,
  DailyAlarmRequest,
  FixedAlarmRequest,
} from './port';

export type MockScheduledAlarm = {
  id: string;
  kind: 'daily' | 'fixed';
  medicineId: string;
  title: string;
  time?: string;
  fireDate?: Date;
  soundId?: string;
};

export class MockAlarmAdapter implements AlarmPort {
  scheduled: MockScheduledAlarm[] = [];
  private nextId = 1;
  private authorization: AlarmAuthorization = 'authorized';

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
    const id = `mock-${this.nextId++}`;
    this.scheduled.push({ id, kind: 'daily', ...req });
    console.log(`[alarme simulado] diário ${req.time} — ${req.title} (${id})`);
    return id;
  }

  async scheduleFixedAlarm(req: FixedAlarmRequest): Promise<string> {
    const id = `mock-${this.nextId++}`;
    this.scheduled.push({ id, kind: 'fixed', ...req });
    console.log(`[alarme simulado] fixo ${req.fireDate.toISOString()} — ${req.title} (${id})`);
    return id;
  }

  async stopAlarm(alarmId: string): Promise<void> {
    this.scheduled = this.scheduled.filter((a) => a.id !== alarmId);
  }

  async stopAllAlarms(): Promise<void> {
    this.scheduled = [];
  }
}
