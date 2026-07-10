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
