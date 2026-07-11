/**
 * Ponto único de acesso ao AlarmPort.
 *
 * Em build nativo (iOS 26+): adapter real com AlarmKit — alarme toca
 * mesmo no silencioso. No Expo Go / testes: mock que só registra.
 */

import { MockAlarmAdapter } from './mock';
import { createNativeAlarmAdapter } from './native';
import type { AlarmPort } from './port';

let instance: AlarmPort | null = null;

export function getAlarmPort(): AlarmPort {
  if (instance === null) {
    instance = createNativeAlarmAdapter() ?? new MockAlarmAdapter();
  }
  return instance;
}

export type { AlarmPort } from './port';
