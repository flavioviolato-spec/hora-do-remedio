# PROGRESSO — Hora do Remédio

> Atualizado em: 10/07/2026

## Estado atual

**Etapa 0 (fundação) em andamento.**

- [x] Plano aprovado pelo Flavio (ver PLANO.md)
- [x] Ambiente verificado: Node 24.18, npm 11.16, git 2.55 (gh CLI ainda não instalado)
- [x] Scaffold Expo SDK 57 + TypeScript + expo-router (template `default`, estrutura `src/`)
- [x] Projeto renomeado: "Hora do Remédio" / slug `hora-do-remedio` / bundle `br.com.flavioviolato.horadoremedio`
- [x] `npm install` concluído (589 pacotes; 11 vulnerabilidades moderadas em dev-deps — revisar na Etapa 7)
- [ ] Commit inicial
- [ ] Repo GitHub público (PENDENTE: conta GitHub do Flavio)

## Decisões tomadas durante a execução

- Template novo do Expo usa `src/` (src/app, src/components…) — arquitetura do PLANO.md ajustada para esse padrão.
- Nome provisório do app: **"Hora do Remédio"** (mudável até a Etapa 6).

## Próximos passos

1. Commit inicial (Etapa 0 concluída)
2. Etapa 1: limpar telas do template → Home com dados fake + tema visual + AlarmPort/mock + jest
3. Etapa 2 (maior risco): build CI + AltStore + alarme no silencioso — **bloqueada pela conta GitHub**

## Como retomar em nova sessão

Ler este arquivo + PLANO.md + DESAFIOS.md (se existir). Tarefas também registradas no task list da sessão (Etapas 0–7).
