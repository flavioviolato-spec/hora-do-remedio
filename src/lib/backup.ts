/**
 * Backup e restauração via janela de compartilhar do iOS — decisão de
 * produto: nada de OAuth/conta de nuvem; o arquivo vai pra onde a pessoa
 * escolher (Arquivos, Drive, e-mail). Fotos ficam de fora: só os dados.
 *
 * Funções puras (serialize/parse) separadas das de I/O (export/pick) pra
 * testar o essencial sem mockar módulos nativos.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { errorMessage } from './text';

import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import { toDateISO } from './schedule';
import { sanitizeStore, type Store } from './storage';

/** Envelope que identifica o arquivo como um backup deste app. */
export function serializeBackup(store: Store): string {
  return JSON.stringify(
    { app: 'hora-do-remedio', exportedAt: new Date().toISOString(), store },
    null,
    2,
  );
}

export type ParsedBackup = {
  store: Store;
  medicineCount: number;
  doseCount: number;
};

/**
 * Lê um backup (com envelope ou um Store puro — tolerante a versões
 * antigas) e devolve a loja já sanitizada. `null` = arquivo que não é um
 * backup deste app; loja vazia LEGÍTIMA (Store válido sem remédios) passa,
 * e os counts avisam o usuário na confirmação.
 */
export function parseBackup(raw: string): ParsedBackup | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Envelope { app, exportedAt, store } ou o Store direto.
  const candidate =
    typeof parsed === 'object' && parsed !== null && 'store' in parsed
      ? (parsed as { store: unknown }).store
      : parsed;

  const store = sanitizeStore(candidate);
  // Fotos não vão no backup: um caminho file:// absoluto do aparelho antigo
  // não vale no novo (e mostraria um quadrado em branco no lugar do ícone).
  // Achado de revisão — anular garante o placeholder correto e elimina
  // qualquer chance de um backup adulterado apontar a foto pra fora do app.
  store.medicines = store.medicines.map((med) => ({ ...med, photoUri: null }));
  const medicineCount = store.medicines.length;
  const doseCount = store.doseLog.length;

  if (medicineCount === 0 && doseCount === 0) {
    // Sanitização devolveu loja vazia: só aceitamos se o arquivo REALMENTE
    // era uma loja vazia (formato de Store reconhecível) — senão é lixo.
    const shape = candidate as Record<string, unknown> | null;
    const wasExplicitEmptyStore =
      typeof shape === 'object' &&
      shape !== null &&
      shape.version === 1 &&
      Array.isArray(shape.medicines);
    if (!wasExplicitEmptyStore) return null;
  }

  return { store, medicineCount, doseCount };
}

/**
 * Grava o backup num arquivo temporário e abre a janela de compartilhar.
 * `false` = indisponível ou falhou (quem chama mostra o alerta); fechar a
 * janela sem escolher destino ainda conta como sucesso — foi escolha do
 * usuário, não erro.
 */
export async function exportBackup(store: Store): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const uri = `${FileSystem.cacheDirectory}hora-do-remedio-backup-${toDateISO(new Date())}.json`;
    await FileSystem.writeAsStringAsync(uri, serializeBackup(store), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    try {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: 'Salvar backup',
      });
    } finally {
      // Higiene (achado de revisão): não deixar uma cópia dos dados de saúde
      // esquecida no cache — o iOS já terminou a cópia quando shareAsync volta.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
    return true;
  } catch (error) {
    // Só a mensagem do erro: o backup tem dados de saúde e não vai a log.
    console.warn(
      '[backup] exportação falhou:',
      errorMessage(error),
    );
    return false;
  }
}

/**
 * Abre o seletor de arquivos do sistema e devolve o CONTEÚDO do arquivo
 * escolhido (quem chama valida com parseBackup). `null` = cancelou ou falhou.
 */
export async function pickBackupFile(): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const pickedUri = result.assets[0].uri;
    try {
      return await FileSystem.readAsStringAsync(pickedUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } finally {
      // Mesma higiene do export: a cópia que o seletor deixou no cache
      // (copyToCacheDirectory) não precisa sobreviver à leitura.
      await FileSystem.deleteAsync(pickedUri, { idempotent: true }).catch(() => {});
    }
  } catch (error) {
    console.warn(
      '[backup] leitura do arquivo falhou:',
      errorMessage(error),
    );
    return null;
  }
}
