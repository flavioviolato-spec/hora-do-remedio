# PROGRESSO — Hora do Remédio

> Atualizado em: 10/07/2026

## Estado atual

**Etapas 1 e 3 concluídas (Etapa 3 adiantada). Etapa 2 (smoke build) bloqueada pela conta GitHub; Etapa 4 (alarmes) depende da 2.**

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

## Próximos passos

1. Flavio testar a Home no iPhone via Expo Go — usar `npx expo start --tunnel` (iPhone fora da rede local; QR/URL: ver DESAFIOS.md item 5)
2. Etapa 2 (maior risco): conta GitHub → repo público → CI → .ipa → AltStore → alarme no silencioso
3. Etapa 3: cadastro real (foto, horários, duração) + storage

## Como retomar em nova sessão

Ler este arquivo + PLANO.md + DESAFIOS.md (se existir). Tarefas também registradas no task list da sessão (Etapas 0–7).
