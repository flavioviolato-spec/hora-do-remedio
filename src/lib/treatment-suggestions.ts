/**
 * Sugestão automática do campo "Tratamento" a partir do nome do remédio.
 * Módulo puro, sem I/O, 100% offline — coberto em
 * __tests__/treatment-suggestions.test.ts.
 *
 * Duas fontes, nesta ordem de prioridade:
 *  1. Memória do próprio usuário (nome normalizado → tratamento), gravada
 *     toda vez que ele salva um remédio com tratamento preenchido — o que
 *     ELE escreveu vale mais que qualquer lista genérica.
 *  2. Lista curada de substâncias comuns (fallback), procurada DENTRO do
 *     nome (pega "cloridrato de ciprofloxacino", "dipirona sódica"…).
 *
 * É sempre SUGESTÃO: quem chama só preenche o campo se ele estiver vazio,
 * e o usuário pode apagar/editar à vontade — nada trava.
 */

import { normalize } from './text';

/** Teto de segurança da memória de tratamentos — evita crescimento sem
 * fim da loja. Não é LRU de verdade: ao estourar, descarta a entrada mais
 * antiga na ordem de inserção de `Object.keys()`. */
export const TREATMENT_MEMORY_LIMIT = 200;

/** Chave: substância (normalizada, sem acento) procurada DENTRO do nome;
 * valor: tratamento sugerido. Lista revisada — NÃO adicionar itens sem
 * nova revisão da correção médica das associações. */
const CURATED: Array<[string, string]> = [
  ['dipirona', 'Dor e febre'],
  ['paracetamol', 'Dor e febre'],
  ['ibuprofeno', 'Dor e inflamação'],
  ['nimesulida', 'Anti-inflamatório'],
  ['diclofenaco', 'Anti-inflamatório'],
  ['amoxicilina', 'Antibiótico'],
  ['azitromicina', 'Antibiótico'],
  ['cefalexina', 'Antibiótico'],
  ['ciprofloxacino', 'Antibiótico'],
  ['ciclobenzaprina', 'Relaxante muscular'],
  ['omeprazol', 'Estômago (azia/gastrite)'],
  ['pantoprazol', 'Estômago (azia/gastrite)'],
  ['losartana', 'Pressão alta'],
  ['enalapril', 'Pressão alta'],
  ['hidroclorotiazida', 'Pressão alta'],
  ['sinvastatina', 'Colesterol'],
  ['atorvastatina', 'Colesterol'],
  ['metformina', 'Diabetes'],
  ['loratadina', 'Alergia'],
  ['dexclorfeniramina', 'Alergia'],
  ['ondansetrona', 'Náusea e vômito'],
  ['dimenidrinato', 'Náusea e enjoo'],
  ['oleo mineral', 'Intestino preso'],
];

/**
 * Sugere um tratamento para o remédio `name`, ou `null` se não houver
 * sugestão. A memória do usuário (match exato do nome normalizado) tem
 * prioridade sobre a lista curada (match por "contém").
 */
export function suggestTreatment(
  name: string,
  memory: Record<string, string>,
): string | null {
  const normalized = normalize(name).trim();
  if (normalized === '') return null;

  // hasOwnProperty em vez de acesso direto: chave herdada de
  // Object.prototype (ex.: nome "constructor") nunca vira sugestão.
  if (Object.prototype.hasOwnProperty.call(memory, normalized)) {
    const remembered = memory[normalized];
    if (typeof remembered === 'string' && remembered.trim() !== '') {
      return remembered;
    }
  }

  for (const [substance, treatment] of CURATED) {
    if (normalized.includes(substance)) return treatment;
  }
  return null;
}

/**
 * Devolve um NOVO Record com a associação `nome normalizado → tratamento`
 * gravada (o original nunca é mutado). Tratamento vazio (após trim) não
 * grava nada — memória volta inalterada. Acima de TREATMENT_MEMORY_LIMIT
 * entradas, descarta a primeira chave de `Object.keys()` (teto de
 * segurança, não LRU de verdade).
 */
export function rememberTreatment(
  memory: Record<string, string>,
  name: string,
  treatment: string,
): Record<string, string> {
  const key = normalize(name).trim();
  const value = treatment.trim();
  if (key === '' || value === '') return memory;

  const next: Record<string, string> = { ...memory, [key]: value };
  const keys = Object.keys(next);
  if (keys.length > TREATMENT_MEMORY_LIMIT) {
    // Nunca descarta a chave recém-gravada (chaves "numéricas" como "500"
    // vêm primeiro em Object.keys() mesmo sendo as mais novas).
    const oldest = keys.find((k) => k !== key);
    if (oldest !== undefined) delete next[oldest];
  }
  return next;
}
