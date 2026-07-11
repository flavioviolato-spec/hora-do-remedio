import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
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

/** Ângulos dos "confetes" ao redor da bolha — 6 pontos espaçados igualmente. */
const CONFETTI_ANGLES = [0, 60, 120, 180, 240, 300];

function ConfettiDot({
  angleDeg,
  color,
  progress,
}: {
  angleDeg: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const radians = (angleDeg * Math.PI) / 180;
    const distance = progress.value * 24;
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(radians) * distance },
        { translateY: Math.sin(radians) * distance },
        { scale: 1 - progress.value * 0.5 },
      ],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.confetti, { backgroundColor: color }, style]} />;
}

/**
 * Uma dose de hoje, com a "bolha de cartela": marcar como tomada é como
 * estourar a bolha do blister — encolhe e volta com mola. Ao MARCAR como
 * tomada (não ao desmarcar), um anel se expande e "confetes" saem da
 * bolha — só Reanimated, sem dependência de animação externa.
 */
export function DoseCheckItem({ time, medicineName, status, onToggle }: Props) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const celebrate = useSharedValue(0);
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - celebrate.value) * 0.7,
    transform: [{ scale: 1 + celebrate.value * 1.3 }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.7, { damping: 20, stiffness: 500 }),
      withSpring(1, { damping: 9, stiffness: 300 }),
    );
    if (status !== 'taken') {
      // Só comemora ao MARCAR como tomada, não ao desmarcar.
      celebrate.value = 0;
      celebrate.value = withTiming(1, { duration: 650 });
    }
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
      <View style={styles.bubbleWrap}>
        <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: theme.brand }, ringStyle]} />
        {CONFETTI_ANGLES.map((angle, index) => (
          <ConfettiDot
            key={angle}
            angleDeg={angle}
            color={index % 2 === 0 ? theme.brand : theme.accent}
            progress={celebrate}
          />
        ))}
        <Animated.View style={[styles.bubble, bubbleColors, bubbleStyle]}>
          {status === 'taken' && (
            <SymbolView name="checkmark" size={20} tintColor={theme.onBrand} weight="bold" />
          )}
        </Animated.View>
      </View>
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
  bubbleWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: Radius.bubble,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: Radius.bubble,
    borderWidth: 2,
  },
  confetti: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: Radius.bubble,
  },
});
