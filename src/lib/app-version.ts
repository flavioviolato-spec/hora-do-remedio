/**
 * Rótulo de versão pra Ajustes. O valor real vem de
 * `process.env.EXPO_PUBLIC_APP_VERSION`, definido pelo CI a partir da tag
 * do git (ex.: "v0.5.0-teste") — só existe em builds publicadas via GitHub
 * Actions. Recebe o valor bruto como parâmetro (em vez de ler
 * process.env diretamente aqui) pra ser testável: o Jest/Metro faz
 * inlining estático de EXPO_PUBLIC_* em tempo de build, então testar
 * "o que aparece quando a env var está vazia" só funciona se essa lógica
 * for uma função pura recebendo o valor de fora.
 */
export function appVersionLabel(rawVersion: string | undefined): string {
  const trimmed = rawVersion?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Versão de desenvolvimento';
}
