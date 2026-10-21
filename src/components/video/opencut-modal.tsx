import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  X,
  ExternalLink,
  RefreshCw,
  Video,
  Maximize2,
  Minimize2,
  Sparkles,
  Smartphone,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import { VideoAspectRatio } from '../../lib/types';
import { buildOpenCutUrl, buildOpenCutTranslatedUrl } from '../../lib/opencut-integration';

export interface OpenCutModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle?: string;
  initialAspectRatio?: VideoAspectRatio;
  scriptDescription?: string;
}

export const OpenCutModal: React.FC<OpenCutModalProps> = ({
  isOpen,
  onClose,
  projectTitle = 'Projeto Éden',
  initialAspectRatio = '9:16',
  scriptDescription,
}) => {
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(initialAspectRatio);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [key, setKey] = useState<number>(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Trava contra Ghost Click no celular: evita que o toque que abriu o modal
  // dispare o botão fechar nos primeiros 350ms (delay do event bubble no mobile)
  const openedAtRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      setAspectRatio(initialAspectRatio);
      setIsLoading(true);
      setHasError(false);
    }
  }, [isOpen, initialAspectRatio]);

  // Fallback de segurança: se onLoad demorar mais de 8s, esconde o loading
  useEffect(() => {
    if (!isOpen || !isLoading) return;
    const timer = setTimeout(() => setIsLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [isOpen, isLoading, key]);

  if (!isOpen) return null;

  // Handler seguro: trava cliques fantasmas nos primeiros 350ms após abrir
  const handleSafeClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (Date.now() - openedAtRef.current < 350) {
      return; // ghost click — ignora
    }
    onClose();
  };

  // URL traduzida PT-BR (agora é o padrão — usa proxy próprio do Éden)
  const translatedUrl = buildOpenCutTranslatedUrl({
    projectTitle,
    aspectRatio,
  });

  // URL original em inglês (alternativa caso usuário prefira)
  const originalUrl = buildOpenCutUrl({
    projectTitle,
    aspectRatio,
    language: 'en',
  });

  // Iframe usa traduzido por padrão
  const openCutUrl = translatedUrl;

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    setKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    // Botão "Nova Aba" abre versão traduzida PT-BR em nova aba
    window.open(translatedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenOriginal = () => {
    // Alternativa: abrir original em inglês
    window.open(originalUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenTranslated = () => {
    window.open(translatedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-3 md:p-4"
    >
      {/* Container Principal: Tela cheia no mobile (<640px), modal amplo no desktop */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex flex-col bg-[color:var(--c-bg-181714)] border border-[color:var(--c-bg-38352e)] shadow-2xl transition-all duration-200 overflow-hidden ${
          isFullScreen
            ? 'fixed inset-0 w-full h-full rounded-none z-50'
            : 'w-full h-full sm:h-[92vh] sm:w-[96vw] lg:w-[96vw] lg:h-[94vh] max-w-7xl sm:rounded-2xl'
        }`}
      >
        {/* Cabeçalho Responsivo Mobile-First & Desktop */}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-[color:var(--c-bg-201e1a)] border-b border-[color:var(--c-bg-38352e)] flex items-center justify-between gap-2 shrink-0">
          {/* Esquerda: Botão Voltar + Título */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleSafeClose}
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] px-2.5 py-1.5 flex items-center justify-center gap-1.5 rounded-xl bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-[color:var(--c-fg-f3efe6)] transition cursor-pointer text-xs font-medium"
              title="Voltar ao Chat"
              aria-label="Voltar ao Chat"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Voltar</span>
            </button>

            <div className="flex items-center gap-2 truncate">
              <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Video className="w-4 h-4 text-rose-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                    OpenCut Video Studio
                  </span>
                  <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
                    CapCut Open Source
                  </span>
                </div>
                <p className="text-[10px] text-[color:var(--c-fg-8c867a)] truncate">
                  {projectTitle} • 100% no navegador (Mobile & PC)
                </p>
              </div>
            </div>
          </div>

          {/* Centro/Direita: Controles e Ações */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Abrir Traduzido PT-BR com 1 clique */}
            <button
              type="button"
              onClick={handleOpenTranslated}
              className="min-h-[44px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0"
              title="Abrir OpenCut 100% Traduzido em Português (PT-BR) em Nova Aba"
              aria-label="Abrir Traduzido em Português (PT-BR)"
            >
              <span className="text-sm">🇧🇷</span>
              <span className="hidden sm:inline">Traduzido (PT-BR)</span>
              <span className="sm:hidden">PT-BR</span>
            </button>

            {/* Seletor de Aspect Ratio (Compacto) */}
            <div className="flex items-center p-0.5 rounded-lg bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] text-[11px]">
              <button
                type="button"
                onClick={() => setAspectRatio('9:16')}
                className={`px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition ${
                  aspectRatio === '9:16'
                    ? 'bg-rose-500/20 text-rose-300 font-medium'
                    : 'text-[color:var(--c-fg-8c867a)] hover:text-white'
                }`}
                title="Proporção 9:16 (TikTok, Reels, Shorts)"
              >
                <Smartphone className="w-3 h-3" />
                <span>9:16</span>
              </button>
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition ${
                  aspectRatio === '16:9'
                    ? 'bg-rose-500/20 text-rose-300 font-medium'
                    : 'text-[color:var(--c-fg-8c867a)] hover:text-white'
                }`}
                title="Proporção 16:9 (YouTube, Horizontal/PC)"
              >
                <Monitor className="w-3 h-3" />
                <span>16:9</span>
              </button>
            </div>

            {/* Recarregar */}
            <button
              type="button"
              onClick={handleRefresh}
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] p-2 rounded-xl bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer flex items-center justify-center"
              title="Recarregar editor"
              aria-label="Recarregar editor"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
            </button>

            {/* Abrir em Nova Aba */}
            <button
              type="button"
              onClick={handleOpenExternal}
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] px-2.5 py-1.5 rounded-xl bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer flex items-center justify-center gap-1.5 text-xs font-medium"
              title="Abrir em Nova Aba / Janela Cheia"
              aria-label="Abrir em Nova Aba"
            >
              <ExternalLink className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden md:inline">Nova Aba</span>
            </button>

            {/* Toggle Fullscreen (PC/Tablet) */}
            <button
              type="button"
              onClick={() => setIsFullScreen((prev) => !prev)}
              className="hidden sm:flex min-h-[36px] min-w-[36px] p-2 rounded-xl bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer items-center justify-center"
              title={isFullScreen ? 'Reduzir para Janela' : 'Maximizar para Tela Cheia'}
              aria-label="Alternar Tela Cheia"
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Fechar (Apenas Desktop - no Mobile o botão Voltar já fecha) */}
            <button
              type="button"
              onClick={handleSafeClose}
              className="hidden sm:flex min-h-[36px] min-w-[36px] p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-rose-950/40 transition cursor-pointer items-center justify-center"
              title="Fechar editor"
              aria-label="Fechar editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notificação/Roteiro Rápido se houver */}
        {scriptDescription && (
          <div className="px-3 py-1.5 bg-rose-950/30 border-b border-rose-500/20 flex items-center justify-between text-xs text-rose-200">
            <div className="flex items-center gap-1.5 truncate">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{scriptDescription}</span>
            </div>
            <span className="text-[10px] text-rose-300/80 shrink-0 ml-2 hidden sm:inline">
              Roteiro sugerido pela IA
            </span>
          </div>
        )}

        {/* Corpo: Iframe do OpenCut */}
        <div className="relative flex-1 w-full h-full min-h-0 bg-[#0d0c0a]">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[color:var(--c-bg-181714)]/90 backdrop-blur-xs text-center p-4 space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center animate-pulse">
                <Video className="w-5 h-5 text-rose-400" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-[color:var(--c-fg-f3efe6)]">
                  Carregando OpenCut Video Studio...
                </div>
                <p className="text-xs text-[color:var(--c-fg-8c867a)] max-w-xs">
                  Iniciando motor de edição no navegador com aceleração de GPU
                </p>
              </div>
            </div>
          )}

          {hasError ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[color:var(--c-bg-181714)] text-center p-6 space-y-4">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <div className="space-y-1 max-w-md">
                <div className="text-sm font-semibold text-[color:var(--c-fg-f3efe6)]">
                  Não foi possível carregar o OpenCut no frame embutido
                </div>
                <p className="text-xs text-[color:var(--c-fg-8c867a)]">
                  O navegador ou políticas de segurança podem bloquear a exibição direta em frame. Você pode abrir o OpenCut em uma nova aba com 1 clique:
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-xs text-white cursor-pointer"
                >
                  Tentar Novamente
                </button>
                <button
                  type="button"
                  onClick={handleOpenTranslated}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-semibold text-white shadow-lg cursor-pointer flex items-center gap-2"
                >
                  <span>🇧🇷</span>
                  <span>Abrir Traduzido (PT-BR) em Nova Aba</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenOriginal}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg cursor-pointer flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir Original (EN)</span>
                </button>
              </div>
            </div>
          ) : (
            <iframe
              key={key}
              ref={iframeRef}
              src={openCutUrl}
              title="OpenCut Video Studio"
              className="w-full h-full border-0"
              allow="autoplay; camera; microphone; clipboard-write; fullscreen; web-share; display-capture; cross-origin-isolated"
              // SANDBOX: bloqueia 100% qualquer tentativa do iframe de fazer
              // frame-busting (window.top.location = ...) que recarregaria o Éden
              // e voltaria pra tela de chat. SEM allow-top-navigation propositalmente.
              // Permite: scripts (React), same-origin (proxy próprio), forms (inputs),
              // popups (auth OAuth), modals, downloads (exportar vídeo).
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
            />
          )}
        </div>

        {/* Rodapé Mobile-First com Dicas de Operação */}
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-[color:var(--c-bg-201e1a)] border-t border-[color:var(--c-bg-38352e)] flex items-center justify-between text-[11px] text-[color:var(--c-fg-8c867a)] shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] shrink-0" />
            <span className="truncate">
              Edição sem servidor: arquivos locais salvos no dispositivo • 🇧🇷 100% em português com 1 toque
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-[color:var(--c-fg-6b655b)]">
            <span>WebCodecs</span>
            <span>•</span>
            <span>Canvas 2D</span>
            <span>•</span>
            <span>WASM</span>
          </div>
        </div>
      </div>
    </div>
  );
};
