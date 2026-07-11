# PROGRESSO — Hora do Remédio

> Atualizado em: 11/07/2026

## Estado atual

**ETAPA 8 CONCLUÍDA EM 11/07/2026 — OCR (ler nome do remédio na foto) + correção de bug de navegação.** Ao fotografar a caixinha, o app tenta ler o nome impresso (Vision da Apple, 100% offline) e sugere no campo "Nome do remédio" — sempre como sugestão editável, nunca trava o campo, nunca sobrescreve o que o usuário digitou. Pacote `expo-text-extractor@2.0.0` (verificado com dados reais de npm/GitHub e código-fonte: usa `VNRecognizeTextRequest`/Vision de verdade, MIT, sem rede). Também corrigido um bug que o Flavio encontrou: tocar no card de um remédio abria "Unmatched Route" em vez do histórico (rota de índice em pasta dinâmica `medicine/[id]/index.tsx` navegava com "/index" no caminho, que o Expo Router remove em runtime). Ciclo completo (testador com mutation testing + revisor-seguranca + revisor-codigo), todos aprovados; achados do revisor de código aplicados (log silencioso no Expo Go, proteção de desmontagem, constante `MAX_NAME_LENGTH` única). **248/248 testes.**

**Próxima: sugestão automática do campo "Tratamento" pelo nome do remédio** (lista curada de remédios comuns + aprender do histórico do próprio usuário) — decidido com o Flavio; entra DEPOIS de o OCR ser confirmado funcionando no iPhone dele. Este é o único item novo na fila; o roadmap original está completo.

### Etapa 8 — OCR do nome do remédio (11/07/2026)
- [x] `src/lib/ocr.ts`: `recognizeText(photoUri)` — require protegido de `expo-text-extractor`, nunca lança (tudo vira `[]`), silencioso no Expo Go, nunca loga texto/foto (dado de saúde)
- [x] `src/lib/ocr-heuristics.ts`: `pickBestNameCandidate(lines)` — função pura, escolhe a linha mais provável de ser o nome (descarta dosagem/validade/lote, corta em `MAX_NAME_LENGTH`)
- [x] `src/components/medicine-form.tsx`: dispara OCR após a foto; proteção contra corrida (`ocrRequestIdRef`) + desmontagem (`mountedRef`); só preenche se o campo estiver vazio; indicador "Lendo o nome da caixinha…"
- [x] **Bug de navegação corrigido** (`src/app/index.tsx`): card do remédio abria "Unmatched Route"; causa confirmada no código-fonte do expo-router (`getReactNavigationConfig`: segmento `index` vira ''); teste de regressão para toda a classe de bug em `routing.qa-review.test.ts`
- [x] `expo-text-extractor@2.0.0` pinado exato; verificado por leitura do Swift instalado que usa Vision (não ML Kit) e não faz rede
- [x] Ciclo completo: **testador** (mutation testing nas 3 proteções do OCR + teste real de rota via funções internas do expo-router), **revisor-seguranca** (aprovado — OCR 100% local, sem log de dado sensível), **revisor-codigo** (aprovado; 3 melhorias aplicadas)
- [x] Verificação final: `tsc` ok, **248/248 testes**, `expo export` sem erros
- [ ] PENDENTE (só no aparelho): confirmar que o OCR lê nomes de caixinhas reais bem — Passo 0/item 5 do PLANO.md, só possível após build+AltStore

### Etapa 7 — concluída (11/07/2026) — entrega v1.0
- [x] `src/lib/provisioning.ts`: lê `embedded.mobileprovision` (Base64 + decodificador manual próprio) e extrai a data de validade da assinatura AltStore
- [x] **Defeito crítico corrigido**: leitura original em UTF-8 lançava erro em arquivo binário real — banner nunca apareceria no aparelho; corrigido antes de qualquer build
- [x] Banner "Expira em N dias" / "Expira amanhã" / "Instalação expirada" na Home; caixa de status com data completa em Ajustes
- [x] `src/components/warning-banner.tsx` (novo): componente único para os dois avisos da Home (alarmes desligados / instalação expirando), eliminando duplicação
- [x] `README.md` reescrito, `TESTES-NO-IPHONE.md` novo (checklist manual, 9 seções)
- [x] Campo **"Tratamento"** (opcional): `src/lib/types.ts`, `validation.ts`, `storage.ts`, `medicines-context.tsx`, `medicine-form.tsx` (chips de sugestão + texto livre), exibido em `medicine-card.tsx` e no histórico
- [x] **Versão instalada em Ajustes**: `src/lib/app-version.ts` (função pura, testável) + `EXPO_PUBLIC_APP_VERSION` definida pelo CI só em builds de tag (`build-ios.yml`)
- [x] Ciclo completo (3 itens, cada um com testador + revisor-seguranca + revisor-codigo): todos **aprovados**, achados baixos/recomendados aplicados (nome fictício em teste, `trim()` alinhado entre `validation.ts`/`storage.ts`, tipagem `SFSymbol`, workflow só preenche versão em build de tag)
- [x] Verificação final: `tsc` ok, **225/225 testes**

### Etapa 6 — concluída (11/07/2026)
- [x] `src/lib/sounds.ts`: catálogo `ALARM_SOUNDS` (5 opções) + `soundFileNameFor`/`normalizeSoundId`
- [x] `assets/sounds/*.wav`: 4 sons CC0 (Kenney.nl, licença documentada) convertidos localmente com ffmpeg (instalado via winget nesta sessão)
- [x] `plugins/withAlarmSounds.js`: config plugin que embute os sons no bundle iOS via `expo prebuild` (sem Mac, sem passo manual)
- [x] `src/components/sound-picker.tsx`: seletor com prévia (`expo-audio`, instalado com permissão de microfone desativada — o app não grava)
- [x] `src/components/medicine-form.tsx`: seção "Som do alarme" real
- [x] Ícone iOS (`assets/expo.icon`) e splash (`assets/images/splash-icon.png`) com a identidade visual do app (verde-garrafa + cruz branca), gerados programaticamente (pngjs) — Flavio optou por algo simples agora
- [x] Ciclo completo: **testador** (aprovado, 1 melhoria de UX aplicada), **revisor-seguranca** (1 item real corrigido: permissão de microfone desnecessária), **revisor-codigo** (aprovado, 2 melhorias aplicadas)
- [x] Verificação final: `tsc` ok, **166/166 testes**, `expo export` sem erros

### Etapa 5 — concluída (11/07/2026)
- [x] `src/lib/medicines-context.tsx`: `doseLog`/`toggleDose(medicineId, dateISO, time)` — marcar dose persiste de verdade
- [x] Fila de gravação (`enqueue`/`writeQueueRef`) corrige condição de corrida real achada em QA (2 toques rápidos perdiam/grudavam marcação)
- [x] `src/lib/schedule.ts`: `buildHistoryGrid` — grade dias×horários, do início do tratamento até hoje
- [x] `src/app/medicine/[id]/index.tsx`: tela nova de histórico (foto, resumo, grade); card da Home agora separa "ver histórico" (toque) de "editar" (lápis)
- [x] Celebração ao marcar dose tomada: anel + confetes, só Reanimated (decisão: sem Lottie, ver ARQUITETURA.md)
- [x] Ciclo completo: **testador** (3 rodadas, 1 defeito real corrigido — condição de corrida), **revisor-seguranca** (aprovado sem críticos), **revisor-codigo** (aprovado, 2 melhorias baratas aplicadas)
- [x] Verificação final: `tsc` ok, **144/144 testes**

### Etapa 4 — concluída (11/07/2026)
- [x] `src/lib/alarmSync.ts`: `reconcileAlarms(port, medicines, now?)` — alarme diário por (remédio ativo hoje, horário) + alarme de data fixa para 1ª dose de remédio futuro
- [x] Proteção "iminente": não cancela/reagenda alarme a menos de 2 min de tocar (trata virada de meia-noite corretamente)
- [x] Serializado por `AlarmPort` (fila interna, `WeakMap`) — nunca duas reconciliações ao mesmo tempo; decisão de arquitetura validada pelo subagente arquiteto (ver ARQUITETURA.md)
- [x] `src/lib/alarm-sync-context.tsx`: liga o reconciliador ao app (início, todo CRUD via `medicines-context`, retorno ao primeiro plano via `AppState`)
- [x] Home: banner "Alarmes desligados" quando permissão negada ou agendamento falhou, com atalho para Ajustes
- [x] `src/lib/schedule.ts`: nova função pura `computeFutureFirstDoses`
- [x] Ciclo completo: **testador** (3 rodadas, 5 defeitos reais corrigidos, 112 testes), **revisor-seguranca** (aprovado; reforço de log aplicado), **revisor-codigo** (1 crítico corrigido: erro inesperado não avisava a UI; 2 desatualizações em ARQUITETURA.md corrigidas)
- [x] Verificação final: `tsc` ok, **112/112 testes**

### Etapa 3 — concluída (11/07/2026)
- [x] Cadastro real: foto da caixinha (câmera/galeria, redimensionada 800px), nome, horários múltiplos (seletor giratório), duração (presets + ajuste), início hoje/amanhã
- [x] Persistência JSON versionada + sanitização (src/lib/storage.ts) — dado corrompido nunca derruba o app
- [x] Editar / pausar (switch) / excluir (com confirmação e limpeza de foto e histórico)
- [x] Ciclo completo de revisão: **testador** (82→83 testes; achou 2 defeitos de validação — CORRIGIDOS: horários 24:00/23:60 e datas 30/02 agora rejeitados nas duas camadas), **revisor-seguranca** (aprovado sem críticos; itens médio/baixos aplicados: logs sem nome de remédio, .gitignore .env, ID validado como padrão seguro), **revisor-codigo** (2 críticos de consistência CORRIGIDOS: gravar-antes-de-mostrar no commit, storeRef sem corrida, foto apagada só após gravação, remédio não duplica se a foto falhar)
- [x] Verificação final: `tsc` ok, **83/83 testes**, app rodando no iPhone do Flavio via Expo Go (túnel)
- Pendências conhecidas (opcionais, anotadas pelo revisor): botão "remover foto", limpeza de fotos órfãs, unificar ciclo da foto no contexto, limpar variantes não usadas do themed-text

### Etapa 0 — concluída
- [x] Plano aprovado pelo Flavio (ver PLANO.md)
- [x] Ambiente: Node 24.18, npm 11.16, git 2.55 (gh CLI ainda não instalado)
- [x] Scaffold Expo SDK 57 + TypeScript + expo-router (template `default`, estrutura `src/`)
- [x] Renomeado: "Hora do Remédio" / slug `hora-do-remedio` / bundle `br.com.flavioviolato.horadoremedio`
- [x] Subagentes movidos para `.claude/agents/`; commit inicial no branch `main`
- [ ] Repo GitHub público (PENDENTE: conta GitHub do Flavio)

### Etapa 1 — concluída
- [x] Tema "farmácia de bairro": verde-garrafa + papel-creme + âmbar; horários em SF Rounded (src/constants/theme.ts)
- [x] Tipos de domínio (src/lib/types.ts) e funções puras de calendário (src/lib/schedule.ts)
- [x] AlarmPort com adapter mock (src/lib/alarm/) — o real entra na Etapa 2
- [x] Home: checklist de doses de hoje ("bolha de cartela" com animação de mola) + cards de remédios com dados FICTÍCIOS + FAB
- [x] Tela provisória de cadastro (src/app/medicine/new.tsx)
- [x] Template limpo (telas/ícones de demonstração do Expo removidos)
- [x] **27 testes jest passando** (schedule, doseStatus, computeDesiredAlarms, acentuação/ç)
- [x] `npx tsc --noEmit` sem erros; `expo export --platform ios` gera bundle ok

## Decisões tomadas durante a execução

- Template novo do Expo usa `src/` — arquitetura do PLANO.md ajustada.
- **Projeto rebaixado para Expo SDK 54** (11/07/2026): o Expo Go do iPhone do Flavio só suporta SDK 54 e a App Store não oferece versão mais nova para ele. iOS do aparelho confirmado 26+ (AlarmKit ok). Detalhes em DESAFIOS.md itens 7–8.
- Nome provisório do app: **"Hora do Remédio"** (mudável até a Etapa 6).
- 11 vulnerabilidades moderadas em dev-deps do npm — revisar na Etapa 7.

### Etapa 2 — em andamento (11/07/2026)
- [x] Flavio CONFIRMOU ter conta GitHub → etapa destravada
- [x] Módulo AlarmKit instalado e pinado: react-native-nitro-ios-alarm-kit@1.0.41 + react-native-nitro-modules (fork na conta do Flavio ainda pendente)
- [x] Adapter nativo (src/lib/alarm/native.ts): require protegido — Expo Go continua no mock; botões "Tomei"/"Adiar" (10 min), tint verde da marca
- [x] Tela Ajustes (src/app/settings.tsx) com "Testar alarme em 1 minuto" — o smoke test do silencioso; engrenagem na Home
- [x] app.json: deploymentTarget 26.0 (expo-build-properties), NSAlarmKitUsageDescription, newArchEnabled
- [x] .github/workflows/build-ios.yml: runner macos-26, prebuild → pod install → xcodebuild sem assinatura → .ipa artefato + Release em tags v*
- [x] Verificação: tsc ok, 83/83 testes, expo export ok (Expo Go não quebra)
- [x] Repo público criado: github.com/flavioviolato-spec/hora-do-remedio (push + tags ok)
- [x] Builds 1–2 falharam (scheme errado: schemes[0]=EXConstants; archive sem assinatura não gera Products/Applications) — corrigidos; build 3 COMPILOU o app
- [x] **.ipa v0.1.2-teste PUBLICADO**: github.com/flavioviolato-spec/hora-do-remedio/releases (12,9 MB; publiquei manualmente via API — o passo automático falhava por falta de `permissions: contents: write`, já corrigido para os próximos)
- [x] DESCOBERTA IMPORTANTE: Flavio acessa este PC remotamente → AltStore deve ser instalado no PC LOCAL dele (Windows, permite instalação). iTunes/iCloud/AltServer instalados neste PC remoto ficam de reserva.
- [ ] DECISÃO PENDENTE do Flavio: seguir gratuito (AltStore no PC local) × migrar p/ TestFlight (US$99/ano). Recomendação dada: gratuito agora, migrar se renovação semanal incomodar.
- [ ] Flavio: Partes 1–3 do GUIA-INSTALACAO.md no PC local → instalar .ipa no iPhone
- [ ] SMOKE TEST FINAL: Ajustes → "Testar alarme em 1 minuto" TOCANDO no silencioso
- Novo pedido do Flavio (11/07): OCR do nome do remédio na foto — tarefa registrada, entra após a Etapa 2 (precisa de build nativo)

## Próximos passos

1. **v0.2.0-teste PUBLICADO** (11/07/2026): github.com/flavioviolato-spec/hora-do-remedio/releases/tag/v0.2.0-teste — Release automático funcionou de primeira (correção de permissões do CI confirmada definitiva). Flavio: atualizar via AltStore (Refresh) e testar alarmes reais dos remédios cadastrados.
2. Depois: Etapa 5 (doses tomadas — histórico + celebração) + OCR + Etapa 6

## Como retomar em nova sessão

Ler este arquivo + PLANO.md + DESAFIOS.md (se existir). Tarefas também registradas no task list da sessão (Etapas 0–7).
