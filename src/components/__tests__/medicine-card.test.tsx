/**
 * Testes da função pura `stockSummary` (resumo de estoque do card da Home).
 * Só a função — sem renderizar o componente. Os mocks de expo-image/
 * expo-symbols existem porque importar o arquivo do card puxa esses módulos
 * nativos, ausentes no Jest (mesmo motivo de medicine-form.test.tsx).
 */
import { describe, expect, it, jest } from '@jest/globals';

import type { Medicine } from '@/lib/types';

import { stockSummary } from '../medicine-card';

jest.mock('expo-symbols', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => ReactActual.createElement(View, props),
  };
});

jest.mock('expo-image', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => ReactActual.createElement(View, props),
  };
});

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Remédio Fictício 500mg',
    photoUri: null,
    times: ['08:00', '20:00'], // 2 doses/dia -> limiar de "acabando" = 4
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

describe('stockSummary', () => {
  it('sem stockCount (usuário não controla estoque): retorna null', () => {
    expect(stockSummary(makeMedicine())).toBeNull();
  });

  it('estoque 0: aviso de reposição em danger', () => {
    expect(stockSummary(makeMedicine({ stockCount: 0 }))).toEqual({
      text: 'Comprimidos acabaram — reponha a caixa',
      danger: true,
    });
  });

  it('estoque exatamente no limiar (times.length * 2 = 4): danger "Acabando"', () => {
    expect(stockSummary(makeMedicine({ stockCount: 4 }))).toEqual({
      text: 'Acabando: 4 comprimidos restantes',
      danger: true,
    });
  });

  it('estoque abaixo do limiar (3 com 2 doses/dia): danger "Acabando"', () => {
    expect(stockSummary(makeMedicine({ stockCount: 3 }))).toEqual({
      text: 'Acabando: 3 comprimidos restantes',
      danger: true,
    });
  });

  it('estoque logo acima do limiar (5 com 2 doses/dia): texto normal, sem danger', () => {
    expect(stockSummary(makeMedicine({ stockCount: 5 }))).toEqual({
      text: '5 comprimidos restantes',
      danger: false,
    });
  });

  it('estoque folgado (20): texto normal, sem danger', () => {
    expect(stockSummary(makeMedicine({ stockCount: 20 }))).toEqual({
      text: '20 comprimidos restantes',
      danger: false,
    });
  });

  it('singular: 1 comprimido restante (dentro do limiar com 2 doses/dia -> danger)', () => {
    expect(stockSummary(makeMedicine({ stockCount: 1 }))).toEqual({
      text: 'Acabando: 1 comprimido restante',
      danger: true,
    });
  });

  it('singular fora do perigo: remédio de 1 dose/dia com 1 comprimido ainda cai no limiar (1 <= 2)', () => {
    // Com 1 horário/dia o limiar é 2 — 1 comprimido é "Acabando" (singular).
    expect(stockSummary(makeMedicine({ times: ['08:00'], stockCount: 1 }))).toEqual({
      text: 'Acabando: 1 comprimido restante',
      danger: true,
    });
  });

  it('limiar acompanha a quantidade de doses/dia: 3 doses -> limiar 6', () => {
    const tresDoses = makeMedicine({ times: ['08:00', '14:00', '20:00'] });
    expect(stockSummary({ ...tresDoses, stockCount: 6 })!.danger).toBe(true);
    expect(stockSummary({ ...tresDoses, stockCount: 7 })!.danger).toBe(false);
  });
});
