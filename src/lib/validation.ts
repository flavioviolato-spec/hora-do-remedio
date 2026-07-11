/** Validação dos dados do formulário de remédio. Mensagens em português. */

import { TIME_RE, isValidDateISO } from './types';

export type MedicineFormValues = {
  name: string;
  photoUri: string | null;
  times: string[];
  startDate: string;
  durationDays: number;
  soundId: string;
  /** Para que é o remédio, ex.: "Dor". Vazio = não informado. */
  treatment: string;
};

/** Retorna a lista de problemas; vazia = tudo certo. */
export function validateMedicine(values: MedicineFormValues): string[] {
  const errors: string[] = [];

  if (values.name.trim().length === 0) {
    errors.push('Dê um nome ao remédio (como está na caixinha).');
  }
  if (values.name.trim().length > 80) {
    errors.push('O nome está longo demais (máximo 80 letras).');
  }
  if (values.times.length === 0) {
    errors.push('Adicione pelo menos um horário.');
  }
  if (values.times.some((t) => !TIME_RE.test(t))) {
    errors.push('Há um horário inválido (use 00:00 a 23:59).');
  }
  if (new Set(values.times).size !== values.times.length) {
    errors.push('Há horários repetidos — remova o duplicado.');
  }
  if (!Number.isInteger(values.durationDays) || values.durationDays < 1) {
    errors.push('A duração precisa ser de pelo menos 1 dia.');
  }
  if (values.durationDays > 365) {
    errors.push('Duração máxima: 365 dias.');
  }
  if (!isValidDateISO(values.startDate)) {
    errors.push('Data de início inválida.');
  }
  if (values.treatment.trim().length > 40) {
    errors.push('O tratamento está longo demais (máximo 40 letras).');
  }

  return errors;
}
