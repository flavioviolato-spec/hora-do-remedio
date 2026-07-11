/**
 * Funções PURAS de calendário e doses — sem I/O, sem estado.
 * Tudo aqui é coberto por testes em __tests__/schedule.test.ts.
 *
 * Datas circulam como strings "YYYY-MM-DD" (dia local) e horários como
 * "HH:MM"; ambos comparáveis lexicograficamente.
 */

import { addDays, format, parseISO } from 'date-fns';

import type { Medicine } from './types';

export function toDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function toTimeHM(date: Date): string {
  return format(date, 'HH:mm');
}

/** Último dia coberto pelo tratamento (inclusive). */
export function treatmentEndISO(med: Pick<Medicine, 'startDate' | 'durationDays'>): string {
  return toDateISO(addDays(parseISO(med.startDate), med.durationDays - 1));
}

/** O remédio tem dose neste dia? */
export function isActiveOn(
  med: Pick<Medicine, 'active' | 'startDate' | 'durationDays'>,
  dateISO: string,
): boolean {
  if (!med.active) return false;
  return dateISO >= med.startDate && dateISO <= treatmentEndISO(med);
}

/**
 * Dias de tratamento que ainda faltam, contando hoje.
 * Antes de começar: duração inteira. Depois do fim (ou pausado): 0.
 */
export function daysRemaining(
  med: Pick<Medicine, 'active' | 'startDate' | 'durationDays'>,
  todayISO: string,
): number {
  if (!med.active) return 0;
  const end = treatmentEndISO(med);
  if (todayISO > end) return 0;
  const from = todayISO < med.startDate ? med.startDate : todayISO;
  const diffMs = parseISO(end).getTime() - parseISO(from).getTime();
  return Math.round(diffMs / 86_400_000) + 1;
}

/** Uma dose prevista para um dia: qual remédio e a que horas. */
export type DoseSlot = {
  medicineId: string;
  time: string;
};

/** Todas as doses previstas para um dia, ordenadas por horário. */
export function dosesForDate(medicines: Medicine[], dateISO: string): DoseSlot[] {
  const slots: DoseSlot[] = [];
  for (const med of medicines) {
    if (!isActiveOn(med, dateISO)) continue;
    for (const time of med.times) {
      slots.push({ medicineId: med.id, time });
    }
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.medicineId.localeCompare(b.medicineId));
}

export type DoseStatus = 'taken' | 'late' | 'upcoming';

/** Estado visual de uma dose de HOJE em relação ao relógio. */
export function doseStatus(time: string, nowHM: string, taken: boolean): DoseStatus {
  if (taken) return 'taken';
  return time < nowHM ? 'late' : 'upcoming';
}

/** Alarme diário desejado para um par (remédio, horário). */
export type DesiredAlarm = {
  medicineId: string;
  time: string;
  title: string;
  soundId: string;
};

/**
 * Conjunto de alarmes diários que deveriam existir HOJE.
 * Base do reconciliador (alarmSync): um alarme recorrente por
 * (remédio ativo hoje, horário) — nunca um por dia de tratamento.
 */
export function computeDesiredAlarms(medicines: Medicine[], todayISO: string): DesiredAlarm[] {
  const alarms: DesiredAlarm[] = [];
  for (const med of medicines) {
    if (!isActiveOn(med, todayISO)) continue;
    for (const time of med.times) {
      alarms.push({ medicineId: med.id, time, title: med.name, soundId: med.soundId });
    }
  }
  return alarms.sort((a, b) => a.time.localeCompare(b.time) || a.medicineId.localeCompare(b.medicineId));
}

/** Uma 1ª dose de um remédio cujo tratamento ainda não começou hoje. */
export type FutureFirstDose = {
  medicineId: string;
  time: string;
  title: string;
  soundId: string;
  /** Dia em que a dose acontece — sempre `med.startDate`, depois de hoje. */
  dateISO: string;
};

/**
 * Remédios ativos com início depois de hoje: o alarme diário recorrente só
 * nasce quando o remédio fica ativo (computeDesiredAlarms), e isso só
 * acontece se o app for reaberto naquele dia. Para a 1ª dose tocar mesmo
 * que o app não seja reaberto entre hoje e o início, alarmSync agenda
 * também um alarme de DATA FIXA para ela.
 */
export function computeFutureFirstDoses(
  medicines: Medicine[],
  todayISO: string,
): FutureFirstDose[] {
  const doses: FutureFirstDose[] = [];
  for (const med of medicines) {
    if (!med.active) continue;
    if (med.startDate <= todayISO) continue;
    for (const time of med.times) {
      doses.push({
        medicineId: med.id,
        time,
        title: med.name,
        soundId: med.soundId,
        dateISO: med.startDate,
      });
    }
  }
  return doses.sort(
    (a, b) =>
      a.dateISO.localeCompare(b.dateISO) ||
      a.time.localeCompare(b.time) ||
      a.medicineId.localeCompare(b.medicineId),
  );
}
