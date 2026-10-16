export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  widthPercent: number;
  heightPercent: number;
  centerXPercent: number;
  centerYPercent: number;
}

/**
 * Verifica se há pontos válidos desenhados pelo usuário
 */
export function hasActiveMask(points: Point[]): boolean {
  return Array.isArray(points) && points.length > 0;
}

/**
 * Calcula a bounding box normalizada e as porcentagens em relação à dimensão do canvas
 */
export function calculateBoundingBox(
  points: Point[],
  canvasWidth: number,
  canvasHeight: number
): BoundingBox {
  if (!points.length || canvasWidth <= 0 || canvasHeight <= 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      widthPercent: 0,
      heightPercent: 0,
      centerXPercent: 0,
      centerYPercent: 0,
    };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return {
    minX: Math.round(minX),
    minY: Math.round(minY),
    maxX: Math.round(maxX),
    maxY: Math.round(maxY),
    widthPercent: Math.round((width / canvasWidth) * 100),
    heightPercent: Math.round((height / canvasHeight) * 100),
    centerXPercent: Math.round((centerX / canvasWidth) * 100),
    centerYPercent: Math.round((centerY / canvasHeight) * 100),
  };
}

/**
 * Identifica a região aproximada em linguagem natural para guiar a IA
 */
export function describeRegion(box: BoundingBox): string {
  const { centerXPercent, centerYPercent } = box;

  const isLeft = centerXPercent < 35;
  const isRight = centerXPercent > 65;
  const isCenterH = !isLeft && !isRight;

  const isTop = centerYPercent < 35;
  const isBottom = centerYPercent > 65;
  const isCenterV = !isTop && !isBottom;

  if (isCenterH && isCenterV) {
    return 'no centro da imagem';
  }

  if (isTop && isLeft) return 'no canto superior esquerdo';
  if (isTop && isRight) return 'no canto superior direito';
  if (isTop && isCenterH) return 'na parte superior';

  if (isBottom && isLeft) return 'no canto inferior esquerdo';
  if (isBottom && isRight) return 'no canto inferior direito';
  if (isBottom && isCenterH) return 'na parte inferior';

  if (isLeft) return 'no lado esquerdo da imagem';
  if (isRight) return 'no lado direito da imagem';

  return 'na região selecionada da imagem';
}

/**
 * Enriquece o prompt do usuário com a localização delimitada pelo pincel
 */
export function buildRegionEditPrompt(
  userPrompt: string,
  box: BoundingBox | null
): string {
  const cleanPrompt = userPrompt?.trim() || '';
  if (!box || (box.widthPercent === 0 && box.heightPercent === 0)) {
    return cleanPrompt;
  }

  const regionDescription = describeRegion(box);
  const dimensionInfo = `(ocupando aprox. ${box.widthPercent}% de largura e ${box.heightPercent}% de altura)`;

  return `[Foco de edição: ${regionDescription} ${dimensionInfo}]: ${cleanPrompt}`;
}
