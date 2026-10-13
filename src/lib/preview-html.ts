import { SynapProject } from './types';

/**
 * Gera o HTML completo pro preview do projeto (LocalPreview).
 * Módulo separado pra ser testável com `npm test`.
 *
 * Como funciona:
 * 1. Transpila cada arquivo .tsx/.ts/.jsx com Babel standalone (CDN)
 * 2. Cria blob URLs pra cada arquivo transpilado
 * 3. Monta import map que resolve:
 *    - deps npm → esm.sh (ex: react, lucide-react)
 *    - imports locais → blob URLs (ex: ./App, ./components/Button)
 * 4. Carrega o entry point (main.tsx) como module script
 */

export interface PreviewFile {
  path: string;
  code: string;
}

export interface BuildPreviewHtmlOptions {
  files: Record<string, { content: string }>;
  template?: string;
  dependencies?: Record<string, string>;
}

/** Converte nome de dependency pra URL do esm.sh */
export function depToUrl(name: string, version?: string): string {
  const cleanName = name.trim();
  const cleanVersion = version ? `@${version.replace(/[\^~>=<]/g, '')}` : '';
  return `https://esm.sh/${cleanName}${cleanVersion}`;
}

/** Extrai dependencies do package.json (se existir nos arquivos) */
export function extractDeps(
  files: Record<string, { content: string }>,
  fallbackDeps?: Record<string, string>
): Record<string, string> {
  const pkgFile = files['package.json'];
  if (!pkgFile) return fallbackDeps || {};
  try {
    const pkg = JSON.parse(pkgFile.content);
    return {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
  } catch {
    return fallbackDeps || {};
  }
}

/** Resolve um import relativo (./App, ../components/Button) pro path completo */
export function resolveImportPath(importerPath: string, importPath: string): string | null {
  if (!importPath.startsWith('.')) return null;
  const dir = importerPath.includes('/')
    ? importerPath.slice(0, importerPath.lastIndexOf('/') + 1)
    : '';
  let resolved = importPath;
  if (importPath.startsWith('./')) {
    resolved = dir + importPath.slice(2);
  } else if (importPath.startsWith('../')) {
    const parts = dir.split('/').filter(Boolean);
    parts.pop();
    resolved = parts.join('/') + '/' + importPath.slice(3);
  }
  return resolved.replace(/^\.\//, '');
}

/** Tenta achar um arquivo dado um path sem extensão */
export function findFile(
  files: Record<string, { content: string }>,
  basePath: string
): string | null {
  const candidates = [
    basePath,
    basePath + '.tsx',
    basePath + '.ts',
    basePath + '.jsx',
    basePath + '.js',
    basePath + '/index.tsx',
    basePath + '/index.ts',
    basePath + '/index.jsx',
    basePath + '/index.js',
  ];
  for (const c of candidates) {
    if (files[c]) return c;
  }
  return null;
}

/** Escapa </script> dentro do código pra não quebrar o HTML do iframe */
export function escapeScriptTags(code: string): string {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

/**
 * Reescreve imports relativos no código transpilado pra paths completos.
 * Suporta: import X from './App', import './index.css', @/x, import()
 */
export function rewriteImports(
  code: string,
  importerPath: string,
  files: Record<string, { content: string }>
): string {
  return code.replace(
    /(from\s+|import\s+)['"]([^'"]+)['"]/g,
    (match, prefix, importPath) => {
      // Imports relativos (./ ou ../)
      if (importPath.startsWith('.')) {
        const resolved = resolveImportPath(importerPath, importPath);
        if (resolved) {
          const found = findFile(files, resolved);
          if (found) {
            return `${prefix}'./${found}'`;
          }
        }
        return match;
      }
      // @/ alias
      if (importPath.startsWith('@/')) {
        const aliased = importPath.slice(2);
        const found = findFile(files, aliased);
        if (found) {
          return `${prefix}'./${found}'`;
        }
      }
      return match;
    }
  );
}

/**
 * Gera o HTML completo pro iframe do preview.
 */
export function buildPreviewHtml(options: BuildPreviewHtmlOptions): string {
  const { files, dependencies } = options;
  const deps = extractDeps(files, dependencies);

  // React versions
  const reactVersion = deps['react'] || '18.2.0';
  const reactDomVersion = deps['react-dom'] || reactVersion;

  // Import map base (npm deps)
  const importMap: Record<string, string> = {
    react: `https://esm.sh/react@${reactVersion}`,
    'react-dom': `https://esm.sh/react-dom@${reactDomVersion}`,
    'react-dom/client': `https://esm.sh/react-dom@${reactDomVersion}/client`,
    'react/jsx-runtime': `https://esm.sh/react@${reactVersion}/jsx-runtime`,
    'react/jsx-dev-runtime': `https://esm.sh/react@${reactVersion}/jsx-dev-runtime`,
  };

  // Adiciona outras deps npm
  for (const [name, version] of Object.entries(deps)) {
    if (name === 'react' || name === 'react-dom' || name === 'react-scripts') continue;
    if (name.startsWith('@types/')) continue;
    if (name === 'typescript' || name === 'vite') continue;
    if (name === '@vitejs/plugin-react') continue;
    importMap[name] = depToUrl(name, version);
  }

  // Lista de arquivos JS/TS transpiláveis
  const codeFiles = Object.entries(files).filter(([path]) => {
    return (
      path.endsWith('.tsx') ||
      path.endsWith('.ts') ||
      path.endsWith('.jsx') ||
      path.endsWith('.js')
    );
  });

  const filesToTranspile: PreviewFile[] = codeFiles.map(([path, file]) => ({
    path,
    code: file.content || '',
  }));

  // Entry point
  const entryCandidates = [
    'src/main.tsx', 'src/main.ts', 'src/main.js', 'src/main.jsx',
    'src/index.tsx', 'src/index.ts', 'src/index.js', 'src/index.jsx',
  ];
  let entryPath = entryCandidates.find((p) => files[p]);
  if (!entryPath && codeFiles.length > 0) {
    entryPath = codeFiles[0][0];
  }

  // Custom HTML do index.html
  let customStyles = '';
  let customHead = '';
  const indexHtml = files['index.html'];
  if (indexHtml) {
    const styleMatch = indexHtml.content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) customStyles = styleMatch[1];
    const headMatch = indexHtml.content.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      const linkMatches = headMatch[1].matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/gi);
      for (const m of linkMatches) {
        customHead += `<link rel="stylesheet" href="${m[1]}">`;
      }
    }
  }

  // Escapa </script> nos códigos (pra não quebrar o HTML do iframe)
  const escapedFiles = filesToTranspile.map((f) => ({
    ...f,
    code: escapeScriptTags(f.code),
  }));

  const defaultEntry = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);`;

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
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
      z-index: 9999; white-space: pre-wrap; word-break: break-all;
    }
  </style>
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"><\/script>
</head>
<body>
  <div id="root"></div>
  <div id="synap-loading">
    <div class="synap-spinner"></div>
    <div>Compilando preview...</div>
  </div>

  <script>
    window.onerror = function(msg, url, line, col, err) {
      var errorStack = err && err.stack ? err.stack : String(msg);
      // Detecta erro de CSP especificamente
      if (errorStack.indexOf('Refused to load') >= 0 || errorStack.indexOf('Content Security Policy') >= 0) {
        errorStack = 'BLOQUEADO POR CSP (Content Security Policy):\\n\\n' + errorStack + '\\n\\nVerifique o vercel.json — precisa liberar unpkg.com, esm.sh, cdn.jsdelivr.net e blob: no script-src.';
      }
      var loading = document.getElementById('synap-loading');
      if (loading) loading.style.display = 'none';
      var errorDiv = document.getElementById('synap-error');
      if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'synap-error';
        document.body.appendChild(errorDiv);
      }
      errorDiv.textContent = errorStack;
      window.parent.postMessage({ type: 'synap-preview-error', message: errorStack }, '*');
      return false;
    };
    window.addEventListener('unhandledrejection', function(event) {
      var msg = event.reason && event.reason.stack ? event.reason.stack : String(event.reason);
      window.onerror('Promise rejeitada: ' + msg, '', 0, 0, event.reason);
    });

    var SYNAP_FILES = ${JSON.stringify(escapedFiles)};
    var SYNAP_ENTRY = ${JSON.stringify(entryPath)};
    var SYNAP_IMPORT_MAP = ${JSON.stringify(importMap)};
    var SYNAP_DEFAULT_ENTRY = ${JSON.stringify(escapeScriptTags(defaultEntry))};

    function resolveImportPath(importerPath, importPath) {
      if (!importPath.startsWith('.')) return null;
      var dir = importerPath.indexOf('/') >= 0 ? importerPath.substring(0, importerPath.lastIndexOf('/') + 1) : '';
      var resolved = importPath;
      if (importPath.startsWith('./')) {
        resolved = dir + importPath.substring(2);
      } else if (importPath.startsWith('../')) {
        var parts = dir.split('/').filter(Boolean);
        parts.pop();
        resolved = parts.join('/') + '/' + importPath.substring(3);
      }
      return resolved.replace(/^\\.\\//, '');
    }

    function findFile(basePath) {
      var candidates = [
        basePath, basePath + '.tsx', basePath + '.ts',
        basePath + '.jsx', basePath + '.js',
        basePath + '/index.tsx', basePath + '/index.ts',
        basePath + '/index.jsx', basePath + '/index.js',
      ];
      for (var i = 0; i < candidates.length; i++) {
        for (var j = 0; j < SYNAP_FILES.length; j++) {
          if (SYNAP_FILES[j].path === candidates[i]) return candidates[i];
        }
      }
      return null;
    }

    function rewriteImports(code, importerPath) {
      return code.replace(/(from\\s+|import\\s+)['"]([^'"]+)['"]/g, function(match, prefix, importPath) {
        if (importPath.startsWith('.')) {
          var resolved = resolveImportPath(importerPath, importPath);
          if (resolved) {
            var found = findFile(resolved);
            if (found) return prefix + "'./" + found + "'";
          }
          return match;
        }
        if (importPath.startsWith('@/')) {
          var aliased = importPath.substring(2);
          var foundAlias = findFile(aliased);
          if (foundAlias) return prefix + "'./" + foundAlias + "'";
        }
        return match;
      });
    }

    function buildAndLoad() {
      try {
        if (typeof Babel === 'undefined') {
          throw new Error('Babel não carregou. Pode ser bloqueio de CSP (verifique vercel.json) ou problema de conexão.');
        }

        var dataUrls = {};
        var importMap = { imports: {} };
        for (var depName in SYNAP_IMPORT_MAP) {
          importMap.imports[depName] = SYNAP_IMPORT_MAP[depName];
        }

        for (var i = 0; i < SYNAP_FILES.length; i++) {
          var fileObj = SYNAP_FILES[i];
          try {
            var transformed = Babel.transform(fileObj.code, {
              presets: [['react'], ['typescript', { isTSX: true, allExtensions: true }]],
              filename: fileObj.path,
              sourceMaps: 'inline',
            }).code;
            var rewritten = rewriteImports(transformed, fileObj.path);
            var blob = new Blob([rewritten], { type: 'application/javascript' });
            var url = URL.createObjectURL(blob);
            dataUrls[fileObj.path] = url;
            importMap.imports['./' + fileObj.path] = url;
            importMap.imports[fileObj.path] = url;
            var noExt = fileObj.path.replace(/\\.(tsx|ts|jsx|js)$/, '');
            importMap.imports['./' + noExt] = url;
            importMap.imports[noExt] = url;
          } catch (e) {
            throw new Error('Erro ao transpilar ' + fileObj.path + ': ' + (e.message || e));
          }
        }

        var entryCode;
        if (SYNAP_ENTRY) {
          var entryFile = null;
          for (var k = 0; k < SYNAP_FILES.length; k++) {
            if (SYNAP_FILES[k].path === SYNAP_ENTRY) {
              entryFile = SYNAP_FILES[k];
              break;
            }
          }
          if (entryFile) {
            var entryTransformed = Babel.transform(entryFile.code, {
              presets: [['react'], ['typescript', { isTSX: true, allExtensions: true }]],
              filename: SYNAP_ENTRY,
            }).code;
            entryCode = rewriteImports(entryTransformed, SYNAP_ENTRY);
          } else {
            entryCode = SYNAP_DEFAULT_ENTRY;
          }
        } else {
          entryCode = SYNAP_DEFAULT_ENTRY;
        }

        var importMapScript = document.createElement('script');
        importMapScript.type = 'importmap';
        importMapScript.textContent = JSON.stringify(importMap);
        document.head.appendChild(importMapScript);

        var entryBlob = new Blob([entryCode], { type: 'application/javascript' });
        var entryUrl = URL.createObjectURL(entryBlob);
        var moduleScript = document.createElement('script');
        moduleScript.type = 'module';
        moduleScript.src = entryUrl;
        moduleScript.onerror = function(e) {
          window.onerror('Falha ao carregar módulo de entrada', entryUrl, 0, 0, e);
        };
        document.body.appendChild(moduleScript);

        setTimeout(function() {
          var loading = document.getElementById('synap-loading');
          if (loading) loading.style.display = 'none';
          window.parent.postMessage({ type: 'synap-preview-compiled' }, '*');
        }, 1000);
      } catch (e) {
        window.onerror(e.message || String(e), '', 0, 0, e);
      }
    }

    if (typeof Babel !== 'undefined') {
      buildAndLoad();
    } else {
      var babelCheck = setInterval(function() {
        if (typeof Babel !== 'undefined') {
          clearInterval(babelCheck);
          buildAndLoad();
        }
      }, 100);
      setTimeout(function() {
        if (typeof Babel === 'undefined') {
          clearInterval(babelCheck);
          window.onerror('Babel standalone não carregou em 15s. Provável bloqueio de CSP — verifique vercel.json.', '', 0, 0, null);
        }
      }, 15000);
    }
  <\/script>
</body>
</html>`;
}

/** Wrapper que aceita SynapProject direto */
export function buildPreviewHtmlFromProject(project: SynapProject): string {
  const files: Record<string, { content: string }> = {};
  for (const [path, file] of Object.entries(project.files)) {
    files[path] = { content: file.content };
  }
  return buildPreviewHtml({
    files,
    template: project.template,
    dependencies: project.dependencies,
  });
}
