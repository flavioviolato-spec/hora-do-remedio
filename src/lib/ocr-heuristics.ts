/**
 * Heurística pura para escolher a linha mais provável de ser o nome do
 * remédio entre as linhas de texto reconhecidas pelo OCR (Vision, via
 * expo-text-extractor). Sem I/O — coberta em
 * __tests__/ocr-heuristics.test.ts. Ver PLANO.md, Etapa 8, para a
 * heurística completa e o limite conhecido dela (pode escolher texto
 * decorativo da marca em vez do nome real — mitigado pela edição manual).
 */

import { MAX_NAME_LENGTH } from './validation';

/** Dosagem (500mg, 10ml…), validade (dd/mm/aaaa) ou palavras de bula/lote —
 * nunca é o nome do remédio. */
const DOSAGE_OR_METADATA_RE =
  /\d+\s*(mg|ml|mcg|g)\b|\d{1,2}\/\d{1,2}\/\d{2,4}|\blote\b|\bval\.?\b|\bcomprimidos?\b|\bcápsulas?\b/i;

const ONLY_DIGITS_RE = /^\d+$/;

/** Abaixo disso raramente é um nome de verdade (ex.: "mg", "ml" soltos). */
const MIN_LENGTH = 3;

/**
 * Escolhe a primeira linha "boa" da lista (o Vision costuma devolver as
 * linhas em ordem de leitura, de cima para baixo — o nome do remédio
 * costuma ser o texto maior/mais no topo da embalagem). Descarta linhas
 * vazias, só números, curtas demais (< 3 caracteres) ou que batem com
 * padrão de dosagem/validade/lote. Corta em 80 caracteres. Devolve `null`
 * se nada sobrar — o campo "Nome do remédio" simplesmente não é
 * preenchido sozinho.
 */
export function pickBestNameCandidate(lines: string[]): string | null {
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.length < MIN_LENGTH) continue;
    if (ONLY_DIGITS_RE.test(line)) continue;
    if (DOSAGE_OR_METADATA_RE.test(line)) continue;
    return line.length > MAX_NAME_LENGTH ? line.slice(0, MAX_NAME_LENGTH) : line;
  }
  return null;
}
