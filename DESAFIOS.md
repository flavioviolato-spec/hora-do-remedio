# DESAFIOS — aprendizados técnicos que podem se repetir

> Máximo ~20 itens. Remover o que ficar obsoleto.

1. **TypeScript 6 não carrega `@types/jest` automaticamente** neste template (Expo SDK 57). Solução adotada: importar `describe/it/expect` de `@jest/globals` em cada arquivo de teste — não mexer no tsconfig.
2. **PowerShell 5.1 marca saída normal de ferramentas como "NativeCommandError"** quando elas escrevem no stderr (jest faz isso). Não é erro de verdade — conferir o texto (ex.: "27 passed") antes de concluir que falhou.
3. **`expo-router` não exporta o tipo `Theme`** — usar `typeof DefaultTheme`.
4. **Template default do SDK 57 usa pasta `src/`** (src/app, src/components) e cria repositório git sozinho.
