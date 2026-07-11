import DateTimePicker from '@react-native-community/datetimepicker';
import { errorMessage } from '@/lib/text';
import { addDays } from 'date-fns';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { SoundPicker } from '@/components/sound-picker';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { recognizeText } from '@/lib/ocr';
import { pickBestNameCandidate } from '@/lib/ocr-heuristics';
import { toDateISO, toTimeHM } from '@/lib/schedule';
import { normalizeSoundId } from '@/lib/sounds';
import { suggestTreatment } from '@/lib/treatment-suggestions';
import type { Medicine } from '@/lib/types';
import { MAX_NAME_LENGTH, validateMedicine, type MedicineFormValues } from '@/lib/validation';

type Props = {
  initial?: Medicine;
  submitLabel: string;
  onSubmit: (values: MedicineFormValues) => Promise<void>;
  /** Memória de sugestões (nome normalizado → tratamento) vinda do
   * useMedicines(). Opcional com default `{}`: o form continua funcionando
   * (e testável) sem provider — só perde a fonte "memória do usuário",
   * a lista curada segue valendo. */
  treatmentMemory?: Record<string, string>;
};

const DURATION_PRESETS = [5, 7, 10, 14, 30];

const TREATMENT_PRESETS = [
  'Dor',
  'Febre',
  'Infecção',
  'Náusea e vômito',
  'Relaxante muscular',
  'Antibiótico',
  'Anti-inflamatório',
  'Pressão',
];

export function MedicineForm({ initial, submitLabel, onSubmit, treatmentMemory = {} }: Props) {
  const theme = useTheme();

  const [name, setName] = useState(initial?.name ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(initial?.photoUri ?? null);
  const [times, setTimes] = useState<string[]>(initial?.times ?? []);
  const [durationDays, setDurationDays] = useState(initial?.durationDays ?? 7);
  const [startDate, setStartDate] = useState(initial?.startDate ?? toDateISO(new Date()));
  const [soundId, setSoundId] = useState(normalizeSoundId(initial?.soundId));
  const [treatment, setTreatment] = useState(initial?.treatment ?? '');
  // Texto cru do campo de estoque: '' = usuário não controla estoque.
  const [stockText, setStockText] = useState(
    initial?.stockCount !== undefined ? String(initial.stockCount) : '',
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  /** "Pedido mais recente vence": incrementado a cada nova foto — se o
   * usuário trocar de foto antes da leitura da anterior terminar, o
   * resultado da leitura antiga é descartado ao chegar (mesmo princípio da
   * fila de gravação em medicines-context.tsx, aqui só um contador). */
  const ocrRequestIdRef = useRef(0);
  /** Espelho do estado `name` pra callbacks assíncronos (o `.then` do OCR)
   * enxergarem o valor mais recente sem depender do closure da renderização
   * antiga — mesmo padrão do storeRef em medicines-context.tsx. */
  const nameRef = useRef(name);
  nameRef.current = name;
  /** Evita aplicar um resultado de OCR depois que a tela já foi fechada
   * (usuário cancelou/voltou antes da leitura terminar). */
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState(() => {
    const base = new Date();
    base.setHours(8, 0, 0, 0);
    return base;
  });

  const todayISO = toDateISO(new Date());
  const tomorrowISO = toDateISO(addDays(new Date(), 1));

  /**
   * Lê o nome impresso na caixinha e sugere no campo — sem nunca travar o
   * formulário nem sobrescrever o que o usuário já digitou. Disparada sem
   * `await` bloquear a tela (ver captureFromCamera/pickFromLibrary).
   */
  function runOcr(uri: string) {
    const requestId = ++ocrRequestIdRef.current;
    setOcrLoading(true);
    recognizeText(uri).then((lines) => {
      // Tela já fechada, ou resposta de uma foto antiga (outra já venceu a
      // corrida) — nos dois casos, ignora.
      if (!mountedRef.current || ocrRequestIdRef.current !== requestId) return;
      setOcrLoading(false);
      const candidate = pickBestNameCandidate(lines);
      if (!candidate) return;
      // O nome só é aplicado se o campo estava vazio — e só nesse caso a
      // sugestão de tratamento também dispara (senão o nome que vale é o
      // que o usuário digitou, não o da foto).
      const willApply = nameRef.current.trim() === '';
      setName((current) => (current.trim() === '' ? candidate : current));
      if (willApply) maybeSuggestTreatment(candidate);
    });
  }

  /**
   * Preenche o campo "Tratamento" com uma sugestão tirada do nome do
   * remédio — SÓ se o campo estiver vazio naquele momento (nunca
   * sobrescreve nada, nem em corrida: a checagem acontece dentro do
   * updater do setTreatment). O usuário pode apagar ou editar à vontade.
   */
  function maybeSuggestTreatment(medicineName: string) {
    const suggestion = suggestTreatment(medicineName, treatmentMemory);
    if (!suggestion) return;
    setTreatment((current) => (current.trim() === '' ? suggestion : current));
  }

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
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        runOcr(result.assets[0].uri);
      }
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
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
        runOcr(result.assets[0].uri);
      }
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
      soundId,
      treatment,
      // Vazio = não controla estoque. Texto ruim vira NaN, que não é inteiro
      // — a validateMedicine rejeita com a mensagem certa.
      stockCount: stockText.trim() === '' ? null : Number(stockText),
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
        errorMessage(error),
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
        onEndEditing={() => maybeSuggestTreatment(name)}
        placeholder="Ex.: Amoxicilina 500mg"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, fieldBox, { color: theme.text }]}
        maxLength={MAX_NAME_LENGTH}
        accessibilityLabel="Nome do remédio"
      />
      {ocrLoading && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.ocrHint}>
          Lendo o nome da caixinha…
        </ThemedText>
      )}

      <ThemedText type="smallBold" themeColor="textSecondary">
        Tratamento (opcional)
      </ThemedText>
      <View style={styles.timesRow}>
        {TREATMENT_PRESETS.map((preset) => {
          const selected = treatment.trim() === preset;
          return (
            <Pressable
              key={preset}
              onPress={() => setTreatment(selected ? '' : preset)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              hitSlop={8}
              style={[styles.timeChip, selected ? { backgroundColor: theme.brand } : fieldBox]}
            >
              <ThemedText type="smallBold" style={selected ? { color: theme.onBrand } : undefined}>
                {preset}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={treatment}
        onChangeText={setTreatment}
        placeholder="Ex.: Dor de cabeça, colesterol…"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, fieldBox, { color: theme.text }]}
        maxLength={40}
        accessibilityLabel="Tratamento"
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
        Comprimidos na caixa (opcional)
      </ThemedText>
      <TextInput
        value={stockText}
        onChangeText={(text) => setStockText(text.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="Ex.: 20 — deixe vazio para não controlar"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, fieldBox, { color: theme.text }]}
        maxLength={3}
        accessibilityLabel="Comprimidos na caixa"
      />

      <ThemedText type="smallBold" themeColor="textSecondary">
        Som do alarme
      </ThemedText>
      <SoundPicker value={soundId} onChange={setSoundId} />

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
  ocrHint: {
    marginTop: -Spacing.one,
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
