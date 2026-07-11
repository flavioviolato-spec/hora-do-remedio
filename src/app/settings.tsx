import { addSeconds } from 'date-fns';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAlarmPort } from '@/lib/alarm';

/**
 * Ajustes + área de teste do alarme (o "smoke test" da Etapa 2):
 * comprova no aparelho que o AlarmKit toca mesmo no modo silencioso.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const alarmPort = getAlarmPort();
  const isReal = alarmPort.isAvailable();

  const [testAlarmId, setTestAlarmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function scheduleTestAlarm() {
    setBusy(true);
    try {
      const authorization = await alarmPort.requestAuthorization();
      if (authorization === 'denied') {
        Alert.alert(
          'Permissão negada',
          'Libere os alarmes em Ajustes → Hora do Remédio → Alarmes.',
        );
        return;
      }
      const id = await alarmPort.scheduleFixedAlarm({
        medicineId: 'teste',
        fireDate: addSeconds(new Date(), 60),
        title: 'Teste de alarme',
      });
      setTestAlarmId(id);
      Alert.alert(
        'Alarme de teste agendado',
        isReal
          ? 'Toca em 1 minuto. Coloque o iPhone no SILENCIOSO e bloqueie a tela — ele deve tocar mesmo assim.'
          : 'Você está no Expo Go: o alarme é SIMULADO (não toca). O alarme de verdade funciona no app instalado.',
      );
    } catch (error) {
      console.warn(
        '[teste de alarme] falhou:',
        error instanceof Error ? error.message : 'erro desconhecido',
      );
      Alert.alert('Não foi possível agendar', 'Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function cancelTestAlarm() {
    if (!testAlarmId) return;
    await alarmPort.stopAlarm(testAlarmId).catch(() => {});
    setTestAlarmId(null);
    Alert.alert('Teste cancelado', 'O alarme de teste foi removido.');
  }

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.statusBox,
          { backgroundColor: isReal ? theme.brandSoft : theme.accentSoft },
        ]}
      >
        <ThemedText type="smallBold" themeColor={isReal ? 'brand' : 'accent'}>
          {isReal
            ? 'Alarme de verdade ativo (AlarmKit) — toca mesmo no silencioso.'
            : 'Modo Expo Go: alarmes SIMULADOS. O teste real é no app instalado.'}
        </ThemedText>
      </View>

      <ThemedText type="heading" style={styles.sectionTitle}>
        Teste do alarme
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Agenda um alarme para daqui a 1 minuto. Para o teste valer: deixe o iPhone
        no modo silencioso (chavinha lateral) e bloqueie a tela.
      </ThemedText>

      <Pressable
        onPress={scheduleTestAlarm}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.brand },
          (pressed || busy) && { opacity: 0.7 },
        ]}
      >
        <ThemedText type="heading" style={{ color: theme.onBrand }}>
          {busy ? 'Agendando…' : 'Testar alarme em 1 minuto'}
        </ThemedText>
      </Pressable>

      {testAlarmId !== null && (
        <Pressable
          onPress={cancelTestAlarm}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
        >
          <ThemedText type="smallBold" themeColor="danger">
            Cancelar alarme de teste
          </ThemedText>
        </Pressable>
      )}

      <View style={styles.footer}>
        <ThemedText type="small" themeColor="textSecondary">
          Hora do Remédio — dados guardados somente neste aparelho.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  statusBox: {
    borderRadius: Radius.chip,
    padding: Spacing.three,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: Radius.bubble,
    paddingVertical: Spacing.three,
  },
  secondaryButton: {
    alignItems: 'center',
    padding: Spacing.two,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingBottom: Spacing.four,
  },
});
