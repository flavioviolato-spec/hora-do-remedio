/** Validação dos dados do formulário de remédio. Mensagens em português. */

import { TIME_RE, isValidDateISO } from './types';

/** Limite do campo "Nome do remédio" — usado também pelo `TextInput` do
 * formulário e pela heurística de OCR (ocr-heuristics.ts), pra nunca
 * sugerir/aceitar um nome maior do que o formulário permite. */
export const MAX_NAME_LENGTH = 80;

export type MedicineFormValues = {
  name: string;
  photoUri: string | null;
  times: string[];
  startDate: string;
  durationDays: number;
  soundId: string;
  /** Para que é o remédio, ex.: "Dor". Vazio = não informado. */
  treatment: string;
  /** Comprimidos na caixa. null = usuário não quer controlar estoque. */
  stockCount: number | null;
};

/** Retorna a lista de problemas; vazia = tudo certo. */
export function validateMedicine(values: MedicineFormValues): string[] {
  const errors: string[] = [];

  if (values.name.trim().length === 0) {
    errors.push('Dê um nome ao remédio (como está na caixinha).');
  }
  if (values.name.trim().length > MAX_NAME_LENGTH) {
    errors.push(`O nome está longo demais (máximo ${MAX_NAME_LENGTH} letras).`);
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
  // Estoque é opcional (null = não controla); quando informado, precisa ser
  // um inteiro plausível pra uma caixa de remédio.
  if (
    values.stockCount !== null &&
    (!Number.isInteger(values.stockCount) || values.stockCount < 0 || values.stockCount > 999)
  ) {
    errors.push('Quantidade de comprimidos inválida (use um número inteiro de 0 a 999).');
  }

  return errors;
}
