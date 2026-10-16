import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Undo2, RotateCcw, Sparkles, Paintbrush, Loader2 } from 'lucide-react';
import {
  calculateBoundingBox,
  buildRegionEditPrompt,
  hasActiveMask,
  type Point,
  type BoundingBox,
} from '../lib/image-mask-helper';

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onApplyEdit: (params: {
    prompt: string;
    imageUrl: string;
    boundingBox: BoundingBox | null;
  }) => void;
}

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onApplyEdit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [prompt, setPrompt] = useState('');
  const [brushSize, setBrushSize] = useState(28);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carrega e calcula dimensões mantendo aspect ratio
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    setImageLoaded(false);
    setStrokes([]);
    setCurrentStroke([]);
    setPrompt('');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };
  }, [isOpen, imageUrl]);

  // Redesenha todos os traços no canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = [...strokes, ...(currentStroke.length ? [currentStroke] : [])];

    allStrokes.forEach((stroke) => {
      if (stroke.length < 1) return;

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Tinta ciano neon semi-transparente para fácil visualização
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = brushSize;

      if (stroke.length === 1) {
        ctx.arc(stroke[0].x, stroke[0].y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(stroke[0].x, stroke[0].y);
        for (let i = 1; i < stroke.length; i++) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
        ctx.stroke();
      }
    });
  }, [strokes, currentStroke, brushSize]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Conversão de coordenadas de toque / mouse para a escala real do canvas
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = getCanvasCoords(e);
    if (!pt) return;

    setIsDrawing(true);
    setCurrentStroke([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pt = getCanvasCoords(e);
    if (!pt) return;

    setCurrentStroke((prev) => [...prev, pt]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);

    if (currentStroke.length > 0) {
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  const handleApply = () => {
    if (!prompt.trim()) return;

    setIsSubmitting(true);
    const canvas = canvasRef.current;
    const allPoints = strokes.flat();
    const hasSelection = hasActiveMask(allPoints);

    let box: BoundingBox | null = null;
    if (hasSelection && canvas) {
      box = calculateBoundingBox(allPoints, canvas.width, canvas.height);
    }

    const finalPrompt = buildRegionEditPrompt(prompt, box);

    onApplyEdit({
      prompt: finalPrompt,
      imageUrl,
      boundingBox: box,
    });

    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4">
      <div className="flex flex-col w-full h-full sm:h-[92vh] sm:max-w-4xl bg-[color:var(--c-bg-211f1c,#1c1917)] border-0 sm:border border-[color:var(--c-bg-3e3b34,#292524)] sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--c-bg-302e2a,#292524)] bg-[color:var(--c-bg-181816,#141210)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
              <Paintbrush className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--c-fg-f3efe6,#fafaf9)] flex items-center gap-2">
                Pincel de Retoque Visual
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  Mobile & Desktop
                </span>
              </h3>
              <p className="text-xs text-[color:var(--c-fg-8a857b,#a8a29e)]">
                Pinte sobre o objeto ou área que deseja alterar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[color:var(--c-fg-8a857b,#a8a29e)] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Área Central: Visualizador e Canvas */}
        <div
          ref={containerRef}
          className="relative flex-1 flex items-center justify-center p-2 sm:p-4 bg-black/40 overflow-hidden select-none"
          style={{ touchAction: 'none' }}
        >
          {!imageLoaded ? (
            <div className="flex flex-col items-center gap-3 text-sky-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs text-[color:var(--c-fg-8a857b,#a8a29e)]">Carregando imagem...</span>
            </div>
          ) : (
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              {/* Imagem Base */}
              <img
                src={imageUrl}
                alt="Base para retoque"
                className="max-h-[50vh] sm:max-h-[58vh] w-auto max-w-full object-contain pointer-events-none rounded-lg shadow-md"
              />
              {/* Canvas de Seleção Transparente sobreposto */}
              <canvas
                ref={canvasRef}
                width={imageDimensions.width || 800}
                height={imageDimensions.height || 600}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute inset-0 w-full h-full cursor-crosshair rounded-lg touch-none"
                style={{ touchAction: 'none' }}
              />
            </div>
          )}
        </div>

        {/* Barra Inferior (Mobile-First Thumb Ergonomics) */}
        <div className="flex flex-col gap-3 p-3 sm:p-4 bg-[color:var(--c-bg-181816,#141210)] border-t border-[color:var(--c-bg-302e2a,#292524)]">
          {/* Controles de Pincel e Ações */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[color:var(--c-fg-8a857b,#a8a29e)] hidden sm:inline">Pincel:</span>
              <input
                type="range"
                min="10"
                max="60"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-24 sm:w-32 accent-sky-500 cursor-pointer"
                title={`Espessura: ${brushSize}px`}
              />
              <span className="text-[11px] font-mono text-sky-400 w-8">{brushSize}px</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={strokes.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[color:var(--c-bg-302e2a,#292524)] text-[color:var(--c-fg-f3efe6,#fafaf9)] hover:bg-white/10 disabled:opacity-40 disabled:pointer-events-none transition-colors min-h-[40px]"
              >
                <Undo2 className="w-4 h-4" />
                <span className="hidden sm:inline">Desfazer</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                disabled={strokes.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[color:var(--c-bg-302e2a,#292524)] text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 disabled:pointer-events-none transition-colors min-h-[40px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Limpar</span>
              </button>
            </div>
          </div>

          {/* Campo de Instrução e Botão de Aplicar */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder={
                strokes.length > 0
                  ? 'Ex: mude para azul, remova este objeto, troque por um copo...'
                  : 'Descreva a alteração que deseja na imagem...'
              }
              className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-[color:var(--c-bg-302e2a,#292524)] border border-[color:var(--c-bg-3e3b34,#3f3f46)] text-[color:var(--c-fg-f3efe6,#fafaf9)] placeholder:text-[color:var(--c-fg-8a857b,#a8a29e)] focus:outline-hidden focus:border-sky-500 min-h-[44px]"
            />

            <button
              type="button"
              onClick={handleApply}
              disabled={!prompt.trim() || isSubmitting}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-lg shadow-sky-600/25 min-h-[44px] shrink-0"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Retocar</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
