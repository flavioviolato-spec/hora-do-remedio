/**
 * Testes de integração do MedicinesContext: cobre toggleDose (marcar/
 * desmarcar dose), removeMedicine limpando o doseLog e, principalmente,
 * chamadas concorrentes — o padrão `commit()` protege a GRAVAÇÃO
 * (AsyncStorage.setItem nunca corre risco de ficar inconsistente), mas
 * isso não implica que a MUTAÇÃO em memória seja segura contra corrida:
 * cada chamada lê `storeRef.current` de forma síncrona, e esse ref só é
 * atualizado depois que o `await saveStore(next)` anterior resolve.
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
    const apiRef = await mountWithStore({ version: 1, medicines: [makeMedicine()], doseLog: [] });

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

  it('DEFEITO: duas chamadas concorrentes em doses DIFERENTES perdem uma marcação (condição de corrida)', async () => {
    const store: Store = {
      version: 1,
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

  it('DEFEITO: duplo toque rápido na MESMA dose fica "grudado" em vez de voltar ao estado original', async () => {
    const store: Store = { version: 1, medicines: [makeMedicine()], doseLog: [] };
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

describe('addMedicine: campo "Tratamento"', () => {
  it('tratamento com espaços ao redor (" Dor ") é salvo já "aparado" ("Dor")', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [] });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ treatment: ' Dor ' }));
    });

    expect(created!.treatment).toBe('Dor');
    expect(apiRef.current!.medicines[0].treatment).toBe('Dor');
    expect((await persistedStore()).medicines[0].treatment).toBe('Dor');
  });

  it('tratamento só com espaços vira undefined (nunca string vazia)', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [] });

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
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [] });

    let created: Medicine | undefined;
    await act(async () => {
      created = await apiRef.current!.addMedicine(makeFormValues({ treatment: '' }));
    });

    expect(created!.treatment).toBeUndefined();
  });

  it('tratamento com acentuação e ç ("Infecção", "Anti-inflamatório") é salvo e recarregado corretamente', async () => {
    const apiRef = await mountWithStore({ version: 1, medicines: [], doseLog: [] });

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

describe('removeMedicine', () => {
  it('remove o remédio e limpa o doseLog associado, sem afetar outros remédios', async () => {
    const store: Store = {
      version: 1,
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
