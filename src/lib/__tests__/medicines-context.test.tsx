/**
 * Testes de integração do MedicinesContext: toggleDose (marcar/desmarcar
 * dose), removeMedicine limpando o doseLog, memória de tratamentos,
 * estoque e — principalmente — chamadas concorrentes. A corrida original
 * (duas mutações lendo o mesmo storeRef "no ar") foi corrigida pela fila
 * de gravação (`enqueue`/`writeQueueRef` no medicines-context.tsx); os
 * testes de concorrência abaixo são a REGRESSÃO dessa correção.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { act, create } from 'react-test-renderer';

import { MedicinesProvider, useMedicines } from '../medicines-context';
import type { Store } from '../storage';
import type { Medicine } from '../types';
import type { MedicineFormValues } from '../validation';

const STORE_KEY = 'hora-do-remedio/store';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Remédio Teste 500mg',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-01',
    durationDays: 30,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

function makeFormValues(overrides: Partial<MedicineFormValues> = {}): MedicineFormValues {
  return {
    name: 'Remédio Novo',
    photoUri: null,
    times: ['12:00'],
    startDate: '2026-07-01',
    durationDays: 10,
    soundId: 'classico',
    treatment: '',
    stockCount: null,
    ...overrides,
  };
}

type Api = ReturnType<typeof useMedicines>;
type ApiRef = { current: Api | null };

function Harness({ apiRef }: { apiRef: ApiRef }) {
  apiRef.current = useMedicines();
  return null;
}

async function mountWithStore(store: Store): Promise<ApiRef> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
  const apiRef: ApiRef = { current: null };
  await act(async () => {
    create(
      <MedicinesProvider>
        <Harness apiRef={apiRef} />
      </MedicinesProvider>,
    );
  });
  return apiRef;
}

async function persistedStore(): Promise<Store> {
  const raw = await AsyncStorage.getItem(STORE_KEY);
  return JSON.parse(raw!);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('toggleDose', () => {
  it('marca uma dose como tomada e persiste no AsyncStorage', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [makeMedicine()], doseLog: [], treatmentMemory: {} });

    let result: boolean | undefined;
    await act(async () => {
      result = await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(result).toBe(true);
    expect(apiRef.current!.doseLog).toEqual([
      expect.objectContaining({ medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00' }),
    ]);
    expect((await persistedStore()).doseLog).toHaveLength(1);
  });

  it('desmarca uma dose já tomada (idempotência de ida e volta)', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine()],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    const apiRef = await mountWithStore(store);

    let result: boolean | undefined;
    await act(async () => {
      result = await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(result).toBe(false);
    expect(apiRef.current!.doseLog).toHaveLength(0);
    expect((await persistedStore()).doseLog).toHaveLength(0);
  });

  it('não mistura doses de remédios diferentes no mesmo horário', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1' }), makeMedicine({ id: 'med-2' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });
    await act(async () => {
      await apiRef.current!.toggleDose('med-2', '2026-07-10', '08:00');
    });

    expect(apiRef.current!.doseLog).toHaveLength(2);
    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });
    // Desmarcar med-1 não deve afetar med-2.
    expect(apiRef.current!.doseLog).toEqual([
      expect.objectContaining({ medicineId: 'med-2', dateISO: '2026-07-10', time: '08:00' }),
    ]);
  });

  it('duas chamadas concorrentes em doses DIFERENTES preservam as duas marcações (regressão da corrida corrigida pela fila)', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1' }), makeMedicine({ id: 'med-2' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      const p1 = apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
      const p2 = apiRef.current!.toggleDose('med-2', '2026-07-10', '08:00');
      await Promise.all([p1, p2]);
    });

    // Comportamento CORRETO esperado: as duas marcações persistidas.
    expect(apiRef.current!.doseLog).toHaveLength(2);
    expect((await persistedStore()).doseLog).toHaveLength(2);
  });

  it('duplo toque rápido na MESMA dose volta ao estado original (regressão da corrida corrigida pela fila)', async () => {
    const store: Store = { version: 1, medicines: [makeMedicine()], doseLog: [], treatmentMemory: {} };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      const p1 = apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
      const p2 = apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
      await Promise.all([p1, p2]);
    });

    // Comportamento CORRETO esperado: marcar + desmarcar em sequência é uma
    // operação líquida nula — a dose deveria voltar a "não tomada" (0 registros).
    // Na prática as duas chamadas leem o MESMO estado (nenhuma viu o efeito da
    // outra), então as duas se comportam como "marcar", e a última a gravar
    // vence: a dose fica PRESA em "tomada" mesmo que o usuário tenha desmarcado.
    expect(apiRef.current!.doseLog).toHaveLength(0);
  });
});

describe('controle de estoque de comprimidos (stockCount)', () => {
  it('marcar dose como tomada desconta 1 comprimido e persiste', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ stockCount: 10 })],
      doseLog: [],
      treatmentMemory: {},
    });

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(apiRef.current!.medicines[0].stockCount).toBe(9);
    expect((await persistedStore()).medicines[0].stockCount).toBe(9);
  });

  it('desmarcar dose devolve 1 comprimido (não foi tomado de verdade)', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ stockCount: 9 })],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(apiRef.current!.medicines[0].stockCount).toBe(10);
    expect((await persistedStore()).medicines[0].stockCount).toBe(10);
  });

  it('piso 0: marcar dose com estoque zerado não vai a -1', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ stockCount: 0 })],
      doseLog: [],
      treatmentMemory: {},
    });

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    // A dose é marcada normalmente; só o estoque fica travado no piso.
    expect(apiRef.current!.doseLog).toHaveLength(1);
    expect(apiRef.current!.medicines[0].stockCount).toBe(0);
    expect((await persistedStore()).medicines[0].stockCount).toBe(0);
  });

  it('teto 999: desmarcar dose com estoque cheio não passa de 999', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ stockCount: 999 })],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(apiRef.current!.doseLog).toHaveLength(0);
    expect(apiRef.current!.medicines[0].stockCount).toBe(999);
  });

  it('remédio SEM stockCount não é alterado pelo toggle (comportamento antigo intacto)', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine()],
      doseLog: [],
      treatmentMemory: {},
    });

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(apiRef.current!.doseLog).toHaveLength(1);
    expect(apiRef.current!.medicines[0].stockCount).toBeUndefined();
    // JSON.stringify não grava chave undefined: o campo nem aparece na loja.
    const persistedMed = (await persistedStore()).medicines[0] as Record<string, unknown>;
    expect('stockCount' in persistedMed).toBe(false);
  });

  it('toggle só mexe no estoque do remédio da dose, não no dos outros', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', stockCount: 10 }), makeMedicine({ id: 'med-2', stockCount: 5 })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    expect(apiRef.current!.medicines.find((m) => m.id === 'med-1')!.stockCount).toBe(9);
    expect(apiRef.current!.medicines.find((m) => m.id === 'med-2')!.stockCount).toBe(5);
  });

  it('addMedicine com stockCount null vira undefined (chave nem é gravada)', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ stockCount: null }));
    });

    expect(created!.stockCount).toBeUndefined();
    const persistedRaw = await AsyncStorage.getItem(STORE_KEY);
    const persistedMed = JSON.parse(persistedRaw!).medicines[0];
    expect('stockCount' in persistedMed).toBe(false);
  });

  it('addMedicine com stockCount informado (20) grava o valor', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ stockCount: 20 }));
    });

    expect(created!.stockCount).toBe(20);
    expect((await persistedStore()).medicines[0].stockCount).toBe(20);
  });

  it('updateMedicine com patch stockCount atualiza; patch com undefined explícito limpa o campo', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', stockCount: 10 })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { stockCount: 30 });
    });
    expect(apiRef.current!.medicines[0].stockCount).toBe(30);

    // undefined explícito no patch = usuário parou de controlar o estoque.
    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { stockCount: undefined });
    });
    expect(apiRef.current!.medicines[0].stockCount).toBeUndefined();
    const persistedMed = (await persistedStore()).medicines[0] as Record<string, unknown>;
    expect('stockCount' in persistedMed).toBe(false);
  });
});

describe('addMedicine: campo "Tratamento"', () => {
  it('tratamento com espaços ao redor (" Dor ") é salvo já "aparado" ("Dor")', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ treatment: ' Dor ' }));
    });

    expect(created!.treatment).toBe('Dor');
    expect(apiRef.current!.medicines[0].treatment).toBe('Dor');
    expect((await persistedStore()).medicines[0].treatment).toBe('Dor');
  });

  it('tratamento só com espaços vira undefined (nunca string vazia)', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ treatment: '   ' }));
    });

    expect(created!.treatment).toBeUndefined();
    expect(apiRef.current!.medicines[0].treatment).toBeUndefined();
    // JSON.stringify remove chaves com valor undefined: a chave não deve aparecer gravada.
    const persistedRaw = await AsyncStorage.getItem(STORE_KEY);
    const persistedMed = JSON.parse(persistedRaw!).medicines[0];
    expect('treatment' in persistedMed).toBe(false);
  });

  it('tratamento vazio ("") também vira undefined', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ treatment: '' }));
    });

    expect(created!.treatment).toBeUndefined();
  });

  it('tratamento com acentuação e ç ("Infecção", "Anti-inflamatório") é salvo e recarregado corretamente', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    await act(async () => {
      await apiRef.current!.addMedicine(makeFormValues({ name: 'Remédio A', treatment: 'Infecção' }));
    });
    await act(async () => {
      await apiRef.current!.addMedicine(
        makeFormValues({ name: 'Remédio B', treatment: 'Anti-inflamatório' }),
      );
    });

    const persisted = await persistedStore();
    expect(persisted.medicines.find((m) => m.name === 'Remédio A')?.treatment).toBe('Infecção');
    expect(persisted.medicines.find((m) => m.name === 'Remédio B')?.treatment).toBe('Anti-inflamatório');
  });
});

describe('updateMedicine: campo "Tratamento"', () => {
  it('editar tratamento com espaços ao redor (" Febre ") salva "aparado" ("Febre")', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', treatment: 'Dor' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { treatment: ' Febre ' });
    });

    expect(apiRef.current!.medicines[0].treatment).toBe('Febre');
    expect((await persistedStore()).medicines[0].treatment).toBe('Febre');
  });

  it('remover o tratamento de um remédio existente (treatment: "") realmente limpa o campo (vira undefined, não string vazia)', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', treatment: 'Dor' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { treatment: '' });
    });

    expect(apiRef.current!.medicines[0].treatment).toBeUndefined();
    const persistedRaw = await AsyncStorage.getItem(STORE_KEY);
    const persistedMed = JSON.parse(persistedRaw!).medicines[0];
    expect('treatment' in persistedMed).toBe(false);
  });

  it('atualizar outro campo sem mencionar treatment mantém o tratamento existente intacto', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', treatment: 'Dor' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { name: 'Nome Alterado' });
    });

    expect(apiRef.current!.medicines[0].name).toBe('Nome Alterado');
    expect(apiRef.current!.medicines[0].treatment).toBe('Dor');
  });

  it('editar tratamento com acentuação e ç ("Infecção") é salvo corretamente', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', treatment: 'Dor' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { treatment: 'Infecção' });
    });

    expect(apiRef.current!.medicines[0].treatment).toBe('Infecção');
    expect((await persistedStore()).medicines[0].treatment).toBe('Infecção');
  });
});

describe('memória de sugestões de tratamento (treatmentMemory)', () => {
  it('salvar remédio com tratamento grava a associação nome normalizado → tratamento', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    await act(async () => {
      await apiRef.current!.addMedicine(
        makeFormValues({ name: 'Amoxicilina 500mg', treatment: 'Antibiótico' }),
      );
    });

    expect(apiRef.current!.treatmentMemory).toEqual({ 'amoxicilina 500mg': 'Antibiótico' });
    expect((await persistedStore()).treatmentMemory).toEqual({
      'amoxicilina 500mg': 'Antibiótico',
    });
  });

  it('salvar remédio SEM tratamento não grava nada na memória', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    await act(async () => {
      await apiRef.current!.addMedicine(makeFormValues({ name: 'Remédio Sem Tratamento', treatment: '' }));
    });
    await act(async () => {
      await apiRef.current!.addMedicine(makeFormValues({ name: 'Outro Remédio', treatment: '   ' }));
    });

    expect(apiRef.current!.treatmentMemory).toEqual({});
    expect((await persistedStore()).treatmentMemory).toEqual({});
  });

  it('updateMedicine com tratamento também grava na memória (estado final do remédio)', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', name: 'Dipirona Sódica' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { treatment: 'Dor nas costas' });
    });

    expect(apiRef.current!.treatmentMemory).toEqual({ 'dipirona sodica': 'Dor nas costas' });
  });

  it('a memória SOBREVIVE ao removeMedicine do remédio que a alimentou', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [], treatmentMemory: {} });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(
        makeFormValues({ name: 'Losartana 50mg', treatment: 'Pressão alta' }),
      );
    });
    await act(async () => {
      await apiRef.current!.removeMedicine(created!.id);
    });

    expect(apiRef.current!.medicines).toHaveLength(0);
    expect(apiRef.current!.treatmentMemory).toEqual({ 'losartana 50mg': 'Pressão alta' });
    expect((await persistedStore()).treatmentMemory).toEqual({ 'losartana 50mg': 'Pressão alta' });
  });
});

describe('removeMedicine', () => {
  it('remove o remédio e limpa o doseLog associado, sem afetar outros remédios', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1' }), makeMedicine({ id: 'med-2' })],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
        { medicineId: 'med-2', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.removeMedicine('med-1');
    });

    expect(apiRef.current!.medicines.map((m) => m.id)).toEqual(['med-2']);
    expect(apiRef.current!.doseLog).toEqual([
      expect.objectContaining({ medicineId: 'med-2' }),
    ]);
    const persisted = await persistedStore();
    expect(persisted.medicines).toHaveLength(1);
    expect(persisted.doseLog).toHaveLength(1);
  });

  it('remover remédio inexistente não quebra nem altera a loja', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1' })],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    const apiRef = await mountWithStore(store);

    await act(async () => {
      await apiRef.current!.removeMedicine('nao-existe');
    });

    expect(apiRef.current!.medicines).toHaveLength(1);
    expect(apiRef.current!.doseLog).toHaveLength(1);
  });
});
