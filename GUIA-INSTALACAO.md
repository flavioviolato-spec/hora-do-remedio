# Guia de instalação — Hora do Remédio no seu iPhone (via AltStore)

> Caminho gratuito escolhido no plano: o app é re-assinado com seu Apple ID
> gratuito e **precisa ser renovado a cada 7 dias** (Parte 4). Se um dia quiser
> se livrar da renovação, a conta Apple Developer (US$ 99/ano) usa este mesmo
> app sem retrabalho.

## Parte 1 — Preparar o PC (uma vez só)

1. **Instale o iTunes e o iCloud dos instaladores da Apple** — NÃO os da
   Microsoft Store (o AltStore não funciona com eles):
   - Acesse **altstore.io** → seção *Downloads/FAQ*: lá estão os links diretos
     da Apple para "iTunes (Windows 64-bit)" e "iCloud for Windows".
   - Se já tiver as versões da Microsoft Store instaladas, desinstale-as antes
     (Configurações do Windows → Aplicativos).
2. **Baixe o AltServer para Windows** em **altstore.io** (botão Download →
   Windows). Extraia o zip e rode o **AltInstaller/Setup**.
3. Abra o **AltServer** — ele fica como um losango na bandeja do relógio
   (canto inferior direito; clique na setinha ^ se não aparecer).

## Parte 2 — Colocar o AltStore no iPhone (uma vez só)

1. Conecte o **iPhone no PC pelo cabo**. Abra o iTunes e, no iPhone, toque em
   **"Confiar"** quando perguntar (digite a senha do próprio iPhone).
2. Na bandeja do Windows, clique no ícone do **AltServer** → **Install AltStore**
   → escolha o seu iPhone.
3. Ele vai pedir **seu Apple ID e senha** — é o login normal do iPhone; digite
   você mesmo (a senha fica entre você e a Apple; se usar dupla verificação,
   aprove no próprio aparelho).
4. No iPhone, vá em **Ajustes → Geral → VPN e Gerenciamento de Dispositivo** →
   toque no seu Apple ID → **Confiar**.
5. Ative o **Modo Desenvolvedor**: Ajustes → **Privacidade e Segurança** →
   **Modo Desenvolvedor** → ativar → o iPhone reinicia → confirme.

## Parte 3 — Instalar o Hora do Remédio

1. **No Safari do iPhone**, abra:
   `github.com/flavioviolato-spec/hora-do-remedio/releases`
2. Na versão mais recente, toque no arquivo **HoraDoRemedio-unsigned.ipa**
   para baixar.
3. Abra o app **AltStore** no iPhone → aba **My Apps** → toque no **+** no
   canto superior esquerdo → escolha o arquivo baixado (fica em "Downloads").
4. Aguarde 1–2 minutos. O ícone do **Hora do Remédio** aparece na tela de início.
5. Na primeira abertura, o iOS vai pedir permissão de **alarmes** — toque em
   **Permitir** (é o coração do app).

## Parte 4 — Renovação semanal (importante!)

O app expira em 7 dias. **Se expirar, ele não abre e OS ALARMES PARAM.**

Rotina que evita isso:
- Deixe o **AltServer aberto no PC** e o **PC ligado na mesma rede Wi-Fi** do
  iPhone de vez em quando (ex.: uma noite por semana) — o AltStore renova
  sozinho em segundo plano.
- Renovação manual: abra o **AltStore** no iPhone (mesma rede Wi-Fi do PC com
  AltServer aberto) → My Apps → **Refresh All**.
- O próprio app mostra um aviso quando a validade estiver acabando.

## Problemas comuns

| Sintoma | Solução |
|---|---|
| AltServer não acha o iPhone | Cabo conectado? iTunes instalado (versão da Apple)? "Confiar" tocado no iPhone? |
| "Mismatched provisioning profile" | Remova o app antigo e instale de novo pelo AltStore |
| App não abre após 7 dias | Parte 4 — Refresh All no AltStore |
| Alarme não tocou | Ajustes → Hora do Remédio → Alarmes: permitido? App aberto na última semana? |
