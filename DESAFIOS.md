# DESAFIOS — aprendizados técnicos que podem se repetir

> Máximo ~20 itens. Remover o que ficar obsoleto.

1. **TypeScript 6 não carrega `@types/jest` automaticamente** neste template (Expo SDK 57). Solução adotada: importar `describe/it/expect` de `@jest/globals` em cada arquivo de teste — não mexer no tsconfig.
2. **PowerShell 5.1 marca saída normal de ferramentas como "NativeCommandError"** quando elas escrevem no stderr (jest faz isso). Não é erro de verdade — conferir o texto (ex.: "27 passed") antes de concluir que falhou.
3. **`expo-router` não exporta o tipo `Theme`** — usar `typeof DefaultTheme`.
4. **Template default do SDK 57 usa pasta `src/`** (src/app, src/components) e cria repositório git sozinho.
5. **iPhone do Flavio não acessa a rede local do PC** → rodar o servidor sempre com `npx expo start --tunnel` (requer devDep `@expo/ngrok`). Em saída não interativa a URL não é impressa; descobrir via API local do ngrok (`http://127.0.0.1:4040/api/tunnels`). A URL é estável entre execuções (`.expo/settings.json` → urlRandomness): `exp://ftvudws-anonymous-8081.exp.direct`.
6. **CLI `npx qrcode` trava no Windows** — gerar QR via biblioteca: `npm i qrcode` em pasta temporária + `node -e "require('qrcode').toFile(...)"`.
