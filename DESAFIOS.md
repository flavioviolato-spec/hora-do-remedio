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
