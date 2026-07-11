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
import type { Medicine } from './types';
import type { MedicineFormValues } from './validation';

type MedicinesContextValue = {
  loading: boolean;
  medicines: Medicine[];
  addMedicine(values: MedicineFormValues): Promise<Medicine>;
  updateMedicine(id: string, patch: Partial<Medicine>): Promise<void>;
  removeMedicine(id: string): Promise<void>;
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

  // Grava no disco PRIMEIRO; a tela só muda se a gravação deu certo.
  // storeRef é atualizado na hora (sem esperar re-renderização) para
  // mutações em sequência rápida não lerem estado velho.
  const commit = useCallback(async (next: Store) => {
    await saveStore(next);
    storeRef.current = next;
    setStore(next);
  }, []);

  const addMedicine = useCallback(
    async (values: MedicineFormValues) => {
      const medicine: Medicine = {
        id: Crypto.randomUUID(),
        name: values.name.trim(),
        photoUri: values.photoUri,
        times: [...values.times].sort(),
        startDate: values.startDate,
        durationDays: values.durationDays,
        soundId: values.soundId,
        active: true,
        createdAt: new Date().toISOString(),
      };
      const current = storeRef.current;
      await commit({ ...current, medicines: [...current.medicines, medicine] });
      return medicine;
    },
    [commit],
  );

  const updateMedicine = useCallback(
    async (id: string, patch: Partial<Medicine>) => {
      const current = storeRef.current;
      const previous = current.medicines.find((med) => med.id === id);
      const medicines = current.medicines.map((med) => {
        if (med.id !== id) return med;
        const next = { ...med, ...patch, id: med.id };
        if (patch.times) next.times = [...patch.times].sort();
        if (patch.name !== undefined) next.name = patch.name.trim();
        return next;
      });
      await commit({ ...current, medicines });
      // Foto antiga só é apagada DEPOIS da gravação: arquivo órfão é
      // inofensivo; referência quebrada na lista, não.
      if (previous && patch.photoUri !== undefined && patch.photoUri !== previous.photoUri) {
        await deletePhoto(previous.photoUri);
      }
    },
    [commit],
  );

  const removeMedicine = useCallback(
    async (id: string) => {
      const current = storeRef.current;
      const target = current.medicines.find((med) => med.id === id);
      await commit({
        ...current,
        medicines: current.medicines.filter((med) => med.id !== id),
        doseLog: current.doseLog.filter((dose) => dose.medicineId !== id),
      });
      if (target) await deletePhoto(target.photoUri);
    },
    [commit],
  );

  const value = useMemo(
    () => ({ loading, medicines: store.medicines, addMedicine, updateMedicine, removeMedicine }),
    [loading, store.medicines, addMedicine, updateMedicine, removeMedicine],
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
