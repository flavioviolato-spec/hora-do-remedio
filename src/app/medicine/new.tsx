import { useRouter } from 'expo-router';

import { MedicineForm } from '@/components/medicine-form';
import { ThemedView } from '@/components/themed-view';
import { useMedicines } from '@/lib/medicines-context';
import { persistPhoto } from '@/lib/photos';
import type { MedicineFormValues } from '@/lib/validation';

export default function NewMedicineScreen() {
  const router = useRouter();
  const { addMedicine, updateMedicine } = useMedicines();

  async function handleSubmit(values: MedicineFormValues) {
    // Salva primeiro; a foto é copiada em seguida para o arquivo definitivo.
    const medicine = await addMedicine({ ...values, photoUri: null });
    if (values.photoUri) {
      const finalUri = await persistPhoto(values.photoUri, medicine.id);
      await updateMedicine(medicine.id, { photoUri: finalUri });
    }
    router.back();
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <MedicineForm submitLabel="Salvar remédio" onSubmit={handleSubmit} />
    </ThemedView>
  );
}
