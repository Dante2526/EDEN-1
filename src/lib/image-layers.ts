/**
 * Tipagem e helpers para o sistema de camadas (layers) do Image Editor.
 *
 * Uma imagem editável no Éden é composta por múltiplas camadas:
 *   - background: imagem raster gerada por FLUX (ou sólida)
 *   - text: texto vetorial editável (fonte, cor, posição)
 *   - shape: retângulo, círculo, linha (com fill/stroke)
 *   - sticker: emoji ou ícone
 *   - image: imagem adicional (ex: logo, personagem recortado)
 *
 * Cada camada tem id único, tipo, posição (x,y), dimensões (width,height),
 * rotação, opacidade, e propriedades específicas do tipo.
 *
 * O editor (image-editor-modal.tsx) renderiza essas camadas com Fabric.js
 * e permite ao usuário manipular cada uma individualmente.
 */

export type LayerType = 'background' | 'text' | 'shape' | 'sticker' | 'image';

export type ShapeKind = 'rect' | 'circle' | 'triangle' | 'line';

export interface BaseLayer {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
}

export interface BackgroundLayer extends BaseLayer {
  type: 'background';
  /** URL da imagem (data URL ou URL remota). Se vazio, fill é usado. */
  imageUrl?: string;
  /** Cor de fundo sólida (ex: '#ff0000'). Usado se imageUrl vazio. */
  fill?: string;
  /** Prompt usado pra gerar a imagem (metadado) */
  prompt?: string;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  underline?: boolean;
  strokeWidth?: number;
  stroke?: string;
  shadow?: boolean;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number; // border radius pra rect
}

export interface StickerLayer extends BaseLayer {
  type: 'sticker';
  /** Emoji ou caractere unicode (ex: '🌟', '❤️') */
  emoji: string;
  fontSize: number;
  color?: string;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  imageUrl: string;
  /** Recorte opcional (object-position) */
  cropX?: number;
  cropY?: number;
}

export type ImageLayer_T =
  | BackgroundLayer
  | TextLayer
  | ShapeLayer
  | StickerLayer
  | ImageLayer;

/**
 * Projeto de imagem editável — conjunto de camadas + dimensões do canvas.
 */
export interface ImageProject {
  id: string;
  title: string;
  width: number;
  height: number;
  /** Cor de fundo do canvas quando não tem background layer */
  backgroundColor?: string;
  layers: ImageLayer_T[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Cria ID único pra camada
 */
export function generateLayerId(): string {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Cria projeto vazio com background sólido
 */
export function createEmptyProject(
  width: number = 1024,
  height: number = 1024,
  backgroundColor: string = '#ffffff'
): ImageProject {
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: 'Nova Imagem',
    width,
    height,
    backgroundColor,
    layers: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Cria camada de fundo a partir de URL de imagem gerada por FLUX
 */
export function createBackgroundLayer(imageUrl: string, prompt?: string, width?: number, height?: number): BackgroundLayer {
  return {
    id: generateLayerId(),
    type: 'background',
    name: 'Fundo',
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    imageUrl,
    prompt,
  };
}

/**
 * Cria camada de texto
 */
export function createTextLayer(
  text: string,
  options?: Partial<TextLayer>
): TextLayer {
  return {
    id: generateLayerId(),
    type: 'text',
    name: options?.name || `Texto: ${text.slice(0, 20)}`,
    x: options?.x ?? 100,
    y: options?.y ?? 100,
    width: options?.width,
    height: options?.height,
    rotation: options?.rotation ?? 0,
    opacity: options?.opacity ?? 1,
    visible: options?.visible ?? true,
    locked: options?.locked ?? false,
    text,
    fontSize: options?.fontSize ?? 48,
    fontFamily: options?.fontFamily ?? 'Inter, sans-serif',
    fill: options?.fill ?? '#000000',
    fontWeight: options?.fontWeight ?? 'normal',
    fontStyle: options?.fontStyle ?? 'normal',
    textAlign: options?.textAlign ?? 'left',
    underline: options?.underline ?? false,
    strokeWidth: options?.strokeWidth,
    stroke: options?.stroke,
    shadow: options?.shadow ?? false,
  };
}

/**
 * Cria camada de shape
 */
export function createShapeLayer(
  shape: ShapeKind,
  options?: Partial<ShapeLayer>
): ShapeLayer {
  return {
    id: generateLayerId(),
    type: 'shape',
    name: options?.name || `Shape: ${shape}`,
    x: options?.x ?? 100,
    y: options?.y ?? 100,
    width: options?.width ?? 200,
    height: options?.height ?? 200,
    rotation: options?.rotation ?? 0,
    opacity: options?.opacity ?? 1,
    visible: options?.visible ?? true,
    locked: options?.locked ?? false,
    shape,
    fill: options?.fill ?? '#ff0000',
    stroke: options?.stroke,
    strokeWidth: options?.strokeWidth,
    rx: options?.rx,
  };
}

/**
 * Cria camada de sticker (emoji)
 */
export function createStickerLayer(
  emoji: string,
  options?: Partial<StickerLayer>
): StickerLayer {
  return {
    id: generateLayerId(),
    type: 'sticker',
    name: options?.name || `Sticker: ${emoji}`,
    x: options?.x ?? 100,
    y: options?.y ?? 100,
    width: options?.width,
    height: options?.height,
    rotation: options?.rotation ?? 0,
    opacity: options?.opacity ?? 1,
    visible: options?.visible ?? true,
    locked: options?.locked ?? false,
    emoji,
    fontSize: options?.fontSize ?? 120,
    color: options?.color,
  };
}

/**
 * Cria camada de imagem adicional
 */
export function createImageLayer(
  imageUrl: string,
  options?: Partial<ImageLayer>
): ImageLayer {
  return {
    id: generateLayerId(),
    type: 'image',
    name: options?.name || 'Imagem',
    x: options?.x ?? 100,
    y: options?.y ?? 100,
    width: options?.width ?? 300,
    height: options?.height ?? 300,
    rotation: options?.rotation ?? 0,
    opacity: options?.opacity ?? 1,
    visible: options?.visible ?? true,
    locked: options?.locked ?? false,
    imageUrl,
    cropX: options?.cropX,
    cropY: options?.cropY,
  };
}

/**
 * Exporta projeto pra JSON (pra salvar no chat ou enviar pra IA)
 */
export function serializeProject(project: ImageProject): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Parseia JSON de volta pra projeto
 */
export function deserializeProject(json: string): ImageProject | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.layers)) {
      return null;
    }
    return parsed as ImageProject;
  } catch {
    return null;
  }
}
