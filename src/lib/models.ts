export const ALLOWED_MODELS = [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'minimaxai/minimax-m3.1-flash',
  'google/diffusiongemma-26b-a4b-it',
  'nvidia/nemotron-3-ultra-550b-a55b',
] as const;

export const VISION_MODELS = [
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
] as const;

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model as any);
}

/**
 * Modelos hospedados na Cloudflare Workers AI (atualmente desativados).
 */
export const CLOUDFLARE_MODELS = [] as const;

export function isCloudflareModel(model: string): boolean {
  return (CLOUDFLARE_MODELS as readonly string[]).includes(model);
}

/**
 * Modelos que suportam execução nativa de ferramentas (OpenAI Function Calling).
 * Todos os 6 modelos NVIDIA online suportam ferramentas nativas.
 */
export const TOOL_MODELS = [
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'minimaxai/minimax-m3.1-flash',
  'google/diffusiongemma-26b-a4b-it',
  'nvidia/nemotron-3-ultra-550b-a55b',
] as const;

export function isToolCapableModel(model: string): boolean {
  return TOOL_MODELS.includes(model as any);
}
