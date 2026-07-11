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
    treatment: '',
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

  // --- Casos-limite adicionados pelo QA ---

  it('duração exatamente 365 é válida (limite superior)', () => {
    expect(validateMedicine(makeValues({ durationDays: 365 }))).toEqual([]);
  });

  it('duração exatamente 1 é válida (limite inferior)', () => {
    expect(validateMedicine(makeValues({ durationDays: 1 }))).toEqual([]);
  });

  it('nome com exatamente 80 caracteres é válido (limite)', () => {
    expect(validateMedicine(makeValues({ name: 'a'.repeat(80) }))).toEqual([]);
  });

  it('horário sem dois-pontos ("0800") é rejeitado', () => {
    expect(validateMedicine(makeValues({ times: ['0800'] }))).not.toEqual([]);
  });

  it('horário com um dígito na hora ("8:00") é rejeitado', () => {
    expect(validateMedicine(makeValues({ times: ['8:00'] }))).not.toEqual([]);
  });

  it('data de início vazia: erro', () => {
    expect(validateMedicine(makeValues({ startDate: '' }))).not.toEqual([]);
  });

  it('29 de fevereiro em ano bissexto (2028) é válido', () => {
    expect(validateMedicine(makeValues({ startDate: '2028-02-29' }))).toEqual([]);
  });

  it('horários impossíveis ("24:00", "23:60", "99:99") são rejeitados', () => {
    expect(validateMedicine(makeValues({ times: ['24:00'] }))).not.toEqual([]);
    expect(validateMedicine(makeValues({ times: ['23:60'] }))).not.toEqual([]);
    expect(validateMedicine(makeValues({ times: ['99:99'] }))).not.toEqual([]);
  });

  it('datas impossíveis (30/02, mês 13, 29/02 em ano não bissexto) são rejeitadas', () => {
    expect(validateMedicine(makeValues({ startDate: '2026-02-30' }))).not.toEqual([]);
    expect(validateMedicine(makeValues({ startDate: '2026-13-01' }))).not.toEqual([]);
    expect(validateMedicine(makeValues({ startDate: '2026-02-29' }))).not.toEqual([]);
  });

  // --- Campo "Tratamento" (opcional) ---

  it('tratamento vazio: sem erro (campo opcional)', () => {
    expect(validateMedicine(makeValues({ treatment: '' }))).toEqual([]);
  });

  it('tratamento com acentuação e ç ("Infecção", "Anti-inflamatório"): sem erro', () => {
    expect(validateMedicine(makeValues({ treatment: 'Infecção' }))).toEqual([]);
    expect(validateMedicine(makeValues({ treatment: 'Anti-inflamatório' }))).toEqual([]);
  });

  it('tratamento com exatamente 40 caracteres é válido (limite superior)', () => {
    expect(validateMedicine(makeValues({ treatment: 'a'.repeat(40) }))).toEqual([]);
  });

  it('tratamento com 41 caracteres: erro', () => {
    expect(validateMedicine(makeValues({ treatment: 'a'.repeat(41) }))).not.toEqual([]);
  });

  it('tratamento só com espaços em branco NÃO conta como preenchido: sem erro de tamanho mesmo com mais de 40 espaços', () => {
    // Comportamento real do código: validateMedicine testa treatment.trim().length > 40,
    // então uma string de puros espaços colapsa para '' antes da checagem de tamanho.
    expect(validateMedicine(makeValues({ treatment: ' '.repeat(50) }))).toEqual([]);
  });

  it('tratamento com espaços nas pontas: só a parte "aparada" (trim) conta para o limite de 40', () => {
    // 40 letras + espaços nas pontas -> trim() = 40 -> não passa de 40 -> sem erro,
    // mesmo a string bruta tendo mais de 40 caracteres (44).
    const treatment = `  ${'a'.repeat(40)}  `;
    expect(treatment.length).toBe(44);
    expect(validateMedicine(makeValues({ treatment }))).toEqual([]);
  });

  it('tratamento com 41 letras "aparadas" (espaços nas pontas + 41 letras): erro', () => {
    const treatment = `  ${'a'.repeat(41)}  `;
    expect(validateMedicine(makeValues({ treatment }))).not.toEqual([]);
  });
});
