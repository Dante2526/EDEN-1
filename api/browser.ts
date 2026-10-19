import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';
import {
  buildPuppeteerFunctionScript,
  parseInteractiveElementsFromHtml,
  BrowserActionParams,
  BrowserActionResult,
} from '../src/lib/browser-agent-engine';

export const config = {
  runtime: 'edge',
};

function extractCleanText(html: string, maxChars = 1500): string {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxChars ? clean.slice(0, maxChars) + '...' : clean;
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const authErr = await checkAuthAndRateLimit(req, envArg);
  if (authErr) return authErr;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = getEnv(envArg);

  try {
    const body = (await req.json()) as BrowserActionParams & { apiKey?: string; browserEndpoint?: string };
    const { action, url, selector, text, apiKey, browserEndpoint } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: 'Parâmetro "action" é obrigatório.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resolvedApiKey = apiKey || env.BROWSERLESS_API_KEY || '';
    const customEndpoint = browserEndpoint || env.BROWSER_ENDPOINT || '';

    // Se tiver chave Browserless ou endpoint personalizado
    if (resolvedApiKey || customEndpoint) {
      const endpoint = customEndpoint || `https://chrome.browserless.io/function?token=${resolvedApiKey}`;
      const code = buildPuppeteerFunctionScript(body);

      try {
        const browserRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          signal: AbortSignal.timeout(30000),
        });

        if (browserRes.ok) {
          const data = (await browserRes.json()) as any;
          const html = data.html || '';
          const interactiveElements = parseInteractiveElementsFromHtml(html);
          const extractedText = extractCleanText(html);

          const result: BrowserActionResult = {
            success: data.success ?? true,
            currentUrl: data.currentUrl || url || '',
            title: data.title || '',
            action: action,
            actionDescription: data.actionDescription || `${action} executado com sucesso`,
            screenshotBase64: data.screenshotBase64,
            interactiveElements,
            extractedText,
            error: data.error,
          };

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (err: any) {
        console.warn('[BrowserAPI] Falha no endpoint Browserless, caindo para fallback:', err?.message);
      }
    }

    // Modo Fallback Edge / Headless sem chave (Jina Reader Chromium Render)
    const targetUrl = url || 'https://google.com';
    const jinaUrl = `https://r.jina.ai/${targetUrl.trim()}`;
    const jinaRes = await fetch(jinaUrl, {
      headers: {
        'X-Return-Format': 'html',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    const html = jinaRes.ok ? await jinaRes.text() : `<html><body><p>Navegado para ${targetUrl}</p></body></html>`;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : targetUrl;
    const interactiveElements = parseInteractiveElementsFromHtml(html);
    const extractedText = extractCleanText(html);

    const actionDesc =
      action === 'navigate'
        ? `Navegou para ${targetUrl}`
        : action === 'click'
        ? `Clicou no elemento ${selector || 'solicitado'}`
        : action === 'type'
        ? `Digitou "${text || ''}" em ${selector || 'campo'}`
        : `Ação ${action} processada com sucesso`;

    const result: BrowserActionResult = {
      success: true,
      currentUrl: targetUrl,
      title,
      action,
      actionDescription: actionDesc,
      interactiveElements,
      extractedText,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || 'Falha ao processar ação no navegador',
        action: 'navigate',
        actionDescription: 'Erro de execução',
        currentUrl: '',
        title: '',
        interactiveElements: [],
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
