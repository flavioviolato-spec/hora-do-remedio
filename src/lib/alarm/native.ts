/**
 * Adapter real do AlarmPort usando AlarmKit (iOS 26+), via
 * react-native-nitro-ios-alarm-kit. Só funciona em build nativo;
 * no Expo Go o require falha e o app cai no mock (ver index.ts).
 */

import { soundFileNameFor } from '../sounds';
import type {
  AlarmAuthorization,
  AlarmPort,
  DailyAlarmRequest,
  FixedAlarmRequest,
} from './port';

/** Verde da marca — cor do alarme em tela cheia/Dynamic Island. */
const TINT_COLOR = '#175A41';

const STOP_BUTTON = { text: 'Tomei', textColor: '#FFFFFF', icon: 'checkmark.circle.fill' };
const SNOOZE_BUTTON = { text: 'Adiar', textColor: '#FFFFFF', icon: 'repeat.circle.fill' };
/** Adiar = 10 minutos (remédio não pode esperar os 2h de um Foco, por ex.). */
const SNOOZE_SECONDS = 600;

const ALL_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Dynamic Island trunca títulos longos; 24 dá para "Amoxicilina 500mg". */
function shortTitle(title: string): string {
  return title.length <= 24 ? title : `${title.slice(0, 23)}…`;
}

type AlarmKitModule = typeof import('react-native-nitro-ios-alarm-kit');

class NativeAlarmAdapter implements AlarmPort {
  private lastAuthorization: AlarmAuthorization = 'notDetermined';

  constructor(private readonly mod: AlarmKitModule) {}

  isAvailable(): boolean {
    return true;
  }

  async getAuthorization(): Promise<AlarmAuthorization> {
    // AlarmKit não expõe consulta sem prompt; devolvemos o último resultado
    // conhecido (o prompt só aparece de fato na primeira requestAuthorization).
    return this.lastAuthorization;
  }

  async requestAuthorization(): Promise<AlarmAuthorization> {
    const granted = await this.mod.requestAlarmPermission();
    this.lastAuthorization = granted ? 'authorized' : 'denied';
    return this.lastAuthorization;
  }

  async scheduleDailyAlarm(req: DailyAlarmRequest): Promise<string> {
    const [hour, minute] = req.time.split(':').map(Number);
    const alarmId = await this.mod.scheduleRelativeAlarm(
      shortTitle(req.title),
      STOP_BUTTON,
      TINT_COLOR,
      hour,
      minute,
      ALL_WEEKDAYS as never,
      SNOOZE_BUTTON,
      { postAlert: SNOOZE_SECONDS },
      soundFileNameFor(req.soundId),
    );
    if (!alarmId) {
      throw new Error(`AlarmKit não agendou o alarme diário de ${req.time}.`);
    }
    return alarmId;
  }

  async scheduleFixedAlarm(req: FixedAlarmRequest): Promise<string> {
    const alarmId = await this.mod.scheduleFixedAlarm(
      shortTitle(req.title),
      STOP_BUTTON,
      TINT_COLOR,
      SNOOZE_BUTTON,
      Math.round(req.fireDate.getTime() / 1000),
      { postAlert: SNOOZE_SECONDS },
      soundFileNameFor(req.soundId),
    );
    if (!alarmId) {
      throw new Error('AlarmKit não agendou o alarme de data fixa.');
    }
    return alarmId;
  }

  async stopAlarm(alarmId: string): Promise<void> {
    await this.mod.stopAlarm(alarmId);
  }

  async stopAllAlarms(): Promise<void> {
    await this.mod.stopAllAlarms();
  }
}

/**
 * Tenta criar o adapter real. Retorna null quando o módulo nativo não existe
 * (Expo Go) ou o AlarmKit não está disponível (iOS < 26, Android).
 */
export function createNativeAlarmAdapter(): AlarmPort | null {
  try {
    // require dinâmico: no Expo Go o módulo nativo não existe e isto lança.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: AlarmKitModule = require('react-native-nitro-ios-alarm-kit');
    if (!mod.isAvailable()) return null;
    return new NativeAlarmAdapter(mod);
  } catch {
    return null;
  }
}
