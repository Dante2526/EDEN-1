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
  'z-ai/glm-5.3-flash',
  'google/gemma-4-31b-it',
  'deepseek-ai/deepseek-v4.1-flash',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
];

/**
 * Modelos hospedados na Cloudflare Workers AI (atualmente desativados).
 */
export const CLOUDFLARE_MODELS: string[] = [];

export function isCloudflareModel(model: string): boolean {
  return CLOUDFLARE_MODELS.includes(model);
}

export const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
];

export function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model);
}

export const TOOL_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'google/gemma-4-31b-it',
  'deepseek-ai/deepseek-v4.1-flash',
  'nvidia/nemotron-3.5-super-vl-120b-a12b',
  'nvidia/nemotron-3-ultra-550b-a55b',
];

export function isToolCapableModel(model: string): boolean {
  return TOOL_MODELS.includes(model);
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
  // No Cloudflare, cf-connecting-ip é o cabecalho confiável (setado pela propria CF).
  // Priorize o que estiver presente.
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
 * Verifica rate limit. Aceita `env` (CF bindings) opcional —
 * se não recebido, cai para `process.env` (dev local Node/Express).
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
 * opcional. Se não recebido, cai para `process.env` via `getEnv()`.
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

/**
 * Validação rigorosa anti-SSRF: bloqueia requisições a loopbacks (127.0.0.0/8),
 * Link-Local / Cloud Instance Metadata Services (169.254.0.0/16), redes privadas RFC 1918
 * (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), CGNAT (100.64.0.0/10) e IPv6 privados
 * e representações numéricas puras de IP.
 */
export function isLocalOrPrivateUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return true;

  try {
    const parsed = new URL(urlStr);
    const protocol = parsed.protocol.toLowerCase();

    // Apenas protocolos web públicos são permitidos
    if (protocol !== 'http:' && protocol !== 'https:') {
      return true;
    }

    // Normaliza hostname removendo colchetes de IPv6 e espaços
    let hostname = parsed.hostname.toLowerCase().trim();
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }

    // Nomes de domínio locais / internos conhecidos e wildcards DNS
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.home') ||
      hostname.endsWith('.corp') ||
      hostname.endsWith('.nip.io') ||
      hostname.endsWith('.sslip.io') ||
      hostname.endsWith('.localtest.me') ||
      hostname.endsWith('.vcap.me') ||
      hostname.endsWith('.traefik.me') ||
      hostname === '0.0.0.0' ||
      hostname === '::'
    ) {
      return true;
    }

    // Bloqueia decimais/hex puros que contenham filtragem de IP (ex: 2130706433 ou 0x7f000001)
    if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
      return true;
    }

    // IPv6 Loopback, Link-Local (fe80::/10), Site-Local (fec0::/10), ULA (fc00::/7) e IPv4-Mapped
    const ipv6LocalRegex = /^(::1|0:0:0:0:0:0:0:1|::|f[cd][0-9a-f]{2}:|fe[89abc][0-9a-f]{1,2}:|::ffff:)/i;
    if (ipv6LocalRegex.test(hostname)) {
      return true;
    }

    // Se for IPv4 (4 octetos)
    const ipv4Parts = hostname.split('.');
    if (ipv4Parts.length === 4 && ipv4Parts.every((p) => /^\d+$/.test(p))) {
      const [o1, o2] = ipv4Parts.map((p) => parseInt(p, 10));

      // 127.0.0.0/8 (Loopback completo) e 0.0.0.0/8
      if (o1 === 127 || o1 === 0) return true;

      // 169.254.0.0/16 (Link-Local / AWS/GCP/Azure Instance Metadata 169.254.169.254)
      if (o1 === 169 && o2 === 254) return true;

      // 10.0.0.0/8 (Rede Privada Classe A)
      if (o1 === 10) return true;

      // 172.16.0.0/12 (Rede Privada Classe B: 172.16.x.x - 172.31.x.x)
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;

      // 192.168.0.0/16 (Rede Privada Classe C)
      if (o1 === 192 && o2 === 168) return true;

      // 100.64.0.0/10 (Carrier-Grade NAT / Shared Address Space: 100.64 - 100.127)
      if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;

      // 192.0.0.0/24 (IETF Protocol Assignments) e 198.18.0.0/15 (Benchmarking)
      if (o1 === 192 && o2 === 0) return true;
      if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;

      // 224.0.0.0/4 (Multicast Classes D) e 240.0.0.0/4 (Reservas/Classes E)
      if (o1 >= 224) return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Executa fetch HTTP com validação anti-SSRF e acompanhamento controlado
 * de redirecionamentos (CWE-918).
 * Previne ataques via HTTP 301/302/303/307/308 para metadados de nuvem ou redes privadas.
 */
export async function safeFetchWithRedirects(
  initialUrl: string,
  options: RequestInit = {},
  maxRedirects = 5
): Promise<Response & { finalUrl?: string }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (isLocalOrPrivateUrl(currentUrl)) {
      throw new Error(`SSRF Blocked: tentativa de conexão para endereço privado ou restrito (${currentUrl})`);
    }

    const res = await fetch(currentUrl, {
      ...options,
      redirect: 'manual',
    });

    const isRedirect =
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 307 ||
      res.status === 308;

    if (!isRedirect) {
      (res as any).finalUrl = currentUrl;
      return res;
    }

    const location = res.headers.get('location');
    if (!location) {
      (res as any).finalUrl = currentUrl;
      return res;
    }

    // Resolve URL de redirecionamento relativo à absoluta
    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).href;
    } catch {
      throw new Error(`SSRF Blocked: URL de redirecionamento inválida (${location})`);
    }

    // Se o método era POST e o status foi 303 (ou 301/302), converte para GET nas próximas requisições
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && options.method === 'POST')) {
      options = {
        ...options,
        method: 'GET',
        body: undefined,
      };
    }

    currentUrl = nextUrl;
  }

  throw new Error(`Excedido o número máximo de redirecionamentos (${maxRedirects})`);
}
