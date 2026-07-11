/**
 * QA — regressão do bug real "Unmatched Route" ao tocar no card de remédio
 * na Home (relatado pelo Flavio na v0.5.0-teste).
 *
 * Causa raiz: `src/app/index.tsx` chamava
 *   router.push({ pathname: '/medicine/[id]/index', params: { id } })
 * O TypeScript aceitava esse literal porque o gerador de tipos do
 * expo-router cria um tipo para o arquivo "medicine/[id]/index.tsx", mas
 * o Expo Router NUNCA registra "/medicine/[id]/index" como caminho de URL
 * navegável: o segmento final "index" de uma rota dentro de uma pasta com
 * parâmetro dinâmico é sempre removido antes de virar rota do React
 * Navigation. Ver expo-router/build/getReactNavigationConfig.js,
 * função convertDynamicRouteToReactNavigation: segmento === 'index' -> ''.
 * Resultado real do bug: tela "Unmatched Route".
 *
 * Este teste NÃO reimplementa essa lógica por conta própria (isso só
 * provaria que nosso código concorda com nossas próprias suposições). Em
 * vez disso, ele:
 *   1. Varre de verdade os arquivos de `src/app` (o mesmo diretório que o
 *      Metro varre em produção) e monta um "contexto" no formato que o
 *      expo-router espera de um require.context do Metro.
 *   2. Chama as funções internas REAIS do expo-router já instalado
 *      (getRoutes + getReactNavigationConfig) para construir a tabela de
 *      rotas de navegação de verdade — a mesma tabela que o app usa em
 *      tempo de execução para casar uma URL com uma tela.
 *   3. Extrai, também dos arquivos-fonte reais, os alvos usados em
 *      router.push/router.replace.
 *   4. Confere que cada alvo usado no código corresponde a uma rota que
 *      de fato existe na tabela construída no passo 2.
 *
 * Não precisa de nenhuma dependência nova (nada de @testing-library/react-
 * native) nem renderiza componentes — por isso é um teste "barato" mesmo
 * não havendo hoje um padrão de teste de navegação no projeto.
 *
 * Se algum dia alguém recriar esse mesmo padrão de bug (pastas
 * `[param]/index.tsx` navegadas com o caminho errado terminando em
 * "/index", ou qualquer rota apontando para um caminho inexistente), este
 * teste falha.
 */

import fs from 'fs';
import path from 'path';

// Import via require porque expo-router só expõe esses módulos internos
// pelo caminho de build, não pelo entrypoint público — são detalhes de
// implementação, mas são os MESMOS usados pelo runtime do app (mesma
// versão instalada em node_modules), não uma cópia nossa.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getRoutes } = require('expo-router/build/getRoutesCore');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');

const APP_DIR = path.join(__dirname, '..', '..', 'app');

/** Extensões de arquivo que o Metro trataria como possível rota. */
const ROUTE_FILE_RE = /\.(tsx|ts|jsx|js)$/;

/** Varre recursivamente `dir` e devolve as chaves no formato de um Metro require.context. */
function buildFakeContextKeys(dir: string, base = ''): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const keys: string[] = [];
  for (const entry of entries) {
    // Nunca deveria haver __tests__ dentro de src/app hoje, mas se um dia
    // houver, isso não deve virar "rota" — mesma exclusão que o Metro faz
    // via testMatch/roots do jest, só que aqui é defensivo.
    if (entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      keys.push(...buildFakeContextKeys(fullPath, relPath));
    } else if (ROUTE_FILE_RE.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      keys.push(`./${relPath.split(path.sep).join('/')}`);
    }
  }
  return keys;
}

function buildRealRouteTable(): Record<string, unknown> {
  const keys = buildFakeContextKeys(APP_DIR);
  expect(keys.length).toBeGreaterThan(0); // Garantia de que a varredura achou algo — se der 0, o teste está quebrado, não o app.

  const files: Record<string, object> = Object.fromEntries(keys.map((key) => [key, {}]));
  function contextModule(key: string) {
    return files[key];
  }
  contextModule.keys = () => keys;

  const tree = getRoutes(contextModule, { skipGenerated: true, ignoreEntryPoints: true });
  expect(tree).not.toBeNull();

  const config = getReactNavigationConfig(tree, /* metaOnly */ true);
  return config.screens as Record<string, unknown>;
}

/** Junta dois trechos de caminho ignorando pedaços vazios. */
function joinPath(a: string, b: string): string {
  return [a, b].filter((part) => part !== undefined && part !== '').join('/');
}

/**
 * "Achata" a árvore de screens do React Navigation em uma lista de
 * caminhos completos navegáveis, com segmentos dinâmicos normalizados
 * para ":param" (não precisamos do nome do parâmetro para este teste).
 */
function flattenScreensToPaths(
  screens: Record<string, unknown>,
  parentPath = '',
): string[] {
  const results: string[] = [];
  for (const value of Object.values(screens)) {
    if (typeof value === 'string') {
      results.push(joinPath(parentPath, value));
    } else if (value && typeof value === 'object') {
      const node = value as { path: string; screens?: Record<string, unknown> };
      const combined = joinPath(parentPath, node.path);
      if (node.screens && Object.keys(node.screens).length > 0) {
        results.push(...flattenScreensToPaths(node.screens, combined));
      } else {
        results.push(combined);
      }
    }
  }
  return results;
}

function normalizeDynamicSegments(fullPath: string): string {
  return fullPath
    .split('/')
    .map((segment) => (segment.startsWith(':') ? ':param' : segment))
    .join('/');
}

/**
 * Extrai os alvos literais passados para router.push/router.replace num
 * arquivo-fonte. Cobre as DUAS formas usadas no projeto (e a forma do bug
 * real relatado):
 *   1. router.push('/caminho') ou router.push(`/caminho/${var}`)
 *   2. router.push({ pathname: '/caminho', params: {...} })  <- forma exata
 *      usada no código com defeito original (router.push({ pathname:
 *      '/medicine/[id]/index', params: { id } }) — precisa ser capturada,
 *      senão o teste dá falso positivo (já aconteceu: ver histórico deste
 *      arquivo/relatório de QA — o teste passou "verde" com o bug
 *      reintroduzido até este trecho ser corrigido).
 */
function extractPushTargets(sourceCode: string): string[] {
  const targets: string[] = [];

  const directArgRe = /router\.(?:push|replace)\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  let match: RegExpExecArray | null;
  while ((match = directArgRe.exec(sourceCode)) !== null) {
    targets.push(match[1].slice(1, -1)); // remove aspas/backticks
  }

  const objectArgRe = /router\.(?:push|replace)\(\s*\{[^}]*?pathname:\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
  while ((match = objectArgRe.exec(sourceCode)) !== null) {
    targets.push(match[1].slice(1, -1));
  }

  return targets;
}

function normalizeTarget(rawTarget: string): string {
  const withPlaceholders = rawTarget.replace(/\$\{[^}]*\}/g, ':param');
  return normalizeDynamicSegments(withPlaceholders.replace(/^\//, ''));
}

describe('tabela de rotas real do expo-router (src/app)', () => {
  it('contém a rota do histórico do remédio como "medicine/:param" (SEM "/index")', () => {
    const screens = buildRealRouteTable();

    // Este é o caso exato do bug relatado: medicine/[id]/index.tsx precisa
    // resolver para "medicine/:param" no runtime — nunca para um caminho
    // que termine em "/index".
    const historyScreenPath = screens['medicine/[id]/index'];
    expect(historyScreenPath).toBe('medicine/:id');
  });

  it('nenhuma rota real do app resolve para um caminho terminado em "/index" ou igual a "index"', () => {
    const screens = buildRealRouteTable();
    const flatPaths = flattenScreensToPaths(screens).map(normalizeDynamicSegments);

    for (const flatPath of flatPaths) {
      expect(flatPath).not.toMatch(/(^|\/)index$/);
    }
  });

  it('todo alvo de router.push/router.replace em src/app usado hoje casa com uma rota real existente', () => {
    const screens = buildRealRouteTable();
    const matchableSet = new Set(flattenScreensToPaths(screens).map(normalizeDynamicSegments));

    const filesToScan = buildFakeContextKeys(APP_DIR)
      .filter((key) => key.endsWith('.tsx') || key.endsWith('.ts'))
      .map((key) => path.join(APP_DIR, key.replace(/^\.\//, '')));

    const allTargets: { file: string; target: string; normalized: string }[] = [];
    for (const file of filesToScan) {
      const source = fs.readFileSync(file, 'utf8');
      for (const target of extractPushTargets(source)) {
        allTargets.push({ file, target, normalized: normalizeTarget(target) });
      }
    }

    // Se a varredura não achou NENHUM router.push em src/app, o regex está
    // quebrado (sabemos que index.tsx sozinho tem vários) — falha alto e
    // claro em vez de "passar" vazio silenciosamente.
    expect(allTargets.length).toBeGreaterThan(0);

    const unmatched = allTargets.filter((t) => !matchableSet.has(t.normalized));
    if (unmatched.length > 0) {
      // Mensagem de erro detalhada: qual arquivo, qual chamada, o que
      // existia de disponível — para facilitar o diagnóstico se este
      // teste um dia pegar um bug de verdade.
      const details = unmatched
        .map((t) => `  ${path.basename(t.file)}: router.push('${t.target}') -> "${t.normalized}" (sem rota correspondente)`)
        .join('\n');
      throw new Error(
        `${unmatched.length} alvo(s) de navegação sem rota real correspondente:\n${details}\n\nRotas disponíveis: ${[...matchableSet].join(', ')}`,
      );
    }
  });
});
