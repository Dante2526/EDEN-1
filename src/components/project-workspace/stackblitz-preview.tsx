import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { SynapProject } from '../../lib/types';
import StackBlitzSDK from '@stackblitz/sdk';

interface StackBlitzPreviewProps {
  project: SynapProject;
}

/**
 * StackBlitzPreview — usa StackBlitz WebContainer SDK.
 * Roda Node.js completo no navegador via WebAssembly.
 * Suporta TUDO: Tailwind, Firebase, Next.js, TypeScript, etc.
 * Igual ao Google AI Studio.
 */
export const StackBlitzPreview: React.FC<StackBlitzPreviewProps> = ({ project }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const buildStackBlitzProject = useCallback(() => {
    // 1. Normaliza todos os paths removendo barra inicial ("/src/App.tsx" -> "src/App.tsx")
    const files: Record<string, string> = {};
    for (const [rawPath, file] of Object.entries(project.files)) {
      const cleanPath = rawPath.replace(/^\/+/, '');
      files[cleanPath] = file.content;
    }

    // 2. Lê dependências do package.json (já com path normalizado)
    let dependencies: Record<string, string> = {};
    const pkgContent = files['package.json'];
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      } catch {}
    }

    // 3. Detecta o entry point real do projeto (suporta Vite/GitHub e AI Studio)
    const entryScript =
      files['src/main.tsx'] ? '/src/main.tsx' :
      files['src/index.tsx'] ? '/src/index.tsx' :
      files['index.tsx'] ? '/index.tsx' :
      files['src/main.jsx'] ? '/src/main.jsx' :
      '/src/main.tsx';

    if (!files['index.html']) {
      files['index.html'] = `<!doctype html>\n<html lang="pt-br">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${project.name || 'Preview'}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="${entryScript}"></script>\n  </body>\n</html>`;
    }

    // 4. Detecta um arquivo válido para o openFile não quebrar
    const candidateFiles = ['src/App.tsx', 'App.tsx', 'src/App.jsx', 'App.jsx', 'src/main.tsx', 'index.tsx'];
    const openFile = candidateFiles.find((f) => !!files[f]) || Object.keys(files)[0] || 'index.html';

    const hasPackageJson = !!pkgContent;
    const template: 'node' | 'create-react-app' = hasPackageJson ? 'node' : 'create-react-app';

    return {
      sbProject: {
        title: project.name || 'Synap Preview',
        description: project.description || '',
        template,
        files,
        dependencies: template === 'node' ? undefined : dependencies,
      },
      openFile,
    };
  }, [project]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isCancelled = false;
    setLoading(true);
    setError(null);

    // Limpa o container e cria um elemento filho descartável
    // (pois o StackBlitzSDK.embedProject faz replaceChild no elemento alvo!)
    container.innerHTML = '';
    const mountTarget = document.createElement('div');
    mountTarget.style.width = '100%';
    mountTarget.style.height = '100%';
    container.appendChild(mountTarget);

    const fallbackTimer = setTimeout(() => {
      if (!isCancelled) setLoading(false);
    }, 4500);

    try {
      const { sbProject, openFile } = buildStackBlitzProject();

      StackBlitzSDK.embedProject(mountTarget, sbProject, {
        openFile,
        view: 'preview',
        theme: 'dark',
        hideExplorer: true,
        hideNavigation: true,
        hideDevTools: false,
        devToolsHeight: 20,
        clickToLoad: false,
        forceEmbedLayout: true,
        height: '100%',
        crossOriginIsolated: true, // CRÍTICO: adiciona ?corp=1 e allow="cross-origin-isolated"
      })
        .then(() => {
          if (!isCancelled) {
            clearTimeout(fallbackTimer);
            setLoading(false);
          }
        })
        .catch((err: any) => {
          if (!isCancelled) {
            clearTimeout(fallbackTimer);
            setError('Erro ao iniciar VM do StackBlitz: ' + (err?.message || err));
            setLoading(false);
          }
        });
    } catch (err: any) {
      clearTimeout(fallbackTimer);
      setError('Erro ao carregar StackBlitz: ' + (err?.message || err));
      setLoading(false);
    }

    return () => {
      isCancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, [project, refreshKey, buildStackBlitzProject]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLoading(true);
    setError(null);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    const { sbProject, openFile } = buildStackBlitzProject();
    StackBlitzSDK.openProject(sbProject, {
      openFile,
      view: 'preview',
      theme: 'dark',
    });
  }, [buildStackBlitzProject]);

  return (
    <div className="relative w-full h-full bg-white">
      {loading && !error && (
        <div className="absolute inset-0 z-20 bg-[#181714] flex flex-col items-center justify-center gap-2 text-[#8c867a]">
          <div className="w-6 h-6 border-2 border-[#d97757]/30 border-t-[#d97757] rounded-full animate-spin" />
          <span className="text-xs">Carregando StackBlitz...</span>
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
              className="p-1 hover:bg-[#282622] rounded text-[#8c867a] hover:text-[#f3efe6] cursor-pointer"
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

      {/* Container do StackBlitz — [&>iframe] garante iframe 100% no mobile */}
      <div
        ref={containerRef}
        className="w-full h-full flex-1 [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
        style={{ minHeight: '400px' }}
      />

      {/* Botões flutuantes */}
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
          title="Abrir no StackBlitz (nova aba)"
          className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-[#5e5a52] hover:text-[#181714] transition cursor-pointer shadow-sm backdrop-blur-sm"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
