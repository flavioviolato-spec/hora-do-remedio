/**
 * Estado global dos remédios, com persistência automática.
 * Toda mutação salva a loja inteira no AsyncStorage (volume minúsculo).
 */

import * as Crypto from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { deletePhoto } from './photos';
import { EMPTY_STORE, loadStore, saveStore, type Store } from './storage';
import { rememberTreatment } from './treatment-suggestions';
import { doseKey, type DoseRecord, type Medicine } from './types';
import type { MedicineFormValues } from './validation';

type MedicinesContextValue = {
  loading: boolean;
  medicines: Medicine[];
  doseLog: DoseRecord[];
  /** Memória de sugestões (nome normalizado → tratamento) — alimenta o
   * preenchimento automático do campo "Tratamento" no formulário. */
  treatmentMemory: Record<string, string>;
  addMedicine(values: MedicineFormValues): Promise<Medicine>;
  updateMedicine(id: string, patch: Partial<Medicine>): Promise<void>;
  removeMedicine(id: string): Promise<void>;
  /** Alterna a dose entre tomada/não tomada. Devolve o novo estado (true = tomada agora). */
  toggleDose(medicineId: string, dateISO: string, time: string): Promise<boolean>;
  /** Substitui a loja INTEIRA (restauração de backup). O conteúdo já deve
   * ter passado por sanitizeStore antes de chegar aqui. */
  replaceStore(next: Store): Promise<void>;
};

const MedicinesContext = createContext<MedicinesContextValue | null>(null);

export function MedicinesProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    let cancelled = false;
    loadStore().then((loaded) => {
      if (cancelled) return;
      setStore(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fila de gravação: cada mutação só lê storeRef.current depois que TODA
  // mutação anterior já terminou de gravar (inclusive já atualizou
  // storeRef.current). Sem isso, duas mutações quase simultâneas (ex.: dois
  // toques rápidos em doses diferentes do checklist) liam o mesmo estado
  // "no ar" e uma apagava o efeito da outra ao terminar por último — achado
  // real de QA na Etapa 5. Mesmo padrão de fila já usado e testado em
  // alarmSync.ts (reconcileAlarms/runQueued), aplicado aqui à gravação.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback(<T,>(task: (current: Store) => { next: Store; result: T }): Promise<T> => {
    const run = writeQueueRef.current.then(async () => {
      const current = storeRef.current;
      const { next, result } = task(current);
      await saveStore(next);
      storeRef.current = next;
      setStore(next);
      return result;
    });
    // Nunca deixa a fila travada por uma falha (AsyncStorage indisponível,
    // etc.) — o erro ainda chega a quem chamou via `run`, só não impede a
    // próxima mutação da fila de rodar.
    writeQueueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const addMedicine = useCallback(
    (values: MedicineFormValues) =>
      enqueue((current) => {
        const medicine: Medicine = {
          id: Crypto.randomUUID(),
          name: values.name.trim(),
          photoUri: values.photoUri,
          times: [...values.times].sort(),
          startDate: values.startDate,
          durationDays: values.durationDays,
          soundId: values.soundId,
          treatment: values.treatment.trim() || undefined,
          // null do formulário ("não quero controlar estoque") vira undefined
          // no objeto persistido — JSON.stringify nem grava a chave.
          stockCount: values.stockCount ?? undefined,
          active: true,
          createdAt: new Date().toISOString(),
        };
        // Na mesma gravação atômica: remédio salvo com tratamento alimenta a
        // memória de sugestões (sobrevive à exclusão do remédio depois).
        const treatmentMemory = medicine.treatment
          ? rememberTreatment(current.treatmentMemory, medicine.name, medicine.treatment)
          : current.treatmentMemory;
        return {
          next: { ...current, medicines: [...current.medicines, medicine], treatmentMemory },
          result: medicine,
        };
      }),
    [enqueue],
  );

  const updateMedicine = useCallback(
    async (id: string, patch: Partial<Medicine>) => {
      const previous = await enqueue((current) => {
        const previousMed = current.medicines.find((med) => med.id === id);
        const medicines = current.medicines.map((med) => {
          if (med.id !== id) return med;
          const next = { ...med, ...patch, id: med.id };
          if (patch.times) next.times = [...patch.times].sort();
          if (patch.name !== undefined) next.name = patch.name.trim();
          if (patch.treatment !== undefined) next.treatment = patch.treatment.trim() || undefined;
          return next;
        });
        // Mesma regra do addMedicine: o estado FINAL do remédio (nome +
        // tratamento já aparados) alimenta a memória de sugestões.
        const updated = medicines.find((med) => med.id === id);
        const treatmentMemory = updated?.treatment
          ? rememberTreatment(current.treatmentMemory, updated.name, updated.treatment)
          : current.treatmentMemory;
        return { next: { ...current, medicines, treatmentMemory }, result: previousMed };
      });
      // Foto antiga só é apagada DEPOIS da gravação: arquivo órfão é
      // inofensivo; referência quebrada na lista, não.
      if (previous && patch.photoUri !== undefined && patch.photoUri !== previous.photoUri) {
        await deletePhoto(previous.photoUri);
      }
    },
    [enqueue],
  );

  const removeMedicine = useCallback(
    async (id: string) => {
      const target = await enqueue((current) => {
        const targetMed = current.medicines.find((med) => med.id === id);
        return {
          next: {
            ...current,
            medicines: current.medicines.filter((med) => med.id !== id),
            doseLog: current.doseLog.filter((dose) => dose.medicineId !== id),
          },
          result: targetMed,
        };
      });
      if (target) await deletePhoto(target.photoUri);
    },
    [enqueue],
  );

  const toggleDose = useCallback(
    (medicineId: string, dateISO: string, time: string) =>
      enqueue((current) => {
        // Se uma exclusão venceu a corrida da fila antes desta rodar, não
        // cria registro órfão apontando pra remédio que já sumiu.
        if (!current.medicines.some((med) => med.id === medicineId)) {
          return { next: current, result: false };
        }
        const key = doseKey(medicineId, dateISO, time);
        const wasTaken = current.doseLog.some(
          (dose) => doseKey(dose.medicineId, dose.dateISO, dose.time) === key,
        );
        const doseLog = wasTaken
          ? current.doseLog.filter((dose) => doseKey(dose.medicineId, dose.dateISO, dose.time) !== key)
          : [...current.doseLog, { medicineId, dateISO, time, takenAt: new Date().toISOString() }];
        // Estoque acompanha a marcação NA MESMA gravação atômica: marcar dose
        // gasta 1 comprimido; desmarcar devolve, porque o comprimido não foi
        // tomado de verdade. Piso 0 (nunca negativo) e teto 999 (limite do
        // campo) protegem contra estados fora da faixa validada. Remédio sem
        // stockCount (usuário não controla estoque) passa intocado.
        const medicines = current.medicines.map((med) => {
          if (med.id !== medicineId || med.stockCount === undefined) return med;
          const stockCount = wasTaken
            ? Math.min(999, med.stockCount + 1)
            : Math.max(0, med.stockCount - 1);
          return { ...med, stockCount };
        });
        return { next: { ...current, medicines, doseLog }, result: !wasTaken };
      }),
    [enqueue],
  );

  // Restauração de backup: passa pela MESMA fila de gravação das demais
  // mutações — uma restauração nunca atropela um toque em dose no meio do
  // caminho (e vice-versa).
  const replaceStore = useCallback(
    (next: Store) => enqueue(() => ({ next, result: undefined })),
    [enqueue],
  );

  const value = useMemo(
    () => ({
      loading,
      medicines: store.medicines,
      doseLog: store.doseLog,
      treatmentMemory: store.treatmentMemory,
      addMedicine,
      updateMedicine,
      removeMedicine,
      toggleDose,
      replaceStore,
    }),
    [
      loading,
      store.medicines,
      store.doseLog,
      store.treatmentMemory,
      addMedicine,
      updateMedicine,
      removeMedicine,
      toggleDose,
      replaceStore,
    ],
  );

  return <MedicinesContext.Provider value={value}>{children}</MedicinesContext.Provider>;
}

export function useMedicines(): MedicinesContextValue {
  const context = useContext(MedicinesContext);
  if (!context) {
    throw new Error('useMedicines precisa estar dentro de <MedicinesProvider>.');
  }
  return context;
}
