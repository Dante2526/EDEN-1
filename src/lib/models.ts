export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'claude-sonnet-4-5',
  'claude-opus-4-1',
] as const;

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'claude-sonnet-4-5',
  'claude-opus-4-1',
] as const;

export const ABHIBOTS_MODELS = [
  'claude-sonnet-4-5',
  'claude-opus-4-1',
] as const;

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model as any);
}

export function isAbhibotsModel(model: string): boolean {
  return ABHIBOTS_MODELS.includes(model as any);
}
