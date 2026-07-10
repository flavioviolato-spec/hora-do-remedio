import { format, parseISO } from 'date-fns';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { daysRemaining, treatmentEndISO } from '@/lib/schedule';
import type { Medicine } from '@/lib/types';

type Props = {
  medicine: Medicine;
  todayISO: string;
  onEdit: () => void;
};

function scheduleSummary(medicine: Medicine, todayISO: string): string {
  const remaining = daysRemaining(medicine, todayISO);
  const end = format(parseISO(treatmentEndISO(medicine)), 'dd/MM');
  if (!medicine.active) return 'Pausado';
  if (todayISO < medicine.startDate) {
    return `Começa em ${format(parseISO(medicine.startDate), 'dd/MM')}`;
  }
  if (remaining === 0) return 'Tratamento encerrado';
  if (remaining === 1) return 'Último dia — termina hoje';
  return `Faltam ${remaining} dias — termina ${end}`;
}

export function MedicineCard({ medicine, todayISO, onEdit }: Props) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Editar ${medicine.name}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.outline },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      {medicine.photoUri ? (
        <Image source={{ uri: medicine.photoUri }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: theme.brandSoft }]}>
          <SymbolView name="pills.fill" size={30} tintColor={theme.brand} />
        </View>
      )}

      <View style={styles.info}>
        <ThemedText type="heading" numberOfLines={2}>
          {medicine.name}
        </ThemedText>
        <View style={styles.timesRow}>
          {medicine.times.map((time) => (
            <View key={time} style={[styles.timeChip, { backgroundColor: theme.accentSoft }]}>
              <ThemedText type="smallBold" themeColor="accent" style={styles.timeChipText}>
                {time}
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {scheduleSummary(medicine, todayISO)}
        </ThemedText>
      </View>

      <SymbolView name="chevron.right" size={16} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: Spacing.two,
  },
  timesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  timeChip: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
  },
  timeChipText: {
    fontVariant: ['tabular-nums'],
  },
});
