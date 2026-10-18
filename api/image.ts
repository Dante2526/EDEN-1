import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

/**
 * Synap Image Generation API
 * ==========================
 * Gera imagem via Cloudflare Workers AI usando FLUX.2 Dev
 * (modelo @cf/black-forest-labs/flux-2-dev — melhor qualidade open-source).
 *
 * Comparação com Imagen 2.1 (Google):
 *   - FLUX.2 Dev: ~95% da qualidade do Imagen 4 Ultra (que já é melhor que 2.1)
 *   - 100% gratuito no free tier da CF (10k neurons/dia = ~500-1000 imgs/dia)
 *   - Sem watermark, sem rate limit agressivo
 *
 * Endpoint REST da CF:
 *   POST https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/@cf/black-forest-labs/flux-2-dev
 *
 * Body:
 *   { prompt: string, size?: string }
 *   size aceita: "1024x1024" (1:1), "1024x576" (16:9), "576x1024" (9:16), "800x600" (4:3)
 *
 * Response: imagem binária (image/png) — convertemos pra base64 data URL
 * pra poder mostrar no chat como markdown ![alt](data:...)
 */

// Modelos disponíveis (em ordem de qualidade, melhor primeiro)
const FLUX_MODELS = {
  'flux-2-dev': '@cf/black-forest-labs/flux-2-dev',
  'flux-1-dev': '@cf/black-forest-labs/flux-1-dev',
  'flux-1-schnell': '@cf/black-forest-labs/flux-1-schnell',
} as const;

type FluxModelKey = keyof typeof FLUX_MODELS;

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  // Aceita POST (body JSON) ou GET (query string)
  let prompt = '';
  let aspectRatio = '1:1';
  let modelKey: FluxModelKey = 'flux-2-dev';

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      prompt = body.prompt || '';
      aspectRatio = body.aspect_ratio || body.aspectRatio || '1:1';
      const requestedModel = body.model || 'flux-2-dev';
      if (requestedModel in FLUX_MODELS) {
        modelKey = requestedModel as FluxModelKey;
      }
    } catch {}
  } else {
    const url = new URL(req.url);
    prompt = url.searchParams.get('prompt') || '';
    aspectRatio = url.searchParams.get('aspect_ratio') || '1:1';
    const requestedModel = url.searchParams.get('model') || 'flux-2-dev';
    if (requestedModel in FLUX_MODELS) {
      modelKey = requestedModel as FluxModelKey;
    }
  }

  if (!prompt.trim()) {
    return new Response(
      JSON.stringify({ error: 'Prompt não fornecido. Use {"prompt": "..."} no body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validar credenciais Cloudflare
  const cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!cfAccountId || !cfApiToken) {
    return new Response(
      JSON.stringify({
        error: 'Cloudflare não configurada. Defina CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN nas variáveis de ambiente.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Converter aspect_ratio pra size aceito pela CF
  let size = '1024x1024';
  if (aspectRatio === '16:9') size = '1024x576';
  else if (aspectRatio === '9:16') size = '576x1024';
  else if (aspectRatio === '4:3') size = '800x600';
  else if (aspectRatio === '3:4') size = '600x800';

  const modelId = FLUX_MODELS[modelKey];
  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${modelId}`;
  const cleanPrompt = prompt.trim();

  // ====== Chamada pra CF Workers AI ======
  // Timeout: 60s (FLUX.2 Dev pode demorar 5-15s numa imagem)
  const fetchCtrl = new AbortController();
  const fetchTimer = setTimeout(() => fetchCtrl.abort(), 60000);

  try {
    const cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: cleanPrompt,
        size,
        // FLUX.2 Dev aceita steps (4-50, default 8). Mais steps = mais qualidade.
        // 12 é bom trade-off entre qualidade e velocidade.
        steps: modelKey === 'flux-2-dev' ? 12 : undefined,
      }),
      signal: fetchCtrl.signal,
    });

    clearTimeout(fetchTimer);

    if (!cfRes.ok) {
      const errText = await cfRes.text().catch(() => 'Erro desconhecido');
      let errMsg = `Cloudflare AI retornou ${cfRes.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.errors?.length) {
          errMsg = parsed.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
        } else if (parsed?.error?.message) {
          errMsg = parsed.error.message;
        }
      } catch {
        if (errText) errMsg = errText.slice(0, 300);
      }
      if (cfRes.status === 401) errMsg = 'CLOUDFLARE_API_TOKEN inválido ou sem permissão de Workers AI.';
      else if (cfRes.status === 402) errMsg = 'Cota do Workers AI esgotada (free tier: 10k neurons/dia).';
      else if (cfRes.status === 404 && errText.includes('not available on the Workers Free plan')) {
        errMsg = `Modelo ${modelId} exige Workers Paid plan ($5/mês).`;
      }
      return new Response(
        JSON.stringify({ error: errMsg, model: modelId, status: cfRes.status }),
        { status: cfRes.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // CF Workers AI retorna imagem binária (image/png) direto no body
    const contentType = cfRes.headers.get('content-type') || '';

    if (contentType.startsWith('image/')) {
      // Resposta é binária — converte pra base64 data URL
      const imageBuffer = await cfRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      const dataUrl = `data:${contentType};base64,${base64}`;

      return new Response(
        JSON.stringify({
          success: true,
          url: dataUrl,
          prompt: cleanPrompt,
          model: modelId,
          size,
          aspect_ratio: aspectRatio,
          markdown: `![${cleanPrompt.replace(/[\n\r\[\]]/g, ' ').trim().slice(0, 60)}](${dataUrl})`,
          // Indica que é data URL (não precisa fazer fetch pra exibir)
          is_data_url: true,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, max-age=86400',
          },
        }
      );
    }

    // Alguns modelos retornam JSON com base64 embutido (fallback)
    if (contentType.includes('application/json')) {
      const data = await cfRes.json();
      // Formato alternativo: { result: { image: "base64..." } }
      const b64 = data?.result?.image || data?.image || data?.result;
      if (typeof b64 === 'string' && b64.length > 100) {
        const dataUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
        return new Response(
          JSON.stringify({
            success: true,
            url: dataUrl,
            prompt: cleanPrompt,
            model: modelId,
            size,
            aspect_ratio: aspectRatio,
            markdown: `![${cleanPrompt.replace(/[\n\r\[\]]/g, ' ').trim().slice(0, 60)}](${dataUrl})`,
            is_data_url: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        error: 'Resposta da Cloudflare não continha imagem.',
        content_type: contentType,
        model: modelId,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    clearTimeout(fetchTimer);
    const errMsg = err?.name === 'AbortError'
      ? 'Timeout após 60s gerando imagem. Tente novamente com prompt mais simples.'
      : (err?.message || String(err));
    return new Response(
      JSON.stringify({ error: errMsg, model: modelId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
