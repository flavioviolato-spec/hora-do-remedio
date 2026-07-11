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

  // Cenários montados a partir de embalagens reais de genéricos brasileiros
  // (layout típico: laboratório no topo → nome em 2 linhas → faixa
  // "Medicamento Genérico" → textos regulatórios). Os medicamentos abaixo
  // são exemplos públicos de genéricos, não registro de uso de ninguém.
  describe('embalagens reais de genéricos (layout típico BR)', () => {
    it('caixa Eurofarma de ciprofloxacino: pula o laboratório e junta o nome quebrado em duas linhas', () => {
      const lines = [
        'Eurofarma',
        'cloridrato de',
        'ciprofloxacino',
        'Medicamento genérico',
        'Lei nº 9.787, de 1999',
        '500 mg',
        'Medicamento',
        'Genérico',
        'VENDA SOB PRESCRIÇÃO MÉDICA',
        'SÓ PODE SER VENDIDO COM',
        'RETENÇÃO DA RECEITA',
        'Uso oral',
        'Comprimido revestido',
        'USO ADULTO',
        'Contém:',
        '14 comprimidos',
      ];
      expect(pickBestNameCandidate(lines)).toBe('cloridrato de ciprofloxacino');
    });

    it('caixa Biosintética de ciclobenzaprina: pula o laboratório e junta o nome quebrado em duas linhas', () => {
      const lines = [
        'Biosintética',
        'cloridrato de',
        'ciclobenzaprina',
        'Medicamento genérico',
        'Lei nº 9.787, de 1999',
        'USO ADULTO',
        'COMPRIMIDOS REVESTIDOS',
        'Medicamento',
        'Genérico',
        'VENDA SOB',
        'PRESCRIÇÃO',
        'MÉDICA',
        'contém',
        '30',
        'comprimidos',
      ];
      expect(pickBestNameCandidate(lines)).toBe('cloridrato de ciclobenzaprina');
    });

    it('nome em minúsculas quebrado em duas linhas ("óleo" + "mineral"): junta e para na dosagem', () => {
      expect(pickBestNameCandidate(['óleo', 'mineral', '100ml'])).toBe('óleo mineral');
    });

    it('razão social com sufixo de empresa ("EMS S/A", "Neo Química Ltda") é filtrada mesmo não sendo igual ao nome da lista', () => {
      expect(pickBestNameCandidate(['EMS S/A', 'Dipirona'])).toBe('Dipirona');
      expect(pickBestNameCandidate(['Neo Química Ltda', 'Dipirona'])).toBe('Dipirona');
      expect(pickBestNameCandidate(['Aché Laboratórios Farmacêuticos S.A.', 'Dipirona'])).toBe(
        'Dipirona',
      );
    });

    it('faixa regulatória que COMEÇA com "medicamento" ("MEDICAMENTO FITOTERÁPICO") é filtrada', () => {
      expect(pickBestNameCandidate(['MEDICAMENTO FITOTERÁPICO', 'Maracugina'])).toBe('Maracugina');
      expect(
        pickBestNameCandidate(['MEDICAMENTO SIMILAR EQUIVALENTE AO DE REFERÊNCIA', 'Dipirona']),
      ).toBe('Dipirona');
    });

    it('outras vias de uso ("USO RETAL", "USO NASAL", "USO INJETÁVEL") também são filtradas', () => {
      expect(pickBestNameCandidate(['USO RETAL', 'Dipirona'])).toBe('Dipirona');
      expect(pickBestNameCandidate(['USO NASAL', 'Dipirona'])).toBe('Dipirona');
      expect(pickBestNameCandidate(['USO INJETÁVEL', 'Dipirona'])).toBe('Dipirona');
    });
  });

  describe('filtro de laboratórios conhecidos', () => {
    it('laboratório com acento ("Biosintética") é pulado', () => {
      expect(pickBestNameCandidate(['Biosintética', 'Dipirona'])).toBe('Dipirona');
    });

    it('laboratório sem acento e em minúsculas ("biosintetica") também é pulado', () => {
      expect(pickBestNameCandidate(['biosintetica', 'Dipirona'])).toBe('Dipirona');
    });

    it('laboratório em MAIÚSCULAS ("EUROFARMA") também é pulado', () => {
      expect(pickBestNameCandidate(['EUROFARMA', 'Dipirona'])).toBe('Dipirona');
    });

    it('linha que apenas CONTÉM o nome de um laboratório não é descartada (comparação é por igualdade)', () => {
      // "Bayer Aspirina" contém "bayer", mas a linha inteira não é igual a
      // "bayer" — então sobrevive como candidata a nome.
      expect(pickBestNameCandidate(['Bayer Aspirina', '500 mg'])).toBe('Bayer Aspirina');
    });

    it('só laboratórios na lista: devolve null', () => {
      expect(pickBestNameCandidate(['Eurofarma', 'Medley', 'Cimed'])).toBeNull();
    });
  });

  describe('junção de linhas vizinhas (nome composto quebrado pelo OCR)', () => {
    it('junta no máximo 3 linhas: a 4ª linha minúscula fica de fora', () => {
      expect(pickBestNameCandidate(['óleo', 'mineral', 'puro', 'extra'])).toBe(
        'óleo mineral puro',
      );
    });

    it('linha filtrada no meio interrompe a junção (dosagem entre as partes do nome)', () => {
      // A dosagem "500 mg" quebra a sequência: "ciprofloxacino" depois dela
      // NÃO é juntado. É o comportamento definido — uma linha ruim encerra
      // o bloco de texto.
      expect(pickBestNameCandidate(['cloridrato de', '500 mg', 'ciprofloxacino'])).toBe(
        'cloridrato de',
      );
    });

    it('linha MAIÚSCULA seguida de outra MAIÚSCULA não junta (blocos independentes)', () => {
      expect(pickBestNameCandidate(['Dipirona', 'Losartana'])).toBe('Dipirona');
    });

    it('linha MAIÚSCULA terminada em "de" junta mesmo com a próxima maiúscula', () => {
      expect(pickBestNameCandidate(['Cloridrato de', 'Ciprofloxacino'])).toBe(
        'Cloridrato de Ciprofloxacino',
      );
    });

    it('candidata terminada em "da"/"do" também junta a próxima linha', () => {
      expect(pickBestNameCandidate(['Tintura da', 'Planta', '10ml'])).toBe('Tintura da Planta');
      expect(pickBestNameCandidate(['Extrato do', 'Barbatimão', '10ml'])).toBe(
        'Extrato do Barbatimão',
      );
    });

    it('palavra que apenas TERMINA em "de"/"da"/"do" (sem ser preposição) não força junção', () => {
      // "Lavanda" termina em "da", mas não é a preposição "da" isolada.
      expect(pickBestNameCandidate(['Lavanda', 'Composta'])).toBe('Lavanda');
    });

    it('nome juntado maior que 80 caracteres: trunca em 80', () => {
      const parte1 = 'nome'.padEnd(50, 'x'); // minúsculas pra permitir junção
      const parte2 = 'continuacao'.padEnd(50, 'y');
      const result = pickBestNameCandidate([parte1, parte2]);
      expect(result).toHaveLength(80);
      expect(result).toBe(`${parte1} ${parte2}`.slice(0, 80));
    });
  });

  describe('filtros de texto padrão de embalagem', () => {
    it('"Medicamento" sozinho é filtrado (^medicamento$)', () => {
      expect(pickBestNameCandidate(['Medicamento', 'Dipirona'])).toBe('Dipirona');
      expect(pickBestNameCandidate(['MEDICAMENTO'])).toBeNull();
    });

    it('nome real contendo "medicamento" no meio da linha NÃO é filtrado', () => {
      expect(pickBestNameCandidate(['Meu medicamento especial'])).toBe(
        'Meu medicamento especial',
      );
    });

    it('textos regulatórios são filtrados (lei, venda sob, prescrição, retenção, receita, uso oral/adulto, contém)', () => {
      const lines = [
        'Medicamento genérico',
        'Lei nº 9.787, de 1999',
        'VENDA SOB PRESCRIÇÃO MÉDICA',
        'RETENÇÃO DA RECEITA',
        'Uso oral',
        'USO ADULTO',
        'Via oral',
        'Contém:',
        'Farmacêutico responsável',
        'Resp. Téc.: Fulano Fictício',
      ];
      expect(pickBestNameCandidate(lines)).toBeNull();
    });

    it('"Genérico" sozinho é filtrado', () => {
      expect(pickBestNameCandidate(['Genérico', 'Nimesulida'])).toBe('Nimesulida');
    });
  });
});
