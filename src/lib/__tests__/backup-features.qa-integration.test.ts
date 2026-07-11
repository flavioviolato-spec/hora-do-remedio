/**
 * QA de INTEGRAÇÃO entre as três features novas (funções puras):
 *
 *  1. Backup roundtrip COMPLETO com as features novas — Store com
 *     `treatment`, `stockCount` e `treatmentMemory` preenchida sobrevive a
 *     serializeBackup → parseBackup byte a byte (inclusive acentuação/ç).
 *  2. Retrocompatibilidade — backup gerado ANTES das features (sem
 *     treatmentMemory, remédios sem treatment/stockCount) restaura sem
 *     perder nenhum remédio.
 *  3. Sugestão de tratamento a partir da memória RESTAURADA de um backup
 *     (parseBackup → suggestTreatment).
 *  4. Relatório de adesão filtra por remédio mesmo com o doseLog completo
 *     (dois remédios com doses no MESMO dia não se contaminam).
 *
 * Dados 100% fictícios (LGPD): nomes de remédio inventados, sem pessoas.
 */
import { describe, expect, it, jest } from '@jest/globals';

// backup.ts importa módulos nativos no topo — mocks mínimos só pro import
// não quebrar (as funções puras testadas aqui não os usam).
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(async () => {}),
}));

import { parseBackup, serializeBackup } from '../backup';
import { buildAdherenceReport } from '../report';
import type { Store } from '../storage';
import { suggestTreatment } from '../treatment-suggestions';
import type { DoseRecord, Medicine } from '../types';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-ficticio-1',
    name: 'Remédio Fictício 500mg',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-09',
    durationDays: 5,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-09T08:00:00.000Z',
    ...overrides,
  };
}

function makeDose(
  medicineId: string,
  dateISO: string,
  time: string,
): DoseRecord {
  return { medicineId, dateISO, time, takenAt: `${dateISO}T12:00:00.000Z` };
}

describe('Cruzamento 1: backup roundtrip com as três features novas', () => {
  // Store exercitando TUDO que as features novas gravam, com acentuação,
  // ç e travessão (dados brasileiros de verdade quebram roundtrips ruins).
  const fullStore: Store = {
    version: 1,
    medicines: [
      makeMedicine({
        id: 'med-acentuado-1',
        name: 'Xarope São João — Infusão de Guaporé',
        treatment: 'Náusea e vômito',
        stockCount: 12,
      }),
      // stockCount 0 é valor extremo E falsy: roundtrip não pode perdê-lo.
      makeMedicine({
        id: 'med-estoque-zero',
        name: 'Comprimido Conceição 10mg',
        treatment: 'Coração',
        stockCount: 0,
      }),
      // Remédio SEM as features novas convivendo no mesmo backup.
      makeMedicine({ id: 'med-sem-extras', name: 'Genérico Simples 5mg' }),
    ],
    doseLog: [
      makeDose('med-acentuado-1', '2026-07-09', '08:00'),
      makeDose('med-estoque-zero', '2026-07-09', '20:00'),
    ],
    treatmentMemory: {
      'xarope sao joao — infusao de guapore': 'Náusea e vômito',
      'comprimido conceicao 10mg': 'Coração',
    },
  };

  it('serializeBackup → parseBackup preserva treatment, stockCount e treatmentMemory byte a byte', () => {
    const parsed = parseBackup(serializeBackup(fullStore));
    expect(parsed).not.toBeNull();
    // Byte a byte: a serialização JSON do Store restaurado é IDÊNTICA à do
    // original (mesmos valores, mesma ordem de chaves, acentos intactos).
    expect(JSON.stringify(parsed!.store)).toBe(JSON.stringify(fullStore));
    expect(parsed!.medicineCount).toBe(3);
    expect(parsed!.doseCount).toBe(2);

    // Conferência explícita dos campos das features novas (não confiar só
    // no deep-equal): stockCount 0 não virou undefined, acentos intactos.
    const [med1, med2, med3] = parsed!.store.medicines;
    expect(med1.treatment).toBe('Náusea e vômito');
    expect(med1.stockCount).toBe(12);
    expect(med2.stockCount).toBe(0);
    expect(med3.treatment).toBeUndefined();
    expect('stockCount' in med3).toBe(false);
    expect(parsed!.store.treatmentMemory['comprimido conceicao 10mg']).toBe('Coração');
  });

  it('retrocompat: backup ANTIGO (sem treatmentMemory, remédios sem treatment/stockCount) restaura sem perder remédios', () => {
    // Reproduz o formato exato que o app gravava ANTES das features:
    // envelope presente, mas o Store não tem a chave treatmentMemory e os
    // remédios não têm treatment nem stockCount.
    const legacyEnvelope = JSON.stringify({
      app: 'hora-do-remedio',
      exportedAt: '2026-01-15T10:00:00.000Z',
      store: {
        version: 1,
        medicines: [
          makeMedicine({ id: 'legado-1', name: 'Remédio Legado 250mg' }),
          makeMedicine({ id: 'legado-2', name: 'Antigo Xarope Fictício' }),
        ],
        doseLog: [makeDose('legado-1', '2026-01-10', '08:00')],
      },
    });

    const parsed = parseBackup(legacyEnvelope);
    expect(parsed).not.toBeNull();
    expect(parsed!.medicineCount).toBe(2);
    expect(parsed!.doseCount).toBe(1);
    expect(parsed!.store.medicines.map((m) => m.id)).toEqual(['legado-1', 'legado-2']);
    // Campo ausente vira {} — nunca undefined (o resto do app confia nisso).
    expect(parsed!.store.treatmentMemory).toEqual({});
    // E o remédio legado segue sem os campos novos (não inventamos valores).
    expect(parsed!.store.medicines[0].treatment).toBeUndefined();
    expect(parsed!.store.medicines[0].stockCount).toBeUndefined();
  });

  it('retrocompat: Store puro legado (sem envelope, sem treatmentMemory) também restaura', () => {
    const legacyBare = JSON.stringify({
      version: 1,
      medicines: [makeMedicine({ id: 'legado-3', name: 'Comprimido Legado' })],
      doseLog: [],
    });
    const parsed = parseBackup(legacyBare);
    expect(parsed).not.toBeNull();
    expect(parsed!.medicineCount).toBe(1);
    expect(parsed!.store.treatmentMemory).toEqual({});
  });

  it('documenta a rigidez do sanitizador: stockCount fora da faixa (1000, -1, "10") derruba o remédio INTEIRO do backup', () => {
    // Comportamento intencional do isValidMedicine (validação estrita), mas
    // vale registrar: um backup editado à mão com estoque inválido perde o
    // remédio todo, não só o campo.
    const tampered = JSON.stringify({
      app: 'hora-do-remedio',
      exportedAt: '2026-07-11T10:00:00.000Z',
      store: {
        version: 1,
        medicines: [
          makeMedicine({ id: 'ok-1', stockCount: 999 }),
          { ...makeMedicine({ id: 'ruim-1' }), stockCount: 1000 },
          { ...makeMedicine({ id: 'ruim-2' }), stockCount: -1 },
          { ...makeMedicine({ id: 'ruim-3' }), stockCount: '10' },
          { ...makeMedicine({ id: 'ruim-4' }), stockCount: 2.5 },
        ],
        doseLog: [],
        treatmentMemory: {},
      },
    });
    const parsed = parseBackup(tampered);
    expect(parsed).not.toBeNull();
    expect(parsed!.store.medicines.map((m) => m.id)).toEqual(['ok-1']);
  });
});

describe('Cruzamento 6: sugestão de tratamento alimentada por backup restaurado', () => {
  it('parseBackup de envelope com memória → suggestTreatment acha o tratamento (com acento no nome digitado)', () => {
    const envelope = serializeBackup({
      version: 1,
      medicines: [],
      doseLog: [],
      treatmentMemory: {
        // Chave como rememberTreatment grava: normalizada (sem acento).
        'remedinho da vovo conceicao': 'Náusea e vômito',
      },
    });
    const parsed = parseBackup(envelope);
    expect(parsed).not.toBeNull();

    // O usuário digita COM acento e ç; a memória restaurada precisa achar.
    expect(suggestTreatment('Remedinho da Vovó Conceição', parsed!.store.treatmentMemory)).toBe(
      'Náusea e vômito',
    );
    // Nome que não está na memória nem na lista curada → sem sugestão.
    expect(suggestTreatment('Coisa Desconhecida XYZ', parsed!.store.treatmentMemory)).toBeNull();
  });

  it('memória restaurada tem prioridade sobre a lista curada', () => {
    const parsed = parseBackup(
      serializeBackup({
        version: 1,
        medicines: [],
        doseLog: [],
        // O usuário associou "dipirona teste" a Enxaqueca; a curada diria
        // "Dor e febre" — o que ELE escreveu vence após a restauração.
        treatmentMemory: { 'dipirona teste 500mg': 'Enxaqueca' },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(suggestTreatment('Dipirona Teste 500mg', parsed!.store.treatmentMemory)).toBe('Enxaqueca');
    // Nome só parecido (match da memória é EXATO) cai na curada.
    expect(suggestTreatment('Dipirona Sódica 1g', parsed!.store.treatmentMemory)).toBe('Dor e febre');
  });
});

describe('Cruzamento 4: relatório filtra por remédio com doseLog compartilhado', () => {
  const medA = makeMedicine({
    id: 'med-a',
    name: 'Remédio A Fictício',
    times: ['08:00', '20:00'],
    startDate: '2026-07-09',
    durationDays: 5,
  });
  const medB = makeMedicine({
    id: 'med-b',
    name: 'Remédio B Fictício',
    times: ['08:00', '20:00'],
    startDate: '2026-07-09',
    durationDays: 5,
  });
  // Mesmo dia, MESMOS horários — o cenário mais fácil de contaminar.
  const sharedLog: DoseRecord[] = [
    makeDose('med-a', '2026-07-09', '08:00'),
    makeDose('med-b', '2026-07-09', '08:00'),
    makeDose('med-b', '2026-07-09', '20:00'),
    makeDose('med-b', '2026-07-10', '08:00'),
    makeDose('med-b', '2026-07-10', '20:00'),
  ];
  const todayISO = '2026-07-10';

  it('relatório do remédio A só conta as doses do A', () => {
    const report = buildAdherenceReport(medA, sharedLog, todayISO);
    // 2 dias × 2 doses = 4 previstas; A só tomou 1 (as 4 do B não contam).
    expect(report).toContain('Doses tomadas: 1 de 4 previstas até hoje (25%)');
    // Dia 10/07: A não marcou nada — mesmo o B tendo tomado as duas.
    expect(report).toContain('10/07: 08:00 ✗  20:00 ✗');
    expect(report).toContain('09/07: 08:00 ✓  20:00 ✗');
    expect(report).toContain('Remédio: Remédio A Fictício');
    expect(report).not.toContain('Remédio B');
  });

  it('relatório do remédio B só conta as doses do B (100%)', () => {
    const report = buildAdherenceReport(medB, sharedLog, todayISO);
    expect(report).toContain('Doses tomadas: 4 de 4 previstas até hoje (100%)');
    expect(report).toContain('10/07: 08:00 ✓  20:00 ✓');
    expect(report).toContain('09/07: 08:00 ✓  20:00 ✓');
  });

  it('doseLog restaurado de backup alimenta o relatório do jeito certo (backup → parse → report)', () => {
    // Integração backup ↔ relatório de ponta a ponta em memória.
    const parsed = parseBackup(
      serializeBackup({
        version: 1,
        medicines: [medA, medB],
        doseLog: sharedLog,
        treatmentMemory: {},
      }),
    );
    expect(parsed).not.toBeNull();
    const medFromBackup = parsed!.store.medicines.find((m) => m.id === 'med-a')!;
    const report = buildAdherenceReport(medFromBackup, parsed!.store.doseLog, todayISO);
    expect(report).toContain('Doses tomadas: 1 de 4 previstas até hoje (25%)');
  });
});
