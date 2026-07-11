# Hora do Remédio 💊

App de iPhone para lembrar de tomar remédios, feito para uso pessoal do Flavio.

**A promessa central:** o alarme toca no horário do remédio **mesmo com o iPhone no
modo silencioso**, igual ao despertador nativo — via AlarmKit (iOS 26+).
**Confirmado no aparelho real** (11/07/2026): alarme tocou em tela cheia com o
iPhone no silencioso e a tela bloqueada.

## O que o app faz

- Cadastra remédio **fotografando a caixinha** (ou escolhendo foto da galeria) —
  ao fotografar, o app tenta **ler o nome impresso** e preencher sozinho (OCR pela
  câmera do iPhone, 100% offline); é só uma sugestão, sempre editável
- Campo opcional **"Tratamento"** (ex.: Dor, Náusea e vômito, Antibiótico) — aparece na
  Home e no histórico; o app **sugere sozinho** a partir do nome (lista de remédios
  comuns + o que você mesmo já preencheu antes), sempre editável
- **Controle de estoque** opcional: informe quantos comprimidos tem na caixa; cada
  dose marcada desconta 1, e o card avisa quando estiver acabando
- **Relatório para consulta**: botão no histórico gera um resumo do tratamento
  (doses tomadas, % de adesão) pra compartilhar com o médico
- **Backup e restauração**: gera um arquivo com seus dados pra guardar onde quiser
  (Google Drive, iCloud, e-mail) pela janela de compartilhar do iPhone — e restaura
  de volta quando precisar (as fotos não vão no backup, só os dados)
- Vários **horários por dia** e **duração em dias** (ex.: 3× ao dia por 7 dias)
- Escolhe o **som do alarme** entre 5 opções (padrão do iPhone + 4 customizados),
  com prévia antes de escolher
- **Alarme de verdade** por remédio/horário — toca sozinho, sem precisar abrir o
  app; sobrevive a reiniciar o aparelho (é o sistema operacional, não o app)
- Tela inicial com as **doses de hoje** (checklist estilo cartela de comprimidos)
  e os remédios cadastrados com foto, horários e "faltam N dias"
- **Marcar dose como tomada** (com animação), com **histórico** por remédio
  (grade dias × horários)
- Editar, pausar e excluir remédios
- Avisa na tela se a permissão de alarme foi negada, ou se a instalação está
  perto de expirar (ver "Distribuição" abaixo)
- Tela de Ajustes mostra a **versão instalada** (a tag do GitHub usada no build),
  para conferir se uma atualização pelo AltStore realmente foi aplicada
- Tudo salvo **somente no aparelho** — nenhum dado sai do iPhone, sem servidor,
  sem rede, sem analytics

## Estado do projeto

Ver [PROGRESSO.md](PROGRESSO.md) (estado atual e histórico etapa a etapa) e
[PLANO.md](PLANO.md) (plano completo). Aprendizados técnicos ficam em
[DESAFIOS.md](DESAFIOS.md); decisões de arquitetura em [ARQUITETURA.md](ARQUITETURA.md).
Checklist de teste manual no iPhone: [TESTES-NO-IPHONE.md](TESTES-NO-IPHONE.md).

| Etapa | Entrega | Status |
|---|---|---|
| 0–1 | Projeto + Home + tema + testes | ✅ |
| 2 | Build nativo (.ipa) + alarme confirmado no silencioso no aparelho | ✅ |
| 3 | Cadastro real (foto, horários, duração) | ✅ |
| 4 | Alarmes reais por remédio (reconciliador testado) | ✅ |
| 5 | Histórico de doses tomadas | ✅ |
| 6 | Sons customizados + ícone/splash | ✅ |
| 7 | Entrega v1.0 (este README, checklist, banner de validade) | ✅ |
| 8 | OCR (ler nome do remédio na foto) + campo Tratamento + versão em Ajustes | ✅ (código; falta confirmar OCR no aparelho) |
| 9 | Sugestão de Tratamento + estoque de comprimidos + relatório + backup | ✅ (código; falta teste no aparelho) |

## Distribuição (sem conta Apple paga)

Instalado via **sideload** (AltStore) com Apple ID gratuito — sem custo, mas a
assinatura **expira a cada 7 dias**. O app avisa na tela (Home e Ajustes)
quando estiver perto de vencer; basta abrir o AltStore no iPhone e tocar em
"Refresh All" pra renovar. Guia completo de instalação: procure por
`GUIA-INSTALACAO.md` no repositório.

## Para desenvolver (ambiente Windows + iPhone)

```powershell
npm install            # dependências
npm test               # testes automatizados (jest)
npm run typecheck      # checagem de tipos
npx expo start --tunnel  # servidor de desenvolvimento (iPhone via Expo Go)
```

O iPhone abre o app pelo **Expo Go** (QR code do túnel) pra desenvolver a UI ao
vivo — mas o alarme de verdade (AlarmKit) só funciona no **app instalado**
(build gerado pelo GitHub Actions, `.github/workflows/build-ios.yml`, sem
precisar de Mac). Importante: o projeto usa **Expo SDK 54** de propósito — é a
versão que o Expo Go do aparelho suporta. Não subir o SDK sem checar o
aparelho antes (DESAFIOS.md, item 7).

## Privacidade (LGPD)

Nomes de remédios e fotos são dados de saúde do usuário: ficam apenas no
armazenamento interno do app no aparelho, sem servidor, sem rede, sem analytics.
Logs não contêm nome de remédio. Testes usam somente dados fictícios.
