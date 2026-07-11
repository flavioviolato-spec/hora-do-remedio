/**
 * Testes de `recognizeText`: o pacote nativo (`expo-text-extractor`) é
 * mockado porque não existe no ambiente de teste (Jest/Node) — mesmo
 * padrão de mock de módulo nativo/externo usado em
 * provisioning.qa-review.test.ts. Cobre o contrato central da função:
 * nunca lança, mesmo quando o módulo está ausente ou o reconhecimento
 * falha.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('recognizeText', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('módulo nativo ausente (Expo Go/jest, require lança): devolve [] sem lançar, SEM logar aviso (é o dia a dia no Expo Go, não um erro)', async () => {
    jest.doMock('expo-text-extractor', () => {
      throw new Error('Cannot find native module (simulado)');
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { recognizeText } = require('../ocr');
    await expect(recognizeText('file:///foto.jpg')).resolves.toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('isSupported: false — devolve [] sem chamar extractTextFromImage', async () => {
    const extractTextFromImage = jest.fn();
    jest.doMock('expo-text-extractor', () => ({
      isSupported: false,
      extractTextFromImage,
    }));
    const { recognizeText } = require('../ocr');
    await expect(recognizeText('file:///foto.jpg')).resolves.toEqual([]);
    expect(extractTextFromImage).not.toHaveBeenCalled();
  });

  it('extractTextFromImage resolve com linhas: devolve as linhas reconhecidas', async () => {
    jest.doMock('expo-text-extractor', () => ({
      isSupported: true,
      extractTextFromImage: jest.fn(async () => ['Amoxicilina', '500mg']),
    }));
    const { recognizeText } = require('../ocr');
    await expect(recognizeText('file:///foto.jpg')).resolves.toEqual(['Amoxicilina', '500mg']);
  });

  it('extractTextFromImage rejeita (foto ilegível, erro do Vision): devolve [], sem lançar, e loga só a mensagem genérica', async () => {
    jest.doMock('expo-text-extractor', () => ({
      isSupported: true,
      extractTextFromImage: jest.fn(async () => {
        throw new Error('erro simulado do Vision');
      }),
    }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { recognizeText } = require('../ocr');
    await expect(recognizeText('file:///foto.jpg')).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith('[ocr] falha ao ler o texto da foto:', 'erro simulado do Vision');
  });

  it('extractTextFromImage resolve com lista vazia (embalagem sem texto legível): devolve []', async () => {
    jest.doMock('expo-text-extractor', () => ({
      isSupported: true,
      extractTextFromImage: jest.fn(async () => []),
    }));
    const { recognizeText } = require('../ocr');
    await expect(recognizeText('file:///foto.jpg')).resolves.toEqual([]);
  });
});
