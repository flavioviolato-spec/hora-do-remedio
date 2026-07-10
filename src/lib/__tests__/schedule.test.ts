import { describe, expect, it } from '@jest/globals';

import {
  computeDesiredAlarms,
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
});

describe('doseKey', () => {
  it('formato estável medicineId|data|hora', () => {
    expect(doseKey('med-1', '2026-07-10', '08:00')).toBe('med-1|2026-07-10|08:00');
  });
});
