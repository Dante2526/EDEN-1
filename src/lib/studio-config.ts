import { get, set } from 'idb-keyval';
import { StudioAgent } from '../studio/studio-types';

export const DEFAULT_STUDIO_CONFIG = {
  planner: { role: 'planner', model: 'moonshotai/kimi-k3', reasoningEffort: 'max' } as StudioAgent,
  reviewer: { role: 'reviewer', model: 'z-ai/glm-5.3', reasoningEffort: 'high' } as StudioAgent,
  implementer: { role: 'implementer', model: 'z-ai/glm-5.3', reasoningEffort: 'low' } as StudioAgent,
};

const CONFIG_KEY = 'synap_studio_config';

export async function loadStudioConfig() {
  const saved = await get<{ planner: StudioAgent; reviewer: StudioAgent; implementer: StudioAgent }>(CONFIG_KEY);
  return saved || DEFAULT_STUDIO_CONFIG;
}

export async function saveStudioConfig(config: { planner: StudioAgent; reviewer: StudioAgent; implementer: StudioAgent }) {
  await set(CONFIG_KEY, config);
}
