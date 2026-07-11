/**
 * Testes da sugestão automática de tratamento (módulo puro, sem I/O).
 * Regra de ouro coberta aqui: memória do usuário VENCE a lista curada,
 * e nada disso sobrescreve o que o usuário escreveu (isso é garantido
 * na camada do formulário, testada em medicine-form.test.tsx).
 */
import { describe, expect, it } from '@jest/globals';

import {
  TREATMENT_MEMORY_LIMIT,
  rememberTreatment,
  suggestTreatment,
} from '../treatment-suggestions';

describe('suggestTreatment', () => {
  it('memória do usuário vence a lista curada', () => {
    // "dipirona" está na lista curada como "Dor e febre", mas o usuário já
    // salvou esse remédio com outro tratamento — a escolha DELE prevalece.
    const memory = { dipirona: 'Dor nas costas' };
    expect(suggestTreatment('Dipirona', memory)).toBe('Dor nas costas');
  });

  it('match curado dentro de nome composto: "cloridrato de ciprofloxacino" → "Antibiótico"', () => {
    expect(suggestTreatment('cloridrato de ciprofloxacino', {})).toBe('Antibiótico');
  });

  it('acentuação não atrapalha: "Dipirona Sódica" → "Dor e febre"', () => {
    expect(suggestTreatment('Dipirona Sódica', {})).toBe('Dor e febre');
  });

  it('memória gravada com acento é encontrada mesmo digitando sem acento (e vice-versa)', () => {
    const memory = rememberTreatment({}, 'Óleo Mineral Extra', 'Intestino');
    expect(suggestTreatment('oleo mineral extra', memory)).toBe('Intestino');
    expect(suggestTreatment('ÓLEO MINERAL EXTRA', memory)).toBe('Intestino');
  });

  it('nome sem match em nenhuma fonte → null', () => {
    expect(suggestTreatment('Xarope Guaporé', {})).toBeNull();
  });

  it('nome vazio (ou só espaços) → null', () => {
    expect(suggestTreatment('', {})).toBeNull();
    expect(suggestTreatment('   ', {})).toBeNull();
  });

  it('nome herdado de Object.prototype ("constructor") não vira sugestão fantasma', () => {
    expect(suggestTreatment('constructor', {})).toBeNull();
  });
});

describe('rememberTreatment', () => {
  it('grava com nome normalizado como chave e tratamento aparado (trim) como valor', () => {
    const memory = rememberTreatment({}, 'Amoxicilina 500mg', '  Antibiótico  ');
    expect(memory).toEqual({ 'amoxicilina 500mg': 'Antibiótico' });
  });

  it('tratamento vazio (após trim) não grava nada — memória volta inalterada', () => {
    const original = { dipirona: 'Dor' };
    expect(rememberTreatment(original, 'Paracetamol', '   ')).toBe(original);
    expect(rememberTreatment(original, 'Paracetamol', '')).toBe(original);
  });

  it('nome vazio também não grava nada', () => {
    const original = { dipirona: 'Dor' };
    expect(rememberTreatment(original, '   ', 'Febre')).toBe(original);
  });

  it('não muta o Record original', () => {
    const original = { dipirona: 'Dor' };
    const next = rememberTreatment(original, 'Paracetamol', 'Febre');
    expect(original).toEqual({ dipirona: 'Dor' });
    expect(next).not.toBe(original);
    expect(next).toEqual({ dipirona: 'Dor', paracetamol: 'Febre' });
  });

  it('regravar o mesmo nome atualiza o valor sem duplicar entrada', () => {
    const first = rememberTreatment({}, 'Dipirona', 'Dor');
    const second = rememberTreatment(first, 'DIPIRONA', 'Febre');
    expect(second).toEqual({ dipirona: 'Febre' });
  });

  it(`respeita o teto de ${TREATMENT_MEMORY_LIMIT} entradas, descartando a mais antiga`, () => {
    let memory: Record<string, string> = {};
    for (let i = 0; i < TREATMENT_MEMORY_LIMIT; i++) {
      memory = rememberTreatment(memory, `remedio ${i}`, `Tratamento ${i}`);
    }
    expect(Object.keys(memory)).toHaveLength(TREATMENT_MEMORY_LIMIT);
    expect(memory['remedio 0']).toBe('Tratamento 0');

    // A inserção nº 201 estoura o teto: a entrada mais antiga cai, a nova entra.
    memory = rememberTreatment(memory, 'remedio novo', 'Tratamento novo');
    expect(Object.keys(memory)).toHaveLength(TREATMENT_MEMORY_LIMIT);
    expect(memory['remedio novo']).toBe('Tratamento novo');
    expect('remedio 0' in memory).toBe(false);
  });
});
