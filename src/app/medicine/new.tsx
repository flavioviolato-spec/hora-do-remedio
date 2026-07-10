import { SymbolView } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Tela provisória — o cadastro real (foto, horários, duração) é a Etapa 3. */
export default function NewMedicineScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SymbolView name="camera.viewfinder" size={56} tintColor={theme.brand} />
      <ThemedText type="heading" style={styles.title}>
        Cadastro de remédio
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.title}>
        Em construção (Etapa 3): fotografar a caixinha, escolher horários e por
        quantos dias.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
});
