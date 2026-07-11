/**
 * Fotos das caixinhas: redimensiona (~800px) e guarda em
 * documentDirectory/photos/. Nome de arquivo único por versão da foto
 * (evita cache mostrando imagem antiga após edição).
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

const PHOTOS_DIR = `${FileSystem.documentDirectory}photos/`;

async function ensurePhotosDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(() => {
    /* já existe */
  });
}

/** Copia a foto temporária do picker para o app; retorna a URI definitiva. */
export async function persistPhoto(tempUri: string, medicineId: string): Promise<string> {
  await ensurePhotosDir();
  const resized = await ImageManipulator.manipulateAsync(
    tempUri,
    [{ resize: { width: 800 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  const finalUri = `${PHOTOS_DIR}${medicineId}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: resized.uri, to: finalUri });
  await FileSystem.deleteAsync(resized.uri, { idempotent: true });
  return finalUri;
}

/** Apaga uma foto persistida (ignora se já não existe). */
export async function deletePhoto(photoUri: string | null): Promise<void> {
  if (!photoUri || !photoUri.startsWith(PHOTOS_DIR)) return;
  await FileSystem.deleteAsync(photoUri, { idempotent: true });
}
