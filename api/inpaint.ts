import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit, safeFetchWithRedirects } from '../lib/server/_security';
import {
  validateInpaintPayload,
  buildInpaintNvidiaPayload,
  buildInpaintCloudflarePayload,
} from '../src/lib/image-inpaint';
import { arrayBufferToBase64 } from './image';

export const config = {
  runtime: 'edge',
};

/**
 * Synap Inpainting API (Multi-Tier Resilient Architecture)
 * =========================================================
 * 1. Provedor Primário: NVIDIA NIM
 *    - Modelos: FLUX.1-Kontext-dev / FLUX.1 Fill
 *    - Endpoint: https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev
 *
 * 2. Provedor Secundário: Cloudflare Workers AI
 *    - Modelo: @cf/runwayml/stable-diffusion-v1-5-inpainting
 *    - Endpoint: https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/...
 */

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido. Utilize POST com payload JSON.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corpo da requisição JSON inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validation = validateInpaintPayload(body);
  if (!validation.valid || !validation.cleanPrompt) {
    return new Response(
      JSON.stringify({ error: validation.error || 'Parâmetros de inpainting inválidos.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cleanPrompt = validation.cleanPrompt;
  const rawImageInput: string = body.image;
  const mask: string = body.mask;
  const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 1_000_000);
  const aspectRatio: string = body.aspect_ratio || body.aspectRatio || '1:1';
  const safeAltText = cleanPrompt.replace(/[\n\r\[\]]/g, ' ').trim().slice(0, 60);

  // Se a imagem original for uma URL remota HTTP/HTTPS, baixa os bytes para converter em Base64
  let image = rawImageInput;
  if (image.startsWith('http://') || image.startsWith('https://')) {
    try {
      const imgRes = await safeFetchWithRedirects(image, {
        headers: { Accept: 'image/*' },
      });
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const mime = imgRes.headers.get('content-type') || 'image/jpeg';
        const b64 = arrayBufferToBase64(imgBuffer);
        image = `data:${mime};base64,${b64}`;
      }
    } catch (e: any) {
      console.warn('[Inpaint] Falha ao baixar imagem remota para inpainting:', e?.message || e);
    }
  }

  // =========================================================================
  // CAMADA 1: NVIDIA NIM (FLUX.1-Kontext-dev)
  // =========================================================================
  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey && !nvidiaKey.startsWith('sua_') && !nvidiaKey.startsWith('nvapi-your')) {
    const nvidiaUrl = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev';
    const payload = buildInpaintNvidiaPayload({
      image,
      mask,
      prompt: cleanPrompt,
      seed,
      steps: 25,
    });

    try {
      const nvidiaCtrl = new AbortController();
      const nvidiaTimeout = setTimeout(() => nvidiaCtrl.abort(), 24000);

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
              model: 'black-forest-labs/flux.1-kontext-dev',
              provider: 'NVIDIA NIM (FLUX.1 Kontext)',
              aspect_ratio: aspectRatio,
              markdown: `![${safeAltText}](${dataUrl})`,
              is_data_url: true,
              type: 'inpaint',
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
        console.warn(`[NVIDIA NIM Inpaint] ${nvidiaRes.status} ${nvidiaRes.statusText} — tentando fallback.`);
      }
    } catch (err: any) {
      console.warn('[NVIDIA NIM Inpaint] Erro na requisição NVIDIA NIM:', err?.message || err);
    }
  }

  // =========================================================================
  // CAMADA 2: Cloudflare Workers AI Inpainting
  // =========================================================================
  const cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();

  if (cfAccountId && cfApiToken) {
    const cfModelId = '@cf/runwayml/stable-diffusion-v1-5-inpainting';
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfModelId}`;
    const cfPayload = buildInpaintCloudflarePayload({
      image,
      mask,
      prompt: cleanPrompt,
      steps: 20,
    });

    try {
      const cfCtrl = new AbortController();
      const cfTimeout = setTimeout(() => cfCtrl.abort(), 18000);

      const cfRes = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cfPayload),
        signal: cfCtrl.signal,
      });

      clearTimeout(cfTimeout);

      if (cfRes.ok) {
        const contentType = cfRes.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          const imageBuffer = await cfRes.arrayBuffer();
          const base64 = arrayBufferToBase64(imageBuffer);
          const dataUrl = `data:${contentType};base64,${base64}`;

          return new Response(
            JSON.stringify({
              success: true,
              url: dataUrl,
              prompt: cleanPrompt,
              model: cfModelId,
              provider: 'Cloudflare Workers AI (Inpaint)',
              aspect_ratio: aspectRatio,
              markdown: `![${safeAltText}](${dataUrl})`,
              is_data_url: true,
              type: 'inpaint',
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
        console.warn(`[Cloudflare Inpaint] ${cfRes.status} ${cfRes.statusText}`);
      }
    } catch (err: any) {
      console.warn('[Cloudflare Inpaint] Erro na requisição Cloudflare:', err?.message || err);
    }
  }

  // =========================================================================
  // Resposta de erro caso nenhum provedor consiga processar
  // =========================================================================
  return new Response(
    JSON.stringify({
      error:
        'Não foi possível concluir a edição localizada no momento. Verifique as credenciais da NVIDIA NIM ou Cloudflare Workers AI.',
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}
