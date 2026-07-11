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
});
