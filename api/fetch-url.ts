import { checkAuthAndRateLimit, isLocalOrPrivateUrl, safeFetchWithRedirects } from '../lib/server/_security';
import { Env } from '../lib/server/env';
import {
  parseMp4Buffer,
  parseHlsManifest,
  inspectMpegTsSegment,
  extractEmbedsAndStreamsFromHtml,
} from '../src/lib/media-probe';
import { buildHeadlessRenderUrl } from '../src/lib/remote-gate';

export const config = {
  runtime: 'edge',
};



// Extração de texto simples sem cheerio (funciona em Edge Runtime)
function extractTextFromHtml(html: string): { title: string; content: string; length: number; truncated: boolean } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Sem título';

  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  clean = clean.replace(/<[^>]*>/g, ' ');

  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');

  clean = clean.replace(/\s+/g, ' ').trim();

  const maxChars = 10000;
  const truncated = clean.length > maxChars;
  if (truncated) {
    clean = clean.substring(0, maxChars) + '...';
  }

  return { title, content: clean, length: clean.length, truncated };
}

function isMediaUrlOrContentType(urlStr: string, contentType: string): 'mp4' | 'hls' | 'ts' | null {
  const lowerUrl = urlStr.toLowerCase().split('?')[0];
  const lowerCt = contentType.toLowerCase();

  if (
    lowerUrl.endsWith('.m3u8') ||
    lowerCt.includes('mpegurl') ||
    lowerCt.includes('vnd.apple.mpegurl')
  ) {
    return 'hls';
  }

  if (lowerUrl.endsWith('.ts') || lowerCt.includes('video/mp2t')) {
    return 'ts';
  }

  if (
    lowerUrl.endsWith('.mp4') ||
    lowerUrl.endsWith('.m4v') ||
    lowerUrl.includes('/get_video') ||
    lowerCt.includes('video/mp4') ||
    lowerCt.includes('video/quicktime')
  ) {
    return 'mp4';
  }

  return null;
}

const ALLOWED_CUSTOM_HEADERS = new Set([
  'referer',
  'range',
  'user-agent',
  'origin',
  'accept',
  'accept-language',
  'cookie',
  'x-requested-with',
  'authorization',
]);

export interface FetchUrlOptions {
  url: string;
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  raw?: boolean;
  probeMedia?: boolean;
  renderJs?: boolean;
  waitForSelector?: string;
  body?: string;
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req, envArg);
  if (securityResponse) return securityResponse;

  const reqUrl = new URL(req.url);
  let targetUrl = reqUrl.searchParams.get('url') || reqUrl.searchParams.get('q') || '';
  let reqMethod: 'GET' | 'HEAD' | 'POST' = 'GET';
  let customHeaders: Record<string, string> = {};
  let rawMode = reqUrl.searchParams.get('raw') === 'true' || reqUrl.searchParams.get('raw') === '1';
  let probeMedia =
    reqUrl.searchParams.get('probe_media') === 'true' ||
    reqUrl.searchParams.get('probeMedia') === 'true' ||
    reqUrl.searchParams.get('probe') === '1';
  let renderJs =
    reqUrl.searchParams.get('render_js') === 'true' ||
    reqUrl.searchParams.get('renderJs') === 'true' ||
    reqUrl.searchParams.get('playwright') === '1';
  let waitForSelector = reqUrl.searchParams.get('wait_for_selector') || reqUrl.searchParams.get('selector') || undefined;
  let forwardBody: string | undefined;

  if (req.method === 'POST') {
    try {
      const bodyJson = (await req.json()) as Partial<FetchUrlOptions> & {
        probe_media?: boolean;
        render_js?: boolean;
        wait_for_selector?: string;
      };
      if (bodyJson.url) targetUrl = String(bodyJson.url);
      if (bodyJson.method && ['GET', 'HEAD', 'POST'].includes(bodyJson.method.toUpperCase())) {
        reqMethod = bodyJson.method.toUpperCase() as 'GET' | 'HEAD' | 'POST';
      }
      if (bodyJson.headers && typeof bodyJson.headers === 'object') {
        customHeaders = bodyJson.headers;
      }
      if (typeof bodyJson.raw === 'boolean') rawMode = bodyJson.raw;
      if (typeof bodyJson.probeMedia === 'boolean') probeMedia = bodyJson.probeMedia;
      if (typeof bodyJson.probe_media === 'boolean') probeMedia = bodyJson.probe_media;
      if (typeof bodyJson.renderJs === 'boolean') renderJs = bodyJson.renderJs;
      if (typeof bodyJson.render_js === 'boolean') renderJs = bodyJson.render_js;
      if (typeof bodyJson.waitForSelector === 'string') waitForSelector = bodyJson.waitForSelector;
      if (typeof bodyJson.wait_for_selector === 'string') waitForSelector = bodyJson.wait_for_selector;
      if (typeof bodyJson.body === 'string') forwardBody = bodyJson.body;
    } catch {
      // Fallback para query params caso o body não seja JSON válido
    }
  } else {
    const methodParam = reqUrl.searchParams.get('method')?.toUpperCase();
    if (methodParam && ['GET', 'HEAD', 'POST'].includes(methodParam)) {
      reqMethod = methodParam as 'GET' | 'HEAD' | 'POST';
    }
    const refererParam = reqUrl.searchParams.get('referer');
    if (refererParam) customHeaders['Referer'] = refererParam;
    const rangeParam = reqUrl.searchParams.get('range');
    if (rangeParam) customHeaders['Range'] = rangeParam;
  }

  if (!targetUrl.trim()) {
    return new Response(JSON.stringify({ error: 'Parâmetro `url` é obrigatório.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isLocalOrPrivateUrl(targetUrl)) {
    return new Response(
      JSON.stringify({ error: 'Acesso a URLs locais ou IPs privados é proibido por segurança.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const outgoingHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  };

  for (const [k, v] of Object.entries(customHeaders)) {
    if (typeof v === 'string' && ALLOWED_CUSTOM_HEADERS.has(k.toLowerCase())) {
      outgoingHeaders[k] = v;
    }
  }

  // Se probeMedia estiver ativo ou URL parecer MP4/TS direto e o usuário não definiu Range,
  // limitamos a leitura inicial aos primeiros 64KB para não baixar centenas de MB no Edge Worker.
  const guessedMediaByUrl = isMediaUrlOrContentType(targetUrl, '');
  const hasExplicitRange = Object.keys(outgoingHeaders).some((k) => k.toLowerCase() === 'range');
  if ((probeMedia || guessedMediaByUrl === 'mp4' || guessedMediaByUrl === 'ts') && !hasExplicitRange) {
    outgoingHeaders['Range'] = 'bytes=0-65535';
  }

  const startTime = Date.now();

  try {
    let fetchTargetUrl = targetUrl;
    let fetchHeaders = outgoingHeaders;

    if (renderJs && !probeMedia) {
      const headlessSpec = buildHeadlessRenderUrl(targetUrl, {
        waitForSelector,
        timeoutSeconds: 12,
      });
      fetchTargetUrl = headlessSpec.url;
      fetchHeaders = { ...outgoingHeaders, ...headlessSpec.headers };
    }

    const response = await safeFetchWithRedirects(fetchTargetUrl, {
      method: reqMethod,
      headers: fetchHeaders,
      body: reqMethod === 'POST' && forwardBody ? forwardBody : undefined,
      signal: AbortSignal.timeout(renderJs ? 15000 : 10000),
    });

    const ttfbMs = Date.now() - startTime;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key.toLowerCase()] = val;
    });

    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.finalUrl || response.url || targetUrl;

    // Modo HEAD (ex.: curl -I)
    if (reqMethod === 'HEAD') {
      return new Response(
        JSON.stringify({
          url: targetUrl,
          finalUrl,
          status: response.status,
          statusText: response.statusText,
          ttfbMs,
          headers: responseHeaders,
          title: `HEAD ${finalUrl} (${response.status})`,
          content: Object.entries(responseHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n'),
          length: 0,
          truncated: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const detectedMediaType = isMediaUrlOrContentType(finalUrl, contentType);

    // Se for mídia binária/stream ou probeMedia explícito (estilo ffprobe)
    if (probeMedia || detectedMediaType) {
      if (detectedMediaType === 'hls' || contentType.includes('mpegurl')) {
        const textBody = await response.text();
        if (textBody.trim().startsWith('#EXTM3U')) {
          const hlsProbe = parseHlsManifest(textBody, finalUrl);
          return new Response(
            JSON.stringify({
              url: targetUrl,
              finalUrl,
              status: response.status,
              statusText: response.statusText,
              ttfbMs,
              headers: responseHeaders,
              title: `HLS Stream (${hlsProbe.type})`,
              mediaProbe: {
                kind: 'hls',
                ...hlsProbe,
              },
              content: textBody.slice(0, 15000),
              length: textBody.length,
              truncated: textBody.length > 15000,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      const arrayBuf = await response.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuf);

      // Checa primeiro se é texto/HTML disfarçado ou m3u8 sem extensão
      const firstChars = new TextDecoder().decode(uint8.subarray(0, 64)).trim();
      if (firstChars.startsWith('#EXTM3U')) {
        const fullText = new TextDecoder().decode(uint8);
        const hlsProbe = parseHlsManifest(fullText, finalUrl);
        return new Response(
          JSON.stringify({
            url: targetUrl,
            finalUrl,
            status: response.status,
            statusText: response.statusText,
            ttfbMs,
            headers: responseHeaders,
            title: `HLS Stream (${hlsProbe.type})`,
            mediaProbe: {
              kind: 'hls',
              ...hlsProbe,
            },
            content: fullText.slice(0, 15000),
            length: fullText.length,
            truncated: fullText.length > 15000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (detectedMediaType === 'ts' || uint8[0] === 0x47) {
        const tsProbe = inspectMpegTsSegment(uint8);
        return new Response(
          JSON.stringify({
            url: targetUrl,
            finalUrl,
            status: response.status,
            statusText: response.statusText,
            ttfbMs,
            headers: responseHeaders,
            title: `MPEG-TS Segment (${tsProbe.valid ? 'Válido' : 'Inválido'})`,
            mediaProbe: {
              kind: 'mpegts',
              bytesRead: uint8.byteLength,
              ...tsProbe,
            },
            content: JSON.stringify(
              {
                format: 'mpegts',
                valid: tsProbe.valid,
                packetCountChecked: tsProbe.packetCountChecked,
                bytesRead: uint8.byteLength,
                ttfbMs,
              },
              null,
              2
            ),
            length: uint8.byteLength,
            truncated: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const mp4Probe = parseMp4Buffer(uint8);
      return new Response(
        JSON.stringify({
          url: targetUrl,
          finalUrl,
          status: response.status,
          statusText: response.statusText,
          ttfbMs,
          headers: responseHeaders,
          title: mp4Probe.valid
            ? `MP4 Video (${mp4Probe.width || '?'}x${mp4Probe.height || '?'}, ${mp4Probe.codecs.join('/') || 'unknown'})`
            : `Binary Probe (${contentType || 'unknown'})`,
          mediaProbe: {
            kind: 'mp4',
            bytesRead: uint8.byteLength,
            ...mp4Probe,
          },
          content: JSON.stringify(
            {
              format: mp4Probe.container,
              valid: mp4Probe.valid,
              brand: mp4Probe.brand,
              width: mp4Probe.width,
              height: mp4Probe.height,
              durationSeconds: mp4Probe.durationSeconds,
              codecs: mp4Probe.codecs,
              bytesRead: uint8.byteLength,
              status: response.status,
              contentRange: responseHeaders['content-range'],
              ttfbMs,
            },
            null,
            2
          ),
          length: uint8.byteLength,
          truncated: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok && !rawMode) {
      return new Response(
        JSON.stringify({
          error: `Falha ao acessar ${targetUrl} (Status HTTP ${response.status}: ${response.statusText})`,
          status: response.status,
          headers: responseHeaders,
          ttfbMs,
        }),
        {
          status: response.status >= 400 && response.status < 500 ? response.status : 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (
      contentType &&
      !contentType.includes('text/') &&
      !contentType.includes('html') &&
      !contentType.includes('xml') &&
      !contentType.includes('json') &&
      !contentType.includes('javascript') &&
      !rawMode
    ) {
      return new Response(
        JSON.stringify({
          error: `O recurso em ${targetUrl} não é legível como texto (Content-Type: ${contentType}). Use probe_media: true para inspecionar streams de vídeo.`,
          status: response.status,
          headers: responseHeaders,
          ttfbMs,
        }),
        { status: 415, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    const embedsAndStreams = extractEmbedsAndStreamsFromHtml(html, finalUrl);

    if (rawMode) {
      const maxRawChars = 50000;
      const truncated = html.length > maxRawChars;
      const rawContent = truncated ? html.substring(0, maxRawChars) : html;
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : finalUrl;

      return new Response(
        JSON.stringify({
          url: targetUrl,
          finalUrl,
          status: response.status,
          statusText: response.statusText,
          ttfbMs,
          headers: responseHeaders,
          title,
          content: rawContent,
          rawHtml: rawContent,
          iframes: embedsAndStreams.iframes,
          mediaUrls: embedsAndStreams.mediaUrls,
          length: rawContent.length,
          truncated,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const extracted = extractTextFromHtml(html);

    return new Response(
      JSON.stringify({
        url: targetUrl,
        finalUrl,
        status: response.status,
        statusText: response.statusText,
        ttfbMs,
        headers: responseHeaders,
        title: extracted.title,
        content: extracted.content,
        iframes: embedsAndStreams.iframes,
        mediaUrls: embedsAndStreams.mediaUrls,
        length: extracted.length,
        truncated: extracted.truncated,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    if (err?.message?.includes('SSRF Blocked')) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('timeout');
    return new Response(
      JSON.stringify({
        error: isTimeout
          ? `Tempo limite de 10s esgotado ao tentar ler ${targetUrl}.`
          : `Erro ao acessar URL: ${err?.message || 'Falha desconhecida.'}`,
      }),
      { status: 504, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
