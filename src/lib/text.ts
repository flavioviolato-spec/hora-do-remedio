export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Minúsculas + sem acento, pra comparar textos sem depender de como foram
 * escritos/lidos ("Biosintética" ≈ "biosintetica", "Dipirona Sódica" ≈
 * "dipirona sodica"). NFD separa "é" em "e" + acento combinante; a faixa
 * U+0300–U+036F remove só os acentos, preservando a letra base.
 * Usada pela heurística de OCR e pela sugestão de tratamento.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Mensagem segura de um erro desconhecido \u2014 para logs SEM dado pessoal
 * (regra do projeto: log nunca cont\u00e9m nome de rem\u00e9dio, tratamento,
 * conte\u00fado de backup/relat\u00f3rio; s\u00f3 a mensagem t\u00e9cnica do erro).
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
