/**
 * QA independente da correção da fila de gravação (writeQueueRef/enqueue) em
 * medicines-context.tsx. Cobre três ângulos que a rodada anterior (que só
 * testou 2 chamadas concorrentes do MESMO tipo, toggleDose) não cobriu:
 *
 *  A) 3+ mutações concorrentes de TIPOS DIFERENTES (add + toggle + remove)
 *     disparadas juntas: o resultado final precisa refletir as três, em
 *     alguma ordem consistente (FIFO pela ordem de chamada).
 *  B) Uma mutação NO MEIO da fila que falha (saveStore rejeita): a fila não
 *     pode travar permanentemente — as próximas mutações (na mesma leva e
 *     depois dela) continuam funcionando.
 *  C) updateMedicine/removeMedicine só apagam a foto ANTIGA depois que a
 *     gravação foi confirmada — e NÃO apagam nada se a gravação falhar.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { act, create } from 'react-test-renderer';

import { MedicinesProvider, useMedicines } from '../medicines-context';
import * as photosModule from '../photos';
import * as storageModule from '../storage';
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
  jest.restoreAllMocks();
});

describe('QA follow-up: mutações concorrentes de tipos diferentes', () => {
  it('add + toggle + remove disparados juntos refletem os três, em ordem FIFO consistente', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [
        makeMedicine({ id: 'med-1' }),
        makeMedicine({ id: 'med-2' }),
        makeMedicine({ id: 'med-3' }),
      ],
      doseLog: [
        { medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
        { medicineId: 'med-3', dateISO: '2026-07-10', time: '08:00', takenAt: '2026-07-10T08:05:00.000Z' },
      ],
    };
    const apiRef = await mountWithStore(store);

    let newMedicine: Medicine | undefined;
    let toggleResult: boolean | undefined;

    await act(async () => {
      const pAdd = apiRef.current!.addMedicine(makeFormValues({ name: 'Recém Chegado' })).then((m) => {
        newMedicine = m;
      });
      const pToggle = apiRef.current!.toggleDose('med-2', '2026-07-10', '08:00').then((r) => {
        toggleResult = r;
      });
      const pRemove = apiRef.current!.removeMedicine('med-3');
      await Promise.all([pAdd, pToggle, pRemove]);
    });

    // add: med-4 (novo) presente
    expect(newMedicine).toBeDefined();
    expect(apiRef.current!.medicines.some((m) => m.id === newMedicine!.id)).toBe(true);
    expect(apiRef.current!.medicines.find((m) => m.id === newMedicine!.id)?.name).toBe('Recém Chegado');

    // toggle: med-2 08:00 marcado (não existia antes -> true)
    expect(toggleResult).toBe(true);
    expect(
      apiRef.current!.doseLog.some(
        (d) => d.medicineId === 'med-2' && d.dateISO === '2026-07-10' && d.time === '08:00',
      ),
    ).toBe(true);

    // remove: med-3 sumiu da lista E seu doseLog foi limpo
    expect(apiRef.current!.medicines.some((m) => m.id === 'med-3')).toBe(false);
    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-3')).toBe(false);

    // med-1 não foi tocado por nada disso
    expect(
      apiRef.current!.doseLog.some(
        (d) => d.medicineId === 'med-1' && d.dateISO === '2026-07-10' && d.time === '08:00',
      ),
    ).toBe(true);

    // Estado em memória == estado persistido (a última gravação da fila
    // já reflete as 3 mutações acumuladas, não só a última isolada)
    const persisted = await persistedStore();
    expect(persisted.medicines.map((m) => m.id).sort()).toEqual(
      apiRef.current!.medicines.map((m) => m.id).sort(),
    );
    expect(persisted.doseLog).toEqual(apiRef.current!.doseLog);
    expect(persisted.medicines).toHaveLength(3); // med-1, med-2, novo (med-3 removido)
  });
});

describe('QA follow-up: falha no meio da fila não trava as próximas mutações', () => {
  it('saveStore rejeitando na 2ª mutação não impede a 3ª nem mutações futuras', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1' }), makeMedicine({ id: 'med-2' }), makeMedicine({ id: 'med-3' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    const realSaveStore = storageModule.saveStore;
    let callCount = 0;
    const spy = jest
      .spyOn(storageModule, 'saveStore')
      .mockImplementation(async (next: Store) => {
        callCount += 1;
        if (callCount === 2) {
          throw new Error('falha simulada de AsyncStorage (QA)');
        }
        return realSaveStore(next);
      });

    let r1: boolean | undefined;
    let r2Error: unknown;
    let r3: boolean | undefined;

    await act(async () => {
      const p1 = apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00').then((r) => {
        r1 = r;
      });
      const p2 = apiRef.current!.toggleDose('med-2', '2026-07-10', '08:00').catch((e) => {
        r2Error = e;
      });
      const p3 = apiRef.current!.toggleDose('med-3', '2026-07-10', '08:00').then((r) => {
        r3 = r;
      });
      await Promise.all([p1, p2, p3]);
    });

    // A 1ª e a 3ª mutação da leva funcionaram normalmente
    expect(r1).toBe(true);
    expect(r3).toBe(true);
    // A 2ª realmente rejeitou (o chamador é avisado do erro real)
    expect(r2Error).toBeInstanceOf(Error);

    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-1')).toBe(true);
    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-3')).toBe(true);
    // med-2 não deveria ter sido persistido, já que a gravação falhou
    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-2')).toBe(false);

    // Prova de que a fila NÃO travou: uma mutação disparada DEPOIS da leva
    // com falha ainda funciona normalmente.
    let r4: boolean | undefined;
    await act(async () => {
      r4 = await apiRef.current!.toggleDose('med-2', '2026-07-10', '08:00');
    });
    expect(r4).toBe(true);
    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-2')).toBe(true);

    const persisted = await persistedStore();
    expect(persisted.doseLog.some((d) => d.medicineId === 'med-1')).toBe(true);
    expect(persisted.doseLog.some((d) => d.medicineId === 'med-2')).toBe(true);
    expect(persisted.doseLog.some((d) => d.medicineId === 'med-3')).toBe(true);

    spy.mockRestore();
  });
});

describe('QA follow-up: exclusão de foto continua ocorrendo só APÓS gravação confirmada', () => {
  it('updateMedicine troca a foto: deletePhoto só é chamado depois de saveStore resolver, com a URI antiga', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', photoUri: 'file:///docs/photos/med-1-old.jpg' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    const events: string[] = [];
    jest.spyOn(storageModule, 'saveStore').mockImplementation(async (next: Store) => {
      events.push('saveStore:start');
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
      events.push('saveStore:end');
    });
    jest.spyOn(photosModule, 'deletePhoto').mockImplementation(async (uri: string | null) => {
      events.push(`deletePhoto:${uri}`);
    });

    await act(async () => {
      await apiRef.current!.updateMedicine('med-1', { photoUri: 'file:///docs/photos/med-1-new.jpg' });
    });

    expect(events).toEqual([
      'saveStore:start',
      'saveStore:end',
      'deletePhoto:file:///docs/photos/med-1-old.jpg',
    ]);
    expect(apiRef.current!.medicines[0]?.photoUri).toBe('file:///docs/photos/med-1-new.jpg');
  });

  it('se saveStore falhar, deletePhoto NÃO é chamado (nada é apagado sem gravação confirmada)', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', photoUri: 'file:///docs/photos/med-1-old.jpg' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    jest.spyOn(storageModule, 'saveStore').mockRejectedValue(new Error('falha simulada (QA)'));
    const deleteSpy = jest
      .spyOn(photosModule, 'deletePhoto')
      .mockImplementation(async () => {});

    await act(async () => {
      await expect(
        apiRef.current!.updateMedicine('med-1', { photoUri: 'file:///docs/photos/med-1-new.jpg' }),
      ).rejects.toThrow('falha simulada (QA)');
    });

    expect(deleteSpy).not.toHaveBeenCalled();
    // O remédio em memória continua com a foto antiga (gravação não confirmada)
    expect(apiRef.current!.medicines[0]?.photoUri).toBe('file:///docs/photos/med-1-old.jpg');
  });

  it('removeMedicine só apaga a foto depois de o remédio sumir da loja gravada', async () => {
    const store: Store = {
      version: 1,
      treatmentMemory: {},
      medicines: [makeMedicine({ id: 'med-1', photoUri: 'file:///docs/photos/med-1.jpg' })],
      doseLog: [],
    };
    const apiRef = await mountWithStore(store);

    const events: string[] = [];
    const realSaveStore = storageModule.saveStore;
    jest.spyOn(storageModule, 'saveStore').mockImplementation(async (next: Store) => {
      events.push('saveStore:start');
      await realSaveStore(next);
      events.push('saveStore:end');
    });
    jest.spyOn(photosModule, 'deletePhoto').mockImplementation(async (uri: string | null) => {
      events.push(`deletePhoto:${uri}`);
    });

    await act(async () => {
      await apiRef.current!.removeMedicine('med-1');
    });

    expect(events).toEqual([
      'saveStore:start',
      'saveStore:end',
      'deletePhoto:file:///docs/photos/med-1.jpg',
    ]);
  });
});
