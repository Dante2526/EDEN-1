export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'google/gemini-3.1-pro',
] as const;

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
  'google/gemini-3.1-pro',
] as const;

export const GOOGLE_MODELS = [
  'google/gemini-3.1-pro',
] as const;

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model as any);
}

export function isGoogleModel(model: string): boolean {
  return GOOGLE_MODELS.includes(model as any);
}
