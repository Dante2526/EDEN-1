import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { SynapProject } from '../../lib/types';

interface LocalPreviewProps {
  project: SynapProject;
  /** Callback quando arquivos mudam (pra sincronizar storage) */
  onFileChange?: (path: string, content: string) => void;
}

/**
 * LocalPreview — preview 100% no navegador, sem servidor externo.
 *
 * Como funciona:
 * 1. Pega os arquivos do projeto (App.tsx, main.tsx, etc.)
 * 2. Gera um HTML único que:
 *    - Importa React/react-dom de esm.sh (CDN)
 *    - Importa outras deps de esm.sh (lucide-react, framer-motion, etc.)
 *    - Transpila JSX/TSX com Babel standalone (carregado via CDN)
 *    - Executa o código no iframe via srcdoc
 * 3. Hot-reload: quando arquivos mudam, regenera o HTML
 *
 * Vantagens sobre Sandpack:
 * - Não depende de bundler runtime remoto (que cai)
 * - Funciona offline (depois de carregar os CDNs uma vez)
 * - Mais rápido pra projetos pequenos
 * - Mostra erros de runtime no overlay
 */

// Converte nome de dependency pra URL do esm.sh
function depToUrl(name: string, version?: string): string {
  const cleanName = name.trim();
  const cleanVersion = version ? `@${version.replace(/[\^~>=<]/g, '')}` : '';
  return `https://esm.sh/${cleanName}${cleanVersion}`;
}

// Extrai dependencies do package.json (se existir)
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

// Gera o HTML completo pro iframe
function buildPreviewHtml(project: SynapProject): string {
  const deps = extractDeps(project);
  const files = project.files;

  // Pega o App.tsx/App.js
  const appFile = files['src/App.tsx'] || files['src/App.js'] || files['App.tsx'] || files['App.js'];
  const mainFile = files['src/main.tsx'] || files['src/main.ts'] || files['src/main.js'] || files['src/index.tsx'] || files['src/index.js'];
  const indexHtml = files['index.html'];

  // Template de deps do React (sempre incluídas)
  const reactVersion = deps['react'] || '18.2.0';
  const reactDomVersion = deps['react-dom'] || reactVersion;

  // Outras deps (sem react/react-dom que já estão no template)
  const otherDeps: Record<string, string> = {};
  for (const [name, version] of Object.entries(deps)) {
    if (name === 'react' || name === 'react-dom' || name === 'react-scripts') continue;
    if (name.startsWith('@types/')) continue;
    if (name === 'typescript' || name === 'vite') continue;
    otherDeps[name] = version;
  }

  // Gera imports de módulos (outros arquivos .tsx/.ts/.js do projeto)
  const moduleFiles = Object.entries(files)
    .filter(([path]) => {
      if (path === 'package.json' || path === 'index.html') return false;
      return path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js');
    })
    .filter(([path]) => path !== 'src/App.tsx' && path !== 'src/App.js' && path !== 'App.tsx' && path !== 'App.js');

  // Converte cada arquivo de módulo pra um "module" inline
  // Usa import maps pra resolver paths relativos
  const importMap: Record<string, string> = {
    'react': `https://esm.sh/react@${reactVersion}`,
    'react-dom': `https://esm.sh/react-dom@${reactDomVersion}`,
    'react-dom/client': `https://esm.sh/react-dom@${reactDomVersion}/client`,
    'react/jsx-runtime': `https://esm.sh/react@${reactVersion}/jsx-runtime`,
  };

  // Adiciona outras deps
  for (const [name, version] of Object.entries(otherDeps)) {
    importMap[name] = depToUrl(name, version);
  }

  // Conteúdo do App (transpilado pelo Babel)
  const appContent = appFile?.content || `export default function App() {
  return <div style={{padding: 20, fontFamily: 'sans-serif'}}>
    <h1>Projeto vazio</h1>
    <p>Crie um arquivo App.tsx com conteúdo.</p>
  </div>;
}`;

  // Conteúdo do main (se existir) ou usa default
  const mainContent = mainFile?.content || `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

  // Custom HTML do index.html (se existir, extrai o body)
  let customStyles = '';
  let customHead = '';
  if (indexHtml) {
    const styleMatch = indexHtml.content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) customStyles = styleMatch[1];
    const headMatch = indexHtml.content.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      // Pega links de CSS externos
      const linkMatches = headMatch[1].matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/gi);
      for (const m of linkMatches) {
        customHead += `<link rel="stylesheet" href="${m[1]}">`;
      }
    }
  }

  // Gera o HTML final
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
  </style>
  <script type="importmap">
  ${JSON.stringify({ imports: importMap }, null, 2)}
  </script>
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <div id="synap-loading">
    <div class="synap-spinner"></div>
    <div>Compilando preview...</div>
  </div>
  <script>
    // Sinaliza pro parent que o iframe carregou
    window.addEventListener('load', function() {
      window.parent.postMessage({ type: 'synap-preview-iframe-loaded' }, '*');
    });

    // Captura erros de runtime e mostra no iframe + manda pro parent
    window.onerror = function(msg, url, line, col, err) {
      var errorHtml = '<div style="padding:20px;font-family:monospace;color:#ef4444;background:#1a0d0d;min-height:100vh"><h3>❌ Erro de runtime</h3><pre style="white-space:pre-wrap;word-break:break-all">' + (err && err.stack ? err.stack : msg) + '</pre></div>';
      var root = document.getElementById('root');
      if (root) root.innerHTML = errorHtml;
      var loading = document.getElementById('synap-loading');
      if (loading) loading.style.display = 'none';
      window.parent.postMessage({
        type: 'synap-preview-error',
        message: (err && err.stack ? err.stack : String(msg))
      }, '*');
      return false;
    };
    window.addEventListener('unhandledrejection', function(event) {
      var root = document.getElementById('root');
      if (root) {
        root.innerHTML += '<div style="padding:10px;font-family:monospace;color:#ef4444;background:#1a0d0d"><strong>Promise rejeitada:</strong><pre style="white-space:pre-wrap">' + (event.reason && event.reason.stack ? event.reason.stack : String(event.reason)) + '</pre></div>';
      }
      window.parent.postMessage({
        type: 'synap-preview-error',
        message: 'Promise rejeitada: ' + (event.reason && event.reason.message ? event.reason.message : String(event.reason))
      }, '*');
    });
  </script>
  <script>
    // Transpila e executa o App + main com Babel
    // Usa fetch + Babel.transform pra garantir ordem de execução
    window.addEventListener('load', function() {
      try {
        // Código do App
        var appCode = ${JSON.stringify(appContent)};
        // Código do main
        var mainCode = ${JSON.stringify(mainContent)};

        // Transpila App primeiro (exporta App)
        var appTransformed = Babel.transform(appCode, {
          presets: ['react', 'typescript'],
          filename: 'App.tsx',
          sourceMaps: 'inline',
        }).code;

        // Transpila main (importa App)
        var mainTransformed = Babel.transform(mainCode, {
          presets: ['react', 'typescript'],
          filename: 'main.tsx',
          sourceMaps: 'inline',
        }).code;

        // Substitui import do App por referência direta
        // Pra evitar problemas com import maps pra arquivos locais
        var combinedCode = '(function() {\\n';
        combinedCode += 'var __synapExports = {};\\n';

        // Wrap do App como module
        combinedCode += 'try {\\n';
        combinedCode += appTransformed.replace(/export\\s+default\\s+/g, '__synapExports.App = ').replace(/export\\s+/g, '__synapExports.');
        combinedCode += '\\n} catch(e) { window.onerror(e.message, "", 0, 0, e); return; }\\n';

        // Wrap do main, com App injetado
        combinedCode += 'try {\\n';
        combinedCode += mainTransformed
          .replace(/import\\s+App\\s+from\\s+['"][\\.\\/]*App['"];?/g, 'var App = __synapExports.App || __synapExports.default;')
          .replace(/import\\s+React\\s+from\\s+['"]react['"];?/g, '')
          .replace(/import\\s+ReactDOM\\s+from\\s+['"]react-dom['"];?/g, '')
          .replace(/import\\s+ReactDOM\\s+from\\s+['"]react-dom\\/client['"];?/g, '');
        combinedCode += '\\n} catch(e) { window.onerror(e.message, "", 0, 0, e); }\\n';

        combinedCode += '})();\\n';

        // Cria script module com o código combinado
        var script = document.createElement('script');
        script.type = 'module';
        script.textContent = combinedCode;
        document.body.appendChild(script);

        // Esconde loading depois de 500ms (deixa o React montar)
        setTimeout(function() {
          var loading = document.getElementById('synap-loading');
          if (loading) loading.style.display = 'none';
          window.parent.postMessage({ type: 'synap-preview-compiled' }, '*');
        }, 500);
      } catch(e) {
        window.onerror(e.message, "", 0, 0, e);
      }
    });
  </script>
</body>
</html>`;
}

export const LocalPreview: React.FC<LocalPreviewProps> = ({ project }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Gera o HTML quando o projeto muda
  const html = useMemo(() => {
    try {
      setError(null);
      return buildPreviewHtml(project);
    } catch (err: any) {
      setError(`Erro ao gerar preview: ${err?.message || err}`);
      return '';
    }
  }, [project, refreshKey]);

  // Recebe mensagens de erro/sucesso do iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'synap-preview-error') {
        setError(event.data.message);
        setLoading(false);
      } else if (event.data?.type === 'synap-preview-compiled') {
        setLoading(false);
      } else if (event.data?.type === 'synap-preview-iframe-loaded') {
        // iframe carregou, mas ainda pode estar compilando
        // Não muda loading aqui — espera 'synap-preview-compiled'
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Timeout: se não compilar em 25s, mostra erro
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setError('Tempo limite excedido (25s). O Babel standalone pode estar lento pra carregar. Tente novamente, ou abra em nova aba.');
      setLoading(false);
    }, 25000);
    return () => clearTimeout(timer);
  }, [loading, refreshKey]);

  // Marca loading quando HTML muda
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
    // Limpa a URL depois de 1 min (deixa a aba abrir)
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="relative w-full h-full bg-white">
      {/* Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 z-20 bg-[#181714] flex flex-col items-center justify-center gap-2 text-[#8c867a]">
          <div className="w-6 h-6 border-2 border-[#d97757]/30 border-t-[#d97757] rounded-full animate-spin" />
          <span className="text-xs">Compilando preview...</span>
        </div>
      )}

      {/* Error overlay */}
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

      {/* iframe com o preview */}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="Preview"
        className="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        onLoad={() => setLoading(false)}
      />

      {/* Botões flutuantes no canto superior direito */}
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
