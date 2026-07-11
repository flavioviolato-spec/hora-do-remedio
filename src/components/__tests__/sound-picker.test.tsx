/**
 * Testes do SoundPicker: garante que
 *  1) nenhum defeito de mapeamento entre `ALARM_SOUNDS` (id/fileName) e o
 *     `PREVIEW_SOURCES` faz o botão de prévia tocar o som errado;
 *  2) um `value` desconhecido (soundId de dado antigo/removido do catálogo)
 *     não derruba o componente — só fica sem nenhuma opção marcada.
 *
 * `expo-audio` e `expo-symbols` são mockados porque dependem de módulos
 * nativos que não existem no ambiente de teste (Jest/Node), não porque a
 * lógica deles está sob teste aqui.
 *
 * NOTA sobre a checagem de mapeamento (item 1): o transform de assets do
 * jest-expo (`assetFileTransformer.js`) reduz TODO `require('*.wav')` ao
 * mesmo valor (`1`), então não dá pra provar "urgente.wav ≠ suave.wav" via
 * valor de retorno em runtime de teste. Por isso a prova aqui é estática:
 * lemos o código-fonte de `sound-picker.tsx` e conferimos, linha a linha,
 * que cada chave de `PREVIEW_SOURCES` faz `require` do arquivo com o MESMO
 * nome — e cruzamos essas chaves com `ALARM_SOUNDS` (a fonte da verdade).
 */
import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as React from 'react';
import { act, create } from 'react-test-renderer';

import { ALARM_SOUNDS } from '@/lib/sounds';

import { SoundPicker } from '../sound-picker';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }),
}));

jest.mock('expo-symbols', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => ReactActual.createElement(View, props),
  };
});

/** Só instâncias HOST (View/Text nativos) — evita contar 1x por cada camada
 * composta (Pressable, forwardRef internos etc.) que também recebe a prop. */
function hostInstancesWithProp(tree: ReturnType<typeof create>, key: string, value: unknown) {
  return tree.root
    .findAllByProps({ [key]: value })
    .filter((instance) => typeof instance.type === 'string');
}

describe('SoundPicker', () => {
  it('renderiza as 5 opções do catálogo sem quebrar', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<SoundPicker value="classico" onChange={() => {}} />);
    });
    const radios = hostInstancesWithProp(tree!, 'accessibilityRole', 'radio');
    expect(radios).toHaveLength(5);
  });

  it('marca a opção "classico" como selecionada quando value="classico"', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<SoundPicker value="classico" onChange={() => {}} />);
    });
    const radios = hostInstancesWithProp(tree!, 'accessibilityRole', 'radio');
    const selected = radios.filter((r) => r.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe('Clássico (padrão do iPhone)');
  });

  it('soundId desconhecido (removido do catálogo) não quebra e não marca nenhuma opção', () => {
    let tree: ReturnType<typeof create>;
    expect(() => {
      act(() => {
        tree = create(<SoundPicker value="campainha-antiga-removida" onChange={() => {}} />);
      });
    }).not.toThrow();
    const radios = hostInstancesWithProp(tree!, 'accessibilityRole', 'radio');
    expect(radios).toHaveLength(5);
    const selected = radios.filter((r) => r.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(0);
  });

  it('value vazio ("") também não quebra e não marca nenhuma opção', () => {
    let tree: ReturnType<typeof create>;
    expect(() => {
      act(() => {
        tree = create(<SoundPicker value="" onChange={() => {}} />);
      });
    }).not.toThrow();
    const radios = hostInstancesWithProp(tree!, 'accessibilityRole', 'radio');
    const selected = radios.filter((r) => r.props.accessibilityState?.selected === true);
    expect(selected).toHaveLength(0);
  });

  it('value=undefined (initial?.soundId ausente) também não quebra', () => {
    expect(() => {
      act(() => {
        // @ts-expect-error -- simula dado antigo sem soundId nenhum, de propósito
        create(<SoundPicker value={undefined} onChange={() => {}} />);
      });
    }).not.toThrow();
  });

  it('botão "Ouvir" existe só para os 4 sons customizados, um por som, sem duplicata', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<SoundPicker value="classico" onChange={() => {}} />);
    });
    const customSounds = ALARM_SOUNDS.filter((s) => s.fileName);
    for (const sound of customSounds) {
      const button = hostInstancesWithProp(tree!, 'accessibilityLabel', `Ouvir ${sound.label}`);
      expect(button).toHaveLength(1);
    }
    // "Clássico" não tem prévia (não existe arquivo local pra tocar).
    const classicoPreview = hostInstancesWithProp(tree!, 'accessibilityLabel', 'Ouvir Clássico (padrão do iPhone)');
    expect(classicoPreview).toHaveLength(0);
  });

  it('pressionar "Ouvir" de cada som customizado não lança erro', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<SoundPicker value="classico" onChange={() => {}} />);
    });
    const customSounds = ALARM_SOUNDS.filter((s) => s.fileName);
    for (const sound of customSounds) {
      // `onPress` só existe na instância composta do Pressable (a camada host
      // não recebe esse prop — ele é tratado internamente via responder),
      // por isso filtramos por quem tem accessibilityLabel + onPress função,
      // em vez de `hostInstancesWithProp` (que serve pra props de acessibilidade).
      const [button] = tree!.root
        .findAllByProps({ accessibilityLabel: `Ouvir ${sound.label}` })
        .filter((instance) => typeof instance.props.onPress === 'function');
      expect(button).toBeDefined();
      expect(() => {
        act(() => {
          button.props.onPress();
        });
      }).not.toThrow();
    }
  });

  it('PREVIEW_SOURCES: cada som customizado do catálogo faz require() do PRÓPRIO arquivo .wav (sem mapeamento cruzado)', () => {
    const source = readFileSync(join(__dirname, '..', 'sound-picker.tsx'), 'utf-8');
    const previewBlockMatch = source.match(/PREVIEW_SOURCES[^{]*\{([\s\S]*?)\n\};/);
    expect(previewBlockMatch).not.toBeNull();
    const block = previewBlockMatch![1];

    const entryRe = /(\w+):\s*require\('\.\.\/\.\.\/assets\/sounds\/([\w-]+)\.wav'\)/g;
    const entries: Record<string, string> = {};
    let match: RegExpExecArray | null;
    while ((match = entryRe.exec(block))) {
      entries[match[1]] = match[2];
    }

    const customSounds = ALARM_SOUNDS.filter((s) => s.fileName);
    // Toda opção customizada do catálogo tem uma entrada em PREVIEW_SOURCES...
    expect(Object.keys(entries).sort()).toEqual(customSounds.map((s) => s.fileName).sort());
    // ...e essa entrada faz require() do arquivo com o MESMO nome (chave === arquivo).
    for (const [key, fileInRequire] of Object.entries(entries)) {
      expect(fileInRequire).toBe(key);
    }
    // Confirma também que a chave bate com o fileName do catálogo (não só consigo mesma).
    for (const sound of customSounds) {
      expect(entries[sound.fileName as string]).toBe(sound.fileName);
    }
  });
});
