import { describe, expect, it } from '@jest/globals';

import { pickBestNameCandidate } from '../ocr-heuristics';

describe('pickBestNameCandidate', () => {
  it('lista vazia: devolve null', () => {
    expect(pickBestNameCandidate([])).toBeNull();
  });

  it('só linhas de dosagem/validade/lote: devolve null', () => {
    const lines = [
      '500mg',
      '10ml',
      '12/12/2027',
      'Lote 4521',
      'Val: 12/2027',
      'Comprimidos',
      'Cápsulas',
    ];
    expect(pickBestNameCandidate(lines)).toBeNull();
  });

  it('linha única simples: devolve essa linha', () => {
    expect(pickBestNameCandidate(['Dipirona'])).toBe('Dipirona');
  });

  it('várias linhas candidatas (nome + dosagem + laboratório + validade em dd/mm/aaaa): escolhe a linha certa, descarta as outras', () => {
    const lines = [
      'Amoxicilina',
      '500 mg',
      'Laboratório Exemplo LTDA',
      'Val: 12/12/2027',
    ];
    expect(pickBestNameCandidate(lines)).toBe('Amoxicilina');
  });

  it('descarta linhas vazias e só números antes de chegar no nome', () => {
    const lines = ['', '   ', '123', 'Paracetamol'];
    expect(pickBestNameCandidate(lines)).toBe('Paracetamol');
  });

  it('descarta linhas muito curtas (< 3 caracteres)', () => {
    const lines = ['mg', 'X', 'Ibuprofeno'];
    expect(pickBestNameCandidate(lines)).toBe('Ibuprofeno');
  });

  it('preserva acentuação e "ç" sem mangling de codificação', () => {
    expect(pickBestNameCandidate(['Ibuprofeno'])).toBe('Ibuprofeno');
    expect(pickBestNameCandidate(['Não sei ler isso'])).toBe('Não sei ler isso');
  });

  it('texto colado sem espaço (fonte comprimida) até 80 caracteres: mantém a linha inteira', () => {
    const glued = 'RemedioExemploComTextoColadoSemEspacoNenhum';
    expect(pickBestNameCandidate([glued])).toBe(glued);
  });

  it('linha maior que 80 caracteres: trunca em 80', () => {
    const longLine = 'A'.repeat(120);
    const result = pickBestNameCandidate([longLine]);
    expect(result).toHaveLength(80);
    expect(result).toBe('A'.repeat(80));
  });

  it('texto colado sem espaço E maior que 80 caracteres: ainda assim cortado em 80, sem travar', () => {
    const glued =
      'RemedioComNomeMuitoLongoColadoSemNenhumEspacoParaTestarOLimiteDeOitentaCaracteresDeVerdadeMesmo';
    expect(glued.length).toBeGreaterThan(80);
    const result = pickBestNameCandidate([glued]);
    expect(result).toHaveLength(80);
    expect(result).toBe(glued.slice(0, 80));
  });

  it('linha com espaços nas pontas: usa a linha aparada (trim)', () => {
    expect(pickBestNameCandidate(['  Losartana  '])).toBe('Losartana');
  });

  it('primeira linha boa vence, mesmo com candidatos bons depois dela', () => {
    expect(pickBestNameCandidate(['Dipirona Sódica', 'Outro Nome Possível'])).toBe(
      'Dipirona Sódica',
    );
  });
});
