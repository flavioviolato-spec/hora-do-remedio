import { describe, expect, it } from '@jest/globals';

import { ALARM_SOUNDS, normalizeSoundId, soundFileNameFor } from '../sounds';
import { DEFAULT_SOUND_ID } from '../types';

describe('ALARM_SOUNDS', () => {
  it('inclui o som padrão do sistema como uma das opções', () => {
    expect(ALARM_SOUNDS.some((sound) => sound.id === DEFAULT_SOUND_ID)).toBe(true);
  });

  it('som padrão não tem arquivo (usa o som do sistema)', () => {
    const classico = ALARM_SOUNDS.find((sound) => sound.id === DEFAULT_SOUND_ID);
    expect(classico?.fileName).toBeUndefined();
  });

  it('todo som customizado (não-padrão) tem um nome de arquivo único', () => {
    const customFileNames = ALARM_SOUNDS.filter((sound) => sound.id !== DEFAULT_SOUND_ID).map(
      (sound) => sound.fileName,
    );
    expect(customFileNames.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(new Set(customFileNames).size).toBe(customFileNames.length);
  });

  it('tem entre 4 e 6 opções, como pedido', () => {
    expect(ALARM_SOUNDS.length).toBeGreaterThanOrEqual(4);
    expect(ALARM_SOUNDS.length).toBeLessThanOrEqual(6);
  });
});

describe('soundFileNameFor', () => {
  it('devolve o nome do arquivo de um som conhecido', () => {
    expect(soundFileNameFor('sino')).toBe('sino');
  });

  it('som padrão devolve undefined (som do sistema)', () => {
    expect(soundFileNameFor(DEFAULT_SOUND_ID)).toBeUndefined();
  });

  it('soundId desconhecido (dado antigo/corrompido) devolve undefined em vez de quebrar', () => {
    expect(soundFileNameFor('id-que-nao-existe-mais')).toBeUndefined();
  });

  it('soundId vazio ("") devolve undefined em vez de quebrar', () => {
    expect(soundFileNameFor('')).toBeUndefined();
  });

  it('soundId undefined/null em runtime (bypass do tipo TS — ex.: JSON antigo sem o campo) não lança erro', () => {
    // O tipo declara `soundId: string`, mas dado salvo antes da Etapa 6 (ou
    // corrompido) pode não ter o campo — testamos o comportamento real em
    // runtime, não só o que o TypeScript promete em tempo de compilação.
    expect(() => soundFileNameFor(undefined as unknown as string)).not.toThrow();
    expect(soundFileNameFor(undefined as unknown as string)).toBeUndefined();
    expect(() => soundFileNameFor(null as unknown as string)).not.toThrow();
    expect(soundFileNameFor(null as unknown as string)).toBeUndefined();
  });

  it('acentuação/ç nos labels não afeta o id nem o fileName (que são ASCII)', () => {
    // "Clássico" e "Eletrônico" têm acento no label (exibido na tela), mas
    // id/fileName precisam ser ASCII puro (chave de storage e nome de
    // arquivo no bundle iOS) — confere que ninguém "aportuguesou" um id.
    for (const sound of ALARM_SOUNDS) {
      expect(sound.id).toMatch(/^[a-z0-9-]+$/);
      if (sound.fileName) expect(sound.fileName).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('normalizeSoundId', () => {
  it('mantém um soundId que existe no catálogo', () => {
    expect(normalizeSoundId('sino')).toBe('sino');
  });

  it('remédio salvo antes da Etapa 6 (sem soundId): cai no padrão', () => {
    expect(normalizeSoundId(undefined)).toBe(DEFAULT_SOUND_ID);
  });

  it('soundId que não existe mais no catálogo: cai no padrão em vez de ficar sem seleção', () => {
    expect(normalizeSoundId('som-removido-do-catalogo')).toBe(DEFAULT_SOUND_ID);
  });

  it('soundId vazio: cai no padrão', () => {
    expect(normalizeSoundId('')).toBe(DEFAULT_SOUND_ID);
  });
});
