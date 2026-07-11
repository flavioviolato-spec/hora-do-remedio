import { describe, expect, it } from '@jest/globals';

import {
  buildHistoryGrid,
  computeDesiredAlarms,
  computeFutureFirstDoses,
  daysRemaining,
  doseStatus,
  dosesForDate,
  isActiveOn,
  treatmentEndISO,
} from '../schedule';
import type { Medicine } from '../types';
import { doseKey } from '../types';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Remédio Teste 500mg',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

describe('treatmentEndISO', () => {
  it('duração 7 dias: termina 6 dias após o início', () => {
    expect(treatmentEndISO(makeMedicine())).toBe('2026-07-16');
  });

  it('duração 1 dia: termina no próprio dia', () => {
    expect(treatmentEndISO(makeMedicine({ durationDays: 1 }))).toBe('2026-07-10');
  });

  it('atravessa virada de mês', () => {
    expect(treatmentEndISO(makeMedicine({ startDate: '2026-07-28', durationDays: 10 }))).toBe(
      '2026-08-06',
    );
  });

  it('atravessa virada de ano', () => {
    expect(treatmentEndISO(makeMedicine({ startDate: '2026-12-30', durationDays: 5 }))).toBe(
      '2027-01-03',
    );
  });

  it('29 de fevereiro em ano bissexto: início e travessia corretos', () => {
    expect(treatmentEndISO(makeMedicine({ startDate: '2028-02-28', durationDays: 2 }))).toBe(
      '2028-02-29',
    );
    expect(treatmentEndISO(makeMedicine({ startDate: '2028-02-29', durationDays: 1 }))).toBe(
      '2028-02-29',
    );
    expect(treatmentEndISO(makeMedicine({ startDate: '2028-02-29', durationDays: 2 }))).toBe(
      '2028-03-01',
    );
  });

  it('fevereiro em ano NÃO bissexto: 28/02 + 2 dias cai em 01/03', () => {
    expect(treatmentEndISO(makeMedicine({ startDate: '2026-02-28', durationDays: 2 }))).toBe(
      '2026-03-01',
    );
  });

  it('duração 365 exata: ano comum fecha em 31/12; ano bissexto fecha em 30/12', () => {
    expect(treatmentEndISO(makeMedicine({ startDate: '2026-01-01', durationDays: 365 }))).toBe(
      '2026-12-31',
    );
    expect(treatmentEndISO(makeMedicine({ startDate: '2028-01-01', durationDays: 365 }))).toBe(
      '2028-12-30',
    );
  });

  it('contrato: só recebe datas válidas — data impossível lança RangeError', () => {
    // A validação e a sanitização barram datas impossíveis antes daqui
    // (isValidDateISO em types.ts). Se uma passar por um caminho novo,
    // o erro é imediato e barulhento, não silencioso:
    expect(() => treatmentEndISO(makeMedicine({ startDate: '2026-02-30' }))).toThrow(RangeError);
  });
});

describe('isActiveOn', () => {
  const med = makeMedicine();

  it('falso antes do início', () => {
    expect(isActiveOn(med, '2026-07-09')).toBe(false);
  });

  it('verdadeiro no primeiro e no último dia', () => {
    expect(isActiveOn(med, '2026-07-10')).toBe(true);
    expect(isActiveOn(med, '2026-07-16')).toBe(true);
  });

  it('falso no dia seguinte ao fim', () => {
    expect(isActiveOn(med, '2026-07-17')).toBe(false);
  });

  it('falso quando pausado', () => {
    expect(isActiveOn(makeMedicine({ active: false }), '2026-07-10')).toBe(false);
  });
});

describe('daysRemaining', () => {
  const med = makeMedicine();

  it('no primeiro dia: duração inteira', () => {
    expect(daysRemaining(med, '2026-07-10')).toBe(7);
  });

  it('no último dia: 1', () => {
    expect(daysRemaining(med, '2026-07-16')).toBe(1);
  });

  it('depois do fim: 0', () => {
    expect(daysRemaining(med, '2026-07-17')).toBe(0);
  });

  it('antes do início: duração inteira', () => {
    expect(daysRemaining(med, '2026-07-01')).toBe(7);
  });

  it('pausado: 0', () => {
    expect(daysRemaining(makeMedicine({ active: false }), '2026-07-10')).toBe(0);
  });

  it('atravessando virada de mês', () => {
    const longo = makeMedicine({ startDate: '2026-07-28', durationDays: 10 });
    expect(daysRemaining(longo, '2026-07-30')).toBe(8);
    expect(daysRemaining(longo, '2026-08-06')).toBe(1);
  });

  it('duração 365 exata: 365 no primeiro dia, 1 no último', () => {
    const ano = makeMedicine({ startDate: '2026-01-01', durationDays: 365 });
    expect(daysRemaining(ano, '2026-01-01')).toBe(365);
    expect(daysRemaining(ano, '2026-12-31')).toBe(1);
    expect(daysRemaining(ano, '2027-01-01')).toBe(0);
  });

  it('tratamento que atravessa 29/02 bissexto conta o dia extra', () => {
    const med = makeMedicine({ startDate: '2028-02-28', durationDays: 3 }); // 28, 29/02 e 01/03
    expect(daysRemaining(med, '2028-02-28')).toBe(3);
    expect(daysRemaining(med, '2028-02-29')).toBe(2);
    expect(daysRemaining(med, '2028-03-01')).toBe(1);
  });
});

describe('dosesForDate', () => {
  it('lista vazia de remédios: nenhuma dose', () => {
    expect(dosesForDate([], '2026-07-10')).toEqual([]);
  });

  it('ordena por horário misturando remédios', () => {
    const a = makeMedicine({ id: 'a', times: ['14:00', '06:00'] });
    const b = makeMedicine({ id: 'b', times: ['08:30'] });
    expect(dosesForDate([a, b], '2026-07-12')).toEqual([
      { medicineId: 'a', time: '06:00' },
      { medicineId: 'b', time: '08:30' },
      { medicineId: 'a', time: '14:00' },
    ]);
  });

  it('ignora remédio fora do período ou pausado', () => {
    const encerrado = makeMedicine({ id: 'x', startDate: '2026-07-01', durationDays: 2 });
    const pausado = makeMedicine({ id: 'y', active: false });
    expect(dosesForDate([encerrado, pausado], '2026-07-10')).toEqual([]);
  });

  it('remédio sem horários: nenhuma dose', () => {
    expect(dosesForDate([makeMedicine({ times: [] })], '2026-07-10')).toEqual([]);
  });

  it('horários duplicados entre remédios diferentes aparecem os dois', () => {
    const a = makeMedicine({ id: 'a', times: ['08:00'] });
    const b = makeMedicine({ id: 'b', times: ['08:00'] });
    expect(dosesForDate([a, b], '2026-07-10')).toHaveLength(2);
  });
});

describe('doseStatus', () => {
  it('tomada é sempre "taken"', () => {
    expect(doseStatus('08:00', '07:00', true)).toBe('taken');
    expect(doseStatus('08:00', '09:00', true)).toBe('taken');
  });

  it('horário já passou e não tomou: "late"', () => {
    expect(doseStatus('08:00', '08:01', false)).toBe('late');
  });

  it('horário exato ainda não é atraso', () => {
    expect(doseStatus('08:00', '08:00', false)).toBe('upcoming');
  });

  it('horário futuro: "upcoming"', () => {
    expect(doseStatus('20:00', '08:00', false)).toBe('upcoming');
  });

  it('virada de meia-noite: dose 00:00 vista às 00:00 ainda é "upcoming", às 00:01 é "late"', () => {
    expect(doseStatus('00:00', '00:00', false)).toBe('upcoming');
    expect(doseStatus('00:00', '00:01', false)).toBe('late');
  });

  it('fim do dia: dose 23:59 vista às 23:59 é "upcoming", tomada é "taken"', () => {
    expect(doseStatus('23:59', '23:59', false)).toBe('upcoming');
    expect(doseStatus('23:59', '23:59', true)).toBe('taken');
  });

  it('contrato: comparação vale só dentro do MESMO dia (23:00 vs relógio 00:00 do dia seguinte não é atraso)', () => {
    // Quem chama doseStatus deve recalcular a lista de doses quando o dia vira;
    // este teste fixa a semântica: a função não conhece datas, só horários.
    expect(doseStatus('23:00', '00:00', false)).toBe('upcoming');
  });
});

describe('computeDesiredAlarms', () => {
  it('um alarme por (remédio ativo, horário), nunca por dia de tratamento', () => {
    const med = makeMedicine({ durationDays: 30 });
    const alarms = computeDesiredAlarms([med], '2026-07-10');
    expect(alarms).toHaveLength(2); // 2 horários, não 60
    expect(alarms[0]).toEqual({
      medicineId: 'med-1',
      time: '08:00',
      title: 'Remédio Teste 500mg',
      soundId: 'classico',
    });
  });

  it('remédio que ainda não começou não gera alarme diário', () => {
    const futuro = makeMedicine({ startDate: '2026-08-01' });
    expect(computeDesiredAlarms([futuro], '2026-07-10')).toEqual([]);
  });

  it('nome com acentuação e ç preservado no título', () => {
    const med = makeMedicine({ name: 'Solução de Ibuprofeno — atenção à ç', times: ['08:00'] });
    expect(computeDesiredAlarms([med], '2026-07-10')[0].title).toBe(
      'Solução de Ibuprofeno — atenção à ç',
    );
  });

  it('horários fora de ordem no cadastro saem ordenados nos alarmes', () => {
    const med = makeMedicine({ times: ['22:00', '06:00', '14:00'] });
    expect(computeDesiredAlarms([med], '2026-07-10').map((a) => a.time)).toEqual([
      '06:00',
      '14:00',
      '22:00',
    ]);
  });

  it('mesmo horário em remédios diferentes: desempate estável por id', () => {
    const b = makeMedicine({ id: 'med-b', times: ['08:00'] });
    const a = makeMedicine({ id: 'med-a', times: ['08:00'] });
    expect(computeDesiredAlarms([b, a], '2026-07-10').map((x) => x.medicineId)).toEqual([
      'med-a',
      'med-b',
    ]);
  });

  it('remédio pausado não gera alarme mesmo dentro do período', () => {
    expect(computeDesiredAlarms([makeMedicine({ active: false })], '2026-07-10')).toEqual([]);
  });
});

describe('computeFutureFirstDoses', () => {
  it('remédio que ainda não começou gera 1ª dose futura por horário', () => {
    const futuro = makeMedicine({ startDate: '2026-08-01', times: ['08:00', '20:00'] });
    const doses = computeFutureFirstDoses([futuro], '2026-07-10');
    expect(doses).toEqual([
      { medicineId: 'med-1', time: '08:00', title: 'Remédio Teste 500mg', soundId: 'classico', dateISO: '2026-08-01' },
      { medicineId: 'med-1', time: '20:00', title: 'Remédio Teste 500mg', soundId: 'classico', dateISO: '2026-08-01' },
    ]);
  });

  it('remédio que já começou hoje não entra (vira alarme diário, não fixo)', () => {
    expect(computeFutureFirstDoses([makeMedicine({ startDate: '2026-07-10' })], '2026-07-10')).toEqual(
      [],
    );
  });

  it('remédio que já começou no passado não entra', () => {
    const antigo = makeMedicine({ startDate: '2026-07-01' });
    expect(computeFutureFirstDoses([antigo], '2026-07-10')).toEqual([]);
  });

  it('remédio pausado com início futuro não entra', () => {
    const pausado = makeMedicine({ startDate: '2026-08-01', active: false });
    expect(computeFutureFirstDoses([pausado], '2026-07-10')).toEqual([]);
  });

  it('ordena por data, depois horário, depois id', () => {
    const b = makeMedicine({ id: 'med-b', startDate: '2026-07-20', times: ['09:00'] });
    const a = makeMedicine({ id: 'med-a', startDate: '2026-07-15', times: ['18:00', '06:00'] });
    expect(computeFutureFirstDoses([b, a], '2026-07-10').map((d) => `${d.dateISO} ${d.time} ${d.medicineId}`)).toEqual([
      '2026-07-15 06:00 med-a',
      '2026-07-15 18:00 med-a',
      '2026-07-20 09:00 med-b',
    ]);
  });
});

describe('buildHistoryGrid', () => {
  it('remédio que ainda não começou: histórico vazio', () => {
    const futuro = makeMedicine({ startDate: '2026-08-01' });
    expect(buildHistoryGrid(futuro, [], '2026-07-10')).toEqual([]);
  });

  it('vai do início do tratamento até HOJE, mais recente primeiro', () => {
    const med = makeMedicine({ startDate: '2026-07-08', durationDays: 10, times: ['08:00'] });
    const grid = buildHistoryGrid(med, [], '2026-07-10');
    expect(grid.map((d) => d.dateISO)).toEqual(['2026-07-10', '2026-07-09', '2026-07-08']);
  });

  it('não passa do fim do tratamento mesmo que hoje seja depois', () => {
    const med = makeMedicine({ startDate: '2026-07-01', durationDays: 3, times: ['08:00'] });
    const grid = buildHistoryGrid(med, [], '2026-07-10');
    expect(grid.map((d) => d.dateISO)).toEqual(['2026-07-03', '2026-07-02', '2026-07-01']);
  });

  it('marca cada célula como tomada ou não, por dia e horário', () => {
    const med = makeMedicine({ startDate: '2026-07-09', durationDays: 5, times: ['08:00', '20:00'] });
    const doseLog = [
      { dateISO: '2026-07-09', time: '08:00' },
      { dateISO: '2026-07-10', time: '20:00' },
    ];
    const grid = buildHistoryGrid(med, doseLog, '2026-07-10');

    expect(grid).toEqual([
      {
        dateISO: '2026-07-10',
        cells: [
          { time: '08:00', taken: false },
          { time: '20:00', taken: true },
        ],
      },
      {
        dateISO: '2026-07-09',
        cells: [
          { time: '08:00', taken: true },
          { time: '20:00', taken: false },
        ],
      },
    ]);
  });

  it('remédio pausado ainda mostra histórico (pausa não apaga o passado)', () => {
    const med = makeMedicine({ startDate: '2026-07-08', durationDays: 5, active: false });
    expect(buildHistoryGrid(med, [], '2026-07-10')).toHaveLength(3);
  });

  // --- Casos-limite adicionados pelo QA ---

  it('tratamento de 1 dia que começa e termina HOJE: exatamente 1 linha', () => {
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 1, times: ['08:00', '20:00'] });
    const grid = buildHistoryGrid(med, [], '2026-07-10');
    expect(grid).toEqual([
      { dateISO: '2026-07-10', cells: [{ time: '08:00', taken: false }, { time: '20:00', taken: false }] },
    ]);
  });

  it('remédio que começa exatamente hoje (tratamento longo): 1 linha, não mais que isso', () => {
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 30, times: ['08:00'] });
    const grid = buildHistoryGrid(med, [], '2026-07-10');
    expect(grid.map((d) => d.dateISO)).toEqual(['2026-07-10']);
  });

  it('duração 365 dias: número de linhas cresce 1 por dia até hoje, sem passar do fim', () => {
    const med = makeMedicine({ startDate: '2026-01-01', durationDays: 365, times: ['08:00'] });
    expect(buildHistoryGrid(med, [], '2026-01-01')).toHaveLength(1);
    expect(buildHistoryGrid(med, [], '2026-06-15')).toHaveLength(166);
    // Depois do fim do tratamento (hoje > treatmentEndISO): trava em 365, não continua crescendo.
    expect(buildHistoryGrid(med, [], '2026-12-31')).toHaveLength(365);
    expect(buildHistoryGrid(med, [], '2027-06-01')).toHaveLength(365);
  });

  it('grade atravessa virada de ano corretamente (mais recente primeiro)', () => {
    const med = makeMedicine({ startDate: '2026-12-30', durationDays: 10, times: ['08:00'] });
    const grid = buildHistoryGrid(med, [], '2027-01-02');
    expect(grid.map((d) => d.dateISO)).toEqual([
      '2027-01-02',
      '2027-01-01',
      '2026-12-31',
      '2026-12-30',
    ]);
  });

  it('grade atravessa 29/02 em ano bissexto e inclui o dia extra', () => {
    const med = makeMedicine({ startDate: '2028-02-27', durationDays: 10, times: ['08:00'] });
    const grid = buildHistoryGrid(med, [], '2028-03-01');
    expect(grid.map((d) => d.dateISO)).toEqual([
      '2028-03-01',
      '2028-02-29',
      '2028-02-28',
      '2028-02-27',
    ]);
  });

  it('mesmo horário de dias DIFERENTES não vaza marcação de um dia para o outro', () => {
    const med = makeMedicine({ startDate: '2026-07-09', durationDays: 5, times: ['08:00'] });
    const doseLog = [{ dateISO: '2026-07-09', time: '08:00' }]; // só o dia 09
    const grid = buildHistoryGrid(med, doseLog, '2026-07-11');
    expect(grid).toEqual([
      { dateISO: '2026-07-11', cells: [{ time: '08:00', taken: false }] },
      { dateISO: '2026-07-10', cells: [{ time: '08:00', taken: false }] },
      { dateISO: '2026-07-09', cells: [{ time: '08:00', taken: true }] },
    ]);
  });

  it('doseLog com registro duplicado (mesma data+hora duas vezes) não gera célula duplicada nem quebra', () => {
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 1, times: ['08:00'] });
    const doseLog = [
      { dateISO: '2026-07-10', time: '08:00' },
      { dateISO: '2026-07-10', time: '08:00' },
    ];
    const grid = buildHistoryGrid(med, doseLog, '2026-07-10');
    expect(grid).toEqual([{ dateISO: '2026-07-10', cells: [{ time: '08:00', taken: true }] }]);
  });

  it('remédio sem horários (defensivo): grade tem os dias mas cada linha vem sem células', () => {
    const med = makeMedicine({ startDate: '2026-07-10', durationDays: 2, times: [] });
    const grid = buildHistoryGrid(med, [], '2026-07-10');
    expect(grid).toEqual([{ dateISO: '2026-07-10', cells: [] }]);
  });
});

describe('doseKey', () => {
  it('formato estável medicineId|data|hora', () => {
    expect(doseKey('med-1', '2026-07-10', '08:00')).toBe('med-1|2026-07-10|08:00');
  });
});
