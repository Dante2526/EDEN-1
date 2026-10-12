import { checkAuthAndRateLimit } from './_security.js';
import { extractCleanContent } from '../src/lib/html-extractor';

export const config = {
  runtime: 'nodejs',
};

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

    // Bloqueia faixas privadas IPv4 (10.*, 192.168.*, 172.16-31.*)
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return true;
    }
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

export default async function handler(req: Request): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  const reqUrl = new URL(req.url);
  const targetUrl = reqUrl.searchParams.get('url') || reqUrl.searchParams.get('q') || '';

  if (!targetUrl.trim()) {
    return new Response(JSON.stringify({ error: 'Parâmetro `url` é obrigatório.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isLocalOrPrivateUrl(targetUrl)) {
    return new Response(
      JSON.stringify({ error: 'Acesso a URLs locais ou IPs privados é proibido por segurança.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SynapWebReader/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Falha ao acessar ${targetUrl} (Status HTTP ${response.status}: ${response.statusText})`,
        }),
        {
          status: response.status >= 400 && response.status < 500 ? response.status : 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (
      contentType &&
      !contentType.includes('text/') &&
      !contentType.includes('html') &&
      !contentType.includes('xml') &&
      !contentType.includes('json')
    ) {
      return new Response(
        JSON.stringify({
          error: `O recurso em ${targetUrl} não é legível como texto (Content-Type: ${contentType}).`,
        }),
        {
          status: 415,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const html = await response.text();
    const extracted = extractCleanContent(html, 10000);

    return new Response(
      JSON.stringify({
        url: targetUrl,
        title: extracted.title,
        content: extracted.content,
        length: extracted.length,
        truncated: extracted.truncated,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('timeout');
    return new Response(
      JSON.stringify({
        error: isTimeout
          ? `Tempo limite de 8s esgotado ao tentar ler ${targetUrl}.`
          : `Erro ao baixar página: ${err?.message || 'Falha desconhecida.'}`,
      }),
      {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
