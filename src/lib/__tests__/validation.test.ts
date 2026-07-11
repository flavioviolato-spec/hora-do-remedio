import { describe, expect, it } from '@jest/globals';

import { validateMedicine, type MedicineFormValues } from '../validation';

function makeValues(overrides: Partial<MedicineFormValues> = {}): MedicineFormValues {
  return {
    name: 'Amoxicilina 500mg',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    ...overrides,
  };
}

describe('validateMedicine', () => {
  it('valores corretos: sem erros', () => {
    expect(validateMedicine(makeValues())).toEqual([]);
  });

  it('nome com acentuação e ç é válido', () => {
    expect(validateMedicine(makeValues({ name: 'Solução à base de ç' }))).toEqual([]);
  });

  it('nome vazio ou só espaços: erro', () => {
    expect(validateMedicine(makeValues({ name: '' }))).not.toEqual([]);
    expect(validateMedicine(makeValues({ name: '   ' }))).not.toEqual([]);
  });

  it('nome longo demais: erro', () => {
    expect(validateMedicine(makeValues({ name: 'a'.repeat(81) }))).not.toEqual([]);
  });

  it('sem horários: erro', () => {
    expect(validateMedicine(makeValues({ times: [] }))).not.toEqual([]);
  });

  it('horário duplicado: erro', () => {
    expect(validateMedicine(makeValues({ times: ['08:00', '08:00'] }))).not.toEqual([]);
  });

  it('horário em formato inválido: erro', () => {
    expect(validateMedicine(makeValues({ times: ['8h'] }))).not.toEqual([]);
  });

  it('duração menor que 1 ou não inteira: erro', () => {
    expect(validateMedicine(makeValues({ durationDays: 0 }))).not.toEqual([]);
    expect(validateMedicine(makeValues({ durationDays: 2.5 }))).not.toEqual([]);
  });

  it('duração acima de 365: erro', () => {
    expect(validateMedicine(makeValues({ durationDays: 366 }))).not.toEqual([]);
  });

  it('data de início inválida: erro', () => {
    expect(validateMedicine(makeValues({ startDate: '10/07/2026' }))).not.toEqual([]);
  });

  it('sem foto é permitido (foto é opcional)', () => {
    expect(validateMedicine(makeValues({ photoUri: null }))).toEqual([]);
  });

  it('erros se acumulam', () => {
    const errors = validateMedicine(makeValues({ name: '', times: [], durationDays: 0 }));
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
