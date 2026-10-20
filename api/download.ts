import { checkAuthAndRateLimit, isLocalOrPrivateUrl, safeFetchWithRedirects } from '../lib/server/_security';
import { Env } from '../lib/server/env';
import {
  extractMediaFromUrl,
  detectMediaPlatform,
  sanitizeFilename,
} from '../src/lib/video-extractors';

/**
 * Universal Downloader API
 * ------------------------
 * 1. Extração nativa de alta velocidade:
 *    - YouTube (Innertube Android/iOS + Cascade Piped)
 *    - TikTok (TikWM HD sem marca d'água + áudio MP3)
 *    - Twitter/X (VxTwitter / FxTwitter)
 *    - Reddit (Reddit JSON API)
 *    - Instagram, Facebook, Pinterest, Vimeo e Web (OpenGraph / HTML5)
 * 2. Túnel de Download Direto (stream=1):
 *    - Stream seguro com Content-Disposition: attachment; filename="..."
 *    - Previne bloqueio 403 de IP/CORS e força download direto do arquivo.
 * 3. Cascade secundário de instâncias Cobalt públicas para sites legados.
 */

export const config = {
  runtime: 'edge',
};

// Instâncias públicas saudáveis do Cobalt (fallback secundário)
const COBALT_INSTANCES = [
  'https://cobalt-backend.canine.tools',
  'https://api.cobalt.tools',
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
}


async function tryCobaltInstance(
  instanceBaseUrl: string,
  targetUrl: string
): Promise<CobaltResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Synap/1.0',
  };

  const response = await fetch(instanceBaseUrl.replace(/\/$/, ''), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url: targetUrl,
      filenamePattern: 'basic',
    }),
    signal: AbortSignal.timeout(10000),
  });

  const text = await response.text();
  let data: CobaltResponse;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON da instância ${instanceBaseUrl}`);
  }

  return data;
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const reqUrl = new URL(req.url);

  // =========================================================================
  // 1. TÚNEL DE STREAM DIRETO: GET /api/download?stream=1&url=<encoded>&filename=<encoded>
  // =========================================================================
  if (req.method === 'GET' && (reqUrl.searchParams.get('stream') === '1' || reqUrl.searchParams.get('stream') === 'true')) {
    const streamTargetUrl = reqUrl.searchParams.get('url') || '';
    const rawFilename = reqUrl.searchParams.get('filename') || 'video.mp4';
    const safeFilename = sanitizeFilename(rawFilename, 'mp4');

    if (!streamTargetUrl || isLocalOrPrivateUrl(streamTargetUrl)) {
      return new Response(JSON.stringify({ error: 'URL de stream inválida ou proibida.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const forwardHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        Accept: '*/*',
      };

      const rangeHeader = req.headers.get('range');
      if (rangeHeader) {
        forwardHeaders['Range'] = rangeHeader;
      }

      const upstreamRes = await safeFetchWithRedirects(streamTargetUrl, {
        headers: forwardHeaders,
        signal: req.signal,
      });

      if (!upstreamRes.ok && upstreamRes.status !== 206) {
        // Se a CDN rejeitar proxy de stream (ex: expire excedido), redireciona o cliente diretamente
        return Response.redirect(streamTargetUrl, 302);
      }

      const responseHeaders = new Headers();
      const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
      const contentLength = upstreamRes.headers.get('content-length');
      const contentRange = upstreamRes.headers.get('content-range');
      const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

      responseHeaders.set('Content-Type', contentType);
      responseHeaders.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
      responseHeaders.set('Accept-Ranges', acceptRanges);
      if (contentLength) responseHeaders.set('Content-Length', contentLength);
      if (contentRange) responseHeaders.set('Content-Range', contentRange);
      responseHeaders.set('Cache-Control', 'private, max-age=3600');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    } catch (err: any) {
      if (err?.message?.includes('SSRF Blocked') || isLocalOrPrivateUrl(streamTargetUrl)) {
        return new Response(JSON.stringify({ error: 'Acesso bloqueado por diretrizes de segurança (SSRF).' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return Response.redirect(streamTargetUrl, 302);
    }
  }

  // =========================================================================
  // 2. EXTRAÇÃO DE MÍDIA (METADADOS + STREAMS)
  // =========================================================================
  const securityResponse = await checkAuthAndRateLimit(req, envArg);
  if (securityResponse) return securityResponse;

  let targetUrl = '';
  let audioOnly = false;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      targetUrl = body.url || '';
      audioOnly = !!body.audioOnly;
    } catch {
      return new Response(JSON.stringify({ error: 'Body JSON inválido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    targetUrl = reqUrl.searchParams.get('url') || '';
    audioOnly = reqUrl.searchParams.get('audioOnly') === 'true';
  }

  if (!targetUrl.trim()) {
    return new Response(JSON.stringify({ error: 'Parâmetro `url` é obrigatório.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isLocalOrPrivateUrl(targetUrl)) {
    return new Response(
      JSON.stringify({ error: 'URLs locais ou IPs privados não são permitidos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const platform = detectMediaPlatform(targetUrl);

async function resolveRedirectUrl(urlStr: string): Promise<string> {
  const lower = urlStr.toLowerCase();
  const isShortened =
    lower.includes('youtu.be/') ||
    lower.includes('vm.tiktok.com/') ||
    lower.includes('vt.tiktok.com/') ||
    lower.includes('t.co/') ||
    lower.includes('bit.ly/') ||
    lower.includes('instagram.com/share/') ||
    lower.includes('pin.it/');

  if (!isShortened) return urlStr;

  try {
    const res = await safeFetchWithRedirects(urlStr, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(3500),
    });
    const finalUrl = (res as any).finalUrl || res.url || urlStr;
    if (isLocalOrPrivateUrl(finalUrl)) {
      return urlStr;
    }
    return finalUrl;
  } catch {
    return urlStr;
  }
}

  // Helper para encapsular links no túnel de download direto
  const wrapTunnelUrl = (rawMediaUrl: string, filename: string): string => {
    return `/api/download?stream=1&url=${encodeURIComponent(rawMediaUrl)}&filename=${encodeURIComponent(filename)}`;
  };

  let lastError = '';

  // -------------------------------------------------------------------------
  // Camada 1: Extratores Nativos (YouTube, TikTok, Twitter/X, Reddit, Web)
  // -------------------------------------------------------------------------
  try {
    const resolvedUrl = await resolveRedirectUrl(targetUrl);
    const effectiveUrl = resolvedUrl || targetUrl;
    const extracted = await extractMediaFromUrl(effectiveUrl, { audioOnly });

    if (extracted.ok && extracted.picker && extracted.picker.length > 0) {
      // Injeta os URLs do túnel em cada item retornado
      const tunneledPicker = extracted.picker.map((item) => ({
        type: item.type,
        url: wrapTunnelUrl(item.url, item.filename),
        directUrl: item.url,
        thumb: item.thumb,
        filename: item.filename,
        quality: item.quality,
        format: item.format,
        metadata: item.metadata,
      }));

      const primary = tunneledPicker[0];

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'picker',
          url: primary.url,
          directUrl: primary.directUrl,
          title: extracted.title,
          thumbnail: extracted.thumbnail,
          picker: tunneledPicker,
          filename: primary.filename,
          platform: extracted.platform || platform,
          instance: 'native-engine',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else if (!extracted.ok && extracted.error) {
      lastError = extracted.error;
    }
  } catch (err: any) {
    lastError = err?.message || 'Erro inesperado na extração nativa.';
  }

  // -------------------------------------------------------------------------
  // Camada 2: Fallback Secundário Cobalt (para outros sites)
  // -------------------------------------------------------------------------
  for (const instance of COBALT_INSTANCES) {
    try {
      const result = await tryCobaltInstance(instance, targetUrl);

      if (result.status === 'error') {
        lastError = result.error?.message || `code: ${result.error?.code || 'unknown'}`;
        continue;
      }

      if (audioOnly && result.picker && result.picker.length > 0) {
        const audios = result.picker.filter((p) => p.type === 'audio');
        if (audios.length > 0) {
          result.picker = audios;
        }
      }

      const rawUrl = result.url || result.picker?.[0]?.url;
      const safeFilename = result.filename || sanitizeFilename(`${platform}-video`, 'mp4');
      const tunnelUrl = rawUrl ? wrapTunnelUrl(rawUrl, safeFilename) : undefined;

      return new Response(
        JSON.stringify({
          ok: true,
          status: result.status,
          url: tunnelUrl || rawUrl,
          directUrl: rawUrl,
          picker: result.picker?.map((p) => ({
            ...p,
            url: wrapTunnelUrl(p.url, p.filename || safeFilename),
            directUrl: p.url,
          })),
          filename: safeFilename,
          platform,
          instance: instance.replace(/^https?:\/\//, ''),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err: any) {
      lastError = err?.message || 'Falha de conexão';
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      ok: false,
      error:
        lastError ||
        'Não foi possível extrair a mídia deste link no momento. Verifique se o vídeo é público e tente novamente.',
      detail: lastError || undefined,
      platform,
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}
