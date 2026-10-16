import React, { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { SynapProject } from '../../lib/types';
import { loadBabel, transpileCode, buildPreviewHtmlPreTranspiled, normalizePath } from '../../lib/preview-html';

interface LocalPreviewProps {
  project: SynapProject;
}

export const LocalPreview: React.FC<LocalPreviewProps> = ({ project }) => {
  const [srcDoc, setSrcDoc] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const transpiledCacheRef = useRef<Record<string, { raw: string; compiled: string }>>({});

  const compileProject = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await loadBabel();

      const preTranspiled: Record<string, string> = {};
      const cache = transpiledCacheRef.current;

      for (const [rawPath, file] of Object.entries(project.files || {})) {
        const path = normalizePath(rawPath);
        const content = typeof file === 'string' ? file : file.content;
        if (/\.(tsx|ts|jsx|js)$/.test(path) && !path.endsWith('.d.ts') && !path.includes('vite.config')) {
          if (cache[path] && cache[path].raw === content) {
            preTranspiled[path] = cache[path].compiled;
          } else {
            const compiled = transpileCode(content, path);
            cache[path] = { raw: content, compiled };
            preTranspiled[path] = compiled;
          }
        }
      }

      const html = buildPreviewHtmlPreTranspiled(project, preTranspiled);
      setSrcDoc(html);
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao transpilar o projeto.');
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    const timer = setTimeout(() => {
      compileProject();
    }, 250);
    return () => clearTimeout(timer);
  }, [compileProject, refreshKey]);

  const handleRefresh = () => {
    transpiledCacheRef.current = {};
    setRefreshKey((k) => k + 1);
  };

  const handleOpenNewTab = () => {
    if (!srcDoc) return;
    const blob = new Blob([srcDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 overflow-hidden">
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
        <button
          onClick={handleRefresh}
          title="Recarregar Preview"
          className="p-2 rounded-lg bg-white/90 hover:bg-white text-zinc-800 shadow-md border border-zinc-200 transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={handleOpenNewTab}
          title="Abrir em nova aba"
          className="p-2 rounded-lg bg-white/90 hover:bg-white text-zinc-800 shadow-md border border-zinc-200 transition cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm text-zinc-300 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          <span className="text-xs font-medium">Compilando preview...</span>
        </div>
      )}

      {error ? (
        <div className="p-6 text-red-400 flex flex-col gap-2 bg-zinc-900 m-4 rounded-xl border border-red-500/30">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span>Falha ao compilar o Preview</span>
          </div>
          <pre className="text-xs whitespace-pre-wrap break-words text-red-300/90 mt-1 font-mono">
            {error}
          </pre>
        </div>
      ) : (
        <iframe
          key={refreshKey}
          srcDoc={srcDoc}
          title={project.name || 'Synap Preview'}
          className="w-full h-full flex-1 border-0 bg-transparent"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      )}
    </div>
  );
};

export default LocalPreview;
