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
| **OCR do nome do remédio via pacote pronto** (`expo-text-extractor`, com `@dariyd/react-native-text-recognition` e módulo Swift próprio como planos B/C) | Confirmado com dados reais de npm/GitHub (não só descrição): `expo-text-extractor` está ativo (push há ~2,5 semanas, 70 estrelas). Usa a Expo Modules API (mesma base dos módulos oficiais do Expo já usados no projeto) para chamar o Vision da Apple no iOS — mesma tecnologia que um módulo próprio usaria, já escrita, com risco de manutenção aceitável porque o OCR é conveniência, não função crítica. Decisão condicionada a um teste real de instalação antes de integrar na tela — ver seção dedicada abaixo. |

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

## OCR do nome do remédio pela foto da caixinha (decisão revisada em 11/07/2026, confirmada com dados reais de npm/GitHub)

**Decisão final**: adotar o pacote de terceiro `expo-text-extractor` como
primeira escolha — em vez de escrever, de saída, um módulo Swift do zero.
Ele usa a **Expo Modules API** (o mesmo mecanismo dos módulos oficiais que
o projeto já usa, como `expo-image` e `expo-file-system`) para chamar o
`VNRecognizeTextRequest` do framework **Vision** da Apple no iOS —
exatamente a mesma tecnologia que um módulo próprio usaria, só que já
escrita. A escolha fica condicionada a um **teste real de instalação**
antes de integrar na tela (ver "Antes de integrar no formulário" no
PLANO.md, Etapa 8) — não só à leitura de documentação.

**Esta seção passou por duas rodadas na mesma sessão**: uma primeira
revisão (subagente arquiteto) sem acesso a ferramentas de busca —
registrada abaixo como nota de transparência — seguida de uma
**verificação real**, feita diretamente na API pública do npm
(`registry.npmjs.org`) e do GitHub, que confirma ou corrige cada
candidato com números de verdade (não suposição):

| Pacote | Dados reais confirmados (11/07/2026) | Veredito |
|---|---|---|
| `expo-text-extractor` (pchalupa) | npm: v2.0.0 publicado 28/02/2026 (histórico ativo desde 01/2025, versões consistentes 0.1→0.2→1.0→2.0); GitHub: último push 23/06/2026 (~2,5 semanas antes desta checagem), 70 estrelas, 6 forks, não arquivado, issues abertas majoritariamente de bump automático de dependência (sinal de manutenção saudável, não de abandono) | **Escolhido — ativo de verdade, dados confirmados, não só descrição do pacote** |
| `expo-ocr` (barthap) | npm: publicado 09/12/2023 e **despublicado pelo próprio autor 10 minutos depois**, no mesmo dia — nunca existiu como pacote instalável de fato | **Eliminado** — a checagem anterior (sem internet) o listou como alternativa por causa da descrição do GitHub, mas ele nunca chegou a ser um pacote real e utilizável no npm. Corrigido nesta verificação. |
| `@dariyd/react-native-text-recognition` | npm: v2.0.20 publicado 21/11/2025 — real, mas ~7,5 meses sem atualização até esta checagem (mais parado que `expo-text-extractor`) | Mantido como **alternativa (plano B)** caso `expo-text-extractor` falhe no teste real — pacote existe e usa Vision de verdade, só não é a primeira escolha |
| `react-native-vision-camera-ocr-plus` | Não verificado numericamente (descartado por motivo estrutural, não de manutenção — ver tabela de decisões acima) | **Descartado** — exigiria `react-native-vision-camera` (dependência pesada que o app não usa; a foto já é estática via `expo-image-picker`) e historicamente usa ML Kit também no iOS, não Vision |

**Plano C, inalterado**: módulo Swift próprio, se `expo-text-extractor` E
`@dariyd/react-native-text-recognition` falharem os dois no teste real.

**Contexto**: em 10–11/07/2026, mais cedo no mesmo dia, a decisão
registrada era escrever um módulo Swift próprio (ver "Checagem original",
abaixo), porque a busca de então não tinha encontrado nenhum pacote de
OCR iOS mantido e claramente compatível com a New Architecture além do
`@dariyd/react-native-text-recognition` (1 mantenedor, poucas estrelas).
Essa checagem não incluía `expo-text-extractor` nem `expo-ocr` — os dois
apareceram numa busca nova, feita mais tarde no mesmo dia, o que motivou
esta revisão (e a tabela de dados reais acima já substitui a comparação
de candidatos feita nessa busca).

**Por que a Expo Modules API muda o cálculo de risco em relação à checagem
original**: a preocupação que motivou o módulo próprio (pacote de OCR
incompatível com a New Architecture, que este projeto usa via
`newArchEnabled: true`) é estruturalmente menor em pacotes escritos com a
Expo Modules API — é o mesmo mecanismo interno que o próprio time do Expo
usa nos seus módulos oficiais, desenhado desde a origem para a New
Architecture (ao contrário de um módulo "ponte" antigo que precisa de um
adaptador extra para funcionar com ela). Isso não elimina o risco de
manutenção (pacote pequeno, poucos mantenedores) — só reduz bastante o
risco técnico de incompatibilidade que era o motivo original para preferir
código próprio.

**Por que continua atendendo à exigência de LGPD (100% no aparelho, sem
rede)**: o `VNRecognizeTextRequest` da Apple **não tem modo de nuvem** —
é sempre local ao aparelho, sem nenhuma configuração que mande dado para
fora (ao contrário do ML Kit do Google, que historicamente tem um modo
on-device e um modo cloud separados). Como este app é **só iOS** (nunca é
publicado para Android), o código Android desses pacotes — que aí sim usa
ML Kit — nunca chega a compilar nem a rodar; é código morto para este
projeto. Ainda assim, antes de integrar de vez, o código Swift instalado
localmente (dentro de `node_modules/expo-text-extractor/ios/`, depois de
rodar `npm install`) será conferido diretamente — grep pelo nome da API —
para confirmar que a chamada real no lado iOS é `VNRecognizeTextRequest`/
`Vision`, e não algum SDK da Google usado também no iOS. Essa conferência
de código-fonte local é mais confiável do que confiar só na descrição do
pacote no npm/GitHub.

**Nota de transparência (histórico)**: a primeira passada desta revisão
(subagente arquiteto) não teve acesso a ferramentas de busca na internet
— não deu pra confirmar ao vivo número de estrelas, data de publicação ou
issues abertas, e por isso chegou a listar `expo-ocr` como alternativa
válida, só pela descrição do repositório. **Essa lacuna foi fechada logo
em seguida**, nesta mesma sessão: consultei diretamente a API pública do
npm (`registry.npmjs.org`) e do GitHub (ver tabela de dados reais acima),
o que confirmou `expo-text-extractor` como ativo de verdade e revelou que
`expo-ocr` nunca foi um pacote instalável (despublicado em 2023, minutos
depois de publicado). A implementação (PLANO.md, Etapa 8) ainda começa
com um **teste real** antes de integrar na tela — instalar o pacote,
rodar `expo prebuild`, compilar de verdade pelo CI já existente e testar
OCR num `.ipa` real no iPhone do Flavio com fotos de caixinhas de verdade
— porque números de npm/GitHub confirmam manutenção, não que o pacote
funciona de fato neste projeto específico. Se `expo-text-extractor` não
compilar, não funcionar, ou o código-fonte não bater com o esperado
(chamar ML Kit em vez de Vision no iOS, por exemplo), a implementação
recua para `@dariyd/react-native-text-recognition` com o mesmo teste e,
por último, para o módulo Swift próprio — plano nunca descartado, só
adiado; o código-fonte de qualquer um dos dois pacotes serve de
referência pronta se for preciso escrever o módulo próprio afinal.

**Por que este é um risco aceitável (diferente do módulo do AlarmKit)**:
o OCR é uma **conveniência**, não uma função crítica do app — se o pacote
escolhido quebrar num upgrade futuro do Expo, o pior caso é o campo "Nome
do remédio" voltar a ficar em branco (o usuário sempre pôde digitar o
nome à mão; é o comportamento de hoje, que nunca deixa de existir). Já o
módulo do AlarmKit é crítico — sem ele, o app perde sua função central de
tocar o alarme — e por isso recebeu tratamento mais cauteloso (fork +
versão pinada, plano de correção por patch). Para o OCR, versão pinada
exata (sem `^`, no mesmo estilo de `react-native-nitro-ios-alarm-kit`) já
é proteção suficiente.

**Alternativas descartadas nesta revisão**:
- *`react-native-vision-camera-ocr-plus`* — motivo na tabela acima.
- *Manter só o módulo Swift próprio, sem tentar nenhum pacote pronto* —
  se os pacotes realmente forem wrappers finos e corretos do Vision (a
  ser confirmado pelo teste real), reescrever do zero é esforço
  redundante sem ganho de segurança ou funcionalidade — mesma tecnologia
  por baixo, só que mais código para o Flavio manter no futuro.
- *`@dariyd/react-native-text-recognition` como primeira escolha* —
  descartado por não ter a mesma garantia estrutural de New Architecture
  da Expo Modules API, mesmo alegando hoje suporte a TurboModule.

**Checagem original (10–11/07/2026, mantida como registro histórico)**:
a primeira checagem, feita mais cedo no mesmo dia, encontrou 1 candidato
plausível (`@dariyd/react-native-text-recognition`, usa Vision de
verdade, ativo, alegava compatibilidade com New Architecture) — mas
mantido por 1 pessoa só, poucas estrelas, pouco testado pela comunidade.
Decisão da época: módulo Swift próprio (auditável por completo, sem
dependência de terceiro tocando dado de saúde, sem carregar suporte a
Android/PDF/multi-idioma que o app não usa). Essa checagem previa
explicitamente uma nova checagem "no momento da implementação" — é
exatamente esta seção.

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

- **248 testes jest** (schedule, validation, storage, alarmSync, medicines-context, sounds, sound-picker, provisioning, app-version, ocr, ocr-heuristics, medicine-form, routing) — rodar com `npm test`
- Ciclo obrigatório por etapa: testador → revisor-seguranca → revisor-codigo → correções → testes de novo (CLAUDE.md)
- Última revisão de segurança: 11/07/2026 (Etapa 8 — OCR do nome do remédio) — aprovada sem
  itens críticos; confirmado por leitura do Swift instalado que o OCR roda 100% local (Vision),
  sem rede e sem logar texto/foto (dado de saúde)
- Última revisão de código: 11/07/2026 (Etapa 8), aprovada sem itens críticos (melhorias
  aplicadas: log silencioso quando o módulo nativo não existe no Expo Go, proteção contra
  desmontagem no `runOcr`, constante única `MAX_NAME_LENGTH` compartilhada)
