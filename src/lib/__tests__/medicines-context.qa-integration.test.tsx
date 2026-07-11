/**
 * QA de INTEGRAÇÃO no MedicinesContext — cruzamentos entre as features
 * novas que os testes unitários de cada uma não cobrem juntas:
 *
 *  2. replaceStore (restauração de backup) disparado ENQUANTO um toggleDose
 *     está na fila de gravação: a fila serializa e nada corrompe, em
 *     qualquer ordem de chegada.
 *  3. toggleDose de remédio COM estoque grava doseLog + stockCount na MESMA
 *     gravação atômica; se saveStore falhar, NENHUMA das duas mudanças fica
 *     em memória (sem estado meio-atualizado).
 *  +  treatmentMemory restaurada via replaceStore alimenta o contexto e a
 *     sugestão de tratamento, e continua acumulando depois.
 *
 * Mesmo harness dos testes existentes (medicines-context.qa-followup2).
 * Dados 100% fictícios (LGPD).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { act, create } from 'react-test-renderer';

import { MedicinesProvider, useMedicines } from '../medicines-context';
import * as storageModule from '../storage';
import type { Store } from '../storage';
import { suggestTreatment } from '../treatment-suggestions';
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

/** Store fictícia "vinda de um backup", com as três features novas. */
function makeBackupStore(): Store {
  return {
    version: 1,
    medicines: [
      makeMedicine({
        id: 'backup-med-1',
        name: 'Xarope Restaurado São Ção',
        treatment: 'Náusea e vômito',
        stockCount: 7,
      }),
    ],
    doseLog: [
      {
        medicineId: 'backup-med-1',
        dateISO: '2026-07-08',
        time: '08:00',
        takenAt: '2026-07-08T08:02:00.000Z',
      },
    ],
    treatmentMemory: { 'xarope restaurado sao cao': 'Náusea e vômito' },
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('Cruzamento 3: toggleDose + estoque + doseLog na MESMA gravação atômica', () => {
  it('marcar dose de remédio com estoque gera UMA chamada a saveStore contendo as DUAS mudanças', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ stockCount: 10 })],
      doseLog: [],
      treatmentMemory: {},
    });

    const realSaveStore = storageModule.saveStore;
    const spy = jest
      .spyOn(storageModule, 'saveStore')
      .mockImplementation((next: Store) => realSaveStore(next));

    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });

    // Atomicidade de verdade: uma gravação só, e o objeto gravado já tem o
    // doseLog novo E o estoque descontado — não duas gravações separadas.
    expect(spy).toHaveBeenCalledTimes(1);
    const written = spy.mock.calls[0][0] as Store;
    expect(written.doseLog).toHaveLength(1);
    expect(written.doseLog[0]).toEqual(
      expect.objectContaining({ medicineId: 'med-1', dateISO: '2026-07-10', time: '08:00' }),
    );
    expect(written.medicines[0].stockCount).toBe(9);
  });

  it('se saveStore falhar, NEM a dose NEM o desconto de estoque ficam em memória ou no disco', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ stockCount: 10 })],
      doseLog: [],
      treatmentMemory: {},
    });

    const spy = jest
      .spyOn(storageModule, 'saveStore')
      .mockRejectedValue(new Error('falha simulada de AsyncStorage (QA)'));

    await act(async () => {
      await expect(
        apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00'),
      ).rejects.toThrow('falha simulada de AsyncStorage (QA)');
    });

    // Memória intacta: nada de estado meio-atualizado (dose sem estoque ou
    // estoque sem dose).
    expect(apiRef.current!.doseLog).toHaveLength(0);
    expect(apiRef.current!.medicines[0].stockCount).toBe(10);

    // Disco intacto também.
    const persisted = await persistedStore();
    expect(persisted.doseLog).toHaveLength(0);
    expect(persisted.medicines[0].stockCount).toBe(10);

    // E o sistema se recupera: com a gravação funcionando de novo, o mesmo
    // toggle aplica as duas mudanças juntas.
    spy.mockRestore();
    await act(async () => {
      await apiRef.current!.toggleDose('med-1', '2026-07-10', '08:00');
    });
    expect(apiRef.current!.doseLog).toHaveLength(1);
    expect(apiRef.current!.medicines[0].stockCount).toBe(9);
    const recovered = await persistedStore();
    expect(recovered.doseLog).toHaveLength(1);
    expect(recovered.medicines[0].stockCount).toBe(9);
  });
});

describe('Cruzamento 2: replaceStore concorrendo com toggleDose na fila de gravação', () => {
  it('toggleDose disparado ANTES + replaceStore logo em seguida: FIFO — a restauração vence e o estado final é EXATAMENTE o backup', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ id: 'med-antigo', stockCount: 5 })],
      doseLog: [],
      treatmentMemory: {},
    });

    // saveStore da 1ª mutação (o toggle) fica artificialmente lento: garante
    // que o replaceStore entra na fila ENQUANTO o toggle ainda grava.
    const realSaveStore = storageModule.saveStore;
    let firstCall = true;
    jest.spyOn(storageModule, 'saveStore').mockImplementation(async (next: Store) => {
      if (firstCall) {
        firstCall = false;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return realSaveStore(next);
    });

    const backup = makeBackupStore();
    let toggleResult: boolean | undefined;
    await act(async () => {
      const pToggle = apiRef.current!
        .toggleDose('med-antigo', '2026-07-10', '08:00')
        .then((r) => {
          toggleResult = r;
        });
      const pReplace = apiRef.current!.replaceStore(backup);
      await Promise.all([pToggle, pReplace]);
    });

    // O toggle rodou de verdade (não foi engolido)…
    expect(toggleResult).toBe(true);
    // …mas a restauração veio DEPOIS na fila e substitui a loja inteira:
    // estado final em memória é exatamente o backup, sem resíduo do toggle.
    expect(apiRef.current!.medicines).toEqual(backup.medicines);
    expect(apiRef.current!.doseLog).toEqual(backup.doseLog);
    expect(apiRef.current!.treatmentMemory).toEqual(backup.treatmentMemory);
    // Nenhum registro órfão do remédio antigo vazou pra loja restaurada.
    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-antigo')).toBe(false);

    // Disco espelha a memória byte a byte.
    const persisted = await persistedStore();
    expect(JSON.stringify(persisted)).toBe(JSON.stringify(backup));
  });

  it('replaceStore disparado ANTES + toggleDose em remédio DO BACKUP: o toggle aplica em cima da loja restaurada (dose + estoque)', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ id: 'med-antigo' })],
      doseLog: [],
      treatmentMemory: {},
    });

    const realSaveStore = storageModule.saveStore;
    let firstCall = true;
    jest.spyOn(storageModule, 'saveStore').mockImplementation(async (next: Store) => {
      if (firstCall) {
        firstCall = false;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return realSaveStore(next);
    });

    const backup = makeBackupStore(); // backup-med-1 com stockCount 7
    let toggleResult: boolean | undefined;
    await act(async () => {
      const pReplace = apiRef.current!.replaceStore(backup);
      const pToggle = apiRef.current!
        .toggleDose('backup-med-1', '2026-07-10', '08:00')
        .then((r) => {
          toggleResult = r;
        });
      await Promise.all([pReplace, pToggle]);
    });

    // O toggle enxergou a loja JÁ restaurada (fila FIFO) e aplicou as duas
    // mudanças em cima dela.
    expect(toggleResult).toBe(true);
    expect(apiRef.current!.medicines[0].id).toBe('backup-med-1');
    expect(apiRef.current!.medicines[0].stockCount).toBe(6); // 7 − 1
    // doseLog = a dose que veio no backup + a recém-marcada. Nada sumiu.
    expect(apiRef.current!.doseLog).toHaveLength(2);
    expect(
      apiRef.current!.doseLog.some(
        (d) => d.medicineId === 'backup-med-1' && d.dateISO === '2026-07-08' && d.time === '08:00',
      ),
    ).toBe(true);
    expect(
      apiRef.current!.doseLog.some(
        (d) => d.medicineId === 'backup-med-1' && d.dateISO === '2026-07-10' && d.time === '08:00',
      ),
    ).toBe(true);

    const persisted = await persistedStore();
    expect(persisted.medicines[0].stockCount).toBe(6);
    expect(persisted.doseLog).toHaveLength(2);
  });

  it('replaceStore ANTES + toggleDose em remédio que SÓ existia na loja antiga: não cria registro órfão', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [makeMedicine({ id: 'med-antigo', stockCount: 5 })],
      doseLog: [],
      treatmentMemory: {},
    });

    const backup = makeBackupStore();
    let toggleResult: boolean | undefined;
    await act(async () => {
      const pReplace = apiRef.current!.replaceStore(backup);
      // O usuário tocou numa dose de um remédio que a restauração apagou.
      const pToggle = apiRef.current!
        .toggleDose('med-antigo', '2026-07-10', '08:00')
        .then((r) => {
          toggleResult = r;
        });
      await Promise.all([pReplace, pToggle]);
    });

    // O guard do toggleDose recusa (remédio não existe mais): false, e o
    // doseLog restaurado fica sem registro órfão.
    expect(toggleResult).toBe(false);
    expect(apiRef.current!.doseLog.some((d) => d.medicineId === 'med-antigo')).toBe(false);
    expect(apiRef.current!.doseLog).toEqual(backup.doseLog);
    const persisted = await persistedStore();
    expect(persisted.doseLog.some((d) => d.medicineId === 'med-antigo')).toBe(false);
  });
});

describe('Cruzamento 6 (nível contexto): treatmentMemory restaurada alimenta a sugestão e continua acumulando', () => {
  it('replaceStore expõe a memória restaurada; suggestTreatment acha; addMedicine posterior acumula em cima dela', async () => {
    const apiRef = await mountWithStore({
      version: 1,
      medicines: [],
      doseLog: [],
      treatmentMemory: {},
    });

    const backup = makeBackupStore();
    await act(async () => {
      await apiRef.current!.replaceStore(backup);
    });

    // A memória restaurada está exposta no contexto (é ela que o formulário
    // recebe via prop treatmentMemory)…
    expect(apiRef.current!.treatmentMemory).toEqual(backup.treatmentMemory);
    // …e a sugestão funciona com o nome digitado COM acento/ç.
    expect(suggestTreatment('Xarope Restaurado São Ção', apiRef.current!.treatmentMemory)).toBe(
      'Náusea e vômito',
    );

    // Cadastro novo DEPOIS da restauração acumula na memória restaurada em
    // vez de substituí-la.
    await act(async () => {
      await apiRef.current!.addMedicine(
        makeFormValues({ name: 'Pomada Fictícia Guaporé', treatment: 'Assadura' }),
      );
    });
    expect(apiRef.current!.treatmentMemory).toEqual({
      'xarope restaurado sao cao': 'Náusea e vômito',
      'pomada ficticia guapore': 'Assadura',
    });
    const persisted = await persistedStore();
    expect(persisted.treatmentMemory['pomada ficticia guapore']).toBe('Assadura');
    expect(persisted.treatmentMemory['xarope restaurado sao cao']).toBe('Náusea e vômito');
  });
});
