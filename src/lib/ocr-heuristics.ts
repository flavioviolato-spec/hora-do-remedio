/**
 * Heurística pura para escolher a linha mais provável de ser o nome do
 * remédio entre as linhas de texto reconhecidas pelo OCR (Vision, via
 * expo-text-extractor). Sem I/O — coberta em
 * __tests__/ocr-heuristics.test.ts. Ver PLANO.md, Etapa 8, para o limite
 * conhecido dela (pode escolher texto decorativo da marca em vez do nome
 * real — mitigado pela edição manual).
 *
 * Ajustada em 11/07/2026 após teste no aparelho com embalagens reais de
 * genéricos (sem registrar aqui quais — dado de saúde não vai a código):
 *  1. Nome composto quebrado em várias linhas pelo OCR (padrão comum em
 *     genéricos: "cloridrato de" + "<substância>", "óleo" + "mineral") —
 *     agora linhas vizinhas que continuam o nome são juntadas.
 *  2. Nome do laboratório impresso no topo da caixa (Eurofarma,
 *     Biosintética…) vinha antes do nome do remédio e era escolhido —
 *     agora há uma lista de laboratórios conhecidos para pular, além de
 *     filtros para os textos padrões de embalagem ("Medicamento
 *     Genérico", "Lei nº 9.787", "Venda sob prescrição médica"…).
 */

import { normalize } from './text';
import { MAX_NAME_LENGTH } from './validation';

/** Laboratórios comuns no Brasil — aparecem no topo da caixa, ANTES do
 * nome do remédio, e não são o nome de remédio nenhum. Comparação por
 * igualdade da linha inteira normalizada (não por "contém", pra não
 * descartar um nome de remédio que por coincidência contenha um trecho).
 * A lista passa por normalize() pra ninguém precisar lembrar de tirar
 * acento/maiúscula ao adicionar um laboratório novo. */
const KNOWN_LABS = new Set(
  [
    'eurofarma',
    'biosintetica',
    'medley',
    'ems',
    'ems pharma',
    'neo quimica',
    'germed',
    'ache',
    'cimed',
    'teuto',
    'uniao quimica',
    'prati-donaduzzi',
    'prati donaduzzi',
    'sandoz',
    'novartis',
    'bayer',
    'pfizer',
    'sanofi',
    'gsk',
    'glaxosmithkline',
    'astrazeneca',
    'legrand',
    'natulab',
    'hipolabor',
    'geolab',
    'vitamedic',
    'belfar',
    'farmoquimica',
    'nova quimica',
    'torrent',
    'zydus',
    'biolab',
    'libbs',
    'hebron',
    'catarinense',
    'supera',
    'mantecorp',
    'abbott',
    'takeda',
    'merck',
    'nycomed',
    'eurofarma laboratorios',
  ].map(normalize),
);

/** Dosagem (500mg, 10ml…), validade (dd/mm/aaaa) e os textos padrões de
 * embalagem brasileira — nunca são o nome do remédio. Testado sobre o
 * texto normalizado (minúsculas, sem acento). */
const DOSAGE_OR_METADATA_RE =
  /\d+\s*(mg|ml|mcg|g)\b|\d{1,2}\/\d{1,2}\/\d{2,4}|\blote\b|\bval\.?\b|comprimid|capsul|generico|^medicamento\b|\blei\b|venda sob|prescricao|retencao|receita|uso (oral|adulto|pediatrico|externo|topico|retal|nasal|injetavel|veterinario)|via oral|\bcontem\b|farmaceutic|resp\.? ?tec|laborator|\bltda\b|\bs\.a\b|\bs\/a\b/;

const ONLY_DIGITS_RE = /^\d+$/;

/** Abaixo disso raramente é um nome de verdade (ex.: "mg", "ml", "G" soltos). */
const MIN_LENGTH = 3;

/** Total máximo de linhas no nome juntado (a primeira + até 2 continuações). */
const MAX_JOINED_LINES = 3;

function isGoodLine(line: string): boolean {
  if (line.length < MIN_LENGTH) return false;
  if (ONLY_DIGITS_RE.test(line)) return false;
  const normalized = normalize(line);
  if (DOSAGE_OR_METADATA_RE.test(normalized)) return false;
  if (KNOWN_LABS.has(normalized)) return false;
  return true;
}

/** A linha seguinte continua o nome? Sim quando a atual termina em
 * preposição ("cloridrato de" → "ciprofloxacino") ou quando a próxima
 * começa com letra minúscula ("óleo" → "mineral" — nos genéricos o nome
 * é impresso em minúsculas; um texto novo/independente começa maiúsculo). */
function continuesName(candidate: string, next: string): boolean {
  if (/(^|\s)(de|da|do)$/i.test(candidate)) return true;
  return /^\p{Ll}/u.test(next);
}

/**
 * Escolhe a primeira linha "boa" da lista (o Vision costuma devolver as
 * linhas em ordem de leitura, de cima para baixo — o nome do remédio
 * costuma ser o texto maior/mais no topo da embalagem, logo depois do
 * laboratório, que é pulado). Junta linhas vizinhas que continuam o nome
 * (nomes compostos quebrados pelo OCR). Corta em MAX_NAME_LENGTH.
 * Devolve `null` se nada sobrar — o campo "Nome do remédio" simplesmente
 * não é preenchido sozinho.
 */
export function pickBestNameCandidate(lines: string[]): string | null {
  const trimmed = lines.map((line) => line.trim());
  for (let i = 0; i < trimmed.length; i++) {
    if (!isGoodLine(trimmed[i])) continue;
    let candidate = trimmed[i];
    let joined = 1;
    for (let j = i + 1; j < trimmed.length && joined < MAX_JOINED_LINES; j++) {
      const next = trimmed[j];
      if (!isGoodLine(next)) break;
      if (!continuesName(candidate, next)) break;
      candidate = `${candidate} ${next}`;
      joined++;
    }
    return candidate.length > MAX_NAME_LENGTH
      ? candidate.slice(0, MAX_NAME_LENGTH).trimEnd()
      : candidate;
  }
  return null;
}
