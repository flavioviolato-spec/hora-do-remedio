/**
 * QA de revisão (Etapa 7 — banner de validade da instalação AltStore).
 *
 * A 1ª rodada de QA achou um defeito real: `readProvisioningInfo` lia
 * `embedded.mobileprovision` com `encoding: UTF8`. O código nativo do
 * expo-file-system (`String(contentsOfFile:encoding:.utf8)`, Swift) FALHA
 * se o arquivo inteiro não for UTF-8 válido — e `embedded.mobileprovision`
 * de verdade é um envelope binário CMS/PKCS#7 (assinatura + certificados
 * X.509 em DER) com um plist ASCII "recheado" no meio; uma simulação com
 * `TextDecoder('utf-8',{fatal:true})` (mesma regra formal do Swift) sobre
 * um buffer realista falhou 20 de 20 vezes. Ou seja: no iPhone real, a
 * leitura provavelmente sempre lançava exceção, e o banner de validade
 * nunca aparecia — silenciosamente (o catch escondia o problema).
 *
 * CORRIGIDO: agora lê como Base64 (nunca falha — é só uma representação
 * textual de bytes) e decodifica manualmente pra uma "string binária" (1
 * caractere = 1 byte) com `base64ToBinaryString`, sem depender de `atob`
 * global. Esta rodada reconfirma os casos de formatação/fronteira já
 * cobertos e prova, com um buffer binário realista de verdade (gerado com
 * `Buffer` do Node, só nos testes — o app em si não usa Buffer), que o
 * caminho corrigido funciona de ponta a ponta.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { base64ToBinaryString, daysUntil, parseExpirationDate } from '../provisioning';

describe('parseExpirationDate — variações realistas de formatação', () => {
  it('quebra de linha CRLF (\\r\\n) entre as tags: ainda extrai a data', () => {
    const raw = '<key>ExpirationDate</key>\r\n\t<date>2026-07-18T14:30:00Z</date>\r\n';
    expect(parseExpirationDate(raw)?.toISOString()).toBe('2026-07-18T14:30:00.000Z');
  });

  it('indentação com tab: extrai a data', () => {
    const raw = '\t<key>ExpirationDate</key>\n\t<date>2026-07-18T14:30:00Z</date>';
    expect(parseExpirationDate(raw)?.toISOString()).toBe('2026-07-18T14:30:00.000Z');
  });

  it('indentação com espaços: extrai a data', () => {
    const raw = '    <key>ExpirationDate</key>\n    <date>2026-07-18T14:30:00Z</date>';
    expect(parseExpirationDate(raw)?.toISOString()).toBe('2026-07-18T14:30:00.000Z');
  });

  it('acentuação e "ç" brasileiros no texto ao redor não atrapalham o regex', () => {
    const raw =
      '<key>TeamName</key><string>José Conceição Guaporé</string>\n' +
      '<key>ExpirationDate</key>\n<date>2026-07-18T14:30:00Z</date>';
    expect(parseExpirationDate(raw)?.toISOString()).toBe('2026-07-18T14:30:00.000Z');
  });

  it('tag <date></date> vazia: devolve null (não "Invalid Date" nem crash)', () => {
    expect(parseExpirationDate('<key>ExpirationDate</key><date></date>')).toBeNull();
  });

  it('chave ExpirationDate duplicada: usa a PRIMEIRA ocorrência (comportamento determinístico)', () => {
    const raw =
      '<key>ExpirationDate</key><date>2020-01-01T00:00:00Z</date>' +
      '<key>ExpirationDate</key><date>2030-01-01T00:00:00Z</date>';
    expect(parseExpirationDate(raw)?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  it('data válida sem componente de hora (só a parte da data): não quebra', () => {
    const raw = '<key>ExpirationDate</key><date>2026-07-18</date>';
    expect(parseExpirationDate(raw)?.toISOString()).toBe('2026-07-18T00:00:00.000Z');
  });
});

describe('daysUntil — fronteira exata do limiar da UI (daysRemaining <= 2)', () => {
  const now = new Date('2026-07-11T10:00:00Z');

  it('2 dias e 5 minutos no futuro: arredonda pra 3 — banner NÃO deveria aparecer', () => {
    const expiration = new Date(now.getTime() + 2 * 86_400_000 + 5 * 60_000);
    expect(daysUntil(expiration, now)).toBe(3);
  });

  it('2 dias menos 1 minuto no futuro: arredonda pra 2 — banner DEVE aparecer', () => {
    const expiration = new Date(now.getTime() + 2 * 86_400_000 - 60_000);
    expect(daysUntil(expiration, now)).toBe(2);
  });

  it('exatamente 2 dias no futuro (ao milissegundo): 2 — banner DEVE aparecer', () => {
    const expiration = new Date(now.getTime() + 2 * 86_400_000);
    expect(daysUntil(expiration, now)).toBe(2);
  });

  it('2 dias e 1 milissegundo no futuro: já vira 3 — banner NÃO deveria aparecer', () => {
    const expiration = new Date(now.getTime() + 2 * 86_400_000 + 1);
    expect(daysUntil(expiration, now)).toBe(3);
  });

  it('não depende de fuso horário/horário de verão: só da diferença absoluta em ms (UTC)', () => {
    // Mesmo instante absoluto escrito com offsets de fuso diferentes —
    // o resultado tem que ser idêntico, porque Date.getTime() é sempre UTC.
    const nowComOffset = new Date('2026-07-11T07:00:00-03:00'); // mesmo instante que 10:00 UTC
    const expiration = new Date('2026-07-13T07:00:00-03:00');
    expect(daysUntil(expiration, nowComOffset)).toBe(2);
  });
});

describe('base64ToBinaryString', () => {
  it('decodifica texto simples corretamente', () => {
    // "Ola" em base64 é "T2xh"
    expect(base64ToBinaryString('T2xh')).toBe('Ola');
  });

  it('lida com padding (1 e 2 "=" no fim)', () => {
    expect(base64ToBinaryString(Buffer.from('AB').toString('base64'))).toBe('AB');
    expect(base64ToBinaryString(Buffer.from('ABC').toString('base64'))).toBe('ABC');
    expect(base64ToBinaryString(Buffer.from('ABCD').toString('base64'))).toBe('ABCD');
  });

  it('preserva bytes binários "crus" (0-255) sem lançar erro — o caso que UTF-8 estrito quebrava', () => {
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const decoded = base64ToBinaryString(bytes.toString('base64'));
    expect(decoded.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(decoded.charCodeAt(i)).toBe(i);
    }
  });

  it('string vazia: devolve string vazia, sem lançar erro', () => {
    expect(() => base64ToBinaryString('')).not.toThrow();
    expect(base64ToBinaryString('')).toBe('');
  });
});

describe('readProvisioningInfo — qualquer falha devolve null, sem propagar erro (mock de expo-file-system)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('arquivo não existe (Android/Expo Go/TestFlight): null', async () => {
    jest.doMock('expo-file-system/legacy', () => ({
      bundleDirectory: 'file:///app-bundle/',
      getInfoAsync: jest.fn(async () => ({ exists: false, uri: '' })),
      readAsStringAsync: jest.fn(),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    const { readProvisioningInfo } = require('../provisioning');
    await expect(readProvisioningInfo()).resolves.toBeNull();
  });

  it('bundleDirectory nulo (Android/web): null, sem sequer tentar ler arquivo', async () => {
    const getInfoAsync = jest.fn();
    jest.doMock('expo-file-system/legacy', () => ({
      bundleDirectory: null,
      getInfoAsync,
      readAsStringAsync: jest.fn(),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    const { readProvisioningInfo } = require('../provisioning');
    await expect(readProvisioningInfo()).resolves.toBeNull();
    expect(getInfoAsync).not.toHaveBeenCalled();
  });

  it('getInfoAsync lança erro (ex.: permissão/timeout do sistema de arquivos): null, não propaga', async () => {
    jest.doMock('expo-file-system/legacy', () => ({
      bundleDirectory: 'file:///app-bundle/',
      getInfoAsync: jest.fn(async () => {
        throw new Error('permission denied (simulado)');
      }),
      readAsStringAsync: jest.fn(),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    const { readProvisioningInfo } = require('../provisioning');
    await expect(readProvisioningInfo()).resolves.toBeNull();
  });

  it('readAsStringAsync lança erro (qualquer falha de I/O): null, não propaga', async () => {
    jest.doMock('expo-file-system/legacy', () => ({
      bundleDirectory: 'file:///app-bundle/',
      getInfoAsync: jest.fn(async () => ({ exists: true, uri: '' })),
      readAsStringAsync: jest.fn(async () => {
        throw new Error('erro de leitura simulado');
      }),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    const { readProvisioningInfo } = require('../provisioning');
    await expect(readProvisioningInfo()).resolves.toBeNull();
  });

  it('CORRIGIDO: lê via Base64 e decodifica corretamente um mobileprovision REALISTA (plist ASCII cercado de bytes binários 0-255 simulando o envelope CMS/PKCS#7) — o caso exato que quebrava com UTF-8 estrito', async () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>AppIDName</key>
\t<string>Hora do Remédio</string>
\t<key>ExpirationDate</key>
\t<date>2026-07-18T10:00:00Z</date>
\t<key>TeamName</key>
\t<string>Equipe Teste</string>
</dict>
</plist>`;
    // Envelope binário "de verdade": bytes 0-255 antes e depois do plist,
    // igual à simulação que provou o defeito original na 1ª rodada de QA.
    const header = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256));
    const trailer = Buffer.from(Array.from({ length: 500 }, (_, i) => (i * 7) % 256));
    const fullProfile = Buffer.concat([header, Buffer.from(plist, 'ascii'), trailer]);
    const base64 = fullProfile.toString('base64');

    jest.doMock('expo-file-system/legacy', () => ({
      bundleDirectory: 'file:///app-bundle/',
      getInfoAsync: jest.fn(async () => ({ exists: true, uri: '' })),
      readAsStringAsync: jest.fn(async () => base64),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    const { readProvisioningInfo } = require('../provisioning');
    const now = new Date('2026-07-11T10:00:00Z');
    const result = await readProvisioningInfo(now);

    expect(result).not.toBeNull();
    expect(result?.expirationDate.toISOString()).toBe('2026-07-18T10:00:00.000Z');
    expect(result?.daysRemaining).toBe(7);
  });

  it('parse falha (plist sem ExpirationDate): null, mesmo com leitura de arquivo OK', async () => {
    const base64 = Buffer.from(
      '<plist><dict><key>TeamName</key><string>X</string></dict></plist>',
      'ascii',
    ).toString('base64');
    jest.doMock('expo-file-system/legacy', () => ({
      bundleDirectory: 'file:///app-bundle/',
      getInfoAsync: jest.fn(async () => ({ exists: true, uri: '' })),
      readAsStringAsync: jest.fn(async () => base64),
      EncodingType: { UTF8: 'utf8', Base64: 'base64' },
    }));
    const { readProvisioningInfo } = require('../provisioning');
    await expect(readProvisioningInfo()).resolves.toBeNull();
  });
});
