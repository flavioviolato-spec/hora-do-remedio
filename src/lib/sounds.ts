import { DEFAULT_SOUND_ID } from './types';

/** Um som de alarme disponível para escolher no cadastro do remédio. */
export type AlarmSound = {
  id: string;
  label: string;
  /**
   * Nome do arquivo no bundle iOS (sem extensão, ver assets/sounds/ e
   * plugins/withAlarmSounds.js), ou `undefined` para o som padrão do
   * sistema (AlarmKit toca o alarme clássico do iPhone).
   */
  fileName: string | undefined;
};

export const ALARM_SOUNDS: AlarmSound[] = [
  { id: DEFAULT_SOUND_ID, label: 'Clássico (padrão do iPhone)', fileName: undefined },
  { id: 'sino', label: 'Sino', fileName: 'sino' },
  { id: 'suave', label: 'Suave', fileName: 'suave' },
  { id: 'urgente', label: 'Urgente', fileName: 'urgente' },
  { id: 'eletronico', label: 'Eletrônico', fileName: 'eletronico' },
];

const SOUND_BY_ID = new Map(ALARM_SOUNDS.map((sound) => [sound.id, sound]));

/** Nome do arquivo (sem extensão) para um `soundId`, ou undefined para o som padrão. */
export function soundFileNameFor(soundId: string | undefined): string | undefined {
  return soundId ? SOUND_BY_ID.get(soundId)?.fileName : undefined;
}

/** `soundId` de um remédio salvo antes deste som existir (ou removido do
 * catálogo depois) cai no padrão — nunca deixa o seletor sem nada marcado. */
export function normalizeSoundId(soundId: string | undefined): string {
  return soundId && SOUND_BY_ID.has(soundId) ? soundId : DEFAULT_SOUND_ID;
}
