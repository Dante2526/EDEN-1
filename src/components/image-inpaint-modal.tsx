import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  RotateCcw,
  Paintbrush,
  Eraser,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getCanvasCoordinates } from '../lib/image-inpaint';

export interface ImageInpaintModalProps {
  isOpen: boolean;
  imageUrl: string;
  originalPrompt?: string;
  aspectRatio?: string;
  onClose: () => void;
  onSubmit: (params: { image: string; mask: string; prompt: string; aspectRatio?: string }) => Promise<void>;
}

export const ImageInpaintModal: React.FC<ImageInpaintModalProps> = ({
  isOpen,
  imageUrl,
  originalPrompt,
  aspectRatio = '1:1',
  onClose,
  onSubmit,
}) => {
  const [brushSize, setBrushSize] = useState<number>(32);
  const [toolMode, setToolMode] = useState<'brush' | 'eraser'>('brush');
  const [prompt, setPrompt] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasPainted, setHasPainted] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Inicializa a imagem no canvas com dimensões nativas
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    setErrorMessage(null);
    setHasPainted(false);
    setPrompt('');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageObjRef.current = img;

      const bgCanvas = bgCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!bgCanvas || !maskCanvas) return;

      const width = img.naturalWidth || 1024;
      const height = img.naturalHeight || 1024;

      bgCanvas.width = width;
      bgCanvas.height = height;
      maskCanvas.width = width;
      maskCanvas.height = height;

      const bgCtx = bgCanvas.getContext('2d');
      if (bgCtx) {
        bgCtx.clearRect(0, 0, width, height);
        bgCtx.drawImage(img, 0, 0, width, height);
      }

      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        maskCtx.clearRect(0, 0, width, height);
      }
    };

    img.onerror = () => {
      setErrorMessage('Não foi possível carregar a imagem para edição.');
    };

    img.src = imageUrl;
  }, [isOpen, imageUrl]);

  // Limpa toda a máscara pintada
  const handleClearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    setHasPainted(false);
  }, []);

  // Inicia traço de desenho
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    // Captura o ponteiro para rastreamento suave mesmo fora dos limites
    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    const rect = canvas.getBoundingClientRect();
    const coords = getCanvasCoordinates(e.clientX, e.clientY, rect, canvas.width, canvas.height);
    lastPointRef.current = coords;

    drawPoint(coords.x, coords.y);
  };

  // Movimento de desenho (Pointer Move)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const coords = getCanvasCoordinates(e.clientX, e.clientY, rect, canvas.width, canvas.height);

    drawLine(lastPointRef.current || coords, coords);
    lastPointRef.current = coords;
  };

  // Finaliza traço
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Calcula o diâmetro do pincel em pixels internos para corresponder à escala na tela (Mobile-First)
  const getEffectiveBrushSize = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return brushSize;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return brushSize;
    return brushSize * (canvas.width / rect.width);
  }, [brushSize]);

  // Desenha um ponto no canvas de máscara
  const drawPoint = (x: number, y: number) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (toolMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(249, 115, 22, 0.55)'; // Laranja néon translúcido de alta visibilidade
    }

    ctx.beginPath();
    const effectiveSize = getEffectiveBrushSize();
    ctx.arc(x, y, effectiveSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (toolMode === 'brush') setHasPainted(true);
  };

  // Desenha uma linha suave interpolada entre pontos
  const drawLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (toolMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.55)';
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const effectiveSize = getEffectiveBrushSize();
    ctx.lineWidth = effectiveSize;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();

    if (toolMode === 'brush') setHasPainted(true);
  };

  // Gera máscara binária offscreen (Preto = Intocado, Branco = Inpaint) e submete
  const handleSubmit = async () => {
    if (!hasPainted) {
      setErrorMessage('Pincele a área da imagem que você deseja alterar.');
      return;
    }

    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorMessage('Descreva o que deseja colocar ou alterar na área pintada.');
      return;
    }

    const maskCanvas = maskCanvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!maskCanvas || !bgCanvas) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Cria canvas offscreen com máscara binária estrita
      const offscreen = document.createElement('canvas');
      offscreen.width = maskCanvas.width;
      offscreen.height = maskCanvas.height;
      const offCtx = offscreen.getContext('2d');

      if (!offCtx) throw new Error('Não foi possível inicializar contexto gráfico.');

      // 1. Fundo 100% preto (área intocada que o modelo preserva)
      offCtx.fillStyle = '#000000';
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      // 2. Extrai dados da máscara pintada
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const binData = offCtx.createImageData(maskCanvas.width, maskCanvas.height);
        const totalPixels = maskCanvas.width * maskCanvas.height;
        let whitePixelsCount = 0;

        for (let i = 0; i < totalPixels; i++) {
          const alpha = maskData.data[i * 4 + 3];
          const binIdx = i * 4;
          if (alpha > 10) {
            // Branco puro (#FFFFFF) = área onde a IA irá gerar
            whitePixelsCount++;
            binData.data[binIdx] = 255;
            binData.data[binIdx + 1] = 255;
            binData.data[binIdx + 2] = 255;
            binData.data[binIdx + 3] = 255;
          } else {
            // Preto puro (#000000) = área preservada
            binData.data[binIdx] = 0;
            binData.data[binIdx + 1] = 0;
            binData.data[binIdx + 2] = 0;
            binData.data[binIdx + 3] = 255;
          }
        }
        if (whitePixelsCount === 0) {
          setErrorMessage('Nenhuma área selecionada. Pincele o detalhe que deseja alterar.');
          setIsSubmitting(false);
          return;
        }
        offCtx.putImageData(binData, 0, 0);
      }

      const binaryMaskUrl = offscreen.toDataURL('image/png');
      let originalImageUrl = imageUrl;
      try {
        originalImageUrl = bgCanvas.toDataURL('image/jpeg', 0.95);
      } catch {
        // Fallback defensivo caso o canvas esteja tainted por restrição de origem (CORS)
        if (!originalImageUrl) {
          throw new Error('Não foi possível exportar a imagem original por restrição de segurança (CORS).');
        }
      }

      await onSubmit({
        image: originalImageUrl,
        mask: binaryMaskUrl,
        prompt: cleanPrompt,
        aspectRatio,
      });

      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao processar edição da imagem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[color:var(--c-bg-141310)] text-[color:var(--c-fg-e2dcce)] sm:p-4 sm:bg-black/75 sm:backdrop-blur-md sm:flex sm:items-center sm:justify-center">
      <div className="flex flex-col w-full h-full sm:max-w-4xl sm:h-[90vh] sm:rounded-2xl sm:border sm:border-[color:var(--c-bg-3e392f)] sm:bg-[color:var(--c-bg-181714)] sm:shadow-2xl overflow-hidden">
        
        {/* Barra Superior Ergonômica Mobile-First */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[color:var(--c-bg-1c1a17)] border-b border-[color:var(--c-bg-2d2a23)] shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[color:var(--c-bg-27241f)] hover:bg-[color:var(--c-bg-322e27)] text-[color:var(--c-fg-a39d93)] hover:text-white transition cursor-pointer"
              title="Voltar / Cancelar"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                  Edição com Pincel
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Inpaint FLUX
                </span>
              </div>
              <span className="text-[11px] text-[color:var(--c-fg-a39d93)] truncate hidden sm:inline">
                Pinte o objeto ou detalhe que deseja alterar
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleClearMask}
              disabled={!hasPainted || isSubmitting}
              className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-xl bg-[color:var(--c-bg-27241f)] hover:bg-[color:var(--c-bg-322e27)] text-xs text-[color:var(--c-fg-a39d93)] hover:text-white transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Limpar seleção atual"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          </div>
        </div>

        {/* Viewport Central do Canvas (Touch-Action: None para não arrastar tela no celular) */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 relative flex items-center justify-center p-2 sm:p-4 bg-black/60 overflow-hidden"
        >
          <div
            className="relative flex items-center justify-center max-w-full max-h-full"
            style={{
              aspectRatio: aspectRatio.includes(':') ? aspectRatio.replace(':', '/') : '1/1',
            }}
          >
            {/* Canvas de Fundo (Foto Original) */}
            <canvas
              ref={bgCanvasRef}
              className="max-w-full max-h-[calc(100vh-250px)] sm:max-h-[55vh] object-contain select-none block"
            />
            {/* Canvas de Máscara (Onde o usuário pinta com o dedo ou mouse) */}
            <canvas
              ref={maskCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 w-full h-full object-contain cursor-crosshair select-none"
              style={{ touchAction: 'none' }}
            />
          </div>

          {!hasPainted && !isSubmitting && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none px-3 py-1.5 rounded-full bg-black/75 border border-amber-500/30 text-amber-300 text-xs shadow-lg flex items-center gap-2">
              <Paintbrush className="w-3.5 h-3.5 animate-pulse" />
              <span>Passe o dedo ou mouse sobre o que quer mudar</span>
            </div>
          )}
        </div>

        {/* Feedback de Erro */}
        {errorMessage && (
          <div className="px-4 py-2 bg-rose-950/40 border-t border-rose-900/50 flex items-center gap-2 text-rose-300 text-xs shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Dock Inferior com Controles de Pincel e Prompt */}
        <div className="p-3 sm:p-4 bg-[color:var(--c-bg-1c1a17)] border-t border-[color:var(--c-bg-2d2a23)] flex flex-col gap-3 shrink-0">
          
          {/* Seletor de Ferramenta e Espessura com Touch Targets Mínimos de 44x44px */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setToolMode('brush')}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition cursor-pointer ${
                  toolMode === 'brush'
                    ? 'bg-amber-500 text-black font-semibold shadow-xs'
                    : 'bg-[color:var(--c-bg-27241f)] text-[color:var(--c-fg-a39d93)] hover:text-white'
                }`}
                title="Pincel de Seleção"
              >
                <Paintbrush className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setToolMode('eraser')}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition cursor-pointer ${
                  toolMode === 'eraser'
                    ? 'bg-amber-500 text-black font-semibold shadow-xs'
                    : 'bg-[color:var(--c-bg-27241f)] text-[color:var(--c-fg-a39d93)] hover:text-white'
                }`}
                title="Borracha para corrigir"
              >
                <Eraser className="w-5 h-5" />
              </button>
            </div>

            {/* Tamanhos de Pincel Ergonômicos: Fino (14px), Médio (32px), Grosso (60px) */}
            <div className="flex items-center gap-1.5 bg-[color:var(--c-bg-141310)] p-1 rounded-xl border border-[color:var(--c-bg-2d2a23)]">
              {[
                { size: 14, label: 'Fino', dot: 'w-2 h-2' },
                { size: 32, label: 'Médio', dot: 'w-3.5 h-3.5' },
                { size: 60, label: 'Grosso', dot: 'w-5 h-5' },
              ].map((b) => (
                <button
                  key={b.size}
                  type="button"
                  onClick={() => setBrushSize(b.size)}
                  className={`min-h-[44px] min-w-[44px] px-3 flex items-center justify-center gap-1.5 rounded-lg text-xs transition cursor-pointer ${
                    brushSize === b.size
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                      : 'text-[color:var(--c-fg-a39d93)] hover:text-white'
                  }`}
                  title={`Espessura ${b.label}`}
                >
                  <span className={`rounded-full bg-current ${b.dot}`} />
                  <span className="hidden sm:inline">{b.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Instrução da Edição e Botão de Ação */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="O que colocar nesta área? Ex: escaravelho dourado metálico..."
              disabled={isSubmitting}
              className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-2d2a23)] focus:border-amber-500/60 focus:outline-hidden text-sm text-[color:var(--c-fg-f3efe6)] placeholder:text-[color:var(--c-fg-8c867a)] transition"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSubmitting && hasPainted) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !hasPainted}
              className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ea580c] hover:from-[#ff7a47] hover:to-[#f97316] text-white text-sm font-semibold transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Gerando Edição…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Aplicar Inpaint</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
