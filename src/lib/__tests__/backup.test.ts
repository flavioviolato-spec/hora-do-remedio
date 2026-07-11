import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Mocks dos módulos nativos: as funções puras não os usam, mas o import de
// backup.ts os carrega — e as de I/O são testadas com eles controlados.
const mockIsAvailableAsync = jest.fn<() => Promise<boolean>>();
const mockShareAsync = jest.fn<() => Promise<void>>();
const mockGetDocumentAsync = jest.fn<() => Promise<unknown>>();
const mockWriteAsStringAsync = jest.fn<() => Promise<void>>();
const mockReadAsStringAsync = jest.fn<() => Promise<string>>();
// Implementação padrão resolvida (não só jest.fn()): o código de produção
// encadeia `.catch()` direto no retorno — mock devolvendo undefined viraria
// TypeError e mascararia o comportamento real. jest.clearAllMocks() limpa as
// chamadas mas preserva esta implementação padrão.
const mockDeleteAsync = jest.fn<() => Promise<void>>(async () => {});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...(args as [])),
  shareAsync: (...args: unknown[]) => mockShareAsync(...(args as [])),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...(args as [])),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...(args as [])),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...(args as [])),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...(args as [])),
}));

import { exportBackup, parseBackup, pickBackupFile, serializeBackup } from '../backup';
import type { Store } from '../storage';
import type { Medicine } from '../types';

// Dados 100% fictícios (LGPD): nomes de remédio inventados.
function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Solução de Açaí — Comprimidos',
    photoUri: null,
    times: ['08:00', '20:00'],
    startDate: '2026-07-05',
    durationDays: 7,
    soundId: 'classico',
    treatment: 'Infecção',
    active: true,
    createdAt: '2026-07-05T09:00:00.000Z',
    ...overrides,
  };
}

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    version: 1,
    medicines: [makeMedicine()],
    doseLog: [
      { medicineId: 'med-1', dateISO: '2026-07-05', time: '08:00', takenAt: '2026-07-05T08:03:00.000Z' },
      { medicineId: 'med-1', dateISO: '2026-07-05', time: '20:00', takenAt: '2026-07-05T20:01:00.000Z' },
    ],
    // Chave SEM acento de propósito: o app grava a chave já normalizada
    // (rememberTreatment usa normalize); o VALOR mantém acento/ç.
    treatmentMemory: { 'solucao de acai — comprimidos': 'Infecção' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('serializeBackup → parseBackup (roundtrip)', () => {
  it('preserva remédios, doses e memória de tratamentos (com acentuação e ç)', () => {
    const store = makeStore();
    const parsed = parseBackup(serializeBackup(store));
    expect(parsed).not.toBeNull();
    expect(parsed!.store).toEqual(store);
    expect(parsed!.medicineCount).toBe(1);
    expect(parsed!.doseCount).toBe(2);
  });

  it('o envelope identifica o app', () => {
    const raw = JSON.parse(serializeBackup(makeStore())) as Record<string, unknown>;
    expect(raw.app).toBe('hora-do-remedio');
    expect(typeof raw.exportedAt).toBe('string');
  });
});

describe('parseBackup — entradas inválidas', () => {
  it('JSON corrompido → null', () => {
    expect(parseBackup('{"app": "hora-do-remedio", "store": {')).toBeNull();
  });

  it('texto que nem é JSON → null', () => {
    expect(parseBackup('isto não é um backup')).toBeNull();
  });

  it('JSON válido mas sem cara de loja → null', () => {
    expect(parseBackup('{"foo": 1}')).toBeNull();
    expect(parseBackup('[1, 2, 3]')).toBeNull();
    expect(parseBackup('"apenas uma string"')).toBeNull();
    expect(parseBackup('null')).toBeNull();
  });

  it('versão desconhecida → null', () => {
    expect(parseBackup(JSON.stringify({ version: 99, medicines: [], doseLog: [] }))).toBeNull();
  });
});

describe('parseBackup — tolerância', () => {
  it('aceita Store puro sem envelope', () => {
    const store = makeStore();
    const parsed = parseBackup(JSON.stringify(store));
    expect(parsed).not.toBeNull();
    expect(parsed!.store).toEqual(store);
  });

  it('chave da memória com acento (backup editado à mão) é normalizada na restauração — casa com a busca', () => {
    const store = makeStore({ treatmentMemory: { 'Solução de Açaí — Comprimidos': 'Infecção' } });
    const parsed = parseBackup(serializeBackup(store));
    expect(parsed).not.toBeNull();
    expect(parsed!.store.treatmentMemory).toEqual({ 'solucao de acai — comprimidos': 'Infecção' });
  });

  it('photoUri de remédio restaurado vira null (fotos não vão no backup; caminho antigo não vale em outro aparelho)', () => {
    const store = makeStore();
    store.medicines[0].photoUri = 'file:///aparelho-antigo/photos/med-1-123.jpg';
    const parsed = parseBackup(serializeBackup(store));
    expect(parsed).not.toBeNull();
    expect(parsed!.store.medicines[0].photoUri).toBeNull();
  });

  it('aceita loja vazia explícita (Store válido sem remédios)', () => {
    const empty: Store = { version: 1, medicines: [], doseLog: [], treatmentMemory: {} };
    const parsed = parseBackup(serializeBackup(empty));
    expect(parsed).not.toBeNull();
    expect(parsed!.medicineCount).toBe(0);
    expect(parsed!.doseCount).toBe(0);
  });

  it('sanitiza envelope com remédios inválidos misturados (os ruins caem)', () => {
    const store = makeStore();
    const raw = JSON.stringify({
      app: 'hora-do-remedio',
      exportedAt: '2026-07-11T10:00:00.000Z',
      store: {
        version: 1,
        medicines: [
          store.medicines[0],
          { id: 'sem-nome', name: '', times: ['08:00'] }, // inválido: nome vazio
          { id: '../caminho-malicioso', name: 'X', times: ['08:00'] }, // inválido: id fora do padrão
        ],
        doseLog: [
          store.doseLog[0],
          { medicineId: 'med-1', dateISO: '2026-02-30', time: '08:00', takenAt: 'x' }, // data impossível
        ],
        treatmentMemory: { ok: 'Dor', ruim: 123 },
      },
    });
    const parsed = parseBackup(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.medicineCount).toBe(1);
    expect(parsed!.store.medicines[0].name).toBe('Solução de Açaí — Comprimidos');
    expect(parsed!.doseCount).toBe(1);
    expect(parsed!.store.treatmentMemory).toEqual({ ok: 'Dor' });
  });
});

describe('exportBackup (I/O mockado)', () => {
  it('grava o arquivo e abre a janela de compartilhar → true', async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockShareAsync.mockResolvedValue(undefined);

    const ok = await exportBackup(makeStore());

    expect(ok).toBe(true);
    const [uri, content] = mockWriteAsStringAsync.mock.calls[0] as unknown as [string, string];
    expect(uri).toMatch(/^file:\/\/\/cache\/hora-do-remedio-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(parseBackup(content)).not.toBeNull();
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    // Higiene: a cópia temporária no cache é apagada depois do compartilhar.
    expect(mockDeleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it('falha ao apagar o arquivo temporário NÃO transforma um export bem-sucedido em erro', async () => {
    mockIsAvailableAsync.mockResolvedValue(true);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockShareAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockRejectedValueOnce(new Error('cache travado (QA)'));

    const ok = await exportBackup(makeStore());

    expect(ok).toBe(true);
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });

  it('compartilhamento indisponível → false, sem tentar gravar', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    const ok = await exportBackup(makeStore());
    expect(ok).toBe(false);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('erro ao gravar → false (sem lançar)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockIsAvailableAsync.mockResolvedValue(true);
    mockWriteAsStringAsync.mockRejectedValue(new Error('disco cheio'));
    const ok = await exportBackup(makeStore());
    expect(ok).toBe(false);
    warn.mockRestore();
  });
});

describe('pickBackupFile (I/O mockado)', () => {
  it('usuário cancelou → null, sem ler arquivo', async () => {
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickBackupFile()).toBeNull();
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('arquivo escolhido → devolve o conteúdo', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue('{"version":1}');
    expect(await pickBackupFile()).toBe('{"version":1}');
    // Higiene: a cópia que o seletor deixou no cache é apagada após a leitura.
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/backup.json', { idempotent: true });
  });

  it('falha ao apagar a cópia do cache NÃO descarta o conteúdo já lido', async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json' }],
    });
    mockReadAsStringAsync.mockResolvedValue('{"version":1}');
    mockDeleteAsync.mockRejectedValueOnce(new Error('cache travado (QA)'));
    expect(await pickBackupFile()).toBe('{"version":1}');
  });

  it('erro ao ler → null (sem lançar)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/backup.json' }],
    });
    mockReadAsStringAsync.mockRejectedValue(new Error('arquivo sumiu'));
    expect(await pickBackupFile()).toBeNull();
    warn.mockRestore();
  });
});
