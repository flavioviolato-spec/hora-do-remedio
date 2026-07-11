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
| 8 | OCR lê o nome do remédio na foto da caixinha e sugere no campo "Nome" | ✅ código; falta confirmar no aparelho (Passo 0/item 5) |

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

## Etapa 8 — OCR do nome do remédio (plano de implementação, 11/07/2026)

> Decisão de arquitetura completa (candidatos avaliados com dados reais de
> npm/GitHub, prós/contras, motivo): ver `ARQUITETURA.md`, seção "OCR do
> nome do remédio pela foto da caixinha". Resumo: pacote pronto
> `expo-text-extractor` (confirmado ativo — push há ~2,5 semanas, 70
> estrelas), plano B `@dariyd/react-native-text-recognition`, plano C
> módulo Swift próprio — gatilhado por foto, preenche o campo "Nome do
> remédio" só como sugestão — nunca trava o campo.

### Objetivo desta etapa

Depois que o usuário tira/escolhe a foto da caixinha em
`src/components/medicine-form.tsx`, o app tenta ler o nome impresso na
embalagem e **sugere** preencher o campo "Nome do remédio" sozinho — sem
nunca impedir o usuário de editar, apagar ou digitar por conta própria (o
comportamento de hoje continua existindo integralmente).

### Passo 0 — teste real do pacote (obrigatório antes de integrar)

`expo-text-extractor` já foi confirmado ativo com dados reais de
npm/GitHub (ver ARQUITETURA.md) — mas isso confirma manutenção do
pacote, não que ele funciona de fato neste projeto. Por isso a primeira
coisa a fazer, antes de escrever qualquer UI, continua sendo um teste
real, não só ler documentação:

1. `npm install expo-text-extractor@<versão exata, sem ^>` — checar se
   instala sem erro e sem exigir nenhum script de pós-instalação que este
   ambiente bloqueia (ver DESAFIOS.md item 16; pacotes Expo Modules API
   normalmente só trazem código-fonte Swift/Kotlin, sem binário baixado
   no `npm install`, mas confirmar mesmo assim).
2. Ler o código-fonte instalado em `node_modules/expo-text-extractor/ios/`
   e confirmar, com `grep`, que a chamada real é `VNRecognizeTextRequest`/
   `Vision` — não um SDK da Google também no lado iOS. Conferir a licença
   (arquivo `LICENSE` do pacote).
3. Conferir se o pacote precisa de alguma entrada no `app.json` (`plugins`)
   ou se autolinka sozinho (like `expo-image`/`expo-file-system` já
   instalados) — a maioria dos pacotes Expo Modules API não precisa de
   nada no `app.json` a menos que peçam uma permissão nova (este pacote
   não deveria pedir, já que só processa uma foto que o app já tem).
4. ~~`npx expo prebuild --platform ios --no-install` local~~ — **não
   funciona neste ambiente** (Windows): falha sempre com "At least one
   platform must be enabled when syncing", a geração do projeto iOS exige
   macOS/Linux (ver DESAFIOS.md item 17, achado ao tentar este passo).
   Autolink só dá pra confirmar via CI de verdade — passo 5.
5. Build real via o workflow do CI já existente
   (`.github/workflows/build-ios.yml`, `workflow_dispatch` numa branch de
   teste) → `.ipa` instalado no iPhone do Flavio via AltStore → testar
   OCR de verdade com fotos de caixinhas reais dele (não há restrição de
   dado fictício aqui: é o app pessoal dele, as fotos são da vida real
   dele mesmo, não dado de terceiro).
6. **Se falhar em qualquer passo** (não instala, não compila, código não
   bate com o esperado, ou o teste no aparelho não funciona bem): repetir
   os passos 1–5 com `@dariyd/react-native-text-recognition`. **Se os
   dois falharem**: seguir para o módulo Swift próprio (usar o código de
   um dos dois pacotes como referência de implementação).

### Arquivos novos

- `src/lib/ocr.ts` — único ponto de acesso ao motor de OCR. Expõe uma
  função `recognizeText(photoUri: string): Promise<string[]>` que:
  - Tenta `require` o pacote nativo dentro de um `try/catch` (mesmo padrão
    já usado em `src/lib/alarm/native.ts` para o AlarmKit — no Expo Go e
    nos testes jest, o módulo nativo não existe, então o `require` lança e
    a função cai num caminho seguro).
  - **Nunca rejeita/lança** para quem chama: qualquer falha (módulo
    ausente, foto ilegível, erro do Vision) vira um array vazio `[]`. OCR
    é um extra — uma falha aqui não pode nunca impedir o cadastro do
    remédio nem gerar um alerta assustador para o Flavio.
  - Não loga o texto reconhecido (dado de saúde) em caso de erro — só uma
    mensagem genérica (mesmo padrão já usado em `handleSubmit` no
    `medicine-form.tsx` atual).
- `src/lib/ocr-heuristics.ts` — função pura e testável
  `pickBestNameCandidate(lines: string[]): string | null`, que escolhe a
  linha mais provável de ser o nome do remédio entre as linhas de texto
  reconhecidas (ver heurística abaixo). Fica separada de `ocr.ts` de
  propósito — mesma separação que o projeto já usa entre `schedule.ts`
  (puro, testado) e `alarmSync.ts`/`alarm/*` (efeitos colaterais).
- `src/lib/ocr-heuristics.test.ts` — testes jest da função pura (não
  precisa de dispositivo real nem do pacote nativo instalado).

### Heurística de escolha do candidato (`pickBestNameCandidate`)

Os pacotes candidatos devolvem uma lista simples de linhas de texto (sem
posição/tamanho de fonte, na maioria dos casos) — a heurística trabalha só
com isso:

1. Descarta linhas vazias, só números, ou que batem com padrões de
   dosagem/validade/lote (ex.: `\d+\s*(mg|ml|mcg|g)\b`, `\d{1,2}/\d{1,2}/\d{2,4}`,
   `\blote\b`, `\bval\.?\b`, `\bcomprimidos?\b`, `\bcápsulas?\b` isoladas).
2. Descarta linhas muito curtas (< 3 caracteres) — raramente é o nome.
3. Entre o que sobra, prefere a primeira linha da lista (o Vision costuma
   devolver as linhas em ordem de leitura, de cima para baixo — o nome do
   remédio costuma ser o texto maior/mais no topo da embalagem).
4. Corta em 80 caracteres (mesmo limite de `validateMedicine`).
5. Se nada sobrar, devolve `null` — o campo simplesmente não é preenchido.

**Limite conhecido, aceito de propósito**: a heurística pode escolher um
texto decorativo da marca em vez do nome real quando os dois têm tamanho
parecido na embalagem (ex.: um slogan da fabricante) — não há como
resolver isso com certeza só com uma lista de strings, sem posição/tamanho
de fonte. Mitigação: o campo nunca fica travado, o usuário sempre vê e
pode corrigir antes de salvar (ver validação abaixo).

### Como a foto chega ao OCR e preenche o campo (`medicine-form.tsx`)

1. Logo depois de `setPhotoUri(result.assets[0].uri)`, tanto em
   `captureFromCamera` quanto em `pickFromLibrary`, disparar (sem
   `await` bloqueando o resto da tela) uma chamada a
   `recognizeText(uri)` seguida de `pickBestNameCandidate`.
2. **Proteção contra corrida** (o Flavio troca de foto rapidamente antes
   da primeira leitura terminar): guardar um contador/ID de pedido: só
   aplica o resultado se ele ainda corresponder à foto mais recente no
   momento em que a leitura termina. Mesmo cuidado que o projeto já
   aplicou no reconciliador de alarmes e na fila de gravação de doses —
   "resposta antiga não pode vencer a mais nova".
3. **Preenche automaticamente só se o campo "Nome do remédio" estiver
   vazio** no momento em que o resultado chega. Se o usuário já digitou
   algo (nome próprio ou de uma tentativa anterior), o OCR não sobrescreve
   — evita apagar o que a pessoa já escreveu.
4. Enquanto processa, mostrar um texto pequeno e discreto perto do campo
   (ex.: "Lendo o nome da caixinha…") — sem travar o resto do formulário,
   sem `Alert`. Se não achar nada, não mostra erro nenhum (silencioso —
   diferente das falhas de câmera/galeria, que continuam usando `Alert`
   porque ali a ação explícita do usuário falhou).
5. O campo continua sendo o `TextInput` normal de hoje — 100% editável,
   sem nenhum bloqueio, exatamente como o resto do formulário. A validação
   (`validateMedicine`) não muda: nome vazio continua sendo bloqueado no
   envio, então um OCR que não achou nada não piora nada — o usuário só
   precisa digitar, como já precisa hoje.

### `app.json` / CI

- Nenhuma nova permissão iOS esperada (o app já declara
  `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription`; o OCR só lê
  um arquivo de imagem que o app já tem acesso).
- Se o pacote escolhido não exigir um config plugin (esperado, a
  confirmar no Passo 0), **nenhuma mudança em `app.json`**.
- **Nenhuma mudança esperada em `.github/workflows/build-ios.yml`**: o
  workflow já roda `npx expo prebuild --platform ios --no-install` seguido
  de `pod install` — o autolink do novo módulo nativo entra automaticamente
  nesse fluxo, do mesmo jeito que `expo-audio`/`datetimepicker` já entram
  hoje.
- Se o caminho final for o módulo Swift próprio (Plano C): criar em
  `modules/text-recognizer/` (Expo autolinka módulos locais dentro de
  `modules/` automaticamente) — mesma técnica já prevista como plano B do
  AlarmKit; também sem mudança de CI.

### Casos-limite a testar

**Na função pura (`ocr-heuristics.test.ts`, jest)**:
- Lista vazia → `null`.
- Só linhas de dosagem/validade/lote → `null`.
- Linha única simples → essa linha.
- Várias linhas candidatas (nome + dosagem + laboratório + validade em
  formato `dd/mm/aaaa`) → escolhe a linha certa, descarta as outras.
- Nome com acento/ç (ex.: "Ibuprofeno", "Não sei ler isso") → preservado
  sem mangling de codificação.
- Texto reconhecido colado/sem espaço (embalagem com fonte comprimida) →
  ainda assim cortado em 80 caracteres, sem travar.
- Linha maior que 80 caracteres → truncada.

**No app real (manual, iPhone, depois do Passo 0)**:
- Foto borrada/fora de foco → nenhuma sugestão, sem erro visível.
- Caixinha sem texto legível (embalagem lisa, só código de barras) →
  mesma coisa.
- Nome cortado na foto (fora do enquadramento) → sugestão parcial aceita
  (usuário completa à mão) — não é tratado como bug.
- Iluminação ruim / reflexo no plástico → mesma tolerância a resultado
  vazio ou ruim; sem tentativa de "validar se é uma palavra real" (fora de
  escopo para a v1).
- Texto decorativo/itálico da marca vs. nome real em caixa alta → risco
  documentado na heurística acima; usuário corrige à mão.
- Duas fotos trocadas rapidamente antes da primeira leitura terminar →
  resultado da primeira não pode preencher o campo depois que a segunda
  foto já está em tela (proteção de corrida, ver acima).
- App aberto no Expo Go (sem o módulo nativo) → nenhuma sugestão, nenhum
  erro, nenhuma trava — mesmo comportamento hoje sem OCR.

### Riscos

1. Pacote escolhido no Passo 0 se revelar mal mantido mais adiante (ex.:
   parar de funcionar num upgrade futuro de Expo SDK) → risco aceito
   (ver ARQUITETURA.md): pior caso é o campo voltar a não se preencher
   sozinho — o cadastro manual sempre continua funcionando. Mitigação:
   versão pinada exata (sem `^`).
2. Heurística escolhe a linha errada (texto decorativo em vez do nome) →
   mitigado só pela edição manual (não há solução algorítmica confiável
   sem posição/tamanho de fonte, que os pacotes candidatos não expõem).
3. Ambiente de desenvolvimento bloqueia scripts de pós-instalação de
   pacotes nativos (DESAFIOS.md item 16) → checar já no Passo 0; pacotes
   Expo Modules API normalmente não precisam disso (só trazem
   código-fonte, compilado no CI, não binário baixado localmente).
