import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DoseCheckItem } from '@/components/dose-check-item';
import { MedicineCard } from '@/components/medicine-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMedicines } from '@/lib/medicines-context';
import { doseStatus, dosesForDate, toDateISO, toTimeHM } from '@/lib/schedule';
import { doseKey } from '@/lib/types';

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Relógio da tela: re-renderiza a cada 30s para "Atrasado" acompanhar a hora.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayISO = toDateISO(now);
  const nowHM = toTimeHM(now);

  const { medicines, loading } = useMedicines();
  // Marcação de dose ainda em memória — a Etapa 5 persiste no histórico.
  const [takenKeys, setTakenKeys] = useState<Set<string>>(new Set());

  const todayDoses = useMemo(() => dosesForDate(medicines, todayISO), [medicines, todayISO]);

  const medicineById = useMemo(
    () => new Map(medicines.map((med) => [med.id, med])),
    [medicines],
  );

  const toggleDose = (medicineId: string, time: string) => {
    const key = doseKey(medicineId, todayISO, time);
    setTakenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="eyebrow" themeColor="brand">
              Hora do Remédio
            </ThemedText>
            <ThemedText type="subtitle">
              {capitalize(format(now, "EEEE, d 'de' MMMM", { locale: ptBR }))}
            </ThemedText>
          </View>

          <ThemedText type="heading" style={styles.sectionTitle}>
            Hoje
          </ThemedText>
          {todayDoses.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyBox}>
              <ThemedText themeColor="textSecondary">Nenhuma dose para hoje.</ThemedText>
            </ThemedView>
          ) : (
            <View style={[styles.blister, { backgroundColor: theme.backgroundElement, borderColor: theme.outline }]}>
              {todayDoses.map((slot, index) => {
                const medicine = medicineById.get(slot.medicineId);
                if (!medicine) return null;
                const taken = takenKeys.has(doseKey(slot.medicineId, todayISO, slot.time));
                return (
                  <View key={`${slot.medicineId}-${slot.time}`}>
                    {index > 0 && <View style={[styles.separator, { backgroundColor: theme.outline }]} />}
                    <DoseCheckItem
                      time={slot.time}
                      medicineName={medicine.name}
                      status={doseStatus(slot.time, nowHM, taken)}
                      onToggle={() => toggleDose(slot.medicineId, slot.time)}
                    />
                  </View>
                );
              })}
            </View>
          )}

          <ThemedText type="heading" style={styles.sectionTitle}>
            Meus remédios
          </ThemedText>
          {medicines.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyBox}>
              <SymbolView name="pills" size={40} tintColor={theme.textSecondary} />
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                {loading
                  ? 'Carregando…'
                  : 'Nenhum remédio por aqui.\nToque em “Adicionar remédio” e fotografe a caixinha.'}
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.cards}>
              {medicines.map((medicine) => (
                <MedicineCard
                  key={medicine.id}
                  medicine={medicine}
                  todayISO={todayISO}
                  onEdit={() => router.push(`/medicine/${medicine.id}/edit`)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <Pressable
          onPress={() => router.push('/medicine/new')}
          accessibilityRole="button"
          accessibilityLabel="Adicionar remédio"
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.brand },
            pressed && { opacity: 0.85 },
          ]}
        >
          <SymbolView name="plus" size={18} tintColor={theme.onBrand} weight="bold" />
          <ThemedText type="smallBold" style={{ color: theme.onBrand }}>
            Adicionar remédio
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six + Spacing.five,
    gap: Spacing.three,
  },
  header: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  blister: {
    borderRadius: Radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  cards: {
    gap: Spacing.three,
  },
  emptyBox: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  emptyText: {
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.five,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.bubble,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
