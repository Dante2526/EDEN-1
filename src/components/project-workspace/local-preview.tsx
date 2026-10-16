import React, { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { SynapProject } from '../../lib/types';
import {
  isBabelLoaded,
  loadBabel,
  transpileCode,
  buildPreviewHtmlPreTranspiled,
  normalizePath,
} from '../../lib/preview-html';

interface LocalPreviewProps {
  project: SynapProject;
}

function buildTranspiledHtmlSync(
  project: SynapProject,
  cache: Record<string, { raw: string; compiled: string }>
): string {
  const preTranspiled: Record<string, string> = {};
  for (const [rawPath, file] of Object.entries(project.files || {})) {
    const path = normalizePath(rawPath);
    const content = typeof file === 'string' ? file : file.content;
    if (
      /\.(tsx|ts|jsx|js)$/.test(path) &&
      !path.endsWith('.d.ts') &&
      !path.includes('vite.config') &&
      !path.includes('vitest.config') &&
      !path.includes('.test.')
    ) {
      if (cache[path] && cache[path].raw === content) {
        preTranspiled[path] = cache[path].compiled;
      } else {
        const compiled = transpileCode(content, path);
        cache[path] = { raw: content, compiled };
        preTranspiled[path] = compiled;
      }
    }
  }
  return buildPreviewHtmlPreTranspiled(project, preTranspiled);
}

export const LocalPreview: React.FC<LocalPreviewProps> = ({ project }) => {
  const transpiledCacheRef = useRef<Record<string, { raw: string; compiled: string }>>({});

  // Se o Babel já estiver em memória (ou projeto estático HTML puro), compila sincronamente no 1º render (0ms)
  const [srcDoc, setSrcDoc] = useState<string>(() => {
    try {
      if (project.template === 'static' || isBabelLoaded()) {
        return buildTranspiledHtmlSync(project, transpiledCacheRef.current);
      }
    } catch {
      // Fallback para compilação assíncrona no useEffect
    }
    return '';
  });

  const [isReady, setIsReady] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const compileProject = useCallback(async () => {
    try {
      setError(null);
      if (project.template !== 'static' && !isBabelLoaded()) {
        await loadBabel();
      }
      const html = buildTranspiledHtmlSync(project, transpiledCacheRef.current);
      setSrcDoc((prev) => {
        if (prev !== html) {
          return html;
        }
        return prev;
      });
      setIsRefreshing(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao transpilar o projeto.');
      setIsRefreshing(false);
      setIsReady(true);
    }
  }, [project]);

  // Compila imediatamente sem atraso artificial de 250ms
  useEffect(() => {
    compileProject();
  }, [compileProject, refreshKey]);

  // Escuta confirmação de renderização do iframe (__SYNAP_PREVIEW_READY__) para revelar sem flash branco
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === '__SYNAP_PREVIEW_READY__') {
        setIsReady(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRefresh = () => {
    transpiledCacheRef.current = {};
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
  };

  const handleOpenNewTab = () => {
    if (!srcDoc) return;
    const blob = new Blob([srcDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#09090b] overflow-hidden">
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
        <button
          onClick={handleRefresh}
          title="Recarregar Preview"
          className="p-2 rounded-lg bg-white/90 hover:bg-white text-zinc-800 shadow-md border border-zinc-200 transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={handleOpenNewTab}
          title="Abrir em nova aba"
          className="p-2 rounded-lg bg-white/90 hover:bg-white text-zinc-800 shadow-md border border-zinc-200 transition cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

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
      ) : srcDoc ? (
        <iframe
          key={refreshKey}
          srcDoc={srcDoc}
          title={project.name || 'Synap Preview'}
          onLoad={() => setIsReady(true)}
          style={{
            backgroundColor: '#09090b',
            opacity: isReady ? 1 : 0,
            transition: 'opacity 80ms ease-out',
          }}
          className="w-full h-full flex-1 border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      ) : null}
    </div>
  );
};

export default LocalPreview;
