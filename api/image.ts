import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

/**
 * Synap Image Generation API (Multi-Tier Resilient Architecture)
 * ==============================================================
 * 1. Provedor Primário: NVIDIA NIM
 *    - Modelos: FLUX.1 [dev] e FLUX.1 [schnell] (Black Forest Labs)
 *    - Endpoints: https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev
 *                 https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
 *    - Saída: Imagem binária codificada em Base64 Data URL (data:image/jpeg;base64,...)
 *
 * 2. Provedor Secundário: Cloudflare Workers AI
 *    - Modelos: @cf/black-forest-labs/flux-1-dev e flux-1-schnell
 *    - Endpoint: https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/...
 *
 * Se ambos falharem, retorna erro (sem fallback externo de terceiros).
 */

export interface ImageDimensions {
  width: number;
  height: number;
  cfSize: string;
}

export type FluxModelKey = 'flux-1-dev' | 'flux-1-schnell';

/**
 * Converte ArrayBuffer para Base64 de forma segura contra estouro de pilha (call stack overflow).
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Normaliza e resolve dimensões e proporções de aspecto (Aspect Ratio).
 */
export function resolveDimensions(aspectRatio?: string): ImageDimensions {
  const ratio = (aspectRatio || '1:1').toLowerCase().trim();

  switch (ratio) {
    case '16:9':
      return { width: 1344, height: 768, cfSize: '1024x576' };
    case '9:16':
      return { width: 768, height: 1344, cfSize: '576x1024' };
    case '4:3':
      return { width: 1024, height: 768, cfSize: '800x600' };
    case '3:4':
      return { width: 768, height: 1024, cfSize: '600x800' };
    case '1:1':
    default:
      return { width: 1024, height: 1024, cfSize: '1024x1024' };
  }
}

/**
 * Normaliza a chave do modelo FLUX solicitado.
 */
export function normalizeModelKey(modelName?: string): FluxModelKey {
  if (!modelName) return 'flux-1-dev';
  const lower = modelName.toLowerCase().replace(/[._]/g, '-');
  if (lower.includes('schnell')) {
    return 'flux-1-schnell';
  }
  return 'flux-1-dev';
}

/**
 * Monta o payload padronizado para a API da NVIDIA NIM.
 */
export function buildNvidiaPayload(
  prompt: string,
  modelKey: FluxModelKey,
  dims: { width: number; height: number },
  seed: number
) {
  const isSchnell = modelKey === 'flux-1-schnell';
  return {
    prompt,
    mode: 'base',
    width: dims.width,
    height: dims.height,
    seed,
    steps: isSchnell ? 4 : 25,
    cfg_scale: isSchnell ? 0.0 : 3.5,
  };
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  let prompt = '';
  let aspectRatio = '1:1';
  let requestedModel = 'flux-1-dev';

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      prompt = body.prompt || '';
      aspectRatio = body.aspect_ratio || body.aspectRatio || '1:1';
      requestedModel = body.model || 'flux-1-dev';
    } catch {}
  } else {
    const url = new URL(req.url);
    prompt = url.searchParams.get('prompt') || '';
    aspectRatio = url.searchParams.get('aspect_ratio') || '1:1';
    requestedModel = url.searchParams.get('model') || 'flux-1-dev';
  }

  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return new Response(
      JSON.stringify({ error: 'Prompt não fornecido. Use {"prompt": "..."} no body.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const modelKey = normalizeModelKey(requestedModel);
  const dims = resolveDimensions(aspectRatio);
  const seed = Math.floor(Math.random() * 1_000_000);
  const safeAltText = cleanPrompt.replace(/[\n\r\[\]]/g, ' ').trim().slice(0, 60);

  // =========================================================================
  // CAMADA 1: NVIDIA NIM (FLUX.1 [dev] e FLUX.1 [schnell])
  // =========================================================================
  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey && !nvidiaKey.startsWith('sua_') && !nvidiaKey.startsWith('nvapi-your')) {
    const nvidiaModelName = modelKey === 'flux-1-schnell' ? 'flux.1-schnell' : 'flux.1-dev';
    const nvidiaUrl = `https://ai.api.nvidia.com/v1/genai/black-forest-labs/${nvidiaModelName}`;
    const payload = buildNvidiaPayload(cleanPrompt, modelKey, dims, seed);

    try {
      const nvidiaCtrl = new AbortController();
      // Timeout seguro de 22s para preservar a janela de execução do Edge
      const nvidiaTimeout = setTimeout(() => nvidiaCtrl.abort(), 22000);

      const nvidiaRes = await fetch(nvidiaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: nvidiaCtrl.signal,
      });

      clearTimeout(nvidiaTimeout);

      if (nvidiaRes.ok) {
        const data: any = await nvidiaRes.json();
        const base64Data = data?.artifacts?.[0]?.base64;
        if (base64Data) {
          const dataUrl = `data:image/jpeg;base64,${base64Data}`;
          return new Response(
            JSON.stringify({
              success: true,
              url: dataUrl,
              prompt: cleanPrompt,
              model: `black-forest-labs/${nvidiaModelName}`,
              provider: 'NVIDIA NIM (Black Forest Labs)',
              size: `${dims.width}x${dims.height}`,
              dimensions: dims,
              aspect_ratio: aspectRatio,
              markdown: `![${safeAltText}](${dataUrl})`,
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
      } else {
        console.warn(`[NVIDIA NIM Image] ${nvidiaRes.status} ${nvidiaRes.statusText} — tentando fallback.`);
      }
    } catch (err: any) {
      console.warn('[NVIDIA NIM Image] Erro na requisição NVIDIA NIM:', err?.message || err);
    }
  }

  // =========================================================================
  // CAMADA 2: Cloudflare Workers AI
  // =========================================================================
  const cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();

  if (cfAccountId && cfApiToken) {
    const cfModelId =
      modelKey === 'flux-1-schnell'
        ? '@cf/black-forest-labs/flux-1-schnell'
        : '@cf/black-forest-labs/flux-1-dev';
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModelId}`;

    try {
      const cfCtrl = new AbortController();
      // Timeout de 15s para caber confortavelmente na cascata de execução
      const cfTimeout = setTimeout(() => cfCtrl.abort(), 15000);

      const cfRes = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: cleanPrompt,
          size: dims.cfSize,
          steps: modelKey === 'flux-1-schnell' ? 8 : 20,
          seed,
        }),
        signal: cfCtrl.signal,
      });

      clearTimeout(cfTimeout);

      if (cfRes.ok) {
        const contentType = cfRes.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const imageBuffer = await cfRes.arrayBuffer();
          // Converte para base64 com proteção contra estouro de pilha
          const base64 = arrayBufferToBase64(imageBuffer);
          const dataUrl = `data:${contentType};base64,${base64}`;

          return new Response(
            JSON.stringify({
              success: true,
              url: dataUrl,
              prompt: cleanPrompt,
              model: cfModelId,
              provider: 'Cloudflare Workers AI',
              size: dims.cfSize,
              dimensions: dims,
              aspect_ratio: aspectRatio,
              markdown: `![${safeAltText}](${dataUrl})`,
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

        if (contentType.includes('application/json')) {
          const data = await cfRes.json();
          const b64 = data?.result?.image || data?.image || data?.result;
          if (typeof b64 === 'string' && b64.length > 100) {
            const dataUrl = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
            return new Response(
              JSON.stringify({
                success: true,
                url: dataUrl,
                prompt: cleanPrompt,
                model: cfModelId,
                provider: 'Cloudflare Workers AI',
                size: dims.cfSize,
                dimensions: dims,
                aspect_ratio: aspectRatio,
                markdown: `![${safeAltText}](${dataUrl})`,
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
        }
      } else {
        console.warn(`[Cloudflare AI Image] ${cfRes.status} ${cfRes.statusText}`);
      }
    } catch (err: any) {
      console.warn('[Cloudflare AI Image] Erro na requisição Cloudflare:', err?.message || err);
    }
  }

  // =========================================================================
  // SEM FALLBACK EXTERNO — retorna erro se NVIDIA e CF falharem
  // =========================================================================
  return new Response(
    JSON.stringify({
      success: false,
      error:
        'Não foi possível gerar a imagem. Tanto NVIDIA NIM quanto Cloudflare Workers AI falharam. ' +
        'Possíveis causas: cota esgotada, variáveis de ambiente ausentes, ou serviço temporariamente indisponível. ' +
        'Tente novamente em alguns segundos.',
      prompt: cleanPrompt,
      model: modelKey,
    }),
    {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
