export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'deepseek-ai/deepseek-v4.1-flash',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
] as const;

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
] as const;

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model as any);
}

/**
 * Modelos hospedados na Cloudflare Workers AI.
 * São roteados no backend para o endpoint OpenAI-compatible da CF
 * (api.cloudflare.com/client/v4/accounts/{id}/ai/v1/chat/completions)
 * e exigem CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 */
export const CLOUDFLARE_MODELS = [
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
] as const;

export function isCloudflareModel(model: string): boolean {
  return CLOUDFLARE_MODELS.includes(model as any);
}
