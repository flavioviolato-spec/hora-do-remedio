import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DoseCheckItem } from '@/components/dose-check-item';
import { MedicineCard } from '@/components/medicine-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WarningBanner } from '@/components/warning-banner';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProvisioningInfo } from '@/hooks/use-provisioning-info';
import { useAlarmSyncStatus } from '@/lib/alarm-sync-context';
import { useMedicines } from '@/lib/medicines-context';
import { doseStatus, dosesForDate, toDateISO, toTimeHM } from '@/lib/schedule';
import { capitalize } from '@/lib/text';
import { doseKey } from '@/lib/types';

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

  const { medicines, doseLog, loading, toggleDose } = useMedicines();
  const { permissionDenied, schedulingFailed } = useAlarmSyncStatus();
  const alarmWarning = permissionDenied || schedulingFailed;
  const { info: provisioning } = useProvisioningInfo();
  const expiryWarning = provisioning !== null && provisioning.daysRemaining <= 2;

  const todayDoses = useMemo(() => dosesForDate(medicines, todayISO), [medicines, todayISO]);

  const medicineById = useMemo(
    () => new Map(medicines.map((med) => [med.id, med])),
    [medicines],
  );

  const takenKeys = useMemo(
    () =>
      new Set(
        doseLog
          .filter((dose) => dose.dateISO === todayISO)
          .map((dose) => doseKey(dose.medicineId, dose.dateISO, dose.time)),
      ),
    [doseLog, todayISO],
  );

  const handleToggleDose = (medicineId: string, time: string) => {
    toggleDose(medicineId, todayISO, time).catch(() => {
      Alert.alert('Não foi possível salvar', 'Tente marcar de novo.');
    });
  };

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <ThemedText type="eyebrow" themeColor="brand">
                Hora do Remédio
              </ThemedText>
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel="Ajustes"
                hitSlop={8}
              >
                <SymbolView name="gearshape.fill" size={22} tintColor={theme.textSecondary} />
              </Pressable>
            </View>
            <ThemedText type="subtitle">
              {capitalize(format(now, "EEEE, d 'de' MMMM", { locale: ptBR }))}
            </ThemedText>
          </View>

          {alarmWarning && (
            <WarningBanner
              icon="bell.slash.fill"
              title="Alarmes desligados"
              subtitle={
                permissionDenied
                  ? 'Permissão negada — toque para liberar em Ajustes.'
                  : 'Alguns alarmes não puderam ser agendados — toque para verificar em Ajustes.'
              }
              accessibilityLabel="Alarmes desligados. Toque para verificar em Ajustes."
              onPress={() => router.push('/settings')}
            />
          )}

          {expiryWarning && provisioning && (
            <WarningBanner
              icon="clock.badge.exclamationmark.fill"
              title={
                provisioning.daysRemaining <= 0
                  ? 'Instalação expirada'
                  : provisioning.daysRemaining === 1
                    ? 'Expira amanhã'
                    : `Expira em ${provisioning.daysRemaining} dias`
              }
              subtitle='Abra o AltStore e toque em "Refresh All" para os alarmes continuarem funcionando.'
              accessibilityLabel="Instalação prestes a expirar. Toque para ver como renovar em Ajustes."
              onPress={() => router.push('/settings')}
            />
          )}

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
                      onToggle={() => handleToggleDose(slot.medicineId, slot.time)}
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
                  onPress={() =>
                    router.push({ pathname: '/medicine/[id]/index', params: { id: medicine.id } })
                  }
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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
