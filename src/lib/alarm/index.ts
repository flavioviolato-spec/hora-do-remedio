/**
 * Ponto único de acesso ao AlarmPort.
 *
 * Hoje sempre devolve o mock (Expo Go). Na Etapa 2, quando o módulo
 * nativo AlarmKit entrar no build, este arquivo passa a detectá-lo e
 * escolher o adapter real — o resto do app não muda.
 */

import { MockAlarmAdapter } from './mock';
import type { AlarmPort } from './port';

const instance: AlarmPort = new MockAlarmAdapter();

export function getAlarmPort(): AlarmPort {
  return instance;
}

export type { AlarmPort } from './port';
