/**
 * Validade da instalação via AltStore (assinatura gratuita, expira em 7
 * dias). O iOS grava a data de validade dentro de `embedded.mobileprovision`,
 * no bundle do próprio app — é um arquivo binário assinado (CMS/PKCS7), mas
 * o "recheio" (um plist comum) é texto ASCII simples dentro dele, então dá
 * pra ler o arquivo como texto e procurar a tag `ExpirationDate` direto,
 * sem precisar decodificar a assinatura. Técnica padrão para isso (não é
 * gambiarra nossa) — se o formato mudar ou o arquivo não existir (Expo Go,
 * Android, TestFlight/App Store — que usam outro mecanismo de validade),
 * a leitura simplesmente devolve `null` e a Home não mostra nenhum aviso.
 *
 * Lemos como BASE64, não como texto UTF-8 direto: o arquivo tem bytes
 * binários de verdade (assinatura, certificados) ao redor do plist, e
 * `readAsStringAsync` com UTF-8 lança erro se o arquivo INTEIRO não for
 * UTF-8 válido — o que essa mistura de binário quase sempre não é (achado
 * de QA, com simulação da mesma regra de decodificação usada pelo iOS).
 * Base64 nunca falha; decodificamos manualmente byte a byte (sem depender
 * de `atob` global, que pode não existir neste motor JS) preservando cada
 * byte como 1 caractere — o bastante pra regex achar o trecho ASCII do plist.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { errorMessage } from './text';

export type ProvisioningInfo = {
  expirationDate: Date;
  /** Dias até expirar, arredondado pra cima (0 = expira ainda hoje). */
  daysRemaining: number;
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodifica base64 pra uma "string binária" (1 caractere = 1 byte, 0-255). */
export function base64ToBinaryString(base64: string): string {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let output = '';
  // Cada grupo de 4 caracteres base64 (6 bits cada = 24 bits) vira 3 bytes de 8 bits.
  for (let i = 0; i < clean.length; i += 4) {
    const bits = clean
      .slice(i, i + 4)
      .split('')
      .map((char) => BASE64_CHARS.indexOf(char));
    output += String.fromCharCode((bits[0] << 2) | (bits[1] >> 4)); // byte 1: 6 bits do 1º char + 2 bits do 2º
    if (bits.length > 2) output += String.fromCharCode(((bits[1] << 4) | (bits[2] >> 2)) & 0xff); // byte 2
    if (bits.length > 3) output += String.fromCharCode(((bits[2] << 6) | bits[3]) & 0xff); // byte 3
  }
  return output;
}

/** Extrai a data de validade do conteúdo bruto do embedded.mobileprovision. */
export function parseExpirationDate(rawProfile: string): Date | null {
  const match = rawProfile.match(/<key>ExpirationDate<\/key>\s*<date>([^<]+)<\/date>/);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Dias até `expirationDate`, arredondado pra cima; negativo se já passou. */
export function daysUntil(expirationDate: Date, now: Date): number {
  const diffMs = expirationDate.getTime() - now.getTime();
  return Math.ceil(diffMs / 86_400_000);
}

export async function readProvisioningInfo(now: Date = new Date()): Promise<ProvisioningInfo | null> {
  try {
    if (!FileSystem.bundleDirectory) return null;
    const profilePath = `${FileSystem.bundleDirectory}embedded.mobileprovision`;
    const info = await FileSystem.getInfoAsync(profilePath);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(profilePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const raw = base64ToBinaryString(base64);
    const expirationDate = parseExpirationDate(raw);
    if (!expirationDate) return null;
    return { expirationDate, daysRemaining: daysUntil(expirationDate, now) };
  } catch (error) {
    console.warn(
      '[provisioning] falha ao ler validade da instalação:',
      errorMessage(error),
    );
    return null;
  }
}
