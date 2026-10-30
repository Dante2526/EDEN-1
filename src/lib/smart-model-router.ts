import type { ConcreteModelId, ModelId, ReasoningEffort } from './types';
import { VISION_MODELS } from './models';

export type ModelHealthStatus = 'online' | 'slow' | 'offline' | 'checking';

export interface ModelHealthInfo {
  id: ConcreteModelId;
  status: ModelHealthStatus;
  latencyMs: number | null;
  checkedAt: number;
  error?: string;
}

export type ModelHealthMap = Partial<Record<ConcreteModelId, ModelHealthInfo>>;

export type TaskIntent = 'vision' | 'fast_practical' | 'deep_architectural';

export interface SmartRouteInput {
  selectedModel: ModelId;
  selectedEffort: ReasoningEffort;
  prompt: string;
  hasImages?: boolean;
  isPlanMode?: boolean;
  healthMap?: ModelHealthMap;
}

export interface SmartRouteDecision {
  isAutoRouted: boolean;
  targetModel: ConcreteModelId;
  targetEffort: ReasoningEffort;
  intent: TaskIntent;
  reason: string;
}

const DEEP_ARCHITECTURAL_PATTERNS =
  /\b(arquitetura|refatore toda|refatora[çc][ãa]o completa|migra[çc][ãa]o|sistema completo|oauth2?|distribu[íi]do|compilador|multi-n[íi]vel|auditoria completa|reescreva todo|redesenh[eo] arquitetural|microsservi[çc]os)\b/i;

/**
 * Classifica a intenção da tarefa para decidir o perfil ideal de modelo e raciocínio.
 */
export function classifyTaskIntent(input: {
  prompt: string;
  hasImages?: boolean;
  isPlanMode?: boolean;
}): TaskIntent {
  if (input.hasImages) {
    return 'vision';
  }
  if (input.isPlanMode) {
    return 'deep_architectural';
  }
  const text = (input.prompt || '').trim();
  if (DEEP_ARCHITECTURAL_PATTERNS.test(text) || text.length > 900) {
    return 'deep_architectural';
  }
  return 'fast_practical';
}

/**
 * Seleciona um candidato online baseado no mapa de saúde em tempo real da NVIDIA.
 */
function pickHealthyCandidate(
  candidates: ConcreteModelId[],
  healthMap: ModelHealthMap | undefined,
  sortByFastest: boolean,
  fallback: ConcreteModelId
): { model: ConcreteModelId; latencyMs: number | null } {
  if (!healthMap || Object.keys(healthMap).length === 0) {
    return { model: fallback, latencyMs: null };
  }

  // 1. Filtra modelos explicitamente 'online'
  const onlineList = candidates.filter((id) => healthMap[id]?.status === 'online');
  if (onlineList.length > 0) {
    if (sortByFastest) {
      const sorted = [...onlineList].sort((a, b) => {
        const latA = healthMap[a]?.latencyMs ?? 99999;
        const latB = healthMap[b]?.latencyMs ?? 99999;
        return latA - latB;
      });
      const chosen = sorted[0];
      return { model: chosen, latencyMs: healthMap[chosen]?.latencyMs ?? null };
    }
    const chosen = onlineList[0];
    return { model: chosen, latencyMs: healthMap[chosen]?.latencyMs ?? null };
  }

  // 2. Fallback para modelos 'slow' (respondendo porém com fila)
  const slowList = candidates.filter((id) => healthMap[id]?.status === 'slow');
  if (slowList.length > 0) {
    const chosen = slowList[0];
    return { model: chosen, latencyMs: healthMap[chosen]?.latencyMs ?? null };
  }

  // 3. Fallback para candidatos que ainda não foram marcados como 'offline'
  const notOffline = candidates.filter((id) => healthMap[id]?.status !== 'offline');
  if (notOffline.length > 0) {
    return { model: notOffline[0], latencyMs: null };
  }

  return { model: fallback, latencyMs: null };
}

/**
 * Resolve qual modelo concreto e qual esforço de raciocínio usar.
 * Regra de Ouro: Se selectedModel !== 'auto', respeita 100% a escolha manual do usuário.
 */
export function resolveSmartModelRoute(input: SmartRouteInput): SmartRouteDecision {
  const intent = classifyTaskIntent({
    prompt: input.prompt,
    hasImages: input.hasImages,
    isPlanMode: input.isPlanMode,
  });

  // Se o usuário selecionou um modelo manualmente, respeita 100% a escolha dele
  if (input.selectedModel !== 'auto') {
    return {
      isAutoRouted: false,
      targetModel: input.selectedModel,
      targetEffort: input.selectedEffort,
      intent,
      reason: `Modo manual: mantendo ${input.selectedModel}`,
    };
  }

  // Modo Automático ('auto') ativo:
  if (intent === 'vision') {
    const visionCandidates: ConcreteModelId[] = [
      ...(VISION_MODELS as unknown as ConcreteModelId[]),
    ];
    const picked = pickHealthyCandidate(
      visionCandidates,
      input.healthMap,
      true,
      'nvidia/nemotron-3.5-super-vl-120b-a12b'
    );
    return {
      isAutoRouted: true,
      targetModel: picked.model,
      targetEffort: 'low',
      intent: 'vision',
      reason: `Visão Multimodal Online (${picked.latencyMs ? `${picked.latencyMs}ms` : 'Rápido'})`,
    };
  }

  if (intent === 'deep_architectural') {
    const deepCandidates: ConcreteModelId[] = [
      'nvidia/nemotron-3-ultra-550b-a55b',
      'z-ai/glm-5.3',
      'nvidia/nemotron-3.5-super-vl-120b-a12b',
      'google/gemma-4-31b-it',
      'z-ai/glm-5.3-flash',
    ];
    const picked = pickHealthyCandidate(
      deepCandidates,
      input.healthMap,
      false, // Prioriza capacidade/inteligência máxima dentre os que estão online
      'nvidia/nemotron-3-ultra-550b-a55b'
    );
    return {
      isAutoRouted: true,
      targetModel: picked.model,
      targetEffort: input.isPlanMode ? 'high' : 'low',
      intent: 'deep_architectural',
      reason: `Arquitetura Complexa Online (${picked.latencyMs ? `${picked.latencyMs}ms` : 'Alta Capacidade'})`,
    };
  }

  // Default: 'fast_practical' (alterações de botões, UI, correções práticas, leitura/edição ágil)
  const fastCandidates: ConcreteModelId[] = [
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'minimaxai/minimax-m3.1-flash',
    'google/diffusiongemma-26b-a4b-it',
    'openai/gpt-oss-20b',
    'z-ai/glm-5.3-flash',
    'deepseek-ai/deepseek-v4.1-flash',
    'nvidia/nemotron-3.5-super-vl-120b-a12b',
    'google/gemma-4-31b-it',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'z-ai/glm-5.3',
  ];
  const picked = pickHealthyCandidate(
    fastCandidates,
    input.healthMap,
    true, // Ordena pelo modelo online de menor latência real!
    'nvidia/nemotron-3.5-super-vl-120b-a12b'
  );

  return {
    isAutoRouted: true,
    targetModel: picked.model,
    targetEffort: 'low',
    intent: 'fast_practical',
    reason: `Execução Prática Rápida (${picked.latencyMs ? `${picked.latencyMs}ms` : 'Turbo'})`,
  };
}

/**
 * Retorna um nome curto amigável para exibição na UI.
 */
export function getShortModelName(modelId: string): string {
  switch (modelId) {
    case 'auto':
      return 'Automático ⚡';
    case 'z-ai/glm-5.3-flash':
      return 'GLM-5.3 Flash';
    case 'z-ai/glm-5.3':
      return 'GLM-5.3';
    case 'google/gemma-4-31b-it':
      return 'Gemma 4 31B';
    case 'deepseek-ai/deepseek-v4.1-flash':
      return 'DeepSeek V4.1';
    case 'nvidia/nemotron-3.5-super-vl-120b-a12b':
      return 'Nemotron VL 120B';
    case 'nvidia/nemotron-3.5-lightning-30b-a3b':
      return 'Nemotron Lightning 30B';
    case 'minimaxai/minimax-m3.1-flash':
      return 'MiniMax Flash';
    case 'google/diffusiongemma-26b-a4b-it':
      return 'DiffusionGemma 26B';
    case 'openai/gpt-oss-20b':
      return 'GPT-OSS 20B';
    case 'nvidia/nemotron-3-ultra-550b-a55b':
      return 'Nemotron 3 Ultra';
    default:
      return modelId;
  }
}
