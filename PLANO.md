# PLANO — App "Hora do Remédio" (iOS, alarme que toca no silencioso)

> Plano aprovado pelo Flavio em 10/07/2026. Detalhes de pesquisa e decisões: ver seções abaixo.

## Objetivo

App para o iPhone do Flavio que:
1. Cadastra remédio **tirando foto da caixinha**;
2. Define **horários** (vários por dia) e **duração em dias**;
3. Toca **alarme de verdade no horário — mesmo com o iPhone no silencioso**;
4. Tela inicial: remédios com foto, horários, dias restantes, editar;
5. **Marcar dose como tomada** (por remédio/horário/dia), com histórico;
6. Vários sons de alarme; visual com animações.

## Decisões-chave (fixadas)

- **iOS 26+ / AlarmKit**: única forma de app de terceiro tocar alarme no silencioso (mesmo privilégio do Relógio nativo). Exige `NSAlarmKitUsageDescription` + permissão do usuário. Sem entitlement especial → compatível com assinatura gratuita.
- **Distribuição gratuita** via AltStore (re-assinatura a cada 7 dias, Apple ID gratuito). Custo assumido: app expirado = alarmes param até o refresh. Mitigação: banner de contagem regressiva no app.
- **Stack**: Expo SDK 57 + TypeScript + expo-router (New Architecture). UI iterada ao vivo no iPhone via Expo Go a partir do Windows.
- **Módulo AlarmKit**: [`react-native-nitro-ios-alarm-kit`](https://github.com/Gautham495/react-native-nitro-ios-alarm-kit) (fork + versão pinada). Fallback: patch no fork; último caso, módulo Expo próprio em Swift.
- **Build sem Mac**: GitHub Actions `macos-26` → `expo prebuild` → `xcodebuild` com `CODE_SIGNING_ALLOWED=NO` → `.ipa` não assinado em GitHub Release → AltStore instala/re-assina. Repositório público.
- **Dados**: JSON versionado em AsyncStorage atrás de `lib/storage.ts`. Fotos em `documentDirectory/photos/`. Datas com `date-fns`.
- **Modelo de alarme**: recorrente diário por horário + reconciliação a cada abertura/foreground (`lib/alarmSync.ts`). Nunca 1 alarme por dia de tratamento (estouraria limite do sistema).

## Arquitetura

```
src/app/_layout.tsx            raiz expo-router; reconciliador + listener AppState
src/app/index.tsx              HOME: checklist de hoje + cards de remédios
src/app/medicine/new.tsx       cadastro: foto → nome → horários → duração → som
src/app/medicine/[id]/edit.tsx edição
src/app/medicine/[id]/index.tsx detalhe/histórico (grade dias × horários)
src/app/settings.tsx           som padrão, banner 7 dias, sobre
src/components/                MedicineCard, DoseCheckItem, TimePickerList, SoundPicker, ExpiryBanner
src/lib/types.ts               Medicine, DoseRecord
src/lib/storage.ts             repositório JSON versionado + migração
src/lib/schedule.ts            FUNÇÕES PURAS (jest): expandDoses, daysRemaining, isActiveOn, computeDesiredAlarms
src/lib/alarmSync.ts           reconciliador
src/lib/alarm/{port,native,mock}.ts  AlarmPort + adapter real + mock (Expo Go/jest)
src/lib/provisioning.ts        lê ExpirationDate do embedded.mobileprovision
plugins/withAlarmSounds.js     config plugin de sons
.github/workflows/build-ios.yml
```

## Etapas

| # | Entrega demonstrável | Status |
|---|---|---|
| 0 | Projeto local + git + PLANO/PROGRESSO | em andamento |
| 1 | App abre no iPhone via Expo Go (Home fake, tema) + jest | pendente |
| 2 | `.ipa` via AltStore com alarme TOCANDO no silencioso | pendente (precisa conta GitHub) |
| 3 | Cadastro com foto/horários/duração; Home real; jest passando | pendente |
| 4 | Alarmes reais; editar/encerrar cancela | pendente |
| 5 | Dose tomada com animação + histórico | pendente |
| 6 | Sons com preview + ícone/splash + polimento | pendente |
| 7 | v1.0 no GitHub Release + guias PT + checklist manual + revisões | pendente |

## Verificação

- **Jest (Windows/CI)**: schedule (expansão, daysRemaining, virada de mês), computeDesiredAlarms, alarmSync mockado, storage (migração, JSON corrompido), casos-limite (nome vazio, ç/acentos, foto ausente, duplicado).
- **iPhone (manual, `TESTES-NO-IPHONE.md`)**: alarme no silencioso, com Foco, app morto, tela bloqueada; som correto; snooze; edição cancela; fim de tratamento; reboot; persistência; banner de expiração.

## Riscos

1. Expiração 7 dias (escolha do usuário) → banner + rotina documentada; upgrade futuro p/ TestFlight usa o mesmo código.
2. Módulo Nitro imaturo → fork + pin + patch; fallback módulo próprio.
3. Primeiro build CI → Etapa 2 antecipada de propósito.
4. AltStore no Windows (iTunes/iCloud do site da Apple) → guia passo a passo.

## Pendências do usuário

- Conta GitHub (informar usuário ou criar — cadastro é do Flavio).
- Etapa 2: instalar iTunes+iCloud (site da Apple) e logar Apple ID no AltServer pessoalmente.
- Rotina de refresh semanal no AltStore.
