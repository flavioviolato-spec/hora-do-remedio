# PROGRESSO — Hora do Remédio

> Atualizado em: 10/07/2026

## Estado atual

**ETAPA 2 CONCLUÍDA EM 11/07/2026 — MARCO PRINCIPAL: alarme do app TOCOU no iPhone do Flavio em MODO SILENCIOSO com tela bloqueada (confirmado por ele).** App v0.1.2-teste instalado via AltStore no PC local dele (Plano B: Sideload .ipa direto pelo AltServer resolveu o erro "could not find this device"). Pipeline completo validado: código → GitHub → build na nuvem → Release → AltStore → iPhone.

**Próxima etapa: 4 (alarmes reais por remédio — reconciliador alarmSync).** Atenção: o app instalado expira em 7 dias (renovar no AltStore); o banner de aviso interno ainda não foi implementado (Etapa 7).

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

1. Flavio: criar o repositório e me passar o nome de usuário (instruções na conversa)
2. Eu: push + tag → acompanhar build → guia AltStore em português
3. Smoke test no iPhone: alarme de teste no modo silencioso
4. Depois: Etapa 4 (alarmes reais por remédio) + OCR + Etapa 5

## Como retomar em nova sessão

Ler este arquivo + PLANO.md + DESAFIOS.md (se existir). Tarefas também registradas no task list da sessão (Etapas 0–7).
