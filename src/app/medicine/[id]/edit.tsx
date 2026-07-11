import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { MedicineForm } from '@/components/medicine-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMedicines } from '@/lib/medicines-context';
import { persistPhoto } from '@/lib/photos';
import type { MedicineFormValues } from '@/lib/validation';

export default function EditMedicineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { medicines, updateMedicine, removeMedicine } = useMedicines();

  const medicine = medicines.find((med) => med.id === id);

  if (!medicine) {
    return (
      <ThemedView style={styles.missing}>
        <ThemedText themeColor="textSecondary">Remédio não encontrado.</ThemedText>
      </ThemedView>
    );
  }

  async function handleSubmit(values: MedicineFormValues) {
    if (!medicine) return;
    let photoUri = values.photoUri;
    if (photoUri && photoUri !== medicine.photoUri) {
      photoUri = await persistPhoto(photoUri, medicine.id);
    }
    await updateMedicine(medicine.id, {
      name: values.name,
      photoUri,
      times: values.times,
      startDate: values.startDate,
      durationDays: values.durationDays,
      soundId: values.soundId,
    });
    router.back();
  }

  function confirmDelete() {
    if (!medicine) return;
    Alert.alert(
      'Excluir remédio',
      `Excluir "${medicine.name}"? Os lembretes dele param e o histórico é apagado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await removeMedicine(medicine.id);
            router.back();
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <View style={[styles.pauseRow, { backgroundColor: theme.backgroundElement, borderColor: theme.outline }]}>
        <View style={styles.pauseText}>
          <ThemedText type="smallBold">Lembretes ativos</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Desligue para pausar sem excluir.
          </ThemedText>
        </View>
        <Switch
          value={medicine.active}
          onValueChange={(active) => updateMedicine(medicine.id, { active })}
          trackColor={{ true: theme.brand }}
          accessibilityLabel="Lembretes ativos"
        />
      </View>

      <MedicineForm initial={medicine} submitLabel="Salvar alterações" onSubmit={handleSubmit} />

      <Pressable
        onPress={confirmDelete}
        accessibilityRole="button"
        style={({ pressed }) => [styles.delete, pressed && { opacity: 0.7 }]}
      >
        <ThemedText type="smallBold" themeColor="danger">
          Excluir remédio
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.chip,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pauseText: {
    flex: 1,
    gap: Spacing.half,
  },
  delete: {
    alignItems: 'center',
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
});
