import { checkAuthAndRateLimit } from '../lib/server/_security';

/**
 * Synap Downloader API
 * --------------------
 * Proxy server-side para a API do cobalt.tools (open-source, sem API key).
 * Suporta: YouTube, TikTok, Instagram, Twitter/X, Reddit, SoundCloud,
 * Pinterest, Facebook, Twitch, Vimeo, Bilibili, etc.
 *
 * Cascade de instâncias públicas (caso uma esteja fora do ar).
 */

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

// Lista de instâncias públicas do cobalt. Caso uma falhe, tentamos a próxima.
const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt-api.kwiatekmiki.com',
  'https://co.eepy.today',
  'https://cobalt-backend.canine.tools',
  'https://cobalt.synzr.ru',
];

interface CobaltResponse {
  status: 'stream' | 'redirect' | 'picker' | 'error' | 'success' | 'tunnel';
  url?: string;
  picker?: Array<{
    type: 'video' | 'audio' | 'photo';
    url: string;
    thumb?: string;
    filename?: string;
    metadata?: { title?: string; duration?: string };
  }>;
  error?: { code: string; message?: string };
  filename?: string;
  output?: string;
  // Token usado em algumas instâncias novas
  token?: string;
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

async function tryCobaltInstance(
  instanceBaseUrl: string,
  targetUrl: string
): Promise<CobaltResponse> {
  // A API nova (v10+) usa POST / com Accept: application/json
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Algumas instâncias exigem um header de chave pública (vazio está OK na maioria)
  if (instanceBaseUrl.includes('cobalt.tools')) {
    headers['User-Agent'] = 'Synap/1.0';
  }

  const response = await fetch(instanceBaseUrl.replace(/\/$/, ''), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url: targetUrl,
      // Prioriza arquivo único (não zip)
      filenamePattern: 'basic',
    }),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let data: CobaltResponse;
  try {
    data = JSON.parse(text);
  } catch {
    // Algumas instâncias antigas usam /api/json
    const fallbackResponse = await fetch(
      `${instanceBaseUrl.replace(/\/$/, '')}/api/json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          url: targetUrl,
          filenamePattern: 'basic',
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const fallbackText = await fallbackResponse.text();
    try {
      data = JSON.parse(fallbackText);
    } catch {
      throw new Error(
        `Resposta inválida da instância ${instanceBaseUrl}: ${text.slice(0, 200)}`
      );
    }
  }

  if (!response.ok && data.status !== 'error') {
    throw new Error(`HTTP ${response.status} em ${instanceBaseUrl}`);
  }

  return data;
}

export default async function handler(req: Request): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  // Aceita GET (query string) ou POST (body JSON)
  let targetUrl = '';
  let audioOnly = false;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      targetUrl = body.url || '';
      audioOnly = !!body.audioOnly;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Body JSON inválido.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    const reqUrl = new URL(req.url);
    targetUrl = reqUrl.searchParams.get('url') || '';
    audioOnly = reqUrl.searchParams.get('audioOnly') === 'true';
  }

  if (!targetUrl.trim()) {
    return new Response(
      JSON.stringify({ error: 'Parâmetro `url` é obrigatório.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (isLocalOrPrivateUrl(targetUrl)) {
    return new Response(
      JSON.stringify({
        error: 'URLs locais ou IPs privados não são permitidos.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Detecta plataforma para feedback amigável
  const platform = detectPlatform(targetUrl);

  // Cascade de instâncias
  let lastError = '';
  for (const instance of COBALT_INSTANCES) {
    try {
      const result = await tryCobaltInstance(instance, targetUrl);

      // Se a instância retornou erro explícito, tenta próxima
      if (result.status === 'error') {
        lastError = result.error?.message || `code: ${result.error?.code || 'unknown'}`;
        continue;
      }

      // Se audioOnly e vieram vídeos no picker, filtra apenas áudios
      if (audioOnly && result.picker && result.picker.length > 0) {
        const audios = result.picker.filter((p) => p.type === 'audio');
        if (audios.length > 0) {
          result.picker = audios;
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          status: result.status,
          url: result.url,
          picker: result.picker,
          filename: result.filename,
          platform,
          instance: instance.replace(/^https?:\/\//, ''),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      lastError = err?.message || 'Falha desconhecida';
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      ok: false,
      error:
        lastError ||
        'Todas as instâncias de download estão indisponíveis. Tente novamente em alguns segundos.',
      platform,
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
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
  if (lower.includes('pinterest.com')) return 'Pinterest';
  return 'Web';
}
