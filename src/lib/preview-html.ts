import type { SynapProject } from './types';

/**
 * Geração do HTML do preview local (100% no navegador).
 *
 * Fluxo dentro do iframe:
 * 1. Babel standalone (unpkg) transpila cada arquivo .tsx/.ts/.jsx/.js
 * 2. Cada arquivo vira um Blob URL, registrado num import map
 * 3. Imports relativos (./App, ../x, @/x) são reescritos (via AST do Babel) para
 *    especificadores "bare" `synap-local/<caminho>` — necessário porque módulos
 *    carregados de blob: não conseguem resolver imports relativos
 * 4. Dependências npm vêm do esm.sh (com ?external=react,react-dom pra compartilhar
 *    a mesma instância do React)
 * 5. CSS e JSON importados viram módulos (CSS injeta um <style>)
 *
 * IMPORTANTE: o iframe herda o Content-Security-Policy da página (vercel.json).
 * O CSP precisa liberar unpkg.com, esm.sh e blob: em script-src.
 */

/** Prefixo dos especificadores bare que apontam pros arquivos do projeto. */
export const LOCAL_PREFIX = 'synap-local/';

/**
 * Serializa um valor como JSON seguro pra ser embutido dentro de uma tag <script>.
 * JSON.stringify NÃO escapa "</script>" nem "<!--": se algum arquivo do projeto
 * tivesse isso, o HTML quebrava e o preview ficava preso em "Compilando...".
 */
export function safeJson(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

/** "^18.2.0" -> "18.2.0"; "latest", "*", "workspace:*" -> "" (esm.sh escolhe a última). */
export function cleanVersion(version?: string): string {
  if (!version) return '';
  const match = version.trim().match(/\d+(?:\.\d+){0,2}/);
  return match ? match[0] : '';
}

/** URL do esm.sh pra uma dependência npm (React externo = mesma instância do React). */
export function depToUrl(name: string, version?: string): string {
  const v = cleanVersion(version);
  return `https://esm.sh/${name.trim()}${v ? `@${v}` : ''}?external=react,react-dom`;
}

// Dependências que não entram no import map (build/tipos ou já mapeadas à parte)
const SKIP_DEPS = new Set([
  'react',
  'react-dom',
  'react-scripts',
  'typescript',
  'vite',
  '@vitejs/plugin-react',
  'tailwindcss',
  '@tailwindcss/vite',
  'postcss',
  'autoprefixer',
]);

/** Dependências do package.json (dependencies + devDependencies) ou do projeto. */
export function extractDeps(project: SynapProject): Record<string, string> {
  const pkgFile = project.files['package.json'];
  if (!pkgFile) return project.dependencies || {};
  try {
    const pkg = JSON.parse(pkgFile.content);
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return project.dependencies || {};
  }
}

/** Import map das dependências npm (React fixado + demais deps do projeto). */
export function buildImportMap(deps: Record<string, string>): Record<string, string> {
  const reactVersion = cleanVersion(deps['react']) || '18.3.1';
  const reactDomVersion = cleanVersion(deps['react-dom']) || reactVersion;

  const map: Record<string, string> = {
    react: `https://esm.sh/react@${reactVersion}`,
    'react/jsx-runtime': `https://esm.sh/react@${reactVersion}/jsx-runtime`,
    'react/jsx-dev-runtime': `https://esm.sh/react@${reactVersion}/jsx-dev-runtime`,
    'react-dom': `https://esm.sh/react-dom@${reactDomVersion}?external=react`,
    'react-dom/client': `https://esm.sh/react-dom@${reactDomVersion}/client?external=react`,
  };

  for (const [name, version] of Object.entries(deps)) {
    if (SKIP_DEPS.has(name) || name.startsWith('@types/')) continue;
    map[name] = depToUrl(name, version);
  }
  return map;
}

type PreviewFileKind = 'code' | 'css' | 'json';

interface PreviewFile {
  path: string;
  code: string;
  kind: PreviewFileKind;
}

function fileKind(path: string): PreviewFileKind | null {
  if (/\.(tsx|ts|jsx|js|mjs)$/i.test(path)) return 'code';
  if (/\.css$/i.test(path)) return 'css';
  if (/\.json$/i.test(path)) return 'json';
  return null;
}

const ENTRY_CANDIDATES = [
  'src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js',
  'src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js',
];

/** Gera o HTML completo que vai no srcDoc do iframe do preview. */
export function buildPreviewHtml(project: SynapProject): string {
  const deps = extractDeps(project);
  const importMap = buildImportMap(deps);

  // Arquivos que o iframe consegue importar (código, CSS, JSON)
  const previewFiles: PreviewFile[] = [];
  const known: Record<string, string> = {};
  for (const [rawPath, file] of Object.entries(project.files)) {
    const path = rawPath.replace(/^\/+/, '');
    const content = typeof file === 'string' ? (file as string) : file?.content || '';
    known[path] = content;
    const kind = fileKind(path);
    if (!kind) continue;
    if (path === 'package.json' || /(^|\/)tsconfig[^/]*\.json$/.test(path)) continue;
    previewFiles.push({ path, code: content, kind });
  }
  const codeFiles = previewFiles.filter((f) => f.kind === 'code');

  // Ponto de entrada: main/index, senão o fallback do App é montado no iframe
  const entryPath = ENTRY_CANDIDATES.find((p) => codeFiles.some((f) => f.path === p)) ?? null;
  const fallbackEntry = codeFiles.length > 0 ? codeFiles[0].path : null;

  // Estilos vindos do index.html (<style> inline e <link rel=stylesheet>)
  let customStyles = '';
  let customHead = '';
  const indexHtml = known['index.html'];
  if (indexHtml) {
    const styleMatch = indexHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) customStyles += styleMatch[1] + '\n';
    for (const m of indexHtml.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/gi)) {
      const href = m[1];
      const local = href.replace(/^\.?\/+/, '');
      if (known[local] !== undefined) {
        // CSS do próprio projeto: inline (um link relativo não resolveria dentro do srcDoc)
        customStyles += known[local].replace(/<\/style/gi, '<\\/style') + '\n';
      } else if (/^https?:\/\//i.test(href)) {
        customHead += `<link rel="stylesheet" href="${href}">`;
      }
    }
  }

  return String.raw`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script>
    // Bootstrap: roda ANTES do Babel pra capturar qualquer falha de carregamento
    (function () {
      var failed = false;
      var finished = false;
      function post(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) {} }
      function hideLoading() {
        var l = document.getElementById('synap-loading');
        if (l) l.style.display = 'none';
      }
      window.__synapFail = function (text) {
        if (failed) return;
        failed = true;
        hideLoading();
        var box = document.getElementById('synap-error');
        if (!box) {
          box = document.createElement('div');
          box.id = 'synap-error';
          (document.body || document.documentElement).appendChild(box);
        }
        box.textContent = 'ERRO NO PREVIEW:\n\n' + text;
        post({ type: 'synap-preview-error', message: text });
      };
      window.__synapDone = function () {
        if (failed || finished) return;
        finished = true;
        hideLoading();
        post({ type: 'synap-preview-compiled' });
      };
      window.__synapState = function () { return { failed: failed, finished: finished }; };

      window.onerror = function (msg, url, line, col, err) {
        var text = String(msg);
        if (/ResizeObserver loop/i.test(text)) return true;
        window.__synapFail(err && err.stack ? err.stack : text);
        return false;
      };
      window.addEventListener('unhandledrejection', function (event) {
        var r = event.reason;
        window.__synapFail('Promise rejeitada: ' + (r && r.stack ? r.stack : String(r)));
      });
      // Script bloqueado pelo CSP (Babel, esm.sh, blob:...) => erro claro, em vez de ficar "compilando" pra sempre
      document.addEventListener('securitypolicyviolation', function (e) {
        var dir = e.violatedDirective || '';
        if (dir.indexOf('script-src') === 0) {
          window.__synapFail(
            'Bloqueado pelo CSP (' + dir + '): ' + e.blockedURI + '\n\n' +
            'Libere esse endereço em script-src no Content-Security-Policy do vercel.json.'
          );
        } else {
          console.warn('[preview] CSP bloqueou (' + dir + '): ' + e.blockedURI);
        }
      });
    })();
  </script>
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js" onerror="window.__synapBabelFailed = true"></script>
  ${customHead}
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #root { min-height: 100vh; }
    ${customStyles}
    #synap-loading {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px;
      background: #181714; color: #8c867a; font-family: sans-serif; font-size: 12px;
      z-index: 9999;
    }
    .synap-spinner {
      width: 24px; height: 24px;
      border: 2px solid rgba(217, 119, 87, 0.3);
      border-top-color: #d97757;
      border-radius: 50%;
      animation: synap-spin 0.8s linear infinite;
    }
    @keyframes synap-spin { to { transform: rotate(360deg); } }
    #synap-error {
      position: fixed; inset: 0; padding: 16px; overflow-y: auto;
      background: #1a0d0d; color: #ef4444; font-family: monospace; font-size: 11px;
      z-index: 10000; white-space: pre-wrap; word-break: break-all;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="synap-loading">
    <div class="synap-spinner"></div>
    <div>Compilando preview...</div>
  </div>

  <script>
    var SYNAP_FILES = ${safeJson(previewFiles)};
    var SYNAP_ENTRY = ${safeJson(entryPath)};
    var SYNAP_FALLBACK_ENTRY = ${safeJson(fallbackEntry)};
    var SYNAP_IMPORT_MAP = ${safeJson(importMap)};
    var SYNAP_PREFIX = ${safeJson(LOCAL_PREFIX)};

    var BY_PATH = {};
    for (var i = 0; i < SYNAP_FILES.length; i++) BY_PATH[SYNAP_FILES[i].path] = SYNAP_FILES[i];

    var unresolved = [];
    var ASSET_RE = /\.(css|scss|sass|less|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|ogg|pdf|md|txt)$/i;

    // Junta o diretório do importador com o import relativo, resolvendo "." e ".."
    function joinPath(importerPath, spec) {
      var segs;
      if (spec.indexOf('@/') === 0) {
        segs = ['src'].concat(spec.slice(2).split('/'));
      } else {
        var base = importerPath.split('/');
        base.pop();
        segs = base.concat(spec.split('/'));
      }
      var out = [];
      for (var k = 0; k < segs.length; k++) {
        var s = segs[k];
        if (s === '' || s === '.') continue;
        if (s === '..') out.pop(); else out.push(s);
      }
      return out.join('/');
    }

    function findFile(basePath) {
      var candidates = [
        basePath, basePath + '.tsx', basePath + '.ts', basePath + '.jsx', basePath + '.js', basePath + '.mjs',
        basePath + '/index.tsx', basePath + '/index.ts', basePath + '/index.jsx', basePath + '/index.js'
      ];
      for (var c = 0; c < candidates.length; c++) {
        if (BY_PATH[candidates[c]]) return candidates[c];
      }
      return null;
    }

    // Import relativo -> especificador bare "synap-local/<arquivo>" (resolvido pelo import map)
    function mapSpecifier(importerPath, spec) {
      var isLocal = spec.charAt(0) === '.' || spec.indexOf('@/') === 0;
      if (!isLocal) return spec;
      var found = findFile(joinPath(importerPath, spec));
      if (found) return SYNAP_PREFIX + found;
      if (ASSET_RE.test(spec)) return SYNAP_PREFIX + '__empty__';
      unresolved.push(spec + ' (importado em ' + importerPath + ')');
      return spec;
    }

    // Plugin do Babel: reescreve imports via AST (não pega texto dentro de strings)
    function rewritePlugin(importerPath) {
      return function () {
        function fix(node) {
          if (node && node.type === 'StringLiteral') node.value = mapSpecifier(importerPath, node.value);
        }
        return {
          visitor: {
            ImportDeclaration: function (p) { if (p.node.importKind !== 'type') fix(p.node.source); },
            ExportAllDeclaration: function (p) { fix(p.node.source); },
            ExportNamedDeclaration: function (p) { if (p.node.source) fix(p.node.source); },
            CallExpression: function (p) {
              if (p.node.callee.type === 'Import' && p.node.arguments.length > 0) fix(p.node.arguments[0]);
            }
          }
        };
      };
    }

    function transpile(file) {
      return Babel.transform(file.code, {
        filename: file.path,
        sourceType: 'module',
        presets: [
          ['react', { runtime: 'automatic' }],
          ['typescript', { isTSX: !/\.ts$/.test(file.path), allExtensions: true }]
        ],
        plugins: [rewritePlugin(file.path)]
      }).code;
    }

    function cssModule(file) {
      return 'var s = document.createElement("style");' +
        's.setAttribute("data-synap-css", ' + JSON.stringify(file.path) + ');' +
        's.textContent = ' + JSON.stringify(file.code) + ';' +
        'document.head.appendChild(s); export default {};';
    }

    function jsonModule(file) {
      var text = '{}';
      try { JSON.parse(file.code); text = file.code; } catch (e) {}
      return 'export default ' + text + ';';
    }

    function blobUrl(code) {
      return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    }

    function unresolvedHint() {
      return unresolved.length
        ? '\n\nImports não encontrados no projeto:\n- ' + unresolved.join('\n- ')
        : '';
    }

    function buildAndLoad() {
      try {
        if (typeof Babel === 'undefined') {
          throw new Error('Babel não carregou. Verifique a conexão com a internet.');
        }

        var imports = {};
        for (var dep in SYNAP_IMPORT_MAP) imports[dep] = SYNAP_IMPORT_MAP[dep];
        imports[SYNAP_PREFIX + '__empty__'] = blobUrl('export default "";');

        for (var n = 0; n < SYNAP_FILES.length; n++) {
          var file = SYNAP_FILES[n];
          var source;
          try {
            if (file.kind === 'css') source = cssModule(file);
            else if (file.kind === 'json') source = jsonModule(file);
            else source = transpile(file);
          } catch (e) {
            throw new Error('Erro ao transpilar ' + file.path + ':\n' + (e.message || e));
          }
          imports[SYNAP_PREFIX + file.path] = blobUrl(source);
        }

        // Ponto de entrada: main/index do projeto; senão monta o App; senão o 1º arquivo de código
        var entrySource;
        if (SYNAP_ENTRY) {
          entrySource = 'import ' + JSON.stringify(SYNAP_PREFIX + SYNAP_ENTRY) + ';\nwindow.__synapDone();';
        } else {
          var app = findFile('src/App') || findFile('App');
          if (app) {
            entrySource =
              'import React from "react";\n' +
              'import { createRoot } from "react-dom/client";\n' +
              'import App from ' + JSON.stringify(SYNAP_PREFIX + app) + ';\n' +
              'createRoot(document.getElementById("root")).render(React.createElement(App));\n' +
              'window.__synapDone();';
          } else if (SYNAP_FALLBACK_ENTRY) {
            entrySource = 'import ' + JSON.stringify(SYNAP_PREFIX + SYNAP_FALLBACK_ENTRY) + ';\nwindow.__synapDone();';
          } else {
            throw new Error('Nenhum arquivo de código (main.tsx, App.tsx...) encontrado no projeto.');
          }
        }

        var mapScript = document.createElement('script');
        mapScript.type = 'importmap';
        mapScript.textContent = JSON.stringify({ imports: imports });
        document.head.appendChild(mapScript);

        var moduleScript = document.createElement('script');
        moduleScript.type = 'module';
        moduleScript.src = blobUrl(entrySource);
        moduleScript.onerror = function () {
          window.__synapFail('Falha ao carregar os módulos do preview (dependência do esm.sh, import quebrado ou bloqueio de rede).' + unresolvedHint());
        };
        document.body.appendChild(moduleScript);

        // Sem resposta em 20s: mostra erro em vez de ficar girando pra sempre
        setTimeout(function () {
          var st = window.__synapState();
          if (!st.failed && !st.finished) {
            window.__synapFail('O preview não terminou de carregar em 20s. As dependências (esm.sh) podem estar lentas ou bloqueadas.' + unresolvedHint());
          }
        }, 20000);
      } catch (e) {
        window.__synapFail(e && e.message ? e.message : String(e));
      }
    }

    // Espera o Babel carregar (falha na hora se o script foi bloqueado/derrubado)
    if (typeof Babel !== 'undefined') {
      buildAndLoad();
    } else {
      var waited = 0;
      var babelCheck = setInterval(function () {
        waited += 100;
        if (typeof Babel !== 'undefined') {
          clearInterval(babelCheck);
          buildAndLoad();
        } else if (window.__synapBabelFailed) {
          clearInterval(babelCheck);
          window.__synapFail('Não foi possível carregar o Babel (unpkg.com). Verifique a internet e se o CSP do vercel.json libera https://unpkg.com em script-src.');
        } else if (waited >= 15000) {
          clearInterval(babelCheck);
          window.__synapFail('O Babel não carregou em 15s. Verifique sua conexão.');
        }
      }, 100);
    }
  </script>
</body>
</html>`;
}

/** Nome usado pelo LocalPreview (mantido por compatibilidade). */
export const buildPreviewHtmlFromProject = buildPreviewHtml;
