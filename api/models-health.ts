import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';
import { ALLOWED_MODELS } from '../src/lib/models';

export const config = {
  runtime: 'edge',
};

export interface ServerModelHealth {
  id: string;
  status: 'online' | 'slow' | 'offline';
  latencyMs: number | null;
  checkedAt: number;
  error?: string;
}

let cachedHealthReport: {
  checkedAt: number;
  models: Record<string, ServerModelHealth>;
} | null = null;

const HEALTH_CACHE_TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 4_500;
const SLOW_THRESHOLD_MS = 2_800;

async function probeModel(modelId: string, apiKey: string): Promise<ServerModelHealth> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

  try {
    const payload: Record<string, any> = {
      model: modelId,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      stream: false,
    };

    if (modelId.startsWith('nvidia/nemotron') || modelId === 'google/gemma-4-31b-it') {
      payload.chat_template_kwargs = { enable_thinking: false };
    }

    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return {
        id: modelId,
        status: 'offline',
        latencyMs: null,
        checkedAt: Date.now(),
        error: `HTTP ${res.status}`,
      };
    }

    return {
      id: modelId,
      status: latencyMs <= SLOW_THRESHOLD_MS ? 'online' : 'slow',
      latencyMs,
      checkedAt: Date.now(),
    };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      id: modelId,
      status: 'offline',
      latencyMs: null,
      checkedAt: Date.now(),
      error: err?.name === 'AbortError' ? 'Timeout (>4.5s)' : err?.message || 'Offline',
    };
  }
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';

  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'nvapi-your-key-here') {
    return new Response(
      JSON.stringify({ error: 'NVIDIA_API_KEY não configurada.', models: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (
    !force &&
    cachedHealthReport &&
    Date.now() - cachedHealthReport.checkedAt < HEALTH_CACHE_TTL_MS
  ) {
    return new Response(
      JSON.stringify({
        cached: true,
        checkedAt: cachedHealthReport.checkedAt,
        models: cachedHealthReport.models,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const results = await Promise.all(
    ALLOWED_MODELS.map((modelId) => probeModel(modelId, apiKey))
  );

  const modelsMap: Record<string, ServerModelHealth> = {};
  for (const item of results) {
    modelsMap[item.id] = item;
  }

  cachedHealthReport = {
    checkedAt: Date.now(),
    models: modelsMap,
  };

  return new Response(
    JSON.stringify({
      cached: false,
      checkedAt: cachedHealthReport.checkedAt,
      models: modelsMap,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
