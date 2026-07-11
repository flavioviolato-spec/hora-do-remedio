import { isValid, parseISO } from 'date-fns';

/** Horário "HH:MM" com faixa real: hora 00–23, minuto 00–59. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Formato "YYYY-MM-DD" (só o formato; use isValidDateISO p/ datas reais). */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true só para datas que existem de verdade (rejeita 30/02, mês 13 etc.). */
export function isValidDateISO(value: string): boolean {
  return DATE_RE.test(value) && isValid(parseISO(value));
}

export const DEFAULT_SOUND_ID = 'classico';

/** Um remédio cadastrado pelo usuário. */
export type Medicine = {
  id: string;
  /** Nome como está na caixinha, ex.: "Amoxicilina 500mg". */
  name: string;
  /** Foto da caixinha (arquivo local do app) ou null se não tirou foto. */
  photoUri: string | null;
  /** Horários das doses no formato "HH:MM", ordenados. */
  times: string[];
  /** Primeiro dia do tratamento, formato "YYYY-MM-DD" (data local). */
  startDate: string;
  /** Quantos dias o tratamento dura (mínimo 1). */
  durationDays: number;
  /** Som do alarme (id de assets/sounds). */
  soundId: string;
  /** Para que é o remédio, ex.: "Dor", "Náusea e vômito", "Antibiótico". Opcional. */
  treatment?: string;
  /** false = pausado pelo usuário; não gera alarmes nem doses. */
  active: boolean;
  createdAt: string;
};

/** Registro de uma dose marcada como tomada. */
export type DoseRecord = {
  medicineId: string;
  /** Dia da dose, "YYYY-MM-DD". */
  dateISO: string;
  /** Horário da dose, "HH:MM". */
  time: string;
  /** Momento em que o usuário marcou como tomada (ISO completo). */
  takenAt: string;
};

/** Identifica uma dose única no dia: `${medicineId}|${dateISO}|${time}`. */
export function doseKey(medicineId: string, dateISO: string, time: string): string {
  return `${medicineId}|${dateISO}|${time}`;
}
