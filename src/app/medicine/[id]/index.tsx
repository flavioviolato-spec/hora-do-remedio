import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { scheduleSummary } from '@/components/medicine-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMedicines } from '@/lib/medicines-context';
import { buildHistoryGrid, toDateISO } from '@/lib/schedule';
import { capitalize } from '@/lib/text';

function formatDayLabel(dateISO: string): string {
  const date = parseISO(dateISO);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return capitalize(format(date, "EEE, dd 'de' MMM", { locale: ptBR }));
}

export default function MedicineHistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const { medicines, doseLog } = useMedicines();

  const medicine = medicines.find((med) => med.id === id);
  const todayISO = toDateISO(new Date());

  const history = useMemo(() => {
    if (!medicine) return [];
    const medicineDoseLog = doseLog.filter((dose) => dose.medicineId === medicine.id);
    return buildHistoryGrid(medicine, medicineDoseLog, todayISO);
  }, [medicine, doseLog, todayISO]);

  if (!medicine) {
    return (
      <ThemedView style={styles.missing}>
        <ThemedText themeColor="textSecondary">Remédio não encontrado.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {medicine.photoUri ? (
            <Image source={{ uri: medicine.photoUri }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: theme.brandSoft }]}>
              <SymbolView name="pills.fill" size={34} tintColor={theme.brand} />
            </View>
          )}
          <View style={styles.headerInfo}>
            <ThemedText type="title" style={styles.name} numberOfLines={2}>
              {medicine.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {scheduleSummary(medicine, todayISO)}
            </ThemedText>
          </View>
          <Pressable
            onPress={() => router.push(`/medicine/${medicine.id}/edit`)}
            accessibilityRole="button"
            accessibilityLabel={`Editar ${medicine.name}`}
            hitSlop={8}
            style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.6 }]}
          >
            <SymbolView name="pencil" size={20} tintColor={theme.textSecondary} />
          </Pressable>
        </View>

        <ThemedText type="heading" style={styles.sectionTitle}>
          Histórico
        </ThemedText>

        {history.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.emptyBox}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              {todayISO < medicine.startDate
                ? 'O histórico aparece aqui quando o tratamento começar.'
                : 'Nenhuma dose registrada ainda.'}
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={[styles.historyList, { backgroundColor: theme.backgroundElement, borderColor: theme.outline }]}>
            {history.map((day, index) => (
              <View key={day.dateISO}>
                {index > 0 && <View style={[styles.separator, { backgroundColor: theme.outline }]} />}
                <View style={styles.dayRow}>
                  <ThemedText type="smallBold" style={styles.dayLabel}>
                    {formatDayLabel(day.dateISO)}
                  </ThemedText>
                  <View style={styles.cellsRow}>
                    {day.cells.map((cell) => (
                      <View
                        key={cell.time}
                        accessibilityLabel={`${cell.time}, ${cell.taken ? 'tomado' : 'não tomado'}`}
                        style={[
                          styles.cell,
                          cell.taken
                            ? { backgroundColor: theme.brand, borderColor: theme.brand }
                            : { backgroundColor: theme.background, borderColor: theme.outline },
                        ]}
                      >
                        {cell.taken ? (
                          <SymbolView name="checkmark" size={12} tintColor={theme.onBrand} weight="bold" />
                        ) : null}
                        <ThemedText
                          type="small"
                          style={{ color: cell.taken ? theme.onBrand : theme.textSecondary }}
                        >
                          {cell.time}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    gap: Spacing.one,
  },
  name: {
    fontSize: 24,
    lineHeight: 28,
  },
  editButton: {
    padding: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  emptyBox: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  historyList: {
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  dayRow: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  dayLabel: {
    textTransform: 'capitalize',
  },
  cellsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: Radius.chip,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
