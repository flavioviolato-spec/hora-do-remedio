import { addSeconds, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useProvisioningInfo } from '@/hooks/use-provisioning-info';
import { useTheme } from '@/hooks/use-theme';
import { getAlarmPort } from '@/lib/alarm';
import { appVersionLabel } from '@/lib/app-version';

/**
 * Ajustes + área de teste do alarme (o "smoke test" da Etapa 2):
 * comprova no aparelho que o AlarmKit toca mesmo no modo silencioso.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const alarmPort = getAlarmPort();
  const isReal = alarmPort.isAvailable();
  const { info: provisioning } = useProvisioningInfo();

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

      {provisioning && (
        <View
          style={[
            styles.statusBox,
            { backgroundColor: provisioning.daysRemaining <= 2 ? theme.accentSoft : theme.brandSoft },
          ]}
        >
          <ThemedText
            type="smallBold"
            themeColor={provisioning.daysRemaining <= 2 ? 'danger' : 'brand'}
          >
            {provisioning.daysRemaining <= 0
              ? 'Instalação expirada — abra o AltStore e toque em "Refresh All".'
              : `Instalação válida até ${format(provisioning.expirationDate, "d 'de' MMMM", { locale: ptBR })} (faltam ${provisioning.daysRemaining} ${provisioning.daysRemaining === 1 ? 'dia' : 'dias'}).`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.provisioningHint}>
            App instalado fora da App Store (AltStore) expira a cada 7 dias — abra o AltStore no
            iPhone e toque em &quot;Refresh All&quot; antes de vencer, senão os alarmes param.
          </ThemedText>
        </View>
      )}

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
        <ThemedText type="small" themeColor="textSecondary">
          Versão instalada: {appVersionLabel(process.env.EXPO_PUBLIC_APP_VERSION)}
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
    gap: Spacing.one,
  },
  provisioningHint: {
    lineHeight: 18,
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
    gap: Spacing.half,
  },
});
