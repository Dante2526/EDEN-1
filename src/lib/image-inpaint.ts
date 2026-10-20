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
 * Converte Base64 para Uint8Array de forma 100% multiplataforma
 * (Cloudflare Workers/Pages workerd, Browser nativo e Node.js sem depender de Buffer global).
 */
export function base64ToUint8Array(base64OrDataUrl: string): Uint8Array {
  const raw = extractRawBase64(base64OrDataUrl);
  if (!raw) return new Uint8Array(0);

  if (typeof globalThis.atob === 'function') {
    try {
      const binaryStr = globalThis.atob(raw);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fallback defensivo
    }
  }

  if (typeof Buffer !== 'undefined') {
    try {
      return new Uint8Array(Buffer.from(raw, 'base64'));
    } catch {}
  }

  return new Uint8Array(0);
}

/**
 * Converte comandos comuns em português e prompts de inpainting em descrições
 * em inglês de alta fidelidade para modelos de difusão (Stable Diffusion e FLUX Fill).
 * Trata comandos imperativos ("muda o verde para azul"), typos ("paraa zul", "zul")
 * e prioriza a cor/objeto de destino (após "para"/"pra"/"por").
 */
export function formatInpaintPrompt(prompt: string): string {
  const clean = (prompt || '').trim();
  if (!clean) return '';

  let normalized = clean.toLowerCase();
  // Corrige typos comuns de digitação em celular
  normalized = normalized.replace(/\bparaa\b/g, 'para');
  normalized = normalized.replace(/\bpraa\b/g, 'pra');
  normalized = normalized.replace(/\bzul\b/g, 'azul');

  // Se o comando tiver estrutura de substituição "muda [origem] para/pra/por [destino]"
  // extraímos a parte do destino para não confundir com a cor original que está sendo removida
  const targetMatch = normalized.match(
    /(?:muda|mude|mudar|troca|troque|trocar|altera|altere|alterar|transforma|transforme|transformar|passa|passe|passar|substitua|substituir)\s+(?:.*?\s+)?(?:para|pra|por)\s+(.+)/
  );
  const targetText = targetMatch ? targetMatch[1] : normalized;

  // 1. Detecta intenção de cor AZUL no destino ou no texto geral
  const hasBlueInTarget =
    targetText.includes('azul') ||
    targetText.includes('blue') ||
    targetText.includes('cyan') ||
    targetText.includes('turquesa') ||
    targetText.includes('cobalto');

  if (hasBlueInTarget) {
    if (
      normalized.includes('grama') ||
      normalized.includes('musgo') ||
      normalized.includes('chao') ||
      normalized.includes('chão') ||
      normalized.includes('folha') ||
      normalized.includes('vegeta') ||
      normalized.includes('planta') ||
      normalized.includes('tronco')
    ) {
      return 'vibrant glowing cobalt blue grass, electric blue moss, lush blue foliage, 8k, photorealistic, intricate cinematic lighting, highly detailed';
    }
    return 'vibrant rich blue texture, bright sapphire blue color, glowing cyan-blue accents, highly detailed, photorealistic';
  }

  // 2. Detecta intenção de cor VERDE no destino
  const hasGreenInTarget =
    targetText.includes('verde') ||
    targetText.includes('green') ||
    targetText.includes('esmeralda');

  if (hasGreenInTarget) {
    return 'lush vibrant emerald green moss, fresh green grass, botanical details, photorealistic, 8k';
  }

  // 3. Detecta intenção de cor VERMELHA no destino
  const hasRedInTarget =
    targetText.includes('vermelh') ||
    targetText.includes('rubi') ||
    targetText.includes('red') ||
    targetText.includes('carmesim');

  if (hasRedInTarget) {
    return 'vibrant ruby red texture, glowing crimson accents, rich vivid red tones, highly detailed';
  }

  // 4. Detecta intenção de DOURADO / AMARELO / OURO no destino
  const hasGoldInTarget =
    targetText.includes('dourad') ||
    targetText.includes('ouro') ||
    targetText.includes('amarel') ||
    targetText.includes('gold') ||
    targetText.includes('yellow');

  if (hasGoldInTarget) {
    if (normalized.includes('escaravelho') || normalized.includes('besouro')) {
      return 'glowing polished gold scarab beetle, metallic golden reflections, radiant amber tones, 8k, photorealistic';
    }
    return 'glowing polished gold texture, metallic golden reflections, radiant amber tones, 8k, photorealistic';
  }

  // 5. Detecta intenção de ROXO / VIOLETA no destino
  const hasPurpleInTarget =
    targetText.includes('rox') ||
    targetText.includes('violet') ||
    targetText.includes('purple') ||
    targetText.includes('lilas') ||
    targetText.includes('lilás');

  if (hasPurpleInTarget) {
    return 'vibrant electric purple violet texture, glowing neon lavender accents, highly detailed';
  }

  // 6. Detecta comandos de remoção / apagar
  if (
    normalized.includes('remover') ||
    normalized.includes('remove') ||
    normalized.includes('apagar') ||
    normalized.includes('tirar') ||
    normalized.includes('limpar') ||
    normalized.includes('eliminar')
  ) {
    return 'clean seamless empty background texture, seamless surface matching surroundings, photorealistic inpaint';
  }

  // Se já for descritivo ou em inglês, preserva o prompt original
  return clean;
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
  const formattedPrompt = formatInpaintPrompt(params.prompt);

  return {
    prompt: formattedPrompt,
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

  const maskBytes = base64ToUint8Array(rawMask);
  const imageBytes = base64ToUint8Array(rawImage);
  const maskArray = Array.from(maskBytes);
  const imageArray = imageBytes.length > 0 ? Array.from(imageBytes) : undefined;

  const formattedPrompt = formatInpaintPrompt(params.prompt);

  return {
    prompt: formattedPrompt,
    image_b64: rawImage,
    mask_b64: rawMask,
    mask: maskArray,
    ...(imageArray ? { image: imageArray } : {}),
    num_steps: Math.min(steps, 20),
    strength: 1.0,
    guidance: 7.5,
  };
}
