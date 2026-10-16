import React, { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw, ExternalLink, AlertCircle, MousePointerClick, MessageSquare } from 'lucide-react';
import { SynapProject, SelectedPreviewElement } from '../../lib/types';
import {
  isBabelLoaded,
  loadBabel,
  transpileCode,
  buildPreviewHtmlPreTranspiled,
  normalizePath,
} from '../../lib/preview-html';

interface LocalPreviewProps {
  project: SynapProject;
  selectedElementsCount?: number;
  onSelectElement?: (element: SelectedPreviewElement) => void;
  onNavigateToChat?: () => void;
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

export const LocalPreview: React.FC<LocalPreviewProps> = ({
  project,
  selectedElementsCount = 0,
  onSelectElement,
  onNavigateToChat,
}) => {
  const transpiledCacheRef = useRef<Record<string, { raw: string; compiled: string }>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
  const [isInspectActive, setIsInspectActive] = useState<boolean>(false);

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

  // Escuta mensagens do iframe: confirmação de prontidão e seleção de elementos
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === '__SYNAP_PREVIEW_READY__') {
        setIsReady(true);
      } else if (event.data && event.data.type === '__SYNAP_ELEMENT_SELECTED__') {
        if (event.data.element && onSelectElement) {
          onSelectElement(event.data.element);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSelectElement]);

  // Sincroniza o modo de inspeção visual com o iframe
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          { type: '__SYNAP_SET_INSPECT_MODE__', active: isInspectActive },
          '*'
        );
      } catch (err) {
        console.warn('[LocalPreview] Falha ao sincronizar modo de inspeção com o iframe:', err);
      }
    }
  }, [isInspectActive, isReady]);

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
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[color:var(--c-bg-181714,#181714)]/90 backdrop-blur-md border border-[color:var(--c-bg-2d2b26,#2d2b26)]/80 shadow-lg">
        {/* Botão de Modo Seleção de Componentes (estilo Google AI Studio / Element Inspector) */}
        <button
          type="button"
          onClick={() => setIsInspectActive((prev) => !prev)}
          title={isInspectActive ? 'Modo Seleção Ativo: clique em elementos do preview' : 'Ativar Modo Seleção de Componentes'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer active:scale-95 ${
            isInspectActive
              ? 'bg-[#d97757]/20 text-[#d97757] border border-[#d97757]/60 shadow-[0_0_12px_rgba(217,119,87,0.3)]'
              : 'text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-[color:var(--c-fg-f3efe6,#f3efe6)] hover:bg-[color:var(--c-bg-25231e,#25231e)]'
          }`}
        >
          <MousePointerClick className={`w-4 h-4 ${isInspectActive ? 'animate-pulse text-[#d97757]' : ''}`} />
          <span className="hidden sm:inline">
            {isInspectActive ? 'Selecionando...' : 'Selecionar'}
          </span>
        </button>

        {/* Pill de Elementos Selecionados */}
        {selectedElementsCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#d97757]/15 border border-[#d97757]/40 text-[#d97757] text-xs animate-in fade-in zoom-in-95 duration-150">
            <span className="font-semibold">{selectedElementsCount}</span>
            <span className="hidden sm:inline">selecionado{selectedElementsCount > 1 ? 's' : ''}</span>
            {onNavigateToChat && (
              <button
                type="button"
                onClick={onNavigateToChat}
                title="Voltar ao Chat com os componentes selecionados"
                className="ml-1 px-1.5 py-0.5 rounded bg-[#d97757] text-white hover:bg-[#c56546] font-medium flex items-center gap-1 cursor-pointer transition-colors text-[11px]"
              >
                <MessageSquare className="w-3 h-3" />
                <span>Chat</span>
              </button>
            )}
          </div>
        )}

        <div className="w-[1px] h-4 bg-[color:var(--c-bg-2d2b26,#2d2b26)] mx-0.5" />

        <button
          type="button"
          onClick={handleRefresh}
          title="Recarregar Preview"
          className="p-1.5 sm:p-2 rounded-lg text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-[color:var(--c-fg-f3efe6,#f3efe6)] hover:bg-[color:var(--c-bg-25231e,#25231e)] active:scale-95 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#d97757]' : ''}`} />
        </button>
        <button
          type="button"
          onClick={handleOpenNewTab}
          title="Abrir em nova aba"
          className="p-1.5 sm:p-2 rounded-lg text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-[color:var(--c-fg-f3efe6,#f3efe6)] hover:bg-[color:var(--c-bg-25231e,#25231e)] active:scale-95 transition-all cursor-pointer"
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
          ref={iframeRef}
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
