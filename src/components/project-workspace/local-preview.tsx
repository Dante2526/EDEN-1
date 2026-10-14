import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { SynapProject } from '../../lib/types';
import { buildPreviewHtmlPreTranspiled, loadBabel, transpileCode } from '../../lib/preview-html';

interface LocalPreviewProps {
  project: SynapProject;
  onFileChange?: (path: string, content: string) => void;
}

/**
 * LocalPreview — preview 100% no navegador, sem servidor externo.
 *
 * Usa buildPreviewHtmlFromProject (módulo testável) pra gerar o HTML
 * do iframe. O HTML transpila JSX/TSX com Babel standalone (CDN)
 * e resolve imports via import maps + blob URLs.
 *
 * Requer CSP no vercel.json que libere:
 * - unpkg.com (Babel)
 * - esm.sh (React, deps)
 * - blob: (módulos transpilados)
 */

export const LocalPreview: React.FC<LocalPreviewProps> = ({ project }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Gera o HTML: transpila no parent (Babel carregado 1x) e manda pro iframe
  const [html, setHtml] = useState('');
  const [babelLoading, setBabelLoading] = useState(false);

  // Carrega Babel na primeira vez
  useEffect(() => {
    loadBabel().then(() => setBabelLoading(false)).catch((err) => {
      setError('Falha ao carregar Babel: ' + (err?.message || err));
      setLoading(false);
    });
  }, []);

  // Transpila e gera HTML quando projeto muda
  useEffect(() => {
    if (!project) return;
    setLoading(true);
    setError(null);

    loadBabel().then(() => {
      try {
        // Transpila cada arquivo no parent
        const transpiledFiles: Array<{ path: string; code: string }> = [];
        for (const [path, file] of Object.entries(project.files)) {
          if (path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js')) {
            if (path === 'package.json' || path === 'index.html') continue;
            try {
              const transpiled = transpileCode(file.content, path);
              transpiledFiles.push({ path, code: transpiled });
            } catch (e: any) {
              console.warn('[Preview] Erro ao transpilar', path, e);
              // Mesmo com erro, inclui o arquivo original (vai falhar no require)
              transpiledFiles.push({ path, code: `// Erro: ${e?.message}\nthrow new Error("Erro ao transpilar ${path}: ${e?.message}");` });
            }
          }
        }
        const generatedHtml = buildPreviewHtmlPreTranspiled(project, transpiledFiles);
        setHtml(generatedHtml);
      } catch (err: any) {
        setError('Erro ao gerar preview: ' + (err?.message || err));
        setLoading(false);
      }
    }).catch((err: any) => {
      setError('Falha ao carregar Babel: ' + (err?.message || err));
      setLoading(false);
    });
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

  // Timeout: 60s (Babel é 3MB, pode demorar em conexão lenta)
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setError('Tempo limite excedido (60s). Possíveis causas:\n\n1. Babel standalone (3MB) demorando pra carregar do unpkg.com\n2. Deps do esm.sh demorando (firebase, etc)\n3. Problema de conexão\n\nClique em ↗ pra abrir em nova aba e ver o erro no DevTools (F12).');
      setLoading(false);
    }, 60000);
    return () => clearTimeout(timer);
  }, [loading, refreshKey]);

  // Setar HTML no iframe via blob URL (não herda CSP da página pai)
  useEffect(() => {
    if (!iframeRef.current || !html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [html, refreshKey]);

  useEffect(() => {
    setLoading(true);
  }, [html]);

  // Refresh que REALMENTE recarrega o iframe
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLoading(true);
    setError(null);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, [html]);

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
              className="p-1 hover:bg-[#282622] rounded text-[#8c867a] hover:text-[#f3efe6] cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="bg-rose-950/40 border border-rose-500/40 rounded-lg p-3">
            <pre className="text-[10px] text-rose-200 font-mono whitespace-pre-wrap break-all overflow-x-auto">{error}</pre>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#c4663f] text-white text-xs font-medium transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22201d] hover:bg-[#2b2924] border border-[#3b3831] text-[#b8b3a8] hover:text-[#f3efe6] text-xs font-medium transition cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              Abrir em nova aba
            </button>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        title="Preview"
        className="w-full h-full border-0 bg-white"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
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
