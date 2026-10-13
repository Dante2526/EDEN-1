import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { SynapProject } from '../../lib/types';

interface LocalPreviewProps {
  project: SynapProject;
  onFileChange?: (path: string, content: string) => void;
}

/**
 * LocalPreview — preview 100% no navegador, sem servidor externo.
 *
 * Como funciona:
 * 1. Transpila cada arquivo .tsx/.ts/.jsx com Babel standalone (CDN)
 * 2. Cria data: URLs para cada arquivo transpilado
 * 3. Monta um import map que resolve:
 *    - deps npm → esm.sh (ex: react, lucide-react)
 *    - imports locais → data: URLs (ex: ./App, ./components/Button)
 * 4. Carrega o entry point (main.tsx) como module script
 * 5. Browser resolve imports automaticamente via import map
 *
 * Vantagens:
 * - Não depende de bundler runtime remoto
 * - Suporta imports entre arquivos locais (./App, ./components/X)
 * - Erros de runtime aparecem em vermelho no iframe
 */

// Converte nome de dependency pra URL do esm.sh
function depToUrl(name: string, version?: string): string {
  const cleanName = name.trim();
  const cleanVersion = version ? `@${version.replace(/[\^~>=<]/g, '')}` : '';
  return `https://esm.sh/${cleanName}${cleanVersion}`;
}

// Extrai dependencies do package.json
function extractDeps(project: SynapProject): Record<string, string> {
  const pkgFile = project.files['package.json'];
  if (!pkgFile) return project.dependencies || {};
  try {
    const pkg = JSON.parse(pkgFile.content);
    return {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
  } catch {
    return project.dependencies || {};
  }
}

// Resolve um import relativo (./App, ../components/Button) pro path completo
function resolveImport(importerPath: string, importPath: string): string | null {
  // Se não é relativo, retorna null (é dep npm — resolve via import map)
  if (!importPath.startsWith('.')) return null;

  // Pega o diretório do importador
  const dir = importerPath.includes('/') ? importerPath.slice(0, importerPath.lastIndexOf('/') + 1) : '';

  // Resolve o path
  let resolved = importPath;
  if (importPath.startsWith('./')) {
    resolved = dir + importPath.slice(2);
  } else if (importPath.startsWith('../')) {
    const parts = dir.split('/').filter(Boolean);
    parts.pop(); // sobe um diretório
    resolved = parts.join('/') + '/' + importPath.slice(3);
  }

  // Remove ./ prefix
  resolved = resolved.replace(/^\.\//, '');

  return resolved;
}

// Tenta achar um arquivo no projeto dado um path sem extensão
function findFile(files: Record<string, any>, basePath: string): string | null {
  // Tenta várias extensões
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

// Gera o HTML completo pro iframe
function buildPreviewHtml(project: SynapProject): string {
  const deps = extractDeps(project);
  const files = project.files;

  // Template de deps do React
  const reactVersion = deps['react'] || '18.2.0';
  const reactDomVersion = deps['react-dom'] || reactVersion;

  // Import map base (npm deps)
  const importMap: Record<string, string> = {
    'react': `https://esm.sh/react@${reactVersion}`,
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
  const codeFiles = Object.entries(files)
    .filter(([path]) => {
      return path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js');
    })
    .filter(([path]) => path !== 'package.json' && path !== 'index.html');

  // Serializa o código de cada arquivo + metadados pra transpilar no iframe
  const filesToTranspile = codeFiles.map(([path, file]) => ({
    path,
    code: typeof file === 'string' ? file : (file as any).content || '',
  }));

  // Entry point: tenta src/main.tsx, src/main.js, src/index.tsx, src/index.js
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

  // Se não tem entry point, cria um default que importa App
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
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <div id="synap-loading">
    <div class="synap-spinner"></div>
    <div>Compilando preview...</div>
  </div>

  <script>
    // Captura erros e manda pro parent
    window.onerror = function(msg, url, line, col, err) {
      var errorStack = err && err.stack ? err.stack : String(msg);
      var loading = document.getElementById('synap-loading');
      if (loading) loading.style.display = 'none';
      var errorDiv = document.getElementById('synap-error');
      if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'synap-error';
        document.body.appendChild(errorDiv);
      }
      errorDiv.textContent = 'ERRO DE RUNTIME:\\n\\n' + errorStack;
      window.parent.postMessage({ type: 'synap-preview-error', message: errorStack }, '*');
      return false;
    };
    window.addEventListener('unhandledrejection', function(event) {
      var msg = event.reason && event.reason.stack ? event.reason.stack : String(event.reason);
      window.onerror('Promise rejeitada: ' + msg, '', 0, 0, event.reason);
    });

    // Dados dos arquivos (vão ser preenchidos abaixo)
    var SYNAP_FILES = ${JSON.stringify(filesToTranspile)};
    var SYNAP_ENTRY = ${JSON.stringify(entryPath)};
    var SYNAP_IMPORT_MAP = ${JSON.stringify(importMap)};
    var SYNAP_DEFAULT_ENTRY = ${JSON.stringify(defaultEntry)};

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

    // Transpila todos os arquivos e cria data URLs
    function buildAndLoad() {
      try {
        if (typeof Babel === 'undefined') {
          throw new Error('Babel não carregou. Verifique sua conexão com a internet.');
        }

        var dataUrls = {};
        var importMap = { imports: {} };

        // Copia deps npm pro import map
        for (var depName in SYNAP_IMPORT_MAP) {
          importMap.imports[depName] = SYNAP_IMPORT_MAP[depName];
        }

        // Transpila cada arquivo
        for (var i = 0; i < SYNAP_FILES.length; i++) {
          var fileObj = SYNAP_FILES[i];
          try {
            var transformed = Babel.transform(fileObj.code, {
              presets: [['react'], ['typescript', { isTSX: true, allExtensions: true }]],
              filename: fileObj.path,
              sourceMaps: 'inline',
            }).code;

            // Reescreve imports relativos pra resolver com data URLs
            // Usa regex pra achar imports: from '...' e import '...'
            var rewritten = transformed.replace(/(from\\s+|import\\s+)['"]([^'"]+)['"]/g, function(match, prefix, importPath) {
              if (importPath.startsWith('.')) {
                var resolved = resolveImportPath(fileObj.path, importPath);
                var found = resolved ? findFile(resolved) : null;
                if (found) {
                  return prefix + "'./" + found + "'";
                }
              }
              return match;
            });

            // Cria data URL
            var blob = new Blob([rewritten], { type: 'application/javascript' });
            var url = URL.createObjectURL(blob);
            dataUrls[fileObj.path] = url;

            // Adiciona no import map com várias variações de path
            importMap.imports['./' + fileObj.path] = url;
            importMap.imports[fileObj.path] = url;
            // Sem extensão
            var noExt = fileObj.path.replace(/\\.(tsx|ts|jsx|js)$/, '');
            importMap.imports['./' + noExt] = url;
            importMap.imports[noExt] = url;
          } catch (e) {
            throw new Error('Erro ao transpilar ' + fileObj.path + ': ' + (e.message || e));
          }
        }

        // Cria o entry script
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

            // Reescreve imports do entry
            entryCode = entryTransformed.replace(/(from\\s+|import\\s+)['"]([^'"]+)['"]/g, function(match, prefix, importPath) {
              if (importPath.startsWith('.')) {
                var resolved = resolveImportPath(SYNAP_ENTRY, importPath);
                var found = resolved ? findFile(resolved) : null;
                if (found) {
                  return prefix + "'./" + found + "'";
                }
              }
              return match;
            });
          } else {
            entryCode = SYNAP_DEFAULT_ENTRY;
          }
        } else {
          entryCode = SYNAP_DEFAULT_ENTRY;
        }

        // Injeta import map no documento
        var importMapScript = document.createElement('script');
        importMapScript.type = 'importmap';
        importMapScript.textContent = JSON.stringify(importMap);
        document.head.appendChild(importMapScript);

        // Cria o module script com o entry point
        var entryBlob = new Blob([entryCode], { type: 'application/javascript' });
        var entryUrl = URL.createObjectURL(entryBlob);
        var moduleScript = document.createElement('script');
        moduleScript.type = 'module';
        moduleScript.src = entryUrl;
        moduleScript.onerror = function(e) {
          window.onerror('Falha ao carregar módulo de entrada', entryUrl, 0, 0, e);
        };
        document.body.appendChild(moduleScript);

        // Esconde loading depois de 1s (deixa o React montar)
        setTimeout(function() {
          var loading = document.getElementById('synap-loading');
          if (loading) loading.style.display = 'none';
          window.parent.postMessage({ type: 'synap-preview-compiled' }, '*');
        }, 1000);
      } catch (e) {
        window.onerror(e.message || String(e), '', 0, 0, e);
      }
    }

    // Espera Babel carregar
    if (typeof Babel !== 'undefined') {
      buildAndLoad();
    } else {
      var babelCheck = setInterval(function() {
        if (typeof Babel !== 'undefined') {
          clearInterval(babelCheck);
          buildAndLoad();
        }
      }, 100);
      // Timeout de 15s pra Babel carregar
      setTimeout(function() {
        if (typeof Babel === 'undefined') {
          clearInterval(babelCheck);
          window.onerror('Babel standalone não carregou em 15s. Verifique sua conexão.', '', 0, 0, null);
        }
      }, 15000);
    }
  </script>
</body>
</html>`;
}

export const LocalPreview: React.FC<LocalPreviewProps> = ({ project }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const html = useMemo(() => {
    try {
      setError(null);
      return buildPreviewHtml(project);
    } catch (err: any) {
      setError(`Erro ao gerar preview: ${err?.message || err}`);
      return '';
    }
  }, [project, refreshKey]);

  // Recebe mensagens do iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'synap-preview-error') {
        setError(event.data.message);
        setLoading(false);
      } else if (event.data?.type === 'synap-preview-compiled') {
        setLoading(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Timeout: 30s
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setError('Tempo limite excedido (30s). O Babel pode estar lento pra carregar do CDN. Tente novamente, ou clique em ↗ pra abrir em nova aba.');
      setLoading(false);
    }, 30000);
    return () => clearTimeout(timer);
  }, [loading, refreshKey]);

  useEffect(() => {
    setLoading(true);
  }, [html]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    setLoading(true);
    setError(null);
  };

  const handleOpenInNewTab = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="relative w-full h-full bg-white">
      {loading && !error && (
        <div className="absolute inset-0 z-20 bg-[#181714] flex flex-col items-center justify-center gap-2 text-[#8c867a]">
          <div className="w-6 h-6 border-2 border-[#d97757]/30 border-t-[#d97757] rounded-full animate-spin" />
          <span className="text-xs">Compilando preview...</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 bg-[#0d0c0a]/95 backdrop-blur-sm overflow-y-auto p-3 text-[#f3efe6]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 font-medium text-rose-400">
              <AlertCircle className="w-4 h-4" />
              <span>Erro</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 hover:bg-[#282622] rounded text-[#8c867a] hover:text-[#f3efe6]"
            >
              ✕
            </button>
          </div>
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg p-3">
            <pre className="text-[10px] text-rose-200 font-mono whitespace-pre-wrap break-all overflow-x-auto">{error}</pre>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#c4663f] text-white text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar novamente
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="Preview"
        className="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        onLoad={() => {
          // iframe carregou, mas ainda pode estar compilando
          // setLoading(false) será chamado via postMessage
        }}
      />

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={handleRefresh}
          title="Recarregar preview"
          className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-[#5e5a52] hover:text-[#181714] transition cursor-pointer shadow-sm backdrop-blur-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleOpenInNewTab}
          title="Abrir em nova aba (tela cheia)"
          className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-[#5e5a52] hover:text-[#181714] transition cursor-pointer shadow-sm backdrop-blur-sm"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
