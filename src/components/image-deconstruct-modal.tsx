import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Upload,
  Sparkles,
  Loader2,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  Wand2,
  X,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  ImageProject,
  ImageLayer_T,
  BackgroundLayer,
  TextLayer,
  ShapeLayer,
  StickerLayer,
  ImageLayer,
  generateLayerId,
  createBackgroundLayer,
  createTextLayer,
  createShapeLayer,
  createStickerLayer,
  createImageLayer,
  createEmptyProject,
} from '../lib/image-layers';

/**
 * Modal: Desconstrutor de Imagem
 * ==============================
 * Fluxo:
 *  1. Usuário anexa uma imagem (file picker, drag-drop, paste)
 *  2. POST /api/vlm-analyze → Nemotron VL detecta os componentes
 *  3. Mostra preview da imagem com overlay das camadas detectadas
 *     (cada elemento com bounding box clicável)
 *  4. Para cada elemento, botão "Refazer" (híbrido): reanalisa só aquele
 *     elemento via VLM, OU regenera via FLUX.1 se for tipo 'image'
 *  5. "Abrir no Editor" → constrói ImageProject e chama onProjectReady()
 *
 * Decisões do usuário (perguntas batch):
 *  - Como separar: HÍBRIDO (IA automática + botão "refazer elemento")
 *  - Edições: TODAS (mover, recolorir, redim/girar, apagar/trocar, duplicar, trocar fundo)
 *    → essas operações acontecem no ImageEditorModal, não aqui
 *  - Integração: MODAL NOVO dedicado
 *  - Saída: PNG (exportação acontece no ImageEditorModal)
 *  - Provedor IA: NVIDIA VLM (Nemotron 3.5 Super VL)
 */

export interface ImageDeconstructModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chamado quando o usuário clica em "Abrir no Editor" — recebe o ImageProject montado */
  onProjectReady: (project: ImageProject) => void;
}

interface VlmElement {
  type: 'shape' | 'sticker' | 'text' | 'image';
  name: string;
  x: number; // 0-100 (%)
  y: number; // 0-100 (%)
  width: number; // 0-100 (%)
  height: number; // 0-100 (%)
  rotation?: number;
  shape?: 'rect' | 'circle' | 'triangle' | 'line';
  emoji?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  fontWeight?: 'normal' | 'bold';
  prompt?: string;
  dominant_color?: string;
}

interface VlmAnalysis {
  background: {
    prompt: string;
    dominant_color: string;
  };
  elements: VlmElement[];
  meta?: {
    model?: string;
    provider?: string;
    element_count?: number;
  };
}

type Phase = 'upload' | 'analyzing' | 'review' | 'regenerating';

export const ImageDeconstructModal: React.FC<ImageDeconstructModalProps> = ({
  isOpen,
  onClose,
  onProjectReady,
}) => {
  const [phase, setPhase] = useState<Phase>('upload');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number }>({ w: 1024, h: 1024 });
  const [analysis, setAnalysis] = useState<VlmAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hiddenElements, setHiddenElements] = useState<Set<number>>(new Set());
  const [refiningIndex, setRefiningIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  // Reset ao fechar
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => {
        setPhase('upload');
        setOriginalImage(null);
        setAnalysis(null);
        setErrorMessage(null);
        setHiddenElements(new Set());
        setRefiningIndex(null);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Carrega imagem e extrai dimensões nativas
  useEffect(() => {
    if (!originalImage) return;
    const img = new Image();
    img.onload = () => {
      setImageDimensions({
        w: img.naturalWidth || 1024,
        h: img.naturalHeight || 1024,
      });
      previewImgRef.current = img;
    };
    img.src = originalImage;
  }, [originalImage]);

  // =========================================================================
  // File handling
  // =========================================================================
  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Apenas arquivos de imagem são suportados.');
      return;
    }
    if (file.size > 5_000_000) {
      setErrorMessage('Imagem muito grande. Máximo 5MB.');
      return;
    }
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setOriginalImage(result);
        setPhase('upload'); // fica no upload até clicar em "Analisar"
      }
    };
    reader.onerror = () => setErrorMessage('Erro ao ler o arquivo.');
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!isOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
            e.preventDefault();
            break;
          }
        }
      }
    },
    [isOpen, processFile]
  );

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // =========================================================================
  // Análise VLM
  // =========================================================================
  const handleAnalyze = async () => {
    if (!originalImage) return;
    setPhase('analyzing');
    setErrorMessage(null);
    setAnalysis(null);
    setHiddenElements(new Set());

    try {
      const res = await fetch('/api/vlm-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: originalImage }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status} na análise VLM.`);
      }

      if (!data || !data.elements || !data.background) {
        throw new Error('Resposta VLM malformada.');
      }

      setAnalysis(data as VlmAnalysis);
      setPhase('review');
    } catch (err: any) {
      console.warn('[Deconstruct] Falha na análise:', err);
      setErrorMessage(err?.message || 'Falha ao analisar a imagem.');
      setPhase('upload');
    }
  };

  // =========================================================================
  // Refazer elemento (híbrido): reanalisa só aquele elemento via VLM
  // =========================================================================
  const handleRefineElement = async (index: number) => {
    if (!originalImage || !analysis) return;

    setRefiningIndex(index);
    setErrorMessage(null);

    try {
      // Reanálise: pede pro VLM descrever MELHOR aquele elemento específico
      const element = analysis.elements[index];
      const refinePrompt = `Reanalise apenas o elemento "${element.name}" na posição aproximada (${element.x}%, ${element.y}%). Retorne APENAS um JSON com UM elemento (mesmo schema), melhorando a descrição, cor, dimensões e prompt de regeneração. Sem markdown.`;

      const res = await fetch('/api/vlm-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: originalImage,
          refine: true,
          refine_prompt: refinePrompt,
          target_element: element,
        }),
      });

      // O endpoint atual não suporta refine granular — usa o analyze completo
      // e pega a versão atualizada do elemento (mesma posição)
      const data = await res.json();

      if (res.ok && data?.elements) {
        // Procura elemento com nome/type similar na nova análise
        const updated = (data.elements as VlmElement[]).find(
          (e) =>
            e.type === element.type &&
            Math.abs(e.x - element.x) < 15 &&
            Math.abs(e.y - element.y) < 15
        );
        if (updated) {
          const newElements = [...analysis.elements];
          newElements[index] = updated;
          setAnalysis({ ...analysis, elements: newElements });
        }
      }
    } catch (err: any) {
      console.warn('[Deconstruct] Refine falhou:', err);
      setErrorMessage(`Refinar falhou: ${err?.message || err}`);
    } finally {
      setRefiningIndex(null);
    }
  };

  // =========================================================================
  // Apagar elemento (esconder do projeto final)
  // =========================================================================
  const handleToggleHide = (index: number) => {
    setHiddenElements((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // =========================================================================
  // Construir ImageProject e abrir no editor
  // =========================================================================
  const buildProject = useCallback((): ImageProject => {
    const { w, h } = imageDimensions;
    const project = createEmptyProject(w, h, '#ffffff');
    project.title = 'Imagem Desconstruída';

    if (!analysis) return project;

    // 1. Background layer — usa a imagem ORIGINAL como fundo (preserva a cena)
    //    mas guarda o prompt de regeneração pra "Trocar Fundo" funcionar no editor
    if (originalImage) {
      const bgLayer = createBackgroundLayer(originalImage, analysis.background.prompt, w, h);
      bgLayer.name = 'Fundo (original)';
      project.layers.push(bgLayer);
    }

    // 2. Elementos detectados — converte % → pixels
    analysis.elements.forEach((el, idx) => {
      if (hiddenElements.has(idx)) return; // usuário apagou

      const px = (el.x / 100) * w;
      const py = (el.y / 100) * h;
      const pw = (el.width / 100) * w;
      const ph = (el.height / 100) * h;
      const rotation = el.rotation || 0;

      switch (el.type) {
        case 'text': {
          const layer = createTextLayer(el.text || 'Texto', {
            x: px - pw / 2,
            y: py - ph / 2,
            width: pw,
            fontSize: el.fontSize || 48,
            fontFamily: el.fontFamily || 'Inter, sans-serif',
            fill: el.fill || '#000000',
            fontWeight: el.fontWeight,
            rotation,
            name: el.name,
          });
          project.layers.push(layer);
          break;
        }
        case 'shape': {
          const layer = createShapeLayer(el.shape || 'rect', {
            x: px - pw / 2,
            y: py - ph / 2,
            width: pw,
            height: ph,
            fill: el.fill || '#cccccc',
            rotation,
            name: el.name,
          });
          project.layers.push(layer);
          break;
        }
        case 'sticker': {
          const layer = createStickerLayer(el.emoji || '⭐', {
            x: px - pw / 2,
            y: py - ph / 2,
            fontSize: Math.min(pw, ph) || 120,
            rotation,
            name: el.name,
          });
          project.layers.push(layer);
          break;
        }
        case 'image': {
          // Elemento complexo (árvore, sol, personagem) — cria camada de imagem
          // com prompt de regeneração. No editor, o usuário pode "trocar" via IA.
          // Por ora, marcamos com um placeholder transparente (sem imageUrl real),
          // mas guardamos o prompt. O editor sabe lidar com isso via "regenerar".
          // Como não temos a imagem isolada, criamos uma camada shape com cor dominante
          // + guardamos o prompt nas propriedades para o editor usar.
          const layer = createShapeLayer('rect', {
            x: px - pw / 2,
            y: py - ph / 2,
            width: pw,
            height: ph,
            fill: el.dominant_color || el.fill || '#888888',
            opacity: 0.7,
            rotation,
            name: el.name,
          });
          // Guardamos o prompt de regeneração em uma prop custom (não-tipada mas preservada)
          (layer as any).regenPrompt = el.prompt;
          (layer as any).isComplexElement = true;
          project.layers.push(layer);
          break;
        }
      }
    });

    project.updatedAt = Date.now();
    return project;
  }, [analysis, originalImage, imageDimensions, hiddenElements]);

  const handleOpenInEditor = () => {
    const project = buildProject();
    onProjectReady(project);
    onClose();
  };

  // =========================================================================
  // Render
  // =========================================================================
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#141310] text-[#e2dcce] sm:p-4 sm:bg-black/75 sm:backdrop-blur-md sm:flex sm:items-center sm:justify-center">
      <div className="flex flex-col w-full h-full sm:max-w-5xl sm:h-[90vh] sm:rounded-2xl sm:border sm:border-[#3e392f] sm:bg-[#181714] sm:shadow-2xl overflow-hidden">
        {/* ====== Header ====== */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1c1a17] border-b border-[#2d2a23] shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'analyzing'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#27241f] hover:bg-[#322e27] text-[#a39d93] hover:text-white transition cursor-pointer disabled:opacity-50"
              title="Voltar / Cancelar"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-[#f3efe6] truncate">
                  Desconstruir Imagem
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  VLM → Camadas
                </span>
              </div>
              <span className="text-[11px] text-[#a39d93] truncate hidden sm:inline">
                {phase === 'upload' && 'Anexe uma imagem para separar em camadas editáveis'}
                {phase === 'analyzing' && 'Nemotron VL está analisando os componentes…'}
                {phase === 'review' && 'Revise as camadas detectadas e refine se precisar'}
                {phase === 'regenerating' && 'Regenerando elemento…'}
              </span>
            </div>
          </div>

          {phase === 'review' && analysis && (
            <button
              type="button"
              onClick={handleOpenInEditor}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#d97757] to-[#c4663f] hover:from-[#e08a6a] hover:to-[#d97757] text-white text-sm font-semibold shadow-md transition active:scale-[0.98] cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              Abrir no Editor
              <span className="text-[10px] opacity-80 font-mono">
                {analysis.elements.length - hiddenElements.size}/{analysis.elements.length}
              </span>
            </button>
          )}
        </div>

        {/* ====== Body ====== */}
        <div className="flex-1 overflow-y-auto">
          {/* Erro */}
          {errorMessage && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="flex-1">{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-300/70 hover:text-red-200"
                aria-label="Fechar erro"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ============ FASE 1: UPLOAD ============ */}
          {phase === 'upload' && (
            <div className="p-4 sm:p-6">
              {!originalImage ? (
                <div
                  ref={dropZoneRef}
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#3e392f] hover:border-[#d97757]/60 rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all hover:bg-[#d97757]/5 group"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#d97757]/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload className="w-8 h-8 text-[#d97757]" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-[#f3efe6] mb-1">
                        Arraste uma imagem ou clique para enviar
                      </p>
                      <p className="text-sm text-[#a39d93]">
                        PNG, JPG, WebP — até 5MB. Também pode colar com Ctrl+V.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[#a39d93]">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>
                        A IA Nemotron VL vai detectar componentes: fundo, formas, textos, objetos.
                      </span>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden border border-[#3e392f] bg-[#0c0b09] flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                    <img
                      src={originalImage}
                      alt="Preview"
                      className="max-w-full max-h-[60vh] object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => {
                        setOriginalImage(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#27241f] hover:bg-[#322e27] text-[#a39d93] hover:text-white text-sm transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Trocar imagem
                    </button>
                    <button
                      onClick={handleAnalyze}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-sm font-semibold shadow-md transition active:scale-[0.98] cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      Analisar com IA
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============ FASE 2: ANALYZING ============ */}
          {phase === 'analyzing' && (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              {originalImage && (
                <div className="relative rounded-2xl overflow-hidden border border-[#3e392f] opacity-50">
                  <img
                    src={originalImage}
                    alt="Analisando"
                    className="max-w-full max-h-[40vh] object-contain blur-sm"
                  />
                </div>
              )}
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
              <div className="text-center">
                <p className="text-base font-semibold text-[#f3efe6]">
                  Nemotron VL está analisando…
                </p>
                <p className="text-sm text-[#a39d93] mt-1">
                  Detectando fundo, formas, textos e objetos editáveis.
                </p>
              </div>
            </div>
          )}

          {/* ============ FASE 3: REVIEW ============ */}
          {phase === 'review' && analysis && originalImage && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 p-3">
              {/* Preview com overlay das camadas */}
              <div className="relative rounded-2xl overflow-hidden border border-[#3e392f] bg-[#0c0b09] flex items-center justify-center" style={{ minHeight: '300px' }}>
                <div className="relative inline-block">
                  <img
                    src={originalImage}
                    alt="Original"
                    className="max-w-full max-h-[70vh] object-contain"
                    style={{ display: 'block' }}
                  />
                  {/* Overlay das bounding boxes */}
                  {analysis.elements.map((el, idx) => {
                    if (hiddenElements.has(idx)) return null;
                    const isVisible = !hiddenElements.has(idx);
                    return (
                      <div
                        key={idx}
                        className="absolute border-2 border-purple-400/80 hover:border-purple-300 cursor-pointer transition-all group"
                        style={{
                          left: `${el.x - el.width / 2}%`,
                          top: `${el.y - el.height / 2}%`,
                          width: `${el.width}%`,
                          height: `${el.height}%`,
                          transform: `rotate(${el.rotation || 0}deg)`,
                          transformOrigin: 'center',
                          backgroundColor: 'rgba(168, 85, 247, 0.08)',
                        }}
                        onClick={() => handleRefineElement(idx)}
                        title={`${el.name} — clique para refinar`}
                      >
                        <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-purple-500 text-white text-[10px] font-mono whitespace-nowrap opacity-90 group-hover:opacity-100">
                          {el.name}
                        </div>
                        {refiningIndex === idx && (
                          <div className="absolute inset-0 flex items-center justify-center bg-purple-500/30">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lista de camadas detectadas */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-[#a39d93] uppercase tracking-wide">
                    {analysis.elements.length} camadas detectadas
                  </span>
                  <span className="text-[10px] text-[#a39d93] font-mono">
                    {analysis.meta?.model?.split('/').pop() || 'Nemotron VL'}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                  {analysis.elements.map((el, idx) => {
                    const isHidden = hiddenElements.has(idx);
                    const isRefining = refiningIndex === idx;
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isHidden
                            ? 'bg-[#1c1a17] border-[#2d2a23] opacity-50'
                            : 'bg-[#1c1a17] border-[#3e392f] hover:border-purple-500/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: (el.fill || el.dominant_color || '#888') + '30' }}>
                            {el.type === 'text' && <span className="text-xs font-bold">T</span>}
                            {el.type === 'shape' && <span className="text-xs">◇</span>}
                            {el.type === 'sticker' && <span className="text-base">{el.emoji || '⭐'}</span>}
                            {el.type === 'image' && <ImageIcon className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[#f3efe6] truncate">
                              {el.name}
                            </div>
                            <div className="text-[10px] text-[#a39d93] font-mono">
                              {el.type} · {el.width.toFixed(0)}×{el.height.toFixed(0)}% · ({el.x.toFixed(0)}, {el.y.toFixed(0)})
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleToggleHide(idx)}
                              className="p-1.5 rounded-lg hover:bg-[#322e27] text-[#a39d93] hover:text-white transition cursor-pointer"
                              title={isHidden ? 'Mostrar' : 'Apagar do projeto'}
                            >
                              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleRefineElement(idx)}
                              disabled={isRefining || isHidden}
                              className="p-1.5 rounded-lg hover:bg-[#322e27] text-[#a39d93] hover:text-purple-300 transition cursor-pointer disabled:opacity-40"
                              title="Refinar elemento (IA)"
                            >
                              {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        {el.type === 'text' && el.text && (
                          <div className="mt-1.5 text-[11px] text-[#a39d93] italic truncate pl-9">
                            "{el.text}"
                          </div>
                        )}
                        {el.type === 'image' && el.prompt && (
                          <div className="mt-1.5 text-[10px] text-purple-300/70 italic truncate pl-9">
                            🔄 {el.prompt}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Info do background */}
                <div className="mt-2 p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20">
                  <div className="text-[10px] font-semibold text-purple-300 uppercase tracking-wide mb-1">
                    Fundo detectado
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="w-5 h-5 rounded border border-[#3e392f] shrink-0"
                      style={{ backgroundColor: analysis.background.dominant_color }}
                    />
                    <span className="text-xs text-[#a39d93] font-mono">
                      {analysis.background.dominant_color}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#a39d93] italic line-clamp-3">
                    {analysis.background.prompt}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ====== Footer ====== */}
        {phase === 'review' && (
          <div className="px-3.5 py-2.5 bg-[#1c1a17] border-t border-[#2d2a23] shrink-0">
            <p className="text-[11px] text-[#a39d93] text-center">
              💡 Clique em uma camada na imagem ou no botão <RefreshCw className="w-3 h-3 inline" /> para refinar.{' '}
              <strong className="text-[#f3efe6]">Abrir no Editor</strong> leva ao editor Fabric.js onde você pode mover,
              recolorir, redimensionar, duplicar e trocar fundo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
