import { Env, getEnv } from './env';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 120;

function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

export const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'deepseek-ai/deepseek-v4.1-flash',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
];

/**
 * Modelos hospedados na Cloudflare Workers AI.
 * Usam endpoint OpenAI-compatible em api.cloudflare.com e exigem
 * CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN configurados.
 */
export const CLOUDFLARE_MODELS = [
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
];

export function isCloudflareModel(model: string): boolean {
  return CLOUDFLARE_MODELS.includes(model);
}

export const VISION_MODELS: string[] = [];

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model);
}

export function getHeader(req: any, name: string): string | null {
  if (!req || !req.headers) return null;
  if (typeof req.headers.get === 'function') {
    return req.headers.get(name);
  }
  const lowerName = name.toLowerCase();
  const val = req.headers[lowerName] ?? req.headers[name];
  if (Array.isArray(val)) return val[0] || null;
  return typeof val === 'string' ? val : null;
}

export function getClientIp(req: Request | any): string {
  // No Cloudflare, cf-connecting-ip é o cabeçalho confiável (setado pela própria CF).
  // Prioriza ele quando presente.
  const cfIp = getHeader(req, 'cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();

  const xForwardedFor = getHeader(req, 'x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = getHeader(req, 'x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();

  if (req?.socket?.remoteAddress) {
    return req.socket.remoteAddress;
  }

  return 'unknown';
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);

  if (aBytes.byteLength !== bBytes.byteLength) {
    let dummyResult = 0;
    for (let i = 0; i < aBytes.byteLength; i++) {
      dummyResult |= aBytes[i] ^ (bBytes[i % (bBytes.byteLength || 1)] || 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }

  return result === 0;
}

/**
 * Verifica rate limit. Aceita `env` (CF bindings) opcional — se não recebido,
 * cai pra `process.env` (dev local Node/Express).
 */
export async function checkRateLimit(
  req: Request,
  maxLimit = MAX_REQUESTS_PER_MINUTE,
  envArg?: Env
): Promise<Response | null> {
  const ip = getClientIp(req);
  if (ip === 'unknown') return null;

  const env = getEnv(envArg);
  const redisUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const minuteWindow = Math.floor(Date.now() / 60000);
      const key = `ratelimit:${ip}:${minuteWindow}`;

      const res = await fetch(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(2000),
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, 60],
        ]),
      });

      if (res.ok) {
        const data = await res.json();
        const count = data?.[0]?.result || 1;

        if (count > maxLimit) {
          return new Response(JSON.stringify({ error: 'Too Many Requests: Limite de taxa excedido (global).' }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
              'X-RateLimit-Limit': String(maxLimit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Store': 'upstash-redis',
            },
          });
        }
        return null;
      }
    } catch (err) {
      console.warn('Erro ao consultar Upstash Redis Rate Limit, aplicando fallback local:', err);
    }
  }

  const now = Date.now();
  cleanupExpiredEntries(now);

  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
  } else {
    entry.count += 1;
    if (entry.count > maxLimit) {
      return new Response(JSON.stringify({ error: 'Too Many Requests: Limite de taxa excedido (instância local).' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
          'X-RateLimit-Limit': String(maxLimit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Store': 'in-memory-isolate',
        },
      });
    }
  }

  return null;
}

/**
 * Combo: rate limit + auth (header x-api-key). Aceita `env` (CF bindings)
 * opcional. Se não recebido, cai pra `process.env` via `getEnv()`.
 */
export async function checkAuthAndRateLimit(
  req: Request,
  envArg?: Env
): Promise<Response | null> {
  const env = getEnv(envArg);

  const rateLimitResponse = await checkRateLimit(req, MAX_REQUESTS_PER_MINUTE, env);
  if (rateLimitResponse) return rateLimitResponse;

  const expectedSecret = env.SYNAP_API_SECRET?.trim();
  if (!expectedSecret) {
    return null;
  }

  const providedKey = getHeader(req, 'x-api-key');
  if (!providedKey || !timingSafeEqualStrings(providedKey, expectedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Chave de API inválida ou ausente (x-api-key)' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}
