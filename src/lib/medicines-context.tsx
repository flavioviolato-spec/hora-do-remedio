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
import { doseKey, type DoseRecord, type Medicine } from './types';
import type { MedicineFormValues } from './validation';

type MedicinesContextValue = {
  loading: boolean;
  medicines: Medicine[];
  doseLog: DoseRecord[];
  addMedicine(values: MedicineFormValues): Promise<Medicine>;
  updateMedicine(id: string, patch: Partial<Medicine>): Promise<void>;
  removeMedicine(id: string): Promise<void>;
  /** Alterna a dose entre tomada/não tomada. Devolve o novo estado (true = tomada agora). */
  toggleDose(medicineId: string, dateISO: string, time: string): Promise<boolean>;
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
          active: true,
          createdAt: new Date().toISOString(),
        };
        return { next: { ...current, medicines: [...current.medicines, medicine] }, result: medicine };
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
        return { next: { ...current, medicines }, result: previousMed };
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
        return { next: { ...current, doseLog }, result: !wasTaken };
      }),
    [enqueue],
  );

  const value = useMemo(
    () => ({
      loading,
      medicines: store.medicines,
      doseLog: store.doseLog,
      addMedicine,
      updateMedicine,
      removeMedicine,
      toggleDose,
    }),
    [loading, store.medicines, store.doseLog, addMedicine, updateMedicine, removeMedicine, toggleDose],
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
