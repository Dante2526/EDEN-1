import { checkAuthAndRateLimit } from '../lib/server/_security';

/**
 * Synap Downloader API
 * --------------------
 * Proxy server-side para a API do cobalt (https://github.com/imputnet/cobalt).
 *
 * RUNTIME: Edge (igual às outras funções do Synap). Antes estava em 'nodejs', mas o
 * handler é no formato Web (Request/Response): no Node da Vercel isso cai no formato
 * antigo (req, res) e, com "type": "module", o import sem extensão derruba a função
 * ao carregar ("A server error has occurred" -> o cliente não conseguia ler o JSON).
 *
 * LIMITE DE TEMPO: a Edge exige o 1º byte em ~25s. Por isso a função tem um orçamento
 * total (20s) e SEMPRE responde JSON antes disso, mesmo que as instâncias não respondam.
 *
 * INSTÂNCIA PRÓPRIA (recomendado):
 *   COBALT_API_URL = https://sua-instancia-cobalt.exemplo
 *   COBALT_API_KEY = chave Api-Key da instância (opcional)
 * As instâncias públicas da lista abaixo são só fallback: a oficial (api.cobalt.tools)
 * usa proteção contra bots e não é pra uso de terceiros sem permissão.
 */

export const config = {
  runtime: 'edge',
};

// Instâncias públicas (fallback). Sem garantia de disponibilidade.
const PUBLIC_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt-api.kwiatekmiki.com',
  'https://co.eepy.today',
  'https://cobalt-backend.canine.tools',
  'https://cobalt.synzr.ru',
];

const DEFAULT_BUDGET_MS = 20_000; // orçamento total (a Edge corta em ~25s sem resposta)
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000; // por requisição a uma instância
const MIN_USEFUL_MS = 1_500; // abaixo disso nem tenta outra instância

// Overrides só pra teste (não precisam existir em produção)
function readMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface CobaltResponse {
  status: 'stream' | 'redirect' | 'picker' | 'error' | 'success' | 'tunnel' | 'local-processing';
  url?: string;
  picker?: Array<{
    type: 'video' | 'audio' | 'photo';
    url: string;
    thumb?: string;
    filename?: string;
    metadata?: { title?: string; duration?: string };
  }>;
  error?: { code?: string; message?: string; context?: unknown };
  filename?: string;
  output?: string;
}

interface CobaltInstance {
  base: string;
  apiKey?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isLocalOrPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return true;
    }

    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
    const match172 = hostname.match(/^172\.(\d+)\./);
    if (match172) {
      const secondOctet = parseInt(match172[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }

    return false;
  } catch {
    return true;
  }
}

function getInstances(): CobaltInstance[] {
  const list: CobaltInstance[] = [];
  const own = process.env.COBALT_API_URL?.trim();
  if (own) {
    list.push({ base: own.replace(/\/$/, ''), apiKey: process.env.COBALT_API_KEY?.trim() || undefined });
  }
  for (const base of PUBLIC_INSTANCES) {
    if (!list.some((i) => i.base === base)) list.push({ base });
  }
  return list;
}

/** Mensagem curta e útil a partir da resposta de erro do cobalt. */
function describeCobaltError(data: CobaltResponse): string {
  const code = data.error?.code || data.error?.message || 'erro desconhecido';
  return String(code);
}

function isAuthError(message: string): boolean {
  return /auth|jwt|api[-_. ]?key|turnstile|unauthorized|forbidden/i.test(message);
}

async function tryCobaltInstance(
  instance: CobaltInstance,
  targetUrl: string,
  audioOnly: boolean,
  deadlineAt: number,
  requestTimeoutMs: number
): Promise<CobaltResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Synap/1.0',
  };
  if (instance.apiKey) headers.Authorization = `Api-Key ${instance.apiKey}`;

  const timeoutFor = () => Math.max(1000, Math.min(requestTimeoutMs, deadlineAt - Date.now()));

  const post = (path: string, body: unknown) =>
    fetch(`${instance.base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutFor()),
    });

  const response = await post('', {
    url: targetUrl,
    downloadMode: audioOnly ? 'audio' : 'auto',
    filenameStyle: 'basic',
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as CobaltResponse;
  } catch {
    // Instâncias antigas (API v7) respondem em /api/json
    if ((response.status === 404 || response.status === 405) && deadlineAt - Date.now() > MIN_USEFUL_MS) {
      const legacy = await post('/api/json', {
        url: targetUrl,
        isAudioOnly: audioOnly,
        filenamePattern: 'basic',
      });
      const legacyText = await legacy.text();
      try {
        return JSON.parse(legacyText) as CobaltResponse;
      } catch {
        /* cai no erro abaixo */
      }
    }
    // Resposta não-JSON (página HTML de bot protection, 5xx do proxy, etc.)
    throw new Error(`resposta inválida (HTTP ${response.status})`);
  }
}

async function handleDownload(req: Request): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  // Aceita GET (query string) ou POST (body JSON)
  let targetUrl = '';
  let audioOnly = false;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      targetUrl = typeof body?.url === 'string' ? body.url : '';
      audioOnly = !!body?.audioOnly;
    } catch {
      return json({ ok: false, status: 'error', error: 'Body JSON inválido.' }, 400);
    }
  } else {
    const reqUrl = new URL(req.url);
    targetUrl = reqUrl.searchParams.get('url') || '';
    audioOnly = reqUrl.searchParams.get('audioOnly') === 'true';
  }

  if (!targetUrl.trim()) {
    return json({ ok: false, status: 'error', error: 'Parâmetro `url` é obrigatório.' }, 400);
  }

  if (isLocalOrPrivateUrl(targetUrl)) {
    return json(
      { ok: false, status: 'error', error: 'URLs locais ou IPs privados não são permitidos.' },
      400
    );
  }

  const platform = detectPlatform(targetUrl);
  const budgetMs = readMs('DOWNLOAD_BUDGET_MS', DEFAULT_BUDGET_MS);
  const requestTimeoutMs = readMs('DOWNLOAD_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  const deadlineAt = startedAt + budgetMs;

  const attempts: string[] = [];
  let sawAuthError = false;
  let triedAll = true;

  for (const instance of getInstances()) {
    if (deadlineAt - Date.now() < MIN_USEFUL_MS) {
      triedAll = false;
      break;
    }
    const host = instance.base.replace(/^https?:\/\//, '');

    try {
      const result = await tryCobaltInstance(instance, targetUrl, audioOnly, deadlineAt, requestTimeoutMs);

      if (result.status === 'error') {
        const msg = describeCobaltError(result);
        if (isAuthError(msg)) sawAuthError = true;
        attempts.push(`${host}: ${msg}`);
        continue;
      }

      if (result.status === 'local-processing') {
        attempts.push(`${host}: exige processamento local (não suportado aqui)`);
        continue;
      }

      if (!result.url && !(result.picker && result.picker.length > 0)) {
        attempts.push(`${host}: resposta sem link de download`);
        continue;
      }

      // Se audioOnly e vieram vídeos no picker, filtra apenas áudios
      if (audioOnly && result.picker && result.picker.length > 0) {
        const audios = result.picker.filter((p) => p.type === 'audio');
        if (audios.length > 0) {
          result.picker = audios;
        }
      }

      return json({
        ok: true,
        status: result.status,
        url: result.url,
        picker: result.picker,
        filename: result.filename,
        platform,
        instance: host,
      });
    } catch (err: any) {
      const reason = err?.name === 'TimeoutError' || err?.name === 'AbortError'
        ? 'não respondeu a tempo'
        : err?.message || 'falha desconhecida';
      attempts.push(`${host}: ${reason}`);
      continue;
    }
  }

  const lastError = attempts.length > 0 ? attempts[attempts.length - 1] : 'nenhuma instância disponível';
  let error = `Nenhuma instância conseguiu processar este link. Último erro: ${lastError}`;
  if (sawAuthError) {
    error +=
      ' — as instâncias públicas do cobalt exigem autenticação. Configure uma instância própria nas variáveis COBALT_API_URL (e COBALT_API_KEY, se tiver).';
  } else if (!triedAll) {
    error += ' (tempo esgotado antes de testar todas as instâncias)';
  }

  return json({ ok: false, status: 'error', error, attempts, platform }, 502);
}

export default async function handler(req: Request): Promise<Response> {
  try {
    return await handleDownload(req);
  } catch (err: any) {
    // Nunca devolve texto puro: o cliente sempre recebe JSON.
    return json(
      { ok: false, status: 'error', error: `Erro interno no download: ${err?.message || 'desconhecido'}` },
      500
    );
  }
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter/X';
  if (lower.includes('reddit.com') || lower.includes('redd.it')) return 'Reddit';
  if (lower.includes('soundcloud.com')) return 'SoundCloud';
  if (lower.includes('pinterest.') || lower.includes('pin.it')) return 'Pinterest';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
  if (lower.includes('twitch.tv')) return 'Twitch';
  if (lower.includes('vimeo.com')) return 'Vimeo';
  if (lower.includes('bilibili.com') || lower.includes('b23.tv')) return 'Bilibili';
  if (lower.includes('dailymotion.com')) return 'Dailymotion';
  if (lower.includes('snapchat.com')) return 'Snapchat';
  if (lower.includes('streamable.com')) return 'Streamable';
  if (lower.includes('t.me')) return 'Telegram';
  return 'Web';
}
