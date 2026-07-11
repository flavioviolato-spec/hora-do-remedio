# DESAFIOS — aprendizados técnicos que podem se repetir

> Máximo ~20 itens. Remover o que ficar obsoleto.

1. **TypeScript 6 não carrega `@types/jest` automaticamente** neste template (Expo SDK 57). Solução adotada: importar `describe/it/expect` de `@jest/globals` em cada arquivo de teste — não mexer no tsconfig.
2. **PowerShell 5.1 marca saída normal de ferramentas como "NativeCommandError"** quando elas escrevem no stderr (jest faz isso). Não é erro de verdade — conferir o texto (ex.: "27 passed") antes de concluir que falhou.
3. **`expo-router` não exporta o tipo `Theme`** — usar `typeof DefaultTheme`.
4. **Template default do SDK 57 usa pasta `src/`** (src/app, src/components) e cria repositório git sozinho.
5. **iPhone do Flavio não acessa a rede local do PC** → rodar o servidor sempre com `npx expo start --tunnel` (requer devDep `@expo/ngrok`). Em saída não interativa a URL não é impressa; descobrir via API local do ngrok (`http://127.0.0.1:4040/api/tunnels`). A URL é estável entre execuções (`.expo/settings.json` → urlRandomness): `exp://ftvudws-anonymous-8081.exp.direct`.
6. **CLI `npx qrcode` trava no Windows** — gerar QR via biblioteca: `npm i qrcode` em pasta temporária + `node -e "require('qrcode').toFile(...)"`.
7. **Expo Go do iPhone do Flavio suporta SDK 54** (App Store não oferece mais novo para ele). Projeto rebaixado de SDK 57 → 54 em 11/07/2026. Se um dia atualizar o Expo Go, NÃO subir o SDK sem verificar o aparelho antes. No SDK 54: `ThemeProvider/DarkTheme` vêm de `@react-navigation/native` (não de `expo-router`); `useColorScheme` retorna `null`, não `'unspecified'`; typescript ~5.9; jest-expo ~54; @types/jest 29.
8. **Downgrade de SDK**: `npx expo install --fix` acerta as deps principais, mas deixar `react`/`react-dom` desalinhados causa conflito de peer (react-server-dom-webpack). Receita: editar versões no package.json, apagar node_modules + package-lock.json, `npm install` limpo, depois `npx expo install --check`.
9. **Build iOS sem assinatura**: `xcodebuild archive` com `CODE_SIGNING_ALLOWED=NO` NÃO coloca o .app em `Products/Applications` (fica em UninstalledProducts). Usar `xcodebuild build -derivedDataPath build` e pegar o .app de `build/Build/Products/Release-iphoneos/`.
10. **Logs do GitHub Actions sem gh CLI**: token do Git Credential Manager via `printf 'protocol=https\nhost=github.com\n\n' | git credential fill` (no Git Bash; o PowerShell 5.1 corrompe o stdin) → `curl -H "Authorization: Bearer $token"` na API `/actions/runs/<id>/logs`.
11. **GitHub Actions: `gh release create` falha sem `permissions: contents: write`** no workflow (token padrão é só-leitura). Falha do build 3.
12. **xcodebuild -list schemes[0] é armadilha**: ordem alfabética traz Pod (EXConstants) antes do app. O scheme do app = nome do workspace (`basename *.xcworkspace`). Falhas dos builds 1–2.
13. **O Flavio acessa este PC REMOTAMENTE** — o iPhone não pode ser conectado aqui. AltStore/AltServer devem rodar no PC LOCAL dele (Windows com permissão de instalação, confirmado). Instaladores também baixados neste PC remoto (Downloads) por engano — inofensivo.
14. **JSON com acentos via curl -d no Git Bash do Windows quebra** ("Problems parsing JSON") — gravar payload em arquivo UTF-8 sem acentos críticos e usar `-d @arquivo`; scripts multi-linha: gravar .sh e executar (aspas aninhadas em one-liner estouram).
