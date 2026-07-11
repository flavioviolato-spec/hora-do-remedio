import { describe, expect, it } from '@jest/globals';

import { appVersionLabel } from '../app-version';

describe('appVersionLabel', () => {
  it('valor undefined (sem build do CI, ex. Expo Go): cai no rótulo de desenvolvimento', () => {
    expect(appVersionLabel(undefined)).toBe('Versão de desenvolvimento');
  });

  it('string vazia: cai no rótulo de desenvolvimento', () => {
    expect(appVersionLabel('')).toBe('Versão de desenvolvimento');
  });

  it('string só com espaços: cai no rótulo de desenvolvimento', () => {
    expect(appVersionLabel('   ')).toBe('Versão de desenvolvimento');
  });

  it('tag de versão do CI: devolve a tag como está', () => {
    expect(appVersionLabel('v0.5.0-teste')).toBe('v0.5.0-teste');
  });

  it('tag com espaços nas pontas: devolve aparada', () => {
    expect(appVersionLabel('  v0.5.0-teste  ')).toBe('v0.5.0-teste');
  });
});
