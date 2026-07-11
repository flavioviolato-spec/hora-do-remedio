import DateTimePicker from '@react-native-community/datetimepicker';
import { addDays } from 'date-fns';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toDateISO, toTimeHM } from '@/lib/schedule';
import { DEFAULT_SOUND_ID, type Medicine } from '@/lib/types';
import { validateMedicine, type MedicineFormValues } from '@/lib/validation';

type Props = {
  initial?: Medicine;
  submitLabel: string;
  onSubmit: (values: MedicineFormValues) => Promise<void>;
};

const DURATION_PRESETS = [5, 7, 10, 14, 30];

export function MedicineForm({ initial, submitLabel, onSubmit }: Props) {
  const theme = useTheme();

  const [name, setName] = useState(initial?.name ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(initial?.photoUri ?? null);
  const [times, setTimes] = useState<string[]>(initial?.times ?? []);
  const [durationDays, setDurationDays] = useState(initial?.durationDays ?? 7);
  const [startDate, setStartDate] = useState(initial?.startDate ?? toDateISO(new Date()));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState(() => {
    const base = new Date();
    base.setHours(8, 0, 0, 0);
    return base;
  });

  const todayISO = toDateISO(new Date());
  const tomorrowISO = toDateISO(addDays(new Date(), 1));

  async function captureFromCamera() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Sem acesso à câmera',
          'Libere a câmera em Ajustes → Hora do Remédio para fotografar a caixinha.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      Alert.alert('Não foi possível abrir a câmera', 'Tente de novo.');
    }
  }

  async function pickFromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      Alert.alert('Não foi possível abrir a galeria', 'Tente de novo.');
    }
  }

  function addTime() {
    const time = toTimeHM(pickerValue);
    setPickerOpen(false);
    setTimes((prev) => (prev.includes(time) ? prev : [...prev, time].sort()));
  }

  function removeTime(time: string) {
    setTimes((prev) => prev.filter((t) => t !== time));
  }

  async function handleSubmit() {
    const values: MedicineFormValues = {
      name,
      photoUri,
      times,
      startDate,
      durationDays,
      soundId: initial?.soundId ?? DEFAULT_SOUND_ID,
    };
    const problems = validateMedicine(values);
    setErrors(problems);
    if (problems.length > 0) return;
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.warn(
        '[form] falha ao salvar:',
        error instanceof Error ? error.message : 'erro desconhecido',
      );
      Alert.alert('Não foi possível salvar', 'Tente de novo. Se persistir, me avise.');
    } finally {
      setSaving(false);
    }
  }

  const fieldBox = { backgroundColor: theme.backgroundElement, borderColor: theme.outline };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <ThemedText type="smallBold" themeColor="textSecondary">
        Foto da caixinha
      </ThemedText>
      <View style={styles.photoRow}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
        ) : (
          <View style={[styles.photoPreview, styles.photoEmpty, { backgroundColor: theme.brandSoft }]}>
            <SymbolView name="pills.fill" size={34} tintColor={theme.brand} />
          </View>
        )}
        <View style={styles.photoButtons}>
          <Pressable
            onPress={captureFromCamera}
            accessibilityRole="button"
            style={({ pressed }) => [styles.photoButton, fieldBox, pressed && { opacity: 0.7 }]}
          >
            <SymbolView name="camera.fill" size={18} tintColor={theme.brand} />
            <ThemedText type="smallBold">Tirar foto</ThemedText>
          </Pressable>
          <Pressable
            onPress={pickFromLibrary}
            accessibilityRole="button"
            style={({ pressed }) => [styles.photoButton, fieldBox, pressed && { opacity: 0.7 }]}
          >
            <SymbolView name="photo.on.rectangle" size={18} tintColor={theme.brand} />
            <ThemedText type="smallBold">Da galeria</ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="smallBold" themeColor="textSecondary">
        Nome do remédio
      </ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ex.: Amoxicilina 500mg"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, fieldBox, { color: theme.text }]}
        maxLength={80}
        accessibilityLabel="Nome do remédio"
      />

      <ThemedText type="smallBold" themeColor="textSecondary">
        Horários das doses
      </ThemedText>
      <View style={styles.timesRow}>
        {times.map((time) => (
          <Pressable
            key={time}
            onPress={() => removeTime(time)}
            accessibilityRole="button"
            accessibilityLabel={`Remover horário ${time}`}
            hitSlop={8}
            style={[styles.timeChip, { backgroundColor: theme.accentSoft }]}
          >
            <ThemedText type="smallBold" themeColor="accent" style={styles.tabularNums}>
              {time}
            </ThemedText>
            <SymbolView name="xmark" size={11} tintColor={theme.accent} />
          </Pressable>
        ))}
        <Pressable
          onPress={() => setPickerOpen((open) => !open)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.timeChip, fieldBox, styles.addChip, pressed && { opacity: 0.7 }]}
        >
          <SymbolView name="plus" size={12} tintColor={theme.brand} />
          <ThemedText type="smallBold" themeColor="brand">
            Adicionar horário
          </ThemedText>
        </Pressable>
      </View>
      {pickerOpen && (
        <View style={[styles.pickerBox, fieldBox]}>
          <DateTimePicker
            value={pickerValue}
            mode="time"
            display="spinner"
            locale="pt-BR"
            onChange={(_event, date) => date && setPickerValue(date)}
          />
          <View style={styles.pickerActions}>
            <Pressable onPress={() => setPickerOpen(false)} accessibilityRole="button">
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cancelar
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={addTime}
              accessibilityRole="button"
              style={[styles.confirmTime, { backgroundColor: theme.brand }]}
            >
              <ThemedText type="smallBold" style={{ color: theme.onBrand }}>
                Adicionar
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      <ThemedText type="smallBold" themeColor="textSecondary">
        Por quantos dias
      </ThemedText>
      <View style={styles.timesRow}>
        {DURATION_PRESETS.map((preset) => {
          const selected = durationDays === preset;
          return (
            <Pressable
              key={preset}
              onPress={() => setDurationDays(preset)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              hitSlop={8}
              style={[
                styles.timeChip,
                selected ? { backgroundColor: theme.brand } : fieldBox,
              ]}
            >
              <ThemedText type="smallBold" style={selected ? { color: theme.onBrand } : undefined}>
                {preset} dias
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.stepperRow, fieldBox]}>
        <Pressable
          onPress={() => setDurationDays((d) => Math.max(1, d - 1))}
          accessibilityRole="button"
          accessibilityLabel="Diminuir um dia"
          style={styles.stepperButton}
        >
          <SymbolView name="minus" size={18} tintColor={theme.brand} />
        </Pressable>
        <ThemedText type="clock">{durationDays}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {durationDays === 1 ? 'dia' : 'dias'}
        </ThemedText>
        <Pressable
          onPress={() => setDurationDays((d) => Math.min(365, d + 1))}
          accessibilityRole="button"
          accessibilityLabel="Aumentar um dia"
          style={styles.stepperButton}
        >
          <SymbolView name="plus" size={18} tintColor={theme.brand} />
        </Pressable>
      </View>

      <ThemedText type="smallBold" themeColor="textSecondary">
        Começa quando
      </ThemedText>
      <View style={styles.timesRow}>
        {[
          { label: 'Hoje', value: todayISO },
          { label: 'Amanhã', value: tomorrowISO },
        ].map((option) => {
          const selected = startDate === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setStartDate(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              hitSlop={8}
              style={[styles.timeChip, selected ? { backgroundColor: theme.brand } : fieldBox]}
            >
              <ThemedText type="smallBold" style={selected ? { color: theme.onBrand } : undefined}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
        {startDate !== todayISO && startDate !== tomorrowISO && (
          <View style={[styles.timeChip, { backgroundColor: theme.brandSoft }]}>
            <ThemedText type="smallBold" themeColor="brand">
              Início: {startDate}
            </ThemedText>
          </View>
        )}
      </View>

      {errors.length > 0 && (
        <View style={[styles.errorBox, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          {errors.map((error) => (
            <ThemedText key={error} type="small" themeColor="danger">
              • {error}
            </ThemedText>
          ))}
        </View>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={saving}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.submit,
          { backgroundColor: theme.brand },
          (pressed || saving) && { opacity: 0.7 },
        ]}
      >
        <ThemedText type="heading" style={{ color: theme.onBrand }}>
          {saving ? 'Salvando…' : submitLabel}
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  photoPreview: {
    width: 96,
    height: 96,
    borderRadius: 16,
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtons: {
    flex: 1,
    gap: Spacing.two,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 17,
    marginBottom: Spacing.two,
  },
  timesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addChip: {
    borderWidth: 1,
  },
  tabularNums: {
    fontVariant: ['tabular-nums'],
  },
  pickerBox: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  confirmTime: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingVertical: Spacing.one,
    marginBottom: Spacing.two,
  },
  stepperButton: {
    padding: Spacing.three,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: Radius.chip,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  submit: {
    alignItems: 'center',
    borderRadius: Radius.bubble,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
});
