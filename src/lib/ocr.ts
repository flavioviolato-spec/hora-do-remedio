/**
 * Único ponto de acesso ao motor de OCR (Vision, via expo-text-extractor).
 * OCR é um extra — uma falha aqui nunca pode impedir o cadastro do
 * remédio, então esta função NUNCA rejeita: qualquer erro (módulo nativo
 * ausente no Expo Go/jest, `isSupported` falso, foto ilegível, o próprio
 * `extractTextFromImage` rejeitando) vira um array vazio.
 */

type TextExtractorModule = typeof import('expo-text-extractor');

/** Lê o texto impresso na foto e devolve as linhas reconhecidas (pode vir
 * vazio — silenciosamente, sem indicar erro a quem chamou). */
export async function recognizeText(photoUri: string): Promise<string[]> {
  let mod: TextExtractorModule;
  try {
    // require dinâmico: no Expo Go e nos testes jest o módulo nativo não
    // existe, e isto lança — mesmo padrão de alarm/native.ts. Silencioso de
    // propósito: é o dia a dia de quem desenvolve no Expo Go, não um erro.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-text-extractor');
  } catch {
    return [];
  }
  if (!mod.isSupported) return [];
  try {
    const lines = await mod.extractTextFromImage(photoUri);
    return Array.isArray(lines) ? lines : [];
  } catch (error) {
    // Só a mensagem genérica: o texto reconhecido e a foto são dado de
    // saúde e não devem ir a log (mesmo padrão de storage.ts/provisioning.ts).
    console.warn(
      '[ocr] falha ao ler o texto da foto:',
      error instanceof Error ? error.message : 'erro desconhecido',
    );
    return [];
  }
}
