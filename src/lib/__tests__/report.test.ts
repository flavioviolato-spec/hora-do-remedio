import { describe, expect, it } from '@jest/globals';

import { buildAdherenceReport } from '../report';
import type { DoseRecord, Medicine } from '../types';

// Dados 100% fictícios (LGPD): nomes de remédio inventados.
function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Fictilina 500mg',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-05',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-05T09:00:00.000Z',
    ...overrides,
  };
}

function makeDose(dateISO: string, time: string, medicineId = 'med-1'): DoseRecord {
  return { medicineId, dateISO, time, takenAt: `${dateISO}T12:00:00.000Z` };
}

const TODAY = '2026-07-11';

describe('buildAdherenceReport — cabeçalho', () => {
  it('inclui título, remédio, período e horários', () => {
    const report = buildAdherenceReport(makeMedicine(), [], TODAY);
    expect(report).toContain('Relatório — Hora do Remédio');
    expect(report).toContain('Remédio: Fictilina 500mg');
    expect(report).toContain('Período: 05/07/2026 a 11/07/2026 (7 dias, em andamento)');
    expect(report).toContain('Horários: 08:00, 20:00 (2 doses por dia)');
  });

  it('inclui a linha Tratamento quando existe', () => {
    const report = buildAdherenceReport(makeMedicine({ treatment: 'Antibiótico' }), [], TODAY);
    expect(report).toContain('Tratamento: Antibiótico');
  });

  it('omite a linha Tratamento quando não existe', () => {
    const report = buildAdherenceReport(makeMedicine(), [], TODAY);
    expect(report).not.toContain('Tratamento:');
  });

  it('marca "concluído" quando o período já passou', () => {
    const med = makeMedicine({ startDate: '2026-06-01', durationDays: 5 });
    const report = buildAdherenceReport(med, [], TODAY);
    expect(report).toContain('(5 dias, concluído)');
  });

  it('preserva acentuação e ç no nome e no tratamento', () => {
    const med = makeMedicine({
      name: 'Solução Cíclica de Açaí',
      treatment: 'Infecção urinária',
    });
    const report = buildAdherenceReport(med, [], TODAY);
    expect(report).toContain('Remédio: Solução Cíclica de Açaí');
    expect(report).toContain('Tratamento: Infecção urinária');
  });
});

describe('buildAdherenceReport — adesão', () => {
  it('adesão 100%: todas as doses previstas tomadas', () => {
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 7 });
    // 10 e 11/07 já passaram: 2 dias × 2 horários = 4 doses previstas.
    const doses = [
      makeDose('2026-07-10', '08:00'),
      makeDose('2026-07-10', '20:00'),
      makeDose('2026-07-11', '08:00'),
      makeDose('2026-07-11', '20:00'),
    ];
    const report = buildAdherenceReport(med, doses, TODAY);
    expect(report).toContain('Doses tomadas: 4 de 4 previstas até hoje (100%)');
  });

  it('adesão parcial: percentual arredondado (10 de 14 = 71%)', () => {
    const doses: DoseRecord[] = [];
    for (const day of ['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09']) {
      doses.push(makeDose(day, '08:00'), makeDose(day, '20:00'));
    }
    const report = buildAdherenceReport(makeMedicine(), doses, TODAY);
    expect(report).toContain('Doses tomadas: 10 de 14 previstas até hoje (71%)');
  });

  it('adesão 0%: nenhuma dose marcada', () => {
    const report = buildAdherenceReport(makeMedicine(), [], TODAY);
    expect(report).toContain('Doses tomadas: 0 de 14 previstas até hoje (0%)');
  });

  it('ignora doses de OUTROS remédios no doseLog', () => {
    const doses = [
      makeDose('2026-07-10', '08:00', 'outro-remedio'),
      makeDose('2026-07-10', '08:00'),
    ];
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 2 });
    const report = buildAdherenceReport(med, doses, TODAY);
    expect(report).toContain('Doses tomadas: 1 de 4 previstas até hoje (25%)');
  });

  it('marca ✓ para tomada e ✗ para não marcada, dia mais recente primeiro', () => {
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 7 });
    const doses = [makeDose('2026-07-11', '08:00')];
    const report = buildAdherenceReport(med, doses, TODAY);
    const lines = report.split('\n');
    const dayLines = lines.filter((line) => /^\d{2}\/\d{2}:/.test(line));
    expect(dayLines[0]).toBe('11/07: 08:00 ✓  20:00 ✗');
    expect(dayLines[1]).toBe('10/07: 08:00 ✗  20:00 ✗');
  });
});

describe('buildAdherenceReport — tratamento futuro', () => {
  it('sem dose prevista ainda: texto honesto, sem percentual', () => {
    const med = makeMedicine({ startDate: '2026-08-01' });
    const report = buildAdherenceReport(med, [], TODAY);
    expect(report).toContain('(7 dias, ainda não começou)');
    expect(report).toContain('Tratamento ainda não começou.');
    expect(report).not.toContain('Doses tomadas');
    expect(report).not.toContain('Por dia');
  });
});

describe('buildAdherenceReport — corte em 30 dias', () => {
  it('lista no máximo 30 dias e resume o restante', () => {
    // Começou há 35 dias (06/06 → 11/07 = 36 dias corridos até hoje).
    const med = makeMedicine({ startDate: '2026-06-06', durationDays: 60 });
    const report = buildAdherenceReport(med, [], TODAY);
    const dayLines = report.split('\n').filter((line) => /^\d{2}\/\d{2}:/.test(line));
    expect(dayLines).toHaveLength(30);
    expect(report).toContain('… e mais 6 dias anteriores');
  });

  it('não mostra linha de resumo quando cabe tudo', () => {
    const report = buildAdherenceReport(makeMedicine(), [], TODAY);
    expect(report).not.toContain('e mais');
  });

  it('singular no resumo: "1 dia anterior"', () => {
    // 31 dias corridos até hoje: lista 30, sobra exatamente 1.
    const med = makeMedicine({ startDate: '2026-06-11', durationDays: 60 });
    const report = buildAdherenceReport(med, [], TODAY);
    expect(report).toContain('… e mais 1 dia anterior');
    expect(report).not.toContain('1 dia anteriores');
  });
});

describe('buildAdherenceReport — singular/plural', () => {
  it('1 dia, 1 dose por dia, 1 prevista', () => {
    const med = makeMedicine({ startDate: TODAY, durationDays: 1, times: ['08:00'] });
    const report = buildAdherenceReport(med, [], TODAY);
    expect(report).toContain('(1 dia, em andamento)');
    expect(report).toContain('(1 dose por dia)');
    expect(report).toContain('Doses tomadas: 0 de 1 prevista até hoje (0%)');
  });

  it('plural: dias, doses e previstas', () => {
    const report = buildAdherenceReport(makeMedicine(), [], TODAY);
    expect(report).toContain('(7 dias, em andamento)');
    expect(report).toContain('(2 doses por dia)');
    expect(report).toContain('previstas até hoje');
  });
});
