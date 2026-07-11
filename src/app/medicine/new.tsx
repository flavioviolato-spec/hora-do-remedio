import { useRouter } from 'expo-router';
import { errorMessage } from '@/lib/text';
import { Alert } from 'react-native';

import { MedicineForm } from '@/components/medicine-form';
import { ThemedView } from '@/components/themed-view';
import { useMedicines } from '@/lib/medicines-context';
import { persistPhoto } from '@/lib/photos';
import type { MedicineFormValues } from '@/lib/validation';

export default function NewMedicineScreen() {
  const router = useRouter();
  const { addMedicine, updateMedicine, treatmentMemory } = useMedicines();

  async function handleSubmit(values: MedicineFormValues) {
    // Salva o remédio primeiro. A foto é a parte "opcional": se ela falhar,
    // o remédio NÃO é perdido nem duplicado — só avisamos sobre a foto.
    const medicine = await addMedicine({ ...values, photoUri: null });
    if (values.photoUri) {
      try {
        const finalUri = await persistPhoto(values.photoUri, medicine.id);
        await updateMedicine(medicine.id, { photoUri: finalUri });
      } catch (error) {
        console.warn(
          '[novo remédio] foto não pôde ser salva:',
          errorMessage(error),
        );
        Alert.alert(
          'Remédio salvo',
          'Só a foto não pôde ser guardada. Toque no remédio para tentar de novo.',
        );
      }
    }
    router.back();
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <MedicineForm submitLabel="Salvar remédio" onSubmit={handleSubmit} treatmentMemory={treatmentMemory} />
    </ThemedView>
  );
}
