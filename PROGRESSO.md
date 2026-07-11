# PROGRESSO — Hora do Remédio

> Atualizado em: 10/07/2026

## Estado atual

**Etapa 1 (esqueleto) concluída. Etapa 2 (smoke build) é a próxima — bloqueada pela conta GitHub.**

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
- Nome provisório do app: **"Hora do Remédio"** (mudável até a Etapa 6).
- 11 vulnerabilidades moderadas em dev-deps do npm — revisar na Etapa 7.

## Próximos passos

1. Flavio testar a Home no iPhone via Expo Go — usar `npx expo start --tunnel` (iPhone fora da rede local; QR/URL: ver DESAFIOS.md item 5)
2. Etapa 2 (maior risco): conta GitHub → repo público → CI → .ipa → AltStore → alarme no silencioso
3. Etapa 3: cadastro real (foto, horários, duração) + storage

## Como retomar em nova sessão

Ler este arquivo + PLANO.md + DESAFIOS.md (se existir). Tarefas também registradas no task list da sessão (Etapas 0–7).
