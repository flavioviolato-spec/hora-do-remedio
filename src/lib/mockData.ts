/**
 * Dados FICTÍCIOS para demonstração da Etapa 1 (nenhum dado real).
 * Somem quando o cadastro de verdade entrar (Etapa 3).
 */

import { addDays } from 'date-fns';

import { toDateISO } from './schedule';
import type { Medicine } from './types';

const today = new Date();

export const MOCK_MEDICINES: Medicine[] = [
  {
    id: 'mock-amoxicilina',
    name: 'Amoxicilina 500mg',
    photoUri: null,
    times: ['06:00', '14:00', '22:00'],
    startDate: toDateISO(addDays(today, -2)),
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: today.toISOString(),
  },
  {
    id: 'mock-losartana',
    name: 'Losartana 50mg',
    photoUri: null,
    times: ['08:00'],
    startDate: toDateISO(addDays(today, -10)),
    durationDays: 30,
    soundId: 'sino',
    active: true,
    createdAt: today.toISOString(),
  },
  {
    id: 'mock-vitamina',
    name: 'Vitamina D 7.000UI',
    photoUri: null,
    times: ['09:30'],
    startDate: toDateISO(today),
    durationDays: 10,
    soundId: 'classico',
    active: true,
    createdAt: today.toISOString(),
  },
];
