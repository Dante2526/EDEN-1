/**
 * Image Bounding Box Snapper & Grounding Converter
 * ==================================================
 * Responsável pelo alinhamento milimétrico de caixas delimitadoras
 * sobre elementos gráficos, textos e ícones na desconstrução visual.
 *
 * Combina:
 * 1. Conversão direta do formato de grounding [ymin, xmin, ymax, xmax] (0-1000)
 * 2. Imantação/Pixel-Snapping local no Canvas do navegador com detecção de bordas/delta-E
 */

export interface RawBBox {
  x: number;      // Posição horizontal do CENTRO em porcentagem (0-100)
  y: number;      // Posição vertical do CENTRO em porcentagem (0-100)
  width: number;  // Largura em porcentagem (0-100)
  height: number; // Altura em porcentagem (0-100)
}

export type BBoxHandle = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

/**
 * Calcula a nova posição e dimensões de uma caixa ao ser arrastada ou redimensionada via alça.
 * Garante limites entre 0 e 100% e tamanho mínimo seguro.
 */
export function computeBBoxResize(
  initialBox: RawBBox,
  handle: BBoxHandle,
  dxPct: number,
  dyPct: number,
  minSizePct = 1
): RawBBox {
  let left = initialBox.x - initialBox.width / 2;
  let top = initialBox.y - initialBox.height / 2;
  let right = initialBox.x + initialBox.width / 2;
  let bottom = initialBox.y + initialBox.height / 2;

  if (handle === 'move') {
    const w = initialBox.width;
    const h = initialBox.height;
    let newLeft = left + dxPct;
    let newTop = top + dyPct;

    // Trava dentro dos limites da imagem
    if (newLeft < 0) newLeft = 0;
    if (newTop < 0) newTop = 0;
    if (newLeft + w > 100) newLeft = 100 - w;
    if (newTop + h > 100) newTop = 100 - h;

    return {
      x: Math.round((newLeft + w / 2) * 10) / 10,
      y: Math.round((newTop + h / 2) * 10) / 10,
      width: Math.round(w * 10) / 10,
      height: Math.round(h * 10) / 10,
    };
  }

  // Ajustes horizontais
  if (handle === 'w' || handle === 'nw' || handle === 'sw') {
    left = Math.min(right - minSizePct, Math.max(0, left + dxPct));
  } else if (handle === 'e' || handle === 'ne' || handle === 'se') {
    right = Math.max(left + minSizePct, Math.min(100, right + dxPct));
  }

  // Ajustes verticais
  if (handle === 'n' || handle === 'nw' || handle === 'ne') {
    top = Math.min(bottom - minSizePct, Math.max(0, top + dyPct));
  } else if (handle === 's' || handle === 'sw' || handle === 'se') {
    bottom = Math.max(top + minSizePct, Math.min(100, bottom + dyPct));
  }

  const w = Math.max(minSizePct, right - left);
  const h = Math.max(minSizePct, bottom - top);

  return {
    x: Math.round((left + w / 2) * 10) / 10,
    y: Math.round((top + h / 2) * 10) / 10,
    width: Math.round(w * 10) / 10,
    height: Math.round(h * 10) / 10,
  };
}

export interface SnapOptions {
  /** Margem de tolerância/busca ao redor do box inicial em % da imagem (padrão: 8%) */
  paddingPercent?: number;
  /** Distância de cor euclidiana mínima para diferenciar do fundo local (padrão: 26) */
  colorThreshold?: number;
  /** Mínimo de pixels detectados para aceitar a imantação e não cair em ruído (padrão: 10) */
  minForegroundPixels?: number;
  /** Pixels adicionais de folga/respiro ao redor do contorno detectado (padrão: 0 para ajuste milimétrico) */
  padPixels?: number;
}

/**
 * Converte box_2d [ymin, xmin, ymax, xmax] da escala 0-1000
 * para porcentagens exatas { x, y, width, height }
 */
export function box2dToPercent(box: [number, number, number, number]): RawBBox {
  const [ymin, xmin, ymax, xmax] = box;
  const w = Math.max(0.1, (xmax - xmin) / 10);
  const h = Math.max(0.1, (ymax - ymin) / 10);
  const x = (xmin + xmax) / 20;
  const y = (ymin + ymax) / 20;

  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: Math.round(w * 10) / 10,
    height: Math.round(h * 10) / 10,
  };
}

/**
 * Imanta uma caixa delimitadora frouxa aos contornos exatos dos pixels na imagem.
 */
export function snapBBoxToPixels(
  pixelData: Uint8ClampedArray | Uint8Array,
  imageWidth: number,
  imageHeight: number,
  initialBBox: RawBBox,
  options?: SnapOptions
): RawBBox {
  const W = imageWidth;
  const H = imageHeight;
  if (!W || !H || !pixelData || pixelData.length < W * H * 4) {
    return initialBBox;
  }

  const paddingPct = options?.paddingPercent ?? 8;
  const threshold = options?.colorThreshold ?? 26;
  const minFg = options?.minForegroundPixels ?? 10;

  // Caixa estimada inicial em pixels
  const initLeftPx = ((initialBBox.x - initialBBox.width / 2) / 100) * W;
  const initTopPx = ((initialBBox.y - initialBBox.height / 2) / 100) * H;
  const initWidthPx = (initialBBox.width / 100) * W;
  const initHeightPx = (initialBBox.height / 100) * H;

  // Janela de busca com padding expandido
  const padX = (paddingPct / 100) * W;
  const padY = (paddingPct / 100) * H;

  const searchX0 = Math.max(0, Math.floor(initLeftPx - padX));
  const searchY0 = Math.max(0, Math.floor(initTopPx - padY));
  const searchX1 = Math.min(W, Math.ceil(initLeftPx + initWidthPx + padX));
  const searchY1 = Math.min(H, Math.ceil(initTopPx + initHeightPx + padY));

  const cropW = searchX1 - searchX0;
  const cropH = searchY1 - searchY0;
  if (cropW <= 2 || cropH <= 2) return initialBBox;

  // 1. Amostra a cor do fundo local na borda externa da janela de busca
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let borderCount = 0;
  let transparentBorderCount = 0;

  const samplePixel = (px: number, py: number) => {
    const idx = (py * W + px) * 4;
    const a = pixelData[idx + 3];
    if (a < 20) {
      transparentBorderCount++;
      return;
    }
    bgR += pixelData[idx];
    bgG += pixelData[idx + 1];
    bgB += pixelData[idx + 2];
    borderCount++;
  };

  // Topo e base da janela
  for (let x = searchX0; x < searchX1; x += 2) {
    samplePixel(x, searchY0);
    samplePixel(x, searchY1 - 1);
  }
  // Laterais da janela
  for (let y = searchY0; y < searchY1; y += 2) {
    samplePixel(searchX0, y);
    samplePixel(searchX1 - 1, y);
  }

  const isTransparentBg = transparentBorderCount > borderCount;
  if (borderCount > 0) {
    bgR /= borderCount;
    bgG /= borderCount;
    bgB /= borderCount;
  }

  // 2. Varre a região procurando pixels que diferem da cor do fundo
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let fgPixelCount = 0;

  for (let y = searchY0; y < searchY1; y++) {
    for (let x = searchX0; x < searchX1; x++) {
      const idx = (y * W + x) * 4;
      const alpha = pixelData[idx + 3];
      if (alpha < 20) continue; // pixel transparente

      // Se o fundo local for transparente, qualquer pixel com opacidade visível é foreground
      if (isTransparentBg) {
        fgPixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        continue;
      }

      const r = pixelData[idx];
      const g = pixelData[idx + 1];
      const b = pixelData[idx + 2];

      // Distância Euclidiana de cor
      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist >= threshold) {
        fgPixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Se não detectou pixels suficientes, mantém a caixa estimada do VLM
  if (fgPixelCount < minFg || minX === Infinity) {
    return initialBBox;
  }

  // Margem de respiro configurável (padrão 0 para contorno rente e milimétrico)
  const padSafety = options?.padPixels ?? 0;
  const snappedLeft = Math.max(0, minX - padSafety);
  const snappedTop = Math.max(0, minY - padSafety);
  const snappedRight = Math.min(W, maxX + 1 + padSafety);
  const snappedBottom = Math.min(H, maxY + 1 + padSafety);

  const snappedW = snappedRight - snappedLeft;
  const snappedH = snappedBottom - snappedTop;

  const widthPct = (snappedW / W) * 100;
  const heightPct = (snappedH / H) * 100;
  const centerXPct = ((snappedLeft + snappedW / 2) / W) * 100;
  const centerYPct = ((snappedTop + snappedH / 2) / H) * 100;

  return {
    x: Math.round(centerXPct * 10) / 10,
    y: Math.round(centerYPct * 10) / 10,
    width: Math.round(widthPct * 10) / 10,
    height: Math.round(heightPct * 10) / 10,
  };
}

/**
 * Executa o snapping de pixels em lote para uma lista de elementos usando uma imagem (Data URL ou HTMLImageElement).
 * Funciona de forma segura no navegador e retorna os elementos com caixas imantadas.
 */
export async function snapAllElements<T extends RawBBox>(
  imageSource: string | HTMLImageElement,
  elements: T[],
  options?: SnapOptions
): Promise<T[]> {
  if (!elements || elements.length === 0) return elements;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return elements;
  }

  let img: HTMLImageElement;
  if (typeof imageSource === 'string') {
    img = new Image();
    img.crossOrigin = 'anonymous';
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao carregar imagem'));
        img.src = imageSource;
      });
    } catch {
      return elements;
    }
  } else {
    img = imageSource;
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return elements;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return elements;

  ctx.drawImage(img, 0, 0, w, h);
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch {
    return elements;
  }

  return elements.map((el) => {
    const snapped = snapBBoxToPixels(
      imgData.data,
      w,
      h,
      { x: el.x, y: el.y, width: el.width, height: el.height },
      options
    );
    return {
      ...el,
      x: snapped.x,
      y: snapped.y,
      width: snapped.width,
      height: snapped.height,
    };
  });
}
