import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DoseStatus } from '@/lib/schedule';

type Props = {
  time: string;
  medicineName: string;
  status: DoseStatus;
  onToggle: () => void;
};

const STATUS_LABEL: Record<DoseStatus, string> = {
  taken: 'Tomado',
  late: 'Atrasado',
  upcoming: '',
};

/**
 * Uma dose de hoje, com a "bolha de cartela": marcar como tomada é
 * como estourar a bolha do blister — encolhe e volta com mola.
 */
export function DoseCheckItem({ time, medicineName, status, onToggle }: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.7, { damping: 20, stiffness: 500 }),
      withSpring(1, { damping: 9, stiffness: 300 }),
    );
    onToggle();
  };

  const bubbleColors = {
    taken: { backgroundColor: theme.brand, borderColor: theme.brand },
    late: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    upcoming: { backgroundColor: theme.background, borderColor: theme.outline },
  }[status];

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: status === 'taken' }}
      accessibilityLabel={`${medicineName} às ${time}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <ThemedText type="clock" themeColor={status === 'late' ? 'accent' : 'text'}>
        {time}
      </ThemedText>
      <View style={styles.middle}>
        <ThemedText
          type="default"
          themeColor={status === 'taken' ? 'textSecondary' : 'text'}
          numberOfLines={1}
        >
          {medicineName}
        </ThemedText>
        {STATUS_LABEL[status] !== '' && (
          <ThemedText type="small" themeColor={status === 'taken' ? 'brand' : 'accent'}>
            {STATUS_LABEL[status]}
          </ThemedText>
        )}
      </View>
      <Animated.View style={[styles.bubble, bubbleColors, bubbleStyle]}>
        {status === 'taken' && (
          <SymbolView name="checkmark" size={20} tintColor={theme.onBrand} weight="bold" />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  middle: {
    flex: 1,
    gap: Spacing.half,
  },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: Radius.bubble,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
