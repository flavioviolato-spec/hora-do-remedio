import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/** Aviso tocável na Home (alarmes desligados, instalação prestes a expirar, etc.). */
export function WarningBanner({ icon, title, subtitle, accessibilityLabel, onPress }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: theme.accentSoft, borderColor: theme.danger },
        pressed && { opacity: 0.85 },
      ]}
    >
      <SymbolView name={icon} size={20} tintColor={theme.danger} />
      <View style={styles.text}>
        <ThemedText type="smallBold" themeColor="danger">
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.chip,
    borderWidth: 1,
    padding: Spacing.three,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
