/**
 * Relatório de adesão em texto puro — pra pessoa compartilhar com o médico
 * na consulta (WhatsApp, e-mail, impressão). Função pura, sem I/O: quem
 * chama decide como compartilhar (Share nativo do iOS).
 */

import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { buildHistoryGrid, treatmentEndISO } from './schedule';
import type { DoseRecord, Medicine } from './types';

/** Dias listados no detalhamento "Por dia" — o resto vira uma linha-resumo. */
const MAX_DAYS_LISTED = 30;

function formatDateBR(dateISO: string): string {
  return format(parseISO(dateISO), 'dd/MM/yyyy', { locale: ptBR });
}

function formatDayShort(dateISO: string): string {
  return format(parseISO(dateISO), 'dd/MM', { locale: ptBR });
}

/**
 * Monta o texto do relatório de adesão de UM remédio até `todayISO`.
 * `doseLog` pode vir com doses de outros remédios — filtramos aqui.
 */
export function buildAdherenceReport(
  medicine: Medicine,
  doseLog: DoseRecord[],
  todayISO: string,
): string {
  const endISO = treatmentEndISO(medicine);
  const dosesPerDay = medicine.times.length;

  const lines: string[] = ['Relatório — Hora do Remédio', ''];
  lines.push(`Remédio: ${medicine.name}`);
  if (medicine.treatment) lines.push(`Tratamento: ${medicine.treatment}`);

  const statusLabel =
    todayISO > endISO ? 'concluído' : todayISO < medicine.startDate ? 'ainda não começou' : 'em andamento';
  const durationLabel = `${medicine.durationDays} ${medicine.durationDays === 1 ? 'dia' : 'dias'}`;
  lines.push(
    `Período: ${formatDateBR(medicine.startDate)} a ${formatDateBR(endISO)} (${durationLabel}, ${statusLabel})`,
  );
  lines.push(
    `Horários: ${medicine.times.join(', ')} (${dosesPerDay} ${dosesPerDay === 1 ? 'dose' : 'doses'} por dia)`,
  );
  lines.push('');

  const medicineDoses = doseLog.filter((dose) => dose.medicineId === medicine.id);
  const grid = buildHistoryGrid(medicine, medicineDoses, todayISO);

  // Tratamento futuro: nenhuma dose prevista ainda — texto honesto, sem
  // inventar "0 de 0 (0%)".
  if (grid.length === 0) {
    lines.push('Tratamento ainda não começou.');
    return lines.join('\n');
  }

  const expected = grid.length * dosesPerDay;
  const taken = grid.reduce(
    (sum, day) => sum + day.cells.filter((cell) => cell.taken).length,
    0,
  );
  const percent = Math.round((taken / expected) * 100);
  lines.push(
    `Doses tomadas: ${taken} de ${expected} ${expected === 1 ? 'prevista' : 'previstas'} até hoje (${percent}%)`,
  );
  lines.push('');

  lines.push('Por dia (✓ tomada, ✗ não marcada):');
  // A grade já vem do mais recente pro mais antigo — cortamos o rabo.
  const listed = grid.slice(0, MAX_DAYS_LISTED);
  for (const day of listed) {
    const cells = day.cells.map((cell) => `${cell.time} ${cell.taken ? '✓' : '✗'}`).join('  ');
    lines.push(`${formatDayShort(day.dateISO)}: ${cells}`);
  }
  const omitted = grid.length - listed.length;
  if (omitted > 0) {
    lines.push(`… e mais ${omitted} ${omitted === 1 ? 'dia anterior' : 'dias anteriores'}`);
  }

  return lines.join('\n');
}
