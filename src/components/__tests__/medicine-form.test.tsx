/**
 * Testes do MedicineForm focados na leitura automática (OCR) do nome do
 * remédio disparada por `runOcr` (foto tirada/escolhida). Cobre as 3
 * proteções que hoje só eram checadas manualmente:
 *  1) "pedido mais recente vence" (ocrRequestIdRef) — resultado de foto
 *     antiga chegando DEPOIS do resultado da foto nova não sobrescreve.
 *  2) nunca sobrescreve o que o usuário já digitou no campo Nome.
 *  3) campo vazio quando o OCR termina -> sugestão é aplicada.
 *
 * `expo-audio`/`expo-symbols` mockados pelo mesmo motivo de
 * sound-picker.test.tsx (módulos nativos ausentes no Jest). `expo-image`,
 * `expo-image-picker` e `@react-native-community/datetimepicker` também
 * dependem de módulos nativos ausentes. `@/lib/ocr` é mockado com
 * resolução manual (array de resolvers) para controlar, dentro do teste,
 * a ordem de término das leituras — é essa ordem invertida que prova (ou
 * derruba) a proteção 1. `@/lib/ocr-heuristics` roda de verdade (função
 * pura, já testada em outro arquivo).
 */
import { describe, expect, it, jest } from '@jest/globals';
import * as React from 'react';
import { act, create } from 'react-test-renderer';

import { MedicineForm } from '../medicine-form';

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

jest.mock('expo-image', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => ReactActual.createElement(View, props),
  };
});

jest.mock('@react-native-community/datetimepicker', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => ReactActual.createElement(View, props),
  };
});

const mockLaunchImageLibraryAsync = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLaunchCameraAsync = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockRequestCameraPermissionsAsync = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCameraAsync(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermissionsAsync(...args),
}));

const mockRecognizeText = jest.fn<(...args: unknown[]) => Promise<string[]>>();
jest.mock('@/lib/ocr', () => ({
  recognizeText: (...args: unknown[]) => mockRecognizeText(...args),
}));

/** Fila de "controles manuais": cada chamada de mockRecognizeText() devolve uma
 * promise nova, guardada aqui, cujo resolve só é disparado quando o teste
 * mandar — permite decidir a ORDEM de término independente da ordem de
 * chamada. */
function makeManualOcr() {
  const resolvers: Array<(lines: string[]) => void> = [];
  mockRecognizeText.mockImplementation(
    () =>
      new Promise<string[]>((resolve) => {
        resolvers.push(resolve);
      }),
  );
  return resolvers;
}

function findNameInput(tree: ReturnType<typeof create>) {
  return tree.root.findByProps({ accessibilityLabel: 'Nome do remédio' });
}

/** Acha o Pressable "Da galeria" (não tem accessibilityLabel próprio — o
 * texto está no filho ThemedText — por isso localizamos o texto e subimos
 * até o Pressable ancestral mais próximo). Evita `JSON.stringify` em
 * test-instances: a árvore do react-test-renderer tem referências
 * circulares (fiber) que quebram `JSON.stringify`. */
function findLibraryPressable(tree: ReturnType<typeof create>) {
  const textNode = tree.root
    .findAll((node) => typeof node.type === 'string')
    .find((node) => (node.children ?? []).includes('Da galeria'));
  expect(textNode).toBeDefined();
  // Sobe até o ancestral composto que carrega o `onPress` de verdade (a
  // camada host/View com accessibilityRole="button" não expõe `onPress`
  // como prop — mesma observação já documentada em sound-picker.test.tsx).
  let current = textNode!.parent;
  while (current && typeof current.props.onPress !== 'function') {
    current = current.parent;
  }
  expect(current).not.toBeNull();
  return current!;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('MedicineForm - OCR do nome do remédio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resultado da foto mais RECENTE vence mesmo quando termina antes do resultado da foto mais ANTIGA chegar depois', async () => {
    const resolvers = makeManualOcr();
    mockLaunchImageLibraryAsync.mockImplementation(async () => ({
      canceled: false,
      assets: [{ uri: `foto-${mockLaunchImageLibraryAsync.mock.calls.length}.jpg` }],
    }));

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<MedicineForm submitLabel="Salvar" onSubmit={async () => {}} />);
    });

    const libraryPressable = findLibraryPressable(tree!);

    // Foto A: dispara pickFromLibrary (chamada 1 de mockRecognizeText).
    await act(async () => {
      await (libraryPressable!.props.onPress as () => Promise<void>)();
    });
    // Foto B: dispara de novo antes de A terminar (chamada 2).
    await act(async () => {
      await (libraryPressable!.props.onPress as () => Promise<void>)();
    });

    expect(mockRecognizeText).toHaveBeenCalledTimes(2);
    expect(resolvers).toHaveLength(2);

    // Ordem de TÉRMINO invertida de propósito: a foto B (mais recente,
    // resolver[1]) termina PRIMEIRO...
    await act(async () => {
      resolvers[1](['Dorflex Recente']);
    });
    await flushMicrotasks();

    let nameInput = findNameInput(tree!);
    expect(nameInput.props.value).toBe('Dorflex Recente');

    // Usuário apaga o campo (volta a ficar vazio) — isola a proteção 1: se
    // dependêssemos só da proteção 2 ("nunca sobrescreve o que já foi
    // digitado"), o campo vazio deixaria a leitura antiga passar; é o
    // ocrRequestIdRef que precisa bloquear aqui.
    await act(async () => {
      (nameInput.props.onChangeText as (t: string) => void)('');
    });
    expect(findNameInput(tree!).props.value).toBe('');

    // ...e só DEPOIS a foto A (mais antiga, resolver[0]) termina. Como sua
    // leitura é obsoleta (ocrRequestIdRef já avançou), não deve sobrescrever
    // — mesmo com o campo vazio.
    await act(async () => {
      resolvers[0](['Paracetamol Antigo']);
    });
    await flushMicrotasks();

    nameInput = findNameInput(tree!);
    expect(nameInput.props.value).toBe('');
  });

  it('não sobrescreve o nome que o usuário já digitou antes do OCR terminar', async () => {
    const resolvers = makeManualOcr();
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'foto-conceicao.jpg' }],
    });

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<MedicineForm submitLabel="Salvar" onSubmit={async () => {}} />);
    });

    const libraryPressable = findLibraryPressable(tree!);

    await act(async () => {
      await (libraryPressable.props.onPress as () => Promise<void>)();
    });
    expect(mockRecognizeText).toHaveBeenCalledTimes(1);

    // Usuário digita o nome dele ANTES do OCR terminar.
    const nameInputBefore = findNameInput(tree!);
    await act(async () => {
      (nameInputBefore.props.onChangeText as (t: string) => void)('José da Conceição 500mg');
    });

    expect(findNameInput(tree!).props.value).toBe('José da Conceição 500mg');

    // Agora o OCR termina com uma sugestão diferente.
    // (Nome fictício sem a palavra "genérico", que a heurística filtra de
    // propósito por ser texto padrão de embalagem, não nome de remédio.)
    await act(async () => {
      resolvers[0](['Xarope Guaporé']);
    });
    await flushMicrotasks();

    expect(findNameInput(tree!).props.value).toBe('José da Conceição 500mg');
  });

  it('aplica a sugestão do OCR quando o campo Nome está vazio ao terminar a leitura', async () => {
    const resolvers = makeManualOcr();
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'foto-vazio.jpg' }],
    });

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<MedicineForm submitLabel="Salvar" onSubmit={async () => {}} />);
    });

    const libraryPressable = findLibraryPressable(tree!);

    expect(findNameInput(tree!).props.value).toBe('');

    await act(async () => {
      await (libraryPressable.props.onPress as () => Promise<void>)();
    });
    expect(mockRecognizeText).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0](['Xarope Guaporé', '500mg']);
    });
    await flushMicrotasks();

    expect(findNameInput(tree!).props.value).toBe('Xarope Guaporé');
  });
});
