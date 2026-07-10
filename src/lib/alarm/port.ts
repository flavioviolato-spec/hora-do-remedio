/**
 * AlarmPort — a fronteira entre o app e o sistema de alarmes do iOS.
 *
 * Duas implementações:
 *  - mock.ts: usada no Expo Go e nos testes (o módulo nativo AlarmKit
 *    não existe fora de um build nativo).
 *  - native.ts (Etapa 2): usa react-native-nitro-ios-alarm-kit / AlarmKit,
 *    que toca alarme de verdade mesmo no modo silencioso.
 */

export type AlarmAuthorization = 'authorized' | 'denied' | 'notDetermined';

export type DailyAlarmRequest = {
  medicineId: string;
  /** "HH:MM" — o alarme repete todos os dias neste horário. */
  time: string;
  /** Texto exibido no alarme, ex.: "Amoxicilina 500mg". */
  title: string;
  /** Som do bundle (id de assets/sounds) ou undefined para o padrão. */
  soundId?: string;
};

export type FixedAlarmRequest = {
  medicineId: string;
  fireDate: Date;
  title: string;
  soundId?: string;
};

export interface AlarmPort {
  /** true quando o módulo AlarmKit real está disponível (build nativo). */
  isAvailable(): boolean;
  getAuthorization(): Promise<AlarmAuthorization>;
  requestAuthorization(): Promise<AlarmAuthorization>;
  /** Agenda alarme diário recorrente; retorna o id para cancelamento. */
  scheduleDailyAlarm(req: DailyAlarmRequest): Promise<string>;
  /** Agenda alarme único em data/hora exata; retorna o id. */
  scheduleFixedAlarm(req: FixedAlarmRequest): Promise<string>;
  stopAlarm(alarmId: string): Promise<void>;
  stopAllAlarms(): Promise<void>;
}
