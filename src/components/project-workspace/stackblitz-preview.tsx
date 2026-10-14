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

  // Converte projeto Synap pra formato do StackBlitz
  const buildStackBlitzProject = useCallback(() => {
    // Pega dependências do package.json
    let dependencies: Record<string, string> = {};
    const pkgFile = project.files['package.json'];
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        dependencies = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
      } catch {}
    }

    // Converte arquivos: SynapProject.files → Record<string, string>
    const files: Record<string, string> = {};
    for (const [path, file] of Object.entries(project.files)) {
      files[path] = file.content;
    }

    // Garante que tem index.html (StackBlitz precisa)
    if (!files['index.html']) {
      files['index.html'] = `<!doctype html>
<html lang="pt-br">
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    }

    // Determina template baseado no projeto
    const hasPackageJson = !!pkgFile;
    const template: 'node' | 'create-react-app' = hasPackageJson ? 'node' : 'create-react-app';

    return {
      title: project.name || 'Synap Preview',
      description: project.description || '',
      template,
      files,
      dependencies: template === 'node' ? undefined : dependencies,
    };
  }, [project]);

  // Embed do StackBlitz quando projeto muda
  useEffect(() => {
    if (!containerRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const sbProject = buildStackBlitzProject();

      // Limpa container anterior
      containerRef.current.innerHTML = '';

      // Embed do projeto
      StackBlitzSDK.embedProject(containerRef.current, sbProject, {
        openFile: 'src/App.tsx',
        view: 'preview',
        theme: 'dark',
        hideExplorer: true,
        hideDevTools: false,
        devToolsHeight: 20,
        clickToLoad: false,
        forceEmbedLayout: true,
      });

      // StackBlitz não tem callback de "pronto", então espera um pouco
      const timer = setTimeout(() => {
        setLoading(false);
      }, 3000);

      return () => clearTimeout(timer);
    } catch (err: any) {
      setError('Erro ao carregar StackBlitz: ' + (err?.message || err));
      setLoading(false);
    }
  }, [project, refreshKey, buildStackBlitzProject]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLoading(true);
    setError(null);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    const sbProject = buildStackBlitzProject();
    StackBlitzSDK.openProject(sbProject, {
      openFile: 'src/App.tsx',
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

      {/* Container do StackBlitz */}
      <div
        ref={containerRef}
        className="w-full h-full"
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
