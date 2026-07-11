import { useAudioPlayer } from 'expo-audio';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ALARM_SOUNDS, type AlarmSound } from '@/lib/sounds';

type Props = {
  value: string;
  onChange: (soundId: string) => void;
};

/** Fontes estáticas — Metro precisa do `require` literal, não dá pra montar
 * o caminho em tempo de execução a partir de `sound.fileName`. */
const PREVIEW_SOURCES: Record<string, number> = {
  sino: require('../../assets/sounds/sino.wav'),
  suave: require('../../assets/sounds/suave.wav'),
  urgente: require('../../assets/sounds/urgente.wav'),
  eletronico: require('../../assets/sounds/eletronico.wav'),
};

function SoundOption({
  sound,
  selected,
  onSelect,
}: {
  sound: AlarmSound;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const player = useAudioPlayer(sound.fileName ? PREVIEW_SOURCES[sound.fileName] : undefined);

  function preview() {
    // "Clássico" é o som padrão do sistema — não temos o arquivo pra tocar
    // uma prévia aqui (só o AlarmKit sabe tocá-lo, na hora do alarme de verdade).
    if (!sound.fileName) return;
    player.seekTo(0);
    player.play();
  }

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={sound.label}
      style={({ pressed }) => [
        styles.option,
        { backgroundColor: theme.backgroundElement, borderColor: selected ? theme.brand : theme.outline },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.optionLeft}>
        <View
          style={[
            styles.radio,
            { borderColor: selected ? theme.brand : theme.outline },
            selected && { backgroundColor: theme.brand },
          ]}
        />
        <ThemedText type="smallBold" themeColor={selected ? 'brand' : 'text'}>
          {sound.label}
        </ThemedText>
      </View>
      {sound.fileName && (
        <Pressable
          onPress={preview}
          accessibilityRole="button"
          accessibilityLabel={`Ouvir ${sound.label}`}
          hitSlop={8}
        >
          <SymbolView name="play.circle.fill" size={24} tintColor={theme.textSecondary} />
        </Pressable>
      )}
    </Pressable>
  );
}

/** Lista de sons de alarme para escolher no cadastro, com prévia (exceto o padrão do sistema). */
export function SoundPicker({ value, onChange }: Props) {
  return (
    <View style={styles.list}>
      {ALARM_SOUNDS.map((sound) => (
        <SoundOption
          key={sound.id}
          sound={sound}
          selected={value === sound.id}
          onSelect={() => onChange(sound.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: Radius.bubble,
    borderWidth: 2,
  },
});
