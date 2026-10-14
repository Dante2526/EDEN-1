export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'claude-opus-5-5',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-fabula-5-1',
  'claude-opus-4-8',
] as const;

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'claude-opus-5-5',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-fabula-5-1',
  'claude-opus-4-8',
] as const;

export const ABHIBOTS_MODELS = [
  'claude-opus-5-5',
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-fabula-5-1',
  'claude-opus-4-8',
] as const;

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model as any);
}

export function isAbhibotsModel(model: string): boolean {
  return ABHIBOTS_MODELS.includes(model as any);
}
