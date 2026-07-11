import { describe, expect, it } from '@jest/globals';

import { daysUntil, parseExpirationDate } from '../provisioning';

describe('parseExpirationDate', () => {
  it('extrai a data de dentro de um plist real de provisioning profile', () => {
    const raw = `bogus binary junk \x00\x01\x02
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>AppIDName</key>
	<string>Hora do Remédio</string>
	<key>ExpirationDate</key>
	<date>2026-07-18T14:30:00Z</date>
	<key>TeamName</key>
	<string>Equipe Teste</string>
</dict>
</plist>
more binary junk \x03\x04`;
    const date = parseExpirationDate(raw);
    expect(date).not.toBeNull();
    expect(date?.toISOString()).toBe('2026-07-18T14:30:00.000Z');
  });

  it('conteúdo sem a tag ExpirationDate: devolve null (não inventa data)', () => {
    expect(parseExpirationDate('<plist><dict><key>TeamName</key><string>X</string></dict></plist>')).toBeNull();
  });

  it('data malformada dentro da tag: devolve null em vez de Date inválida', () => {
    const raw = '<key>ExpirationDate</key>\n<date>não é uma data</date>';
    expect(parseExpirationDate(raw)).toBeNull();
  });

  it('string vazia ou lixo binário puro: devolve null sem lançar erro', () => {
    expect(() => parseExpirationDate('')).not.toThrow();
    expect(parseExpirationDate('')).toBeNull();
    expect(parseExpirationDate('\x00\x01\x02\x03binário sem plist nenhum')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('exatamente 7 dias no futuro: 7', () => {
    const now = new Date('2026-07-11T10:00:00Z');
    const expiration = new Date('2026-07-18T10:00:00Z');
    expect(daysUntil(expiration, now)).toBe(7);
  });

  it('menos de 1 dia no futuro (hoje mais tarde): arredonda pra cima, ainda 1', () => {
    const now = new Date('2026-07-11T10:00:00Z');
    const expiration = new Date('2026-07-11T23:00:00Z');
    expect(daysUntil(expiration, now)).toBe(1);
  });

  it('já expirou (data no passado): número negativo, não zero nem erro', () => {
    const now = new Date('2026-07-20T10:00:00Z');
    const expiration = new Date('2026-07-18T10:00:00Z');
    expect(daysUntil(expiration, now)).toBeLessThan(0);
  });

  it('expira no exato instante "agora": 0', () => {
    const now = new Date('2026-07-11T10:00:00Z');
    expect(daysUntil(now, now)).toBe(0);
  });
});
