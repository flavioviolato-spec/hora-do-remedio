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
  /** Toque no card inteiro: abre o histórico do remédio. */
  onPress: () => void;
  /** Toque no lápis: vai direto para a edição. */
  onEdit: () => void;
};

export function scheduleSummary(medicine: Medicine, todayISO: string): string {
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

/**
 * Resumo do estoque pro card da Home. null = usuário não controla estoque
 * (nada é mostrado). `danger: true` quando acabou ou está acabando —
 * limiar de "acabando": 2 dias de doses (times.length * 2).
 */
export function stockSummary(medicine: Medicine): { text: string; danger: boolean } | null {
  const stock = medicine.stockCount;
  if (stock === undefined) return null;
  if (stock === 0) {
    return { text: 'Comprimidos acabaram — reponha a caixa', danger: true };
  }
  const unit = stock === 1 ? 'comprimido' : 'comprimidos';
  if (stock <= medicine.times.length * 2) {
    return { text: `Acabando: ${stock} ${unit} ${stock === 1 ? 'restante' : 'restantes'}`, danger: true };
  }
  return { text: `${stock} ${unit} ${stock === 1 ? 'restante' : 'restantes'}`, danger: false };
}

export function MedicineCard({ medicine, todayISO, onPress, onEdit }: Props) {
  const theme = useTheme();
  const stock = stockSummary(medicine);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ver histórico de ${medicine.name}`}
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
        {medicine.treatment && (
          <ThemedText type="small" themeColor="brand" numberOfLines={1}>
            {medicine.treatment}
          </ThemedText>
        )}
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
        {stock && (
          <ThemedText
            type={stock.danger ? 'smallBold' : 'small'}
            themeColor={stock.danger ? 'danger' : 'textSecondary'}
          >
            {stock.text}
          </ThemedText>
        )}
      </View>

      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${medicine.name}`}
        hitSlop={8}
        style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.6 }]}
      >
        <SymbolView name="pencil" size={18} tintColor={theme.textSecondary} />
      </Pressable>
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
  editButton: {
    padding: Spacing.one,
  },
  timeChipText: {
    fontVariant: ['tabular-nums'],
  },
});
