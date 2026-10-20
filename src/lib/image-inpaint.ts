/**
 * Motor Lógico de Inpainting com Máscara e Coordenadas de Canvas (Mobile-First)
 */

export interface InpaintValidationResult {
  valid: boolean;
  error?: string;
  cleanPrompt?: string;
}

export interface InpaintParams {
  image: string;
  mask: string;
  prompt: string;
  seed?: number;
  steps?: number;
  model?: string;
}

export type InpaintModelKey = 'flux-kontext' | 'sd-inpaint';

/**
 * Valida o payload de inpainting garantindo presença de imagem original, máscara e prompt descritivo.
 */
export function validateInpaintPayload(input: {
  image?: string;
  mask?: string;
  prompt?: string;
}): InpaintValidationResult {
  const cleanPrompt = (input.prompt || '').trim();
  if (!cleanPrompt) {
    return {
      valid: false,
      error: 'Prompt de edição não fornecido. Descreva o que deseja alterar na área selecionada.',
    };
  }

  const image = (input.image || '').trim();
  if (!image) {
    return {
      valid: false,
      error: 'Imagem original ausente para o processo de inpainting.',
    };
  }

  const mask = (input.mask || '').trim();
  if (!mask) {
    return {
      valid: false,
      error: 'Máscara de pintura ausente. Pincele a área que deseja alterar antes de enviar.',
    };
  }

  return {
    valid: true,
    cleanPrompt,
  };
}

/**
 * Extrai a string Base64 pura descartando prefixos como "data:image/png;base64,".
 */
export function extractRawBase64(dataUrlOrBase64: string): string {
  if (!dataUrlOrBase64) return '';
  const commaIdx = dataUrlOrBase64.indexOf(',');
  if (commaIdx !== -1 && dataUrlOrBase64.slice(0, commaIdx).includes('base64')) {
    return dataUrlOrBase64.slice(commaIdx + 1).trim();
  }
  return dataUrlOrBase64.trim();
}

/**
 * Normaliza a chave do modelo de inpaint solicitado.
 */
export function normalizeInpaintModel(modelName?: string): InpaintModelKey {
  if (!modelName) return 'flux-kontext';
  const lower = modelName.toLowerCase();
  if (lower.includes('sd') || lower.includes('stable')) {
    return 'sd-inpaint';
  }
  return 'flux-kontext';
}

/**
 * Calcula as coordenadas de toque (touch) ou clique (mouse) relativas ao canvas,
 * compensando as diferenças entre o tamanho de renderização CSS e a resolução interna de pixels.
 * Aplica limitação (clamp) para garantir que as coordenadas fiquem estritamente dentro da imagem.
 */
export function getCanvasCoordinates(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  internalWidth: number,
  internalHeight: number
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }

  const scaleX = internalWidth / rect.width;
  const scaleY = internalHeight / rect.height;

  const rawX = (clientX - rect.left) * scaleX;
  const rawY = (clientY - rect.top) * scaleY;

  const clampedX = Math.max(0, Math.min(internalWidth, rawX));
  const clampedY = Math.max(0, Math.min(internalHeight, rawY));

  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
  };
}

/**
 * Monta o payload padronizado para a API da NVIDIA NIM (FLUX.1-Kontext ou FLUX Fill).
 */
export function buildInpaintNvidiaPayload(params: InpaintParams) {
  const seed = params.seed ?? Math.floor(Math.random() * 1_000_000);
  const steps = params.steps ?? 25;

  return {
    prompt: params.prompt.trim(),
    image: params.image,
    mask: params.mask,
    mode: 'inpaint',
    steps,
    seed,
  };
}

/**
 * Monta o payload padronizado para Cloudflare Workers AI Inpainting
 * (@cf/runwayml/stable-diffusion-v1-5-inpainting).
 */
export function buildInpaintCloudflarePayload(params: InpaintParams) {
  const rawImage = extractRawBase64(params.image);
  const rawMask = extractRawBase64(params.mask);
  const steps = params.steps ?? 20;

  let maskArray: number[] | undefined;
  if (typeof Buffer !== 'undefined' && rawMask) {
    try {
      maskArray = Array.from(Buffer.from(rawMask, 'base64'));
    } catch {}
  }

  return {
    prompt: params.prompt.trim(),
    image_b64: rawImage,
    mask_b64: rawMask,
    ...(maskArray ? { mask: maskArray } : {}),
    num_steps: Math.min(steps, 20),
    strength: 1.0,
    guidance: 7.5,
  };
}
