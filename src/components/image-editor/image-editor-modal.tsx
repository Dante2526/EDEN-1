import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  X,
  Type,
  Square,
  Circle,
  Triangle,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Loader2,
  AlertCircle,
  Sparkles,
  Download,
  Trash2,
  Copy,
} from 'lucide-react';
import * as fabric from 'fabric';
import {
  ImageProject,
  ImageLayer_T,
  TextLayer,
  ShapeLayer,
  StickerLayer,
  BackgroundLayer,
  createTextLayer,
  createShapeLayer,
  createStickerLayer,
  generateLayerId,
} from '../../lib/image-layers';
import { exportCanvasToPng, downloadDataUrl } from '../../lib/image-export';

export interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProject?: ImageProject;
  onExport?: (dataUrl: string, project: ImageProject) => void;
  onRegenerateBackground?: (prompt: string, currentImage: string) => Promise<string>;
}

const FONTS = [
  'Inter, sans-serif',
  'Arial, sans-serif',
  'Georgia, serif',
  '"Courier New", monospace',
  'Impact, sans-serif',
  '"Comic Sans MS", cursive',
];

const COMMON_EMOJIS = ['🌟', '❤️', '👍', '🔥', '✨', '🎨', '💡', '🚀', '⭐', '💫', '🎉', '🌈'];

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  onClose,
  initialProject,
  onExport,
  onRegenerateBackground,
}) => {
  const [project, setProject] = useState<ImageProject>(
    initialProject || {
      id: `proj_${Date.now()}`,
      title: 'Nova Imagem',
      width: 1024,
      height: 1024,
      backgroundColor: '#ffffff',
      layers: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [bgPrompt, setBgPrompt] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const layerObjectsMapRef = useRef<Map<string, fabric.Object>>(new Map());
  const openedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen || !canvasContainerRef.current) return;
    openedAtRef.current = Date.now();
    setErrorMessage(null);

    const initCanvas = () => {
      const container = canvasContainerRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) { setTimeout(initCanvas, 50); return; }

      const aspect = project.width / project.height;
      const cAspect = cw / ch;
      let dw, dh;
      if (aspect > cAspect) { dw = cw; dh = cw / aspect; }
      else { dh = ch; dw = ch * aspect; }

      const canvasEl = document.createElement('canvas');
      canvasEl.width = dw;
      canvasEl.height = dh;
      container.innerHTML = '';
      container.appendChild(canvasEl);

      const fc = new fabric.Canvas(canvasEl, {
        width: dw,
        height: dh,
        backgroundColor: project.backgroundColor || '#ffffff',
        preserveObjectStacking: true,
        selection: true,
      });

      const scaleX = dw / project.width;
      const scaleY = dh / project.height;
      fc.viewportTransform = [scaleX, 0, 0, scaleY, 0, 0];
      fc.calcOffset();
      fabricCanvasRef.current = fc;

      fc.on('selection:created', (e: any) => {
        const s = e.selected?.[0];
        if (s) {
          // Procura layerId no Map (em vez de propriedade direta no objeto)
          for (const [layerId, obj] of layerObjectsMapRef.current.entries()) {
            if (obj === s) { setSelectedLayerId(layerId); break; }
          }
        }
      });
      fc.on('selection:updated', (e: any) => {
        const s = e.selected?.[0];
        if (s) {
          for (const [layerId, obj] of layerObjectsMapRef.current.entries()) {
            if (obj === s) { setSelectedLayerId(layerId); break; }
          }
        }
      });
      fc.on('selection:cleared', () => setSelectedLayerId(null));
      fc.on('object:modified', () => syncProjectFromCanvas());

      renderLayers();
      setIsLoading(false);
    };

    setIsLoading(true);
    setTimeout(initCanvas, 50);

    return () => {
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
      layerObjectsMapRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project.width, project.height]);

  const renderLayers = useCallback(async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((obj: any) => canvas.remove(obj));
    layerObjectsMapRef.current.clear();

    for (const layer of project.layers) {
      try {
        const obj = await layerToFabricObject(layer, project.width, project.height);
        if (obj) {
          // Não usamos obj.layerId (Fabric 6 não tem essa prop).
          // A associação layer↔obj fica no layerObjectsMapRef.
          obj.visible = layer.visible !== false;
          obj.selectable = !layer.locked;
          obj.evented = !layer.locked;
          canvas.add(obj);
          layerObjectsMapRef.current.set(layer.id, obj);
        }
      } catch (err) {
        console.error('[ImageEditor] Erro ao renderizar layer', layer.id, err);
      }
    }
    canvas.renderAll();
  }, [project]);

  const layerToFabricObject = async (
    layer: ImageLayer_T,
    canvasWidth: number,
    canvasHeight: number
  ): Promise<fabric.Object | null> => {
    if (!layer.visible) return null;
    const common: Partial<fabric.Object> = {
      left: layer.x,
      top: layer.y,
      angle: layer.rotation || 0,
      opacity: layer.opacity ?? 1,
      originX: 'left',
      originY: 'top',
    };

    if (layer.type === 'background' || layer.type === 'image') {
      const url = (layer as BackgroundLayer).imageUrl;
      if (!url) {
        return new fabric.Rect({
          ...common,
          width: layer.width || canvasWidth,
          height: layer.height || canvasHeight,
          fill: (layer as BackgroundLayer).fill || '#ffffff',
          selectable: false,
          evented: false,
        });
      }
      try {
        const img = await fabric.Image.fromURL(url, { crossOrigin: 'anonymous' });
        img.set({
          ...common,
          scaleX: (layer.width || canvasWidth) / (img.width || 1),
          scaleY: (layer.height || canvasHeight) / (img.height || 1),
        });
        return img;
      } catch { return null; }
    }

    if (layer.type === 'text') {
      const t = layer as TextLayer;
      return new fabric.IText(t.text, {
        ...common,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fill: t.fill,
        fontWeight: t.fontWeight,
        fontStyle: t.fontStyle,
        textAlign: t.textAlign,
        underline: t.underline,
        strokeWidth: t.strokeWidth || 0,
        stroke: t.stroke,
        shadow: t.shadow ? new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 4, offsetX: 2, offsetY: 2 }) : undefined,
      });
    }

    if (layer.type === 'shape') {
      const s = layer as ShapeLayer;
      const sp: any = {
        ...common,
        width: s.width || 200,
        height: s.height || 200,
        fill: s.fill,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth || 0,
      };
      if (s.shape === 'rect') {
        sp.rx = s.rx || 0;
        sp.ry = s.rx || 0;
        return new fabric.Rect(sp);
      }
      if (s.shape === 'circle') {
        sp.radius = Math.max(1, (s.width || 200) / 2);
        return new fabric.Circle(sp);
      }
      if (s.shape === 'triangle') return new fabric.Triangle(sp);
      if (s.shape === 'line') {
        return new fabric.Line([s.x, s.y, s.x + (s.width || 200), s.y + (s.height || 200)], {
          ...common,
          stroke: s.fill,
          strokeWidth: s.strokeWidth || 4,
        });
      }
    }

    if (layer.type === 'sticker') {
      const st = layer as StickerLayer;
      return new fabric.IText(st.emoji, {
        ...common,
        fontSize: st.fontSize,
        fontFamily: 'Apple Color Emoji, Segoe UI Emoji, sans-serif',
        fill: st.color || '#000000',
      });
    }
    return null;
  };

  const syncProjectFromCanvas = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    setProject((prev) => {
      const updated = prev.layers.map((layer) => {
        const obj = layerObjectsMapRef.current.get(layer.id);
        if (!obj) return layer;
        return {
          ...layer,
          x: Math.round(obj.left || 0),
          y: Math.round(obj.top || 0),
          width: obj.width ? Math.round(obj.width * (obj.scaleX || 1)) : layer.width,
          height: obj.height ? Math.round(obj.height * (obj.scaleY || 1)) : layer.height,
          rotation: Math.round(obj.angle || 0),
          opacity: obj.opacity ?? 1,
          visible: obj.visible !== false,
        } as ImageLayer_T;
      });
      return { ...prev, layers: updated, updatedAt: Date.now() };
    });
  }, []);

  const addTextLayer = () => {
    const l = createTextLayer('Novo texto', {
      x: project.width / 2 - 100, y: project.height / 2 - 24,
      fontSize: 48, fill: '#000000',
    });
    setProject((p) => ({ ...p, layers: [...p.layers, l], updatedAt: Date.now() }));
    setSelectedLayerId(l.id);
    setTimeout(() => renderLayers(), 50);
  };

  const addShapeLayer = (shape: 'rect' | 'circle' | 'triangle' | 'line') => {
    const l = createShapeLayer(shape, {
      x: project.width / 2 - 100, y: project.height / 2 - 100,
      width: 200, height: 200, fill: '#ff6b6b',
    });
    setProject((p) => ({ ...p, layers: [...p.layers, l], updatedAt: Date.now() }));
    setSelectedLayerId(l.id);
    setTimeout(() => renderLayers(), 50);
  };

  const addStickerLayer = (emoji: string) => {
    const l = createStickerLayer(emoji, {
      x: project.width / 2 - 60, y: project.height / 2 - 60, fontSize: 120,
    });
    setProject((p) => ({ ...p, layers: [...p.layers, l], updatedAt: Date.now() }));
    setSelectedLayerId(l.id);
    setTimeout(() => renderLayers(), 50);
  };

  const deleteLayer = (id: string) => {
    setProject((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id), updatedAt: Date.now() }));
    const obj = layerObjectsMapRef.current.get(id);
    if (obj && fabricCanvasRef.current) {
      fabricCanvasRef.current.remove(obj);
      fabricCanvasRef.current.discardActiveObject();
      fabricCanvasRef.current.renderAll();
    }
    layerObjectsMapRef.current.delete(id);
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const duplicateLayer = (id: string) => {
    const layer = project.layers.find((l) => l.id === id);
    if (!layer) return;
    const newL = { ...layer, id: generateLayerId(), x: layer.x + 20, y: layer.y + 20, name: `${layer.name} (cópia)` };
    setProject((p) => ({ ...p, layers: [...p.layers, newL], updatedAt: Date.now() }));
    setSelectedLayerId(newL.id);
    setTimeout(() => renderLayers(), 50);
  };

  const toggleVisible = (id: string) => {
    setProject((p) => ({ ...p, layers: p.layers.map((l) => l.id === id ? { ...l, visible: !l.visible } : l), updatedAt: Date.now() }));
    const obj = layerObjectsMapRef.current.get(id);
    if (obj && fabricCanvasRef.current) {
      obj.visible = !obj.visible;
      fabricCanvasRef.current.renderAll();
    }
  };

  const toggleLock = (id: string) => {
    setProject((p) => ({ ...p, layers: p.layers.map((l) => l.id === id ? { ...l, locked: !l.locked } : l), updatedAt: Date.now() }));
    const obj = layerObjectsMapRef.current.get(id);
    if (obj && fabricCanvasRef.current) {
      obj.selectable = !obj.selectable;
      obj.evented = !obj.evented;
      fabricCanvasRef.current.renderAll();
    }
  };

  const moveLayer = (id: string, direction: 'up' | 'down') => {
    setProject((p) => {
      const ls = [...p.layers];
      const i = ls.findIndex((l) => l.id === id);
      if (i === -1) return p;
      const ni = direction === 'up' ? i + 1 : i - 1;
      if (ni < 0 || ni >= ls.length) return p;
      [ls[i], ls[ni]] = [ls[ni], ls[i]];
      return { ...p, layers: ls, updatedAt: Date.now() };
    });
    setTimeout(() => renderLayers(), 50);
  };

  const updateLayerProperty = (id: string, property: string, value: any) => {
    setProject((p) => ({ ...p, layers: p.layers.map((l) => l.id === id ? { ...l, [property]: value } : l), updatedAt: Date.now() }));
    const obj = layerObjectsMapRef.current.get(id);
    if (obj && fabricCanvasRef.current) {
      (obj as any).set(property, value);
      obj.setCoords();
      fabricCanvasRef.current.renderAll();
    }
  };

  const handleExport = () => {
    if (!fabricCanvasRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = exportCanvasToPng(fabricCanvasRef.current);
      if (dataUrl && onExport) onExport(dataUrl, project);
      downloadDataUrl(dataUrl, `${project.title.replace(/\s+/g, '_')}.png`);
    } catch (err) {
      setErrorMessage('Erro ao exportar: ' + (err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRegenerateBackground = async () => {
    if (!onRegenerateBackground || !bgPrompt.trim()) return;
    setIsRegenerating(true);
    setErrorMessage(null);
    try {
      const bg = project.layers.find((l) => l.type === 'background') as BackgroundLayer | undefined;
      const current = bg?.imageUrl || '';
      const newImg = await onRegenerateBackground(bgPrompt, current);
      if (newImg) {
        setProject((p) => ({
          ...p,
          layers: p.layers.map((l) => l.type === 'background' ? { ...l, imageUrl: newImg, prompt: bgPrompt } : l),
          updatedAt: Date.now(),
        }));
        setTimeout(() => renderLayers(), 50);
        setBgPrompt('');
      }
    } catch (err) {
      setErrorMessage('Erro ao regenerar fundo: ' + (err as Error).message);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSafeClose = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (Date.now() - openedAtRef.current < 350) return;
    onClose();
  };

  if (!isOpen) return null;

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId);

  return (
    <div onClick={(e) => e.stopPropagation()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 sm:p-2">
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col bg-[color:var(--c-bg-181714)] border border-[color:var(--c-bg-38352e)] shadow-2xl w-full h-full sm:h-[95vh] sm:w-[98vw] sm:rounded-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-[color:var(--c-bg-201e1a)] border-b border-[color:var(--c-bg-38352e)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={handleSafeClose} className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] px-2.5 py-1.5 flex items-center justify-center gap-1.5 rounded-xl bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-[color:var(--c-fg-f3efe6)] transition cursor-pointer text-xs font-medium" title="Voltar">
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Voltar</span>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs sm:text-sm font-semibold text-[color:var(--c-fg-f3efe6)] truncate">Editor de Camadas</span>
                  <span className="hidden md:inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{project.layers.length} camada(s)</span>
                </div>
                <p className="text-[10px] text-[color:var(--c-fg-8c867a)] truncate">{project.title} • {project.width}×{project.height}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={handleExport} disabled={isExporting} className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0 disabled:opacity-50" title="Exportar PNG">
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Exportar PNG</span>
            </button>
            <button type="button" onClick={handleSafeClose} className="hidden sm:flex min-h-[36px] min-w-[36px] p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-rose-950/40 transition cursor-pointer items-center justify-center" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Corpo: 3 colunas */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Toolbar esquerda */}
          <div className="w-14 sm:w-16 bg-[color:var(--c-bg-201e1a)] border-r border-[color:var(--c-bg-38352e)] flex flex-col items-center py-2 gap-1.5 shrink-0 overflow-y-auto">
            <span className="text-[9px] font-mono uppercase text-[color:var(--c-fg-8c867a)] mb-1">Add</span>
            <button type="button" onClick={addTextLayer} className="w-10 h-10 rounded-lg bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] flex items-center justify-center cursor-pointer transition" title="Texto"><Type className="w-4 h-4 text-amber-400" /></button>
            <button type="button" onClick={() => addShapeLayer('rect')} className="w-10 h-10 rounded-lg bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] flex items-center justify-center cursor-pointer transition" title="Retângulo"><Square className="w-4 h-4 text-rose-400" /></button>
            <button type="button" onClick={() => addShapeLayer('circle')} className="w-10 h-10 rounded-lg bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] flex items-center justify-center cursor-pointer transition" title="Círculo"><Circle className="w-4 h-4 text-sky-400" /></button>
            <button type="button" onClick={() => addShapeLayer('triangle')} className="w-10 h-10 rounded-lg bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] flex items-center justify-center cursor-pointer transition" title="Triângulo"><Triangle className="w-4 h-4 text-emerald-400" /></button>
            <div className="w-8 h-px bg-[color:var(--c-bg-38352e)] my-1" />
            <span className="text-[9px] font-mono uppercase text-[color:var(--c-fg-8c867a)] mb-1">Emoji</span>
            <div className="grid grid-cols-2 gap-1 px-1">
              {COMMON_EMOJIS.slice(0, 6).map((emoji) => (
                <button key={emoji} type="button" onClick={() => addStickerLayer(emoji)} className="w-8 h-8 rounded-lg bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] flex items-center justify-center cursor-pointer transition text-lg" title={`Adicionar ${emoji}`}>{emoji}</button>
              ))}
            </div>
          </div>

          {/* Canvas central */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] relative">
            {/*
             * ⚠️ CORREÇÃO CRASH "removeChild: not a child of this node":
             * O canvas Fabric é montado IMPERATIVAMENTE dentro deste div
             * (initCanvas faz container.innerHTML = '' + appendChild(canvas)).
             * Este div NUNCA pode ter filhos renderizados pelo React — o
             * innerHTML = '' os destruiria por baixo do React, e o commit
             * seguinte (setIsLoading(false) removendo o overlay) explodiria
             * em NotFoundError: removeChild. Por isso o overlay de loading
             * é IRMÃO absoluto deste container (ancorado no wrapper relative
             * acima), nunca filho. Não renderizar children React aqui.
             */}
            <div ref={canvasContainerRef} className="flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-4" style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #0d0d0d 0% 50%) 50% / 24px 24px' }} />
            {isLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[color:var(--c-bg-181714)]/90 backdrop-blur-xs text-center p-4 space-y-3">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <div className="text-sm text-[color:var(--c-fg-f3efe6)]">Carregando editor...</div>
              </div>
            )}

            {onRegenerateBackground && (
              <div className="px-3 py-2 bg-[color:var(--c-bg-201e1a)] border-t border-[color:var(--c-bg-38352e)] flex items-center gap-2 shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <input type="text" value={bgPrompt} onChange={(e) => setBgPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRegenerateBackground()} placeholder="Regenerar fundo via IA (ex: pôr do sol na praia)" className="flex-1 bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--c-fg-f3efe6)] focus:border-emerald-500/50 focus:outline-none" disabled={isRegenerating} />
                <button type="button" onClick={handleRegenerateBackground} disabled={isRegenerating || !bgPrompt.trim()} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
                  {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span className="hidden sm:inline">Gerar</span>
                </button>
              </div>
            )}

            {errorMessage && (
              <div className="px-3 py-2 bg-rose-950/30 border-t border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Painel direito */}
          <div className="w-56 sm:w-64 bg-[color:var(--c-bg-201e1a)] border-l border-[color:var(--c-bg-38352e)] flex flex-col shrink-0 overflow-hidden">
            {selectedLayer && (
              <div className="px-3 py-2 border-b border-[color:var(--c-bg-38352e)] max-h-[40%] overflow-y-auto">
                <div className="text-[10px] font-mono uppercase text-emerald-400 mb-1.5">Propriedades</div>
                <div className="text-xs text-[color:var(--c-fg-f3efe6)] font-semibold mb-2 truncate">{selectedLayer.name}</div>

                {selectedLayer.type === 'text' && (
                  <>
                    <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Texto</label>
                    <textarea value={(selectedLayer as TextLayer).text} onChange={(e) => updateLayerProperty(selectedLayer.id, 'text', e.target.value)} className="w-full bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg px-2 py-1 text-xs text-[color:var(--c-fg-f3efe6)] mb-2 resize-none" rows={2} />
                    <div className="grid grid-cols-2 gap-1.5 mb-2">
                      <div>
                        <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Tamanho</label>
                        <input type="number" value={(selectedLayer as TextLayer).fontSize} onChange={(e) => updateLayerProperty(selectedLayer.id, 'fontSize', parseInt(e.target.value) || 48)} className="w-full bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg px-2 py-1 text-xs text-[color:var(--c-fg-f3efe6)]" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Cor</label>
                        <input type="color" value={(selectedLayer as TextLayer).fill} onChange={(e) => updateLayerProperty(selectedLayer.id, 'fill', e.target.value)} className="w-full h-7 bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg cursor-pointer" />
                      </div>
                    </div>
                    <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Fonte</label>
                    <select value={(selectedLayer as TextLayer).fontFamily} onChange={(e) => updateLayerProperty(selectedLayer.id, 'fontFamily', e.target.value)} className="w-full bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg px-2 py-1 text-xs text-[color:var(--c-fg-f3efe6)] mb-2">
                      {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}
                    </select>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => updateLayerProperty(selectedLayer.id, 'fontWeight', (selectedLayer as TextLayer).fontWeight === 'bold' ? 'normal' : 'bold')} className={`flex-1 py-1 rounded text-xs ${ (selectedLayer as TextLayer).fontWeight === 'bold' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[color:var(--c-bg-2d2a25)] text-[color:var(--c-fg-8c867a)]' }`}><strong>B</strong></button>
                      <button type="button" onClick={() => updateLayerProperty(selectedLayer.id, 'fontStyle', (selectedLayer as TextLayer).fontStyle === 'italic' ? 'normal' : 'italic')} className={`flex-1 py-1 rounded text-xs ${ (selectedLayer as TextLayer).fontStyle === 'italic' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[color:var(--c-bg-2d2a25)] text-[color:var(--c-fg-8c867a)]' }`}><em>I</em></button>
                    </div>
                  </>
                )}

                {selectedLayer.type === 'shape' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Cor</label>
                      <input type="color" value={(selectedLayer as ShapeLayer).fill} onChange={(e) => updateLayerProperty(selectedLayer.id, 'fill', e.target.value)} className="w-full h-7 bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Opacidade</label>
                      <input type="range" min="0" max="1" step="0.1" value={selectedLayer.opacity ?? 1} onChange={(e) => updateLayerProperty(selectedLayer.id, 'opacity', parseFloat(e.target.value))} className="w-full" />
                    </div>
                  </div>
                )}

                {selectedLayer.type === 'sticker' && (
                  <>
                    <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Emoji</label>
                    <input type="text" value={(selectedLayer as StickerLayer).emoji} onChange={(e) => updateLayerProperty(selectedLayer.id, 'emoji', e.target.value)} className="w-full bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg px-2 py-1 text-2xl text-center mb-2" maxLength={4} />
                    <label className="block text-[10px] text-[color:var(--c-fg-8c867a)] mb-1">Tamanho</label>
                    <input type="number" value={(selectedLayer as StickerLayer).fontSize} onChange={(e) => updateLayerProperty(selectedLayer.id, 'fontSize', parseInt(e.target.value) || 120)} className="w-full bg-[color:var(--c-bg-141311)] border border-[color:var(--c-bg-38352e)] rounded-lg px-2 py-1 text-xs text-[color:var(--c-fg-f3efe6)]" />
                  </>
                )}

                <div className="mt-2 pt-2 border-t border-[color:var(--c-bg-38352e)] flex gap-1">
                  <button type="button" onClick={() => duplicateLayer(selectedLayer.id)} className="flex-1 py-1 rounded text-xs bg-[color:var(--c-bg-2d2a25)] hover:bg-[color:var(--c-bg-38352e)] text-[color:var(--c-fg-c4bfb6)] cursor-pointer flex items-center justify-center gap-1"><Copy className="w-3 h-3" /> Duplicar</button>
                  <button type="button" onClick={() => deleteLayer(selectedLayer.id)} className="flex-1 py-1 rounded text-xs bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 cursor-pointer flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" /> Excluir</button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-2 py-2">
              <div className="text-[10px] font-mono uppercase text-[color:var(--c-fg-8c867a)] mb-1.5 px-1">Camadas</div>
              {project.layers.length === 0 && (
                <div className="text-xs text-[color:var(--c-fg-8c867a)] italic px-1 py-2">Nenhuma camada. Use a toolbar pra adicionar.</div>
              )}
              {[...project.layers].reverse().map((layer) => (
                <div key={layer.id} onClick={() => { setSelectedLayerId(layer.id); const obj = layerObjectsMapRef.current.get(layer.id); if (obj && fabricCanvasRef.current) { fabricCanvasRef.current.setActiveObject(obj); fabricCanvasRef.current.renderAll(); } }} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-0.5 cursor-pointer transition ${ selectedLayerId === layer.id ? 'bg-emerald-500/20 border border-emerald-500/40' : 'hover:bg-[color:var(--c-bg-2d2a25)]' }`}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleVisible(layer.id); }} className="shrink-0" title={layer.visible !== false ? 'Ocultar' : 'Mostrar'}>
                    {layer.visible !== false ? <Eye className="w-3 h-3 text-[color:var(--c-fg-c4bfb6)]" /> : <EyeOff className="w-3 h-3 text-[color:var(--c-fg-6b655b)]" />}
                  </button>
                  <span className="flex-1 text-xs text-[color:var(--c-fg-f3efe6)] truncate">{layer.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleLock(layer.id); }} className="shrink-0" title={layer.locked ? 'Desbloquear' : 'Bloquear'}>
                    {layer.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3 text-[color:var(--c-fg-6b655b)]" />}
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }} className="shrink-0" title="Subir"><ChevronUp className="w-3 h-3 text-[color:var(--c-fg-8c867a)]" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }} className="shrink-0" title="Descer"><ChevronDown className="w-3 h-3 text-[color:var(--c-fg-8c867a)]" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-[color:var(--c-bg-201e1a)] border-t border-[color:var(--c-bg-38352e)] flex items-center justify-between text-[11px] text-[color:var(--c-fg-8c867a)] shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate">Clique nos elementos pra editar • Arraste pra mover • Use a toolbar pra adicionar</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] text-[color:var(--c-fg-6b655b)]">
            <span>Fabric.js</span>
            <span>•</span>
            <span>Camadas</span>
          </div>
        </div>
      </div>
    </div>
  );
};
