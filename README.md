# Hora do Remédio 💊

App de iPhone para lembrar de tomar remédios, feito para uso pessoal do Flavio.

**A promessa central:** o alarme toca no horário do remédio **mesmo com o iPhone no
modo silencioso**, igual ao despertador nativo — via AlarmKit (iOS 26+).

## O que o app faz

- Cadastra remédio **fotografando a caixinha** (ou escolhendo foto da galeria)
- Vários **horários por dia** e **duração em dias** (ex.: 3× ao dia por 7 dias)
- Tela inicial com as **doses de hoje** (checklist estilo cartela de comprimidos)
  e os remédios cadastrados com foto, horários e "faltam N dias"
- **Marcar dose como tomada**, editar, pausar e excluir remédios
- Tudo salvo **somente no aparelho** — nenhum dado sai do iPhone

## Estado do projeto

Ver [PROGRESSO.md](PROGRESSO.md) (estado atual e próximos passos) e
[PLANO.md](PLANO.md) (plano completo das etapas). Aprendizados técnicos ficam em
[DESAFIOS.md](DESAFIOS.md); decisões de arquitetura em [ARQUITETURA.md](ARQUITETURA.md).

| Etapa | Entrega | Status |
|---|---|---|
| 0–1 | Projeto + Home + tema + testes | ✅ |
| 3 | Cadastro real (foto, horários, duração) com revisões | ✅ |
| 2 | Build nativo (.ipa) + alarme no silencioso | ⏳ aguarda conta GitHub |
| 4–7 | Alarmes reais, histórico, sons, entrega v1.0 | pendentes |

## Para desenvolver (ambiente Windows + iPhone)

```powershell
npm install            # dependências
npm test               # testes automatizados (jest)
npm run typecheck      # checagem de tipos
npx expo start --tunnel  # servidor de desenvolvimento (iPhone via Expo Go)
```

O iPhone abre o app pelo **Expo Go** (QR code do túnel). Importante: o projeto usa
**Expo SDK 54** de propósito — é a versão que o Expo Go do aparelho suporta.
Não subir o SDK sem checar o aparelho (DESAFIOS.md, itens 7–8).

## Privacidade (LGPD)

Nomes de remédios e fotos são dados de saúde do usuário: ficam apenas no
armazenamento interno do app no aparelho, sem servidor, sem rede, sem analytics.
Logs não contêm nome de remédio. Testes usam somente dados fictícios.
