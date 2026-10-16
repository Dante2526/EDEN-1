export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'google/gemma-4-31b-it',
  'deepseek-ai/deepseek-v4.1-flash',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
] as const;

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
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
 * Todos os 5 modelos NVIDIA atuais suportam ferramentas nativas.
 */
export const TOOL_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'google/gemma-4-31b-it',
  'deepseek-ai/deepseek-v4.1-flash',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
] as const;

export function isToolCapableModel(model: string): boolean {
  return TOOL_MODELS.includes(model as any);
}
