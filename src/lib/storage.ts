/**
 * Persistência local em JSON versionado (AsyncStorage).
 * Toda leitura passa por sanitização: dado corrompido nunca derruba o app —
 * no pior caso volta uma loja vazia.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DoseRecord, Medicine } from './types';

const STORE_KEY = 'hora-do-remedio/store';

export type Store = {
  version: 1;
  medicines: Medicine[];
  doseLog: DoseRecord[];
};

export const EMPTY_STORE: Store = { version: 1, medicines: [], doseLog: [] };

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidMedicine(value: unknown): value is Medicine {
  if (typeof value !== 'object' || value === null) return false;
  const med = value as Record<string, unknown>;
  return (
    typeof med.id === 'string' &&
    med.id.length > 0 &&
    typeof med.name === 'string' &&
    med.name.trim().length > 0 &&
    (med.photoUri === null || typeof med.photoUri === 'string') &&
    Array.isArray(med.times) &&
    med.times.length > 0 &&
    med.times.every((t) => typeof t === 'string' && TIME_RE.test(t)) &&
    typeof med.startDate === 'string' &&
    DATE_RE.test(med.startDate) &&
    typeof med.durationDays === 'number' &&
    Number.isInteger(med.durationDays) &&
    med.durationDays >= 1 &&
    typeof med.soundId === 'string' &&
    typeof med.active === 'boolean' &&
    typeof med.createdAt === 'string'
  );
}

function isValidDose(value: unknown): value is DoseRecord {
  if (typeof value !== 'object' || value === null) return false;
  const dose = value as Record<string, unknown>;
  return (
    typeof dose.medicineId === 'string' &&
    typeof dose.dateISO === 'string' &&
    DATE_RE.test(dose.dateISO) &&
    typeof dose.time === 'string' &&
    TIME_RE.test(dose.time) &&
    typeof dose.takenAt === 'string'
  );
}

/** Aceita o que for válido, descarta o resto. Versão desconhecida = loja vazia. */
export function sanitizeStore(parsed: unknown): Store {
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_STORE;
  const raw = parsed as Record<string, unknown>;
  if (raw.version !== 1) return EMPTY_STORE;
  const medicines = Array.isArray(raw.medicines) ? raw.medicines.filter(isValidMedicine) : [];
  const doseLog = Array.isArray(raw.doseLog) ? raw.doseLog.filter(isValidDose) : [];
  return { version: 1, medicines, doseLog };
}

export async function loadStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw === null) return EMPTY_STORE;
    return sanitizeStore(JSON.parse(raw));
  } catch (error) {
    console.warn('[storage] loja corrompida, começando vazia:', error);
    return EMPTY_STORE;
  }
}

export async function saveStore(store: Store): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
}
