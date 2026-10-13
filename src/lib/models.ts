export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
] as const;

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
] as const;

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model as any);
}
