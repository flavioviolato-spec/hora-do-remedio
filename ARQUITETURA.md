# ARQUITETURA — Hora do Remédio

> Decisões registradas em 10–11/07/2026. Contexto completo no PLANO.md.

## Visão geral

App iOS local-first (sem servidor). React Native via **Expo SDK 54** + TypeScript
+ expo-router. Dados em JSON no AsyncStorage; fotos no diretório de documentos do
app. Alarmes de verdade virão do **AlarmKit** (iOS 26+) na Etapa 2.

```
UI (expo-router)  →  medicines-context (estado + persistência)
                       ↓                    ↓
                   storage.ts (JSON)    alarm/ (AlarmPort)
                       ↓                    ↓
                   AsyncStorage         mock | AlarmKit nativo (Etapa 2)
```

## Decisões e porquês

| Decisão | Motivo |
|---|---|
| **Expo SDK 54** (não o mais novo) | É a versão suportada pelo Expo Go do iPhone do Flavio; permite desenvolver do Windows com preview ao vivo. Não subir sem checar o aparelho. |
| **AlarmKit (iOS 26+)** na Etapa 2 | Única forma de app de terceiro tocar alarme no modo silencioso/Foco. Sem entitlement especial → sobrevive à re-assinatura gratuita do AltStore. Módulo: `react-native-nitro-ios-alarm-kit` (fork + versão pinada). |
| **AlarmPort (interface + 2 adapters)** em `src/lib/alarm/` | O módulo nativo não existe no Expo Go. O mock permite desenvolver toda a UI/lógica; o adapter real entra sem mudar o resto do app. |
| **Alarme recorrente diário por horário + reconciliação** (Etapa 4) | 1 alarme por dia de tratamento estouraria o limite (não documentado) do sistema. Contagem fica em remédios ativos × horários. Reconciliador roda a cada abertura/foreground. |
| **JSON no AsyncStorage** (não SQLite) | Escala minúscula (dezenas de remédios, ~1.100 doses/ano). Camada repositório (`storage.ts`) versionada permite migrar p/ SQLite depois sem tocar nas telas. |
| **Sanitização na leitura** (`sanitizeStore`) | Dado corrompido nunca derruba o app: registros inválidos são descartados (formato E valores reais — rejeita "24:00", "2026-02-30", id fora do padrão). |
| **Gravar antes de mostrar** (`commit` do contexto) | A tela só muda se o disco gravou. Foto antiga apagada só APÓS gravar. Evita estado inconsistente e duplicação em retentativas. |
| **Fotos**: resize 800px JPEG, nome `<uuid>-<timestamp>.jpg` | Economiza espaço; timestamp evita cache mostrando foto antiga; UUID gerado pelo app impede caminho malicioso. |
| **Build sem Mac** (Etapa 2) | GitHub Actions `macos-26`: `expo prebuild` → `xcodebuild` sem assinatura → `.ipa` → AltStore re-assina com Apple ID gratuito (renovação semanal). EAS não serve (exige conta Apple paga p/ device build). |
| **Datas como strings** `YYYY-MM-DD`/`HH:MM` | Comparáveis lexicograficamente, sem bugs de fuso. Funções puras de calendário em `schedule.ts`, 100% cobertas por testes. |

## Modelo de dados (v1)

```ts
Medicine  { id(uuid), name, photoUri|null, times["HH:MM"], startDate"YYYY-MM-DD",
            durationDays(1–365), soundId, active, createdAt }
DoseRecord{ medicineId, dateISO, time, takenAt }
Store     { version:1, medicines[], doseLog[] }   // AsyncStorage "hora-do-remedio/store"
```

## Estrutura de pastas

```
src/app/          telas (expo-router): index (Home), medicine/new, medicine/[id]/edit
src/components/   medicine-form, medicine-card, dose-check-item, themed-*
src/lib/          types (+ regexes/validadores), storage, validation, photos,
                  schedule (funções puras), medicines-context, alarm/{port,mock,index}
src/constants/    theme.ts (paleta "farmácia de bairro", verde/creme/âmbar)
__mocks__/        mock oficial do AsyncStorage p/ jest
```

## Qualidade

- **83 testes jest** (schedule, validation, storage) — rodar com `npm test`
- Ciclo obrigatório por etapa: testador → revisor-seguranca → revisor-codigo → correções → testes de novo (CLAUDE.md)
- Última revisão de segurança: 11/07/2026, aprovada sem itens críticos/altos
