import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { EMPTY_STORE, loadStore, sanitizeStore, saveStore, type Store } from '../storage';
import type { Medicine } from '../types';

const STORE_KEY = 'hora-do-remedio/store';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Solução de Ibuprofeno — atenção à ç',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('loadStore / saveStore', () => {
  it('sem nada salvo: loja vazia', async () => {
    expect(await loadStore()).toEqual(EMPTY_STORE);
  });

  it('salva e recarrega preservando acentuação e ç', async () => {
    const store: Store = { version: 1, medicines: [makeMedicine()], doseLog: [] };
    await saveStore(store);
    const loaded = await loadStore();
    expect(loaded.medicines).toHaveLength(1);
    expect(loaded.medicines[0].name).toBe('Solução de Ibuprofeno — atenção à ç');
  });

  it('JSON corrompido não derruba o app: volta loja vazia', async () => {
    await AsyncStorage.setItem(STORE_KEY, '{{{isso não é json');
    expect(await loadStore()).toEqual(EMPTY_STORE);
  });

  it('versão desconhecida: volta loja vazia', async () => {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ version: 99, medicines: [] }));
    expect(await loadStore()).toEqual(EMPTY_STORE);
  });

  it('registros de dose válidos são preservados', async () => {
    const store: Store = {
      version: 1,
      medicines: [makeMedicine()],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    await saveStore(store);
    expect((await loadStore()).doseLog).toHaveLength(1);
  });

  it('salva e recarrega remédio com treatment preservando acentuação e ç', async () => {
    const store: Store = { version: 1, medicines: [makeMedicine({ treatment: 'Náusea e vômito' })], doseLog: [] };
    await saveStore(store);
    const loaded = await loadStore();
    expect(loaded.medicines[0].treatment).toBe('Náusea e vômito');
  });
});

describe('sanitizeStore', () => {
  it('filtra remédio sem nome', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine(), { ...makeMedicine({ id: 'x' }), name: '   ' }],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(1);
  });

  it('filtra remédio com horário inválido', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine({ times: ['25h00'] as unknown as string[] })],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('filtra remédio com duração zero ou negativa', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine({ durationDays: 0 }), makeMedicine({ id: 'b', durationDays: -3 })],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('filtra dose com data inválida', () => {
    const dirty = {
      version: 1,
      medicines: [],
      doseLog: [{ medicineId: 'a', dateISO: 'ontem', time: '08:00', takenAt: 'x' }],
    };
    expect(sanitizeStore(dirty).doseLog).toHaveLength(0);
  });

  it('aceita photoUri null e string', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine({ photoUri: null }), makeMedicine({ id: 'b', photoUri: 'file:///x.jpg' })],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(2);
  });

  it('entrada não-objeto: loja vazia', () => {
    expect(sanitizeStore('lixo')).toEqual(EMPTY_STORE);
    expect(sanitizeStore(null)).toEqual(EMPTY_STORE);
    expect(sanitizeStore([1, 2])).toEqual(EMPTY_STORE);
  });

  // --- Casos-limite adicionados pelo QA ---

  it('version ausente: loja vazia', () => {
    expect(sanitizeStore({ medicines: [makeMedicine()], doseLog: [] })).toEqual(EMPTY_STORE);
  });

  it('version "1" como string (não número): loja vazia', () => {
    expect(sanitizeStore({ version: '1', medicines: [makeMedicine()], doseLog: [] })).toEqual(
      EMPTY_STORE,
    );
  });

  it('medicines/doseLog que não são arrays: viram arrays vazios', () => {
    const dirty = { version: 1, medicines: 'x', doseLog: { a: 1 } };
    expect(sanitizeStore(dirty)).toEqual({ version: 1, medicines: [], doseLog: [] });
  });

  it('filtra remédio com lista de horários vazia', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ times: [] })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('filtra remédio sem campo obrigatório (durationDays ausente)', () => {
    const semDuracao = { ...makeMedicine() } as Record<string, unknown>;
    delete semDuracao.durationDays;
    const dirty = { version: 1, medicines: [semDuracao], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('filtra remédio com durationDays em string ("7") ou não inteiro (2.5)', () => {
    const dirty = {
      version: 1,
      medicines: [
        makeMedicine({ durationDays: '7' as unknown as number }),
        makeMedicine({ id: 'b', durationDays: 2.5 }),
      ],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('filtra dose com horário sem formato HH:MM ("8h") ou takenAt não-string', () => {
    const dirty = {
      version: 1,
      medicines: [],
      doseLog: [
        { medicineId: 'a', dateISO: '2026-07-10', time: '8h', takenAt: '2026-07-10T08:00:00.000Z' },
        { medicineId: 'a', dateISO: '2026-07-10', time: '08:00', takenAt: 12345 },
      ],
    };
    expect(sanitizeStore(dirty).doseLog).toHaveLength(0);
  });

  it('duplicidade: mesmo remédio (mesmo id) duas vezes é mantido duas vezes — observação, não filtra', () => {
    // sanitizeStore não deduplica por id. Hoje o app é o único escritor da loja,
    // mas se um backup/restauração duplicar entradas, haverá alarmes em dobro.
    // Documentado aqui como comportamento atual (baixa severidade).
    const dirty = { version: 1, medicines: [makeMedicine(), makeMedicine()], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(2);
  });

  it('loja grande (1000 remédios válidos) é aceita integralmente', () => {
    const muitos = Array.from({ length: 1000 }, (_, i) => makeMedicine({ id: `med-${i}` }));
    const dirty = { version: 1, medicines: muitos, doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(1000);
  });

  it('horário impossível "24:00"/"23:60" é filtrado pela sanitização', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine({ times: ['24:00', '23:60'] })],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('startDate impossível "2026-02-30" é filtrada pela sanitização', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ startDate: '2026-02-30' })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('id fora do padrão UUID (ex.: "../x") é filtrado — vira nome de arquivo de foto', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ id: '../x' })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  // --- Campo "Tratamento" (opcional) ---

  it('compatibilidade retroativa: remédio salvo ANTES da feature (sem o campo treatment) continua válido', () => {
    const semTreatment = makeMedicine(); // makeMedicine() não inclui treatment
    expect('treatment' in semTreatment).toBe(false);
    const dirty = { version: 1, medicines: [semTreatment], doseLog: [] };
    const result = sanitizeStore(dirty);
    expect(result.medicines).toHaveLength(1);
    expect(result.medicines[0].treatment).toBeUndefined();
  });

  it('remédio com treatment string curta e válida é aceito, com acentuação/ç preservada', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine({ treatment: 'Infecção' }), makeMedicine({ id: 'b', treatment: 'Anti-inflamatório' })],
      doseLog: [],
    };
    const result = sanitizeStore(dirty);
    expect(result.medicines).toHaveLength(2);
    expect(result.medicines[0].treatment).toBe('Infecção');
    expect(result.medicines[1].treatment).toBe('Anti-inflamatório');
  });

  it('remédio com treatment de exatamente 40 caracteres é aceito (limite superior)', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ treatment: 'a'.repeat(40) })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(1);
  });

  it('remédio com treatment de 41 caracteres é REJEITADO — o remédio inteiro cai do array', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ treatment: 'a'.repeat(41) })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('remédio com treatment em tipo errado (número em vez de string) é rejeitado', () => {
    const dirty = {
      version: 1,
      medicines: [makeMedicine({ treatment: 42 as unknown as string })],
      doseLog: [],
    };
    expect(sanitizeStore(dirty).medicines).toHaveLength(0);
  });

  it('treatment só com espaços em branco (mesmo 41+) é aceito: isValidMedicine mede o tamanho aparado (trim), igual a validateMedicine', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ treatment: ' '.repeat(41) })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(1);
  });

  it('treatment com espaços nas pontas: só a parte aparada conta pro limite de 40 (consistente com validateMedicine)', () => {
    const treatment = `  ${'a'.repeat(40)}  `;
    const dirty = { version: 1, medicines: [makeMedicine({ treatment })], doseLog: [] };
    expect(sanitizeStore(dirty).medicines).toHaveLength(1);
  });

  it('remédio com treatment string vazia ("") é aceito pela sanitização (a camada de storage não distingue de "não informado")', () => {
    const dirty = { version: 1, medicines: [makeMedicine({ treatment: '' })], doseLog: [] };
    const result = sanitizeStore(dirty);
    expect(result.medicines).toHaveLength(1);
    expect(result.medicines[0].treatment).toBe('');
  });
});
