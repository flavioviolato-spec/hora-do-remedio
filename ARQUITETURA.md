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
| **Reconciliação de alarmes protegida por fila única, dentro da própria função** | Chamadas concorrentes de `reconcileAlarms` sobre o mesmo `AlarmPort` (dois cadastros rápidos em sequência) podiam duplicar ou apagar alarmes corretos. Uma fila com "coalescing" (pedidos que chegam enquanto uma reconciliação roda são mesclados em UM próximo, já com os dados mais atuais) fica dentro de `alarmSync.ts`, associada ao `AlarmPort` — protege qualquer chamador (contexto React, testes, ou uma tela futura), não só quem lembrar de usar uma trava. Ver seção dedicada abaixo. |
| **JSON no AsyncStorage** (não SQLite) | Escala minúscula (dezenas de remédios, ~1.100 doses/ano). Camada repositório (`storage.ts`) versionada permite migrar p/ SQLite depois sem tocar nas telas. |
| **Sanitização na leitura** (`sanitizeStore`) | Dado corrompido nunca derruba o app: registros inválidos são descartados (formato E valores reais — rejeita "24:00", "2026-02-30", id fora do padrão). |
| **Gravar antes de mostrar** (`commit` do contexto) | A tela só muda se o disco gravou. Foto antiga apagada só APÓS gravar. Evita estado inconsistente e duplicação em retentativas. |
| **Fotos**: resize 800px JPEG, nome `<uuid>-<timestamp>.jpg` | Economiza espaço; timestamp evita cache mostrando foto antiga; UUID gerado pelo app impede caminho malicioso. |
| **Build sem Mac** (Etapa 2) | GitHub Actions `macos-26`: `expo prebuild` → `xcodebuild` sem assinatura → `.ipa` → AltStore re-assina com Apple ID gratuito (renovação semanal). EAS não serve (exige conta Apple paga p/ device build). |
| **Datas como strings** `YYYY-MM-DD`/`HH:MM` | Comparáveis lexicograficamente, sem bugs de fuso. Funções puras de calendário em `schedule.ts`, 100% cobertas por testes. |

## Concorrência no reconciliador de alarmes (10/07/2026)

**Decisão**: `reconcileAlarms` (em `src/lib/alarmSync.ts`) passa a serializar
sozinha as chamadas concorrentes feitas sobre o mesmo `AlarmPort`. Se uma
chamada chega enquanto outra já está em andamento, ela **não** roda em
paralelo: espera a chamada atual terminar e então roda de novo
automaticamente, já com a lista de remédios mais recente (as chamadas que
chegaram no meio do caminho são "mescladas" numa só rodada final — não se
empilha uma reconciliação por clique). Isso é implementado com uma
estrutura interna associada a cada `AlarmPort` (há só um por app, criado
uma vez em `src/lib/alarm/index.ts`). `alarm-sync-context.tsx` **não**
precisa de trava própria — só chama `reconcileAlarms` normalmente.

**Motivo**: dois cadastros/edições em sequência rápida podiam disparar duas
reconciliações ao mesmo tempo sobre o mesmo alarme nativo (AlarmKit),
duplicando um alarme ou apagando alarmes corretos — grave num app cujo
propósito é garantir que o alarme de remédio toque. Só uma fila real
(uma reconciliação de cada vez) elimina esse risco por completo; uma
solução que apenas "detecta depois que ficou desatualizada e desfaz" não
consegue interromper uma chamada nativa que já estava em andamento.

**Alternativas descartadas**:
- *Trava só no React (`alarm-sync-context.tsx`), sem proteção dentro da
  função pura* — resolve o app de hoje, mas deixa `reconcileAlarms`
  vulnerável para qualquer chamador futuro que não passe pelo contexto
  (ex.: um botão "sincronizar agora" adicionado sem lembrar da regra) e
  para os próprios testes automatizados.
- *"Número de geração" por chamada + status `superseded` + desfazer
  (`stopAlarm`) depois do fato* — funciona em teoria, mas usa DUAS técnicas
  de concorrência diferentes no mesmo arquivo (mais difícil de entender e
  manter sozinho), depende de `stopAlarm` desfazer perfeitamente o que
  criou (nem todo dublê de teste faz isso certo — achado real durante esta
  revisão), e ainda deixa uma brecha teórica se a chamada antiga demorar
  mais que a nova inteira.

**Implementado e testado** (11/07/2026): a fila está em `alarmSync.ts`
(`reconcileAlarms`/`runQueued`, `WeakMap<AlarmPort, PortQueue>`). O teste
`alarmSync.edge-cases.test.ts` (bloco "DEFEITO 3 (corrigido)") valida o
comportamento novo — 3 rodadas de QA independente (subagente testador)
encontraram e corrigiram 5 defeitos reais no total nesta etapa: virada de
meia-noite não protegida (alarme diário e de data fixa), falha de
agendamento reportada como sucesso, a corrida em si, e um relógio (`now`)
desatualizado que a própria fila introduziu (corrigido lendo o relógio só
no instante em que a rodada enfileirada de fato começa a rodar).

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
                  schedule (funções puras), medicines-context, alarm/{port,mock,native,index},
                  alarmSync (reconciliador, fila por AlarmPort), alarm-sync-context (liga ao React)
src/constants/    theme.ts (paleta "farmácia de bairro", verde/creme/âmbar)
__mocks__/        mock oficial do AsyncStorage p/ jest
```

## Qualidade

- **112 testes jest** (schedule, validation, storage, alarmSync) — rodar com `npm test`
- Ciclo obrigatório por etapa: testador → revisor-seguranca → revisor-codigo → correções → testes de novo (CLAUDE.md)
- Última revisão de segurança: 11/07/2026 (Etapa 4), aprovada sem itens críticos/altos
- Última revisão de código: 11/07/2026 (Etapa 4) — 1 item crítico corrigido (erro inesperado
  na reconciliação não avisava a tela, só o console)
