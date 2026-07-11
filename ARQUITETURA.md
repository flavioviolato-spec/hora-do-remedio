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
| **Um único contexto para `medicines` + `doseLog`** (Etapa 5) | Os dois vivem no mesmo `Store`/arquivo JSON; dois contextos independentes arriscam uma gravação sobrescrever a outra. |
| **Celebração de dose tomada com Reanimated, sem Lottie** (Etapa 5) | Zero dependência nativa nova; Reanimated já entrega o efeito e já está provado no app (`dose-check-item.tsx`). |
| **Sons do alarme via config plugin próprio** (`plugins/withAlarmSounds.js`, Etapa 6) | Mecanismo padrão do Expo para embutir arquivo no bundle nativo; roda sozinho dentro do `expo prebuild` já existente no CI, sem precisar de Mac. |
| **Validade da instalação lida direto do `embedded.mobileprovision`** (Base64, Etapa 7) | É o único jeito de saber, de dentro do app, quando a assinatura gratuita do AltStore vai vencer — sem isso, o alarme para de tocar sem aviso nenhum. Lido como Base64 (não UTF-8): o arquivo é um envelope binário assinado (CMS/PKCS7), e leitura UTF-8 estrita lança erro em qualquer arquivo que não seja texto válido — achado real de QA que teria deixado o banner sempre quebrado no aparelho real (ver `provisioning.ts`). |
| **Versão exibida em Ajustes vem da tag do git, injetada pelo CI** (`EXPO_PUBLIC_APP_VERSION`, Etapa 7) | `app.json` tem uma versão fixa (`1.0.0`) que nunca muda — não serve pra conferir qual build está instalada. A tag usada no build (`v0.5.0-teste`, etc.) já é o identificador real de cada Release; o workflow só a propaga como variável de ambiente (só em builds de tag, nunca em build manual numa branch) em vez de exigir bump manual de versão a cada release. |
| **OCR do nome do remédio via módulo Expo nativo próprio** (Vision `VNRecognizeTextRequest`) | Não há, com confiança suficiente, um pacote OCR iOS mantido e compatível com New Architecture; a API da Apple é pequena, estável, gratuita e roda 100% no aparelho (exigência de LGPD). |

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

## Etapa 5 — histórico de doses tomadas (11/07/2026)

### Um contexto só, não dois

**Decisão**: `MedicinesContext` (`src/lib/medicines-context.tsx`) passa a
expor também `doseLog` e `toggleDose(medicineId, dateISO, time)`, além do
que já tem hoje (`medicines`, `addMedicine`, `updateMedicine`,
`removeMedicine`). **Não** entra um `dose-log-context.tsx` novo.

**Motivo**: `medicines` e `doseLog` moram no mesmo arquivo JSON — o `Store`
de `storage.ts` — e `commit()` grava a loja **inteira** de uma vez, de
propósito (ver "Gravar antes de mostrar" na tabela acima). Se cada um
tivesse seu próprio contexto, cada um teria sua própria cópia do `store`
em memória (`storeRef`) e sua própria chamada a `saveStore`; marcar uma
dose e editar um remédio ao mesmo tempo poderia fazer uma gravação
sobrescrever a outra (a última a terminar "vence" e apaga a mudança da
primeira) — um bug raro, difícil de reproduzir e ainda mais difícil de
diagnosticar sozinho. Além disso `removeMedicine` já precisa alterar
`medicines` E `doseLog` na mesma gravação (limpeza em cascata) — prova de
que os dois já são acoplados, não independentes.

**Alternativa descartada**: `dose-log-context.tsx` espelhando
`medicines-context.tsx` — pareceria "mais organizado" por ter um arquivo
por assunto, mas cria dois escritores para o mesmo dado (risco de corrida
descrito acima) e obrigaria um contexto a chamar funções do outro só para
a exclusão de remédio funcionar direito — mais complexidade, não menos.

### Celebração da dose tomada: Reanimated, sem Lottie

**Decisão**: a animação de "comemoração" ao marcar uma dose como tomada é
feita só com `react-native-reanimated` (já instalado, sem rebuild nativo).
Não entra `lottie-react-native` nesta etapa.

**Motivo**: qualquer dependência nativa nova é mais uma peça para manter e
atualizar nos próximos anos (a cada upgrade de Expo/React Native, é mais
uma biblioteca que pode quebrar ou pedir ajuste) — sem ganho proporcional
aqui, porque o Reanimated já está provado no app (o "estourar a bolha" em
`dose-check-item.tsx`) e é perfeitamente capaz de um efeito bonito por
conta própria (ex.: anel se expandindo + pontinhos de confete simulados
com `View`s animadas por spring/timing), sem precisar de nenhum arquivo de
animação externo (`.json` do Lottie) nem checar a licença desse arquivo.

**Alternativa descartada**: `lottie-react-native` com uma animação pronta
baixada da internet — pode ficar visualmente um pouco mais rica, mas soma
três custos de uma vez: dependência nativa nova (exige rebuild via CI),
um arquivo de asset de terceiro (mais uma licença para verificar, como no
caso dos sons da Etapa 6) e mais uma biblioteca para acompanhar em
atualizações futuras do Expo — por um ganho estético que o Reanimated já
cobre bem. Fica registrado como opção **reversível**: se depois de ver a
versão em Reanimated no iPhone o Flavio quiser algo mais elaborado, a
troca fica isolada no componente de celebração, sem afetar o resto do app.

## Etapa 6 — sons customizados do alarme (11/07/2026)

**Decisão**: `plugins/withAlarmSounds.js`, um config plugin próprio usando
a API oficial de config plugins do Expo (`@expo/config-plugins`, mod
`withXcodeProject`). Ele copia os 4–6 arquivos de som fixos (embutidos no
projeto, não escolhidos pelo usuário) de `assets/sounds/` para dentro do
projeto iOS gerado e os registra na fase "Copy Bundle Resources" do
Xcode — automaticamente, dentro do `npx expo prebuild` que **já existe**
no `.github/workflows/build-ios.yml`. Nenhum passo manual no Xcode,
nenhum Mac necessário — o `ios/` é gerado do zero a cada build no runner
`macos-26` do GitHub Actions.

**Motivo**: é o mecanismo padrão e documentado do próprio ecossistema Expo
para "preciso de um arquivo nativo dentro do bundle que o Metro/JS não
carrega" — o mesmo tipo de mecanismo que o próprio Expo usa internamente
para ícone e splash screen. Como os sons são fixos e já conhecidos hoje,
um plugin pequeno (dezenas de linhas) resolve sem trazer nenhuma
dependência nativa nova.

**Alternativas descartadas**:
- *Reaproveitar o config plugin do `expo-notifications`* (que tem um
  parâmetro `sounds` pronto para embutir áudio no bundle iOS) só pelo
  efeito colateral de embutir arquivo — funcionaria, mas traria um módulo
  nativo inteiro (com prompt de permissão de notificação e o framework
  `UserNotifications` vinculado ao app) que o app não usa para mais nada,
  só para reaproveitar um "encanamento" que dá para escrever direto, sob
  controle total do projeto, em menos código do que a superfície inteira
  daquele módulo.
- *Pedir para o Flavio abrir o Xcode e arrastar os arquivos manualmente* —
  descartado de cara: ele não tem Mac, e mesmo que tivesse, o `ios/` é
  regenerado do zero a cada `prebuild`, então o passo manual teria que se
  repetir em todo build.

## OCR do nome do remédio pela foto da caixinha (11/07/2026)

**Decisão**: escrever um módulo Expo nativo próprio, pequeno, em Swift
(via Expo Modules API — módulo local dentro do próprio projeto, sem
depender de pacote publicado por terceiros), chamando o `VNRecognizeTextRequest`
do framework Vision da Apple e devolvendo ao JS as linhas de texto
reconhecidas na foto. É a mesma técnica de "módulo local autolinkado"
já prevista como plano B para o AlarmKit no PLANO.md, agora usada como
caminho principal.

**Motivo**: não encontrei, com confiança suficiente para recomendar, um
pacote React Native/Expo de OCR para iOS atualmente mantido e compatível
com a New Architecture que este projeto já usa (`newArchEnabled: true`) —
os que existem no ecossistema tendem a estar desatualizados ou a depender
do Google ML Kit (mais um framework de terceiros pesado, para fazer o que
o próprio iOS já faz de graça e localmente). Diante dessa dúvida — e como
o `VNRecognizeTextRequest` é uma API pequena, estável e muito bem
documentada da Apple (existe desde 2019, não muda com frequência) — o
módulo próprio fica pequeno (uma função: recebe o caminho da foto, devolve
o texto reconhecido), mais fácil de auditar e manter no futuro do que
depender da disponibilidade contínua de um pacote de terceiro incerto.
Roda 100% no aparelho, sem rede — atende à exigência de sigilo/LGPD (foto
da caixinha nunca sai do iPhone).

**Antes de implementar**: farei uma checagem pontual por um pacote mantido
no momento da implementação (o ecossistema de bibliotecas muda com o
tempo); se aparecer uma opção madura e compatível com New Architecture,
ela passa a ser preferida — mais simples que manter código Swift. Até lá,
o módulo próprio é o caminho assumido.

**Checagem feita (11/07/2026)**: encontrado 1 candidato plausível
(`@dariyd/react-native-text-recognition`, usa Vision de verdade, ativo,
compatível com New Architecture) — mas mantido por 1 pessoa só, 4 estrelas,
pouco testado pela comunidade. Decisão confirmada: módulo Swift próprio
(auditável por completo, sem dependência de terceiro tocando dado de
saúde, sem carregar suporte a Android/PDF/multi-idioma que o app não usa).

**Alternativa descartada**: pacote de terceiro de OCR (ex.: wrappers de
Google ML Kit ou de Vision já publicados no npm) como primeira escolha —
descartado por incerteza de manutenção/compatibilidade com New
Architecture, não por princípio; se um candidato confiável aparecer na
checagem da implementação, ele é preferido ao módulo próprio (mesma regra
de ouro: preferir o que já existe e é bem mantido, quando existir).

## Modelo de dados (v1)

```ts
Medicine  { id(uuid), name, photoUri|null, times["HH:MM"], startDate"YYYY-MM-DD",
            durationDays(1–365), soundId, treatment?(≤40 chars), active, createdAt }
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

- **225 testes jest** (schedule, validation, storage, alarmSync, medicines-context, sounds, sound-picker, provisioning, app-version) — rodar com `npm test`
- Ciclo obrigatório por etapa: testador → revisor-seguranca → revisor-codigo → correções → testes de novo (CLAUDE.md)
- Última revisão de segurança: 11/07/2026 (Etapa 7 — banner de validade, campo Tratamento,
  versão em Ajustes) — aprovada sem itens críticos; achados baixos corrigidos (nome fictício
  em dado de teste)
- Última revisão de código: 11/07/2026 (Etapa 7), aprovada sem itens críticos (melhorias
  aplicadas: `WarningBanner` extraído, `trim()` alinhado entre `validation.ts`/`storage.ts`,
  tipagem `SFSymbol` em vez de namespace `React` implícito, workflow só preenche versão em
  build de tag)
