import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';
import { buildOpenCutInjectorScript } from '../lib/server/opencut-i18n';

export const config = {
  runtime: 'edge',
};

/**
 * Proxy reverso do OpenCut (https://opencut.app) que injeta script de tradução
 * PT-BR no HTML antes de servir pro navegador.
 *
 * Por que existe:
 *   - OpenCut é app React/Next.js que renderiza textos dinamicamente
 *   - Google Tradutor proxy (translate.goog) não consegue traduzir apps React
 *   - Same-origin policy impede injectar script de fora do iframe
 *   - Solução: fazer o proxy no backend (mesma origem do Éden), reescrever HTML
 *
 * Como funciona:
 *   1. Browser do Éden pede /api/opencut-proxy/projects?...
 *   2. Worker faz fetch('https://opencut.app/projects?...')
 *   3. Worker reescreve o HTML: adiciona <script> com dicionário PT-BR
 *   4. Worker serve HTML modificado (com Content-Type: text/html)
 *   5. Como tá no mesmo origin (eden.pages.dev), o script roda com acesso total
 *   6. MutationObserver detecta novos elementos e traduz
 *
 * Recursos internos do OpenCut (_next/static/*, icons/*, etc) também são
 * proxyados pra manter same-origin.
 *
 * Uso:
 *   GET /api/opencut-proxy/projects
 *   GET /api/opencut-proxy/_next/static/chunks/abc.js
 *   GET /api/opencut-proxy/icons/apple-icon-57x57.png
 */

const OPENCUT_ORIGIN = 'https://opencut.app';

// Headers que precisam ser repassados do client pro OpenCut
const CLIENT_HEADERS_TO_FORWARD = [
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
  'referer',
  'range',
  'if-none-match',
  'if-modified-since',
];

// Headers que precisam ser repassados do OpenCut pro client
const SERVER_HEADERS_TO_FORWARD = [
  'content-type',
  'content-length',
  'content-encoding',
  'content-disposition',
  'cache-control',
  'etag',
  'last-modified',
  'expires',
  'date',
  'vary',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
];

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  const url = new URL(req.url);
  // path = /api/opencut-proxy/projects → /projects
  // path = /api/opencut-proxy/_next/static/abc.js → /_next/static/abc.js
  const proxyPrefix = '/api/opencut-proxy';
  let targetPath = url.pathname;
  if (targetPath.startsWith(proxyPrefix)) {
    targetPath = targetPath.slice(proxyPrefix.length);
  }
  if (!targetPath.startsWith('/')) {
    targetPath = '/' + targetPath;
  }

  // Monta URL alvo no opencut.app
  const targetUrl = new URL(targetPath, OPENCUT_ORIGIN);
  // Repassa query string
  targetUrl.search = url.search;

  // Monta headers do request pro OpenCut
  const forwardHeaders: Record<string, string> = {
    'User-Agent': req.headers.get('user-agent') || 'Mozilla/5.0 (compatible; EdenProxy/1.0)',
    'Accept': req.headers.get('accept') || '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Referer': OPENCUT_ORIGIN + '/',
  };
  for (const h of CLIENT_HEADERS_TO_FORWARD) {
    const val = req.headers.get(h);
    if (val && !forwardHeaders[h.charAt(0).toUpperCase() + h.slice(1)]) {
      forwardHeaders[h] = val;
    }
  }
  // Remove host (vai ser substituído)
  delete forwardHeaders['host'];

  // Fetch pro OpenCut
  const method = req.method;
  const init: RequestInit = {
    method,
    headers: forwardHeaders,
  };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = req.body;
  }

  let cfRes: Response;
  try {
    cfRes = await fetch(targetUrl.toString(), init);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Falha ao conectar com opencut.app',
        detail: err?.message || String(err),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Repassa headers de volta
  const responseHeaders: Record<string, string> = {};
  for (const h of SERVER_HEADERS_TO_FORWARD) {
    const val = cfRes.headers.get(h);
    if (val) {
      responseHeaders[h] = val;
    }
  }

  // Permite que o iframe do Éden nos embuta (same-origin, então naive)
  responseHeaders['X-Frame-Options'] = 'SAMEORIGIN';
  responseHeaders['Content-Security-Policy'] = "frame-ancestors 'self'";

  // Se for HTML, reescreve pra injetar script de tradução
  const contentType = cfRes.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    let html = await cfRes.text();
    const injectorScript = buildOpenCutInjectorScript();

    // Injeta script antes de </head> (ou </body> se não tiver </head>)
    const scriptTag = `<script data-opencut-pt-br="1">${injectorScript}</script>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${scriptTag}</head>`);
    } else if (html.includes('</body>')) {
      html = html.replace('</body>', `${scriptTag}</body>`);
    } else {
      // Fallback: append no final
      html = html + scriptTag;
    }

    // Reescreve URLs internas pra passar pelo proxy
    // Ex: href="/_next/static/abc.js" → href="/api/opencut-proxy/_next/static/abc.js"
    html = html.replace(
      /((?:href|src|action|poster)\s*=\s*["'])(\/[^"']*)/gi,
      (match, prefix, path) => {
        // Não reescreve URLs externas (http://, https://, //)
        if (path.startsWith('//') || path.startsWith('http')) return match;
        // Não reescreve data: URLs
        if (path.startsWith('data:')) return match;
        return `${prefix}/api/opencut-proxy${path}`;
      }
    );

    // Atualiza Content-Length (já que modificamos o HTML)
    delete responseHeaders['content-length'];
    responseHeaders['content-type'] = 'text/html; charset=utf-8';

    return new Response(html, {
      status: cfRes.status,
      statusText: cfRes.statusText,
      headers: responseHeaders,
    });
  }

  // Não-HTML: repassa direto (JS, CSS, imagens, fonts, etc)
  // Mas ainda precisa reescrever URLs em CSS e JS (raro, mas pode ter)
  if (contentType.includes('text/css') || contentType.includes('javascript')) {
    let body = await cfRes.text();
    // Reescreve URLs relativas em CSS/JS
    body = body.replace(
      /url\((['"]?)(\/[^'")\s]+)/g,
      (match, quote, path) => `url(${quote}/api/opencut-proxy${path}`
    );
    body = body.replace(
      /(["'])\/_next\//g,
      `$1/api/opencut-proxy/_next/`
    );
    delete responseHeaders['content-length'];
    return new Response(body, {
      status: cfRes.status,
      statusText: cfRes.statusText,
      headers: responseHeaders,
    });
  }

  // Binário (imagem, fonte, etc): repassa direto
  return new Response(cfRes.body, {
    status: cfRes.status,
    statusText: cfRes.statusText,
    headers: responseHeaders,
  });
}
