import React, { useState, useMemo } from 'react';
import {
  Layout,
  Smartphone,
  Monitor,
  RotateCw,
  ExternalLink,
  Check,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { CanvasPrototype } from '../lib/types';
import { sanitizePrototypeHtml } from '../lib/canvas-prototype';

interface CanvasPrototypeCardProps {
  prototype: CanvasPrototype;
  onApprove?: (prototype: CanvasPrototype) => void;
  onRequestChanges?: (prototype: CanvasPrototype) => void;
}

export const CanvasPrototypeCard: React.FC<CanvasPrototypeCardProps> = ({
  prototype,
  onApprove,
  onRequestChanges,
}) => {
  const [viewport, setViewport] = useState<'mobile' | 'desktop'>(prototype.viewport || 'mobile');
  const [iframeKey, setIframeKey] = useState(0);

  const sanitizedHtml = useMemo(() => {
    return sanitizePrototypeHtml(prototype.html);
  }, [prototype.html]);

  const handleReload = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenNewTab = () => {
    const blob = new Blob([sanitizedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  };

  const isApproved = prototype.status === 'approved';
  const isRejected = prototype.status === 'rejected';

  return (
    <div className="w-full my-3 rounded-2xl overflow-hidden border border-amber-500/30 bg-[color:var(--c-bg-181714)] shadow-xl transition-all">
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[color:var(--c-bg-201e1a)] border-b border-amber-500/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
            <Layout className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                {prototype.title || 'Protótipo Visual no Canvas'}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Canvas Figma/v0
              </span>
            </div>
            {prototype.description && (
              <p className="text-[10px] text-[color:var(--c-fg-a39d93)] truncate max-w-[240px] sm:max-w-[420px]">
                {prototype.description}
              </p>
            )}
          </div>
        </div>

        {/* Controles de Visualização */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Seletor Mobile / Desktop */}
          <div className="flex items-center p-0.5 rounded-lg bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-2d2a25)] text-xs">
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition cursor-pointer flex items-center gap-1 ${
                viewport === 'mobile'
                  ? 'bg-amber-500/20 text-amber-300 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Visualização Mobile (375px)"
            >
              <Smartphone className="w-3 h-3" />
              <span className="hidden sm:inline">Mobile</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition cursor-pointer flex items-center gap-1 ${
                viewport === 'desktop'
                  ? 'bg-amber-500/20 text-amber-300 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Visualização Desktop (100%)"
            >
              <Monitor className="w-3 h-3" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleReload}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[color:var(--c-bg-282622)] transition cursor-pointer"
            title="Recarregar protótipo"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleOpenNewTab}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-[color:var(--c-bg-282622)] transition cursor-pointer"
            title="Abrir protótipo em tela cheia"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Área do Canvas Sandbox */}
      <div className="p-3 bg-zinc-950/80 flex justify-center items-center min-h-[420px] max-h-[580px] overflow-hidden">
        <div
          className={`transition-all duration-300 w-full flex justify-center ${
            viewport === 'mobile' ? 'max-w-[375px]' : 'max-w-full'
          }`}
        >
          <div
            className={`w-full bg-zinc-950 overflow-hidden shadow-2xl transition-all ${
              viewport === 'mobile'
                ? 'rounded-3xl border-4 border-zinc-800 h-[500px]'
                : 'rounded-xl border border-zinc-800 h-[480px]'
            }`}
          >
            <iframe
              key={iframeKey}
              srcDoc={sanitizedHtml}
              title={prototype.title || 'Canvas Prototype'}
              sandbox="allow-scripts allow-forms allow-modals"
              className="w-full h-full border-0 bg-zinc-950"
            />
          </div>
        </div>
      </div>

      {/* Rodapé com Ações de Aprovação e Ajustes */}
      <div className="px-3.5 py-2.5 bg-[color:var(--c-bg-201e1a)] border-t border-amber-500/20 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--c-fg-a39d93)]">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Interaja com os botões e campos acima para testar o fluxo.</span>
        </div>

        <div className="flex items-center gap-2">
          {isApproved ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <Check className="w-3.5 h-3.5" />
              <span>Design Aprovado</span>
            </div>
          ) : isRejected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium">
              <span>Ajustes solicitados</span>
            </div>
          ) : (
            <>
              {onRequestChanges && (
                <button
                  type="button"
                  onClick={() => onRequestChanges(prototype)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Pedir Ajustes</span>
                </button>
              )}
              {onApprove && (
                <button
                  type="button"
                  onClick={() => onApprove(prototype)}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-[0_2px_10px_rgba(16,185,129,0.3)]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Aprovar e Gerar Código</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
