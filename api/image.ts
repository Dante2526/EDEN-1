import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req, envArg);
  if (securityResponse) return securityResponse;

  const env = getEnv(envArg);
  let prompt = '';
  let aspectRatio = '1:1';
  let imageUrl = '';
  let mode: 'generate' | 'edit' = 'generate';

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      prompt = body.prompt || '';
      aspectRatio = body.aspect_ratio || '1:1';
      imageUrl = body.image_url || body.image || '';
      mode = body.mode || (imageUrl ? 'edit' : 'generate');
    } catch {}
  } else {
    const url = new URL(req.url);
    prompt = url.searchParams.get('prompt') || '';
    aspectRatio = url.searchParams.get('aspect_ratio') || '1:1';
    imageUrl = url.searchParams.get('image_url') || '';
    mode = (url.searchParams.get('mode') as any) || (imageUrl ? 'edit' : 'generate');
  }

  if (!prompt.trim()) {
    return new Response(JSON.stringify({ error: 'Prompt não fornecido para geração de imagem.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cleanPrompt = prompt.trim();
  const seed = Math.floor(Math.random() * 10000000);
  const safeAltText = cleanPrompt.replace(/[\n\r\[\]]/g, ' ').trim();

  // 1. Tentar NVIDIA NIM (Qwen-Image / Qwen-Image-Edit) se NVIDIA_API_KEY estiver configurada
  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey && !nvidiaKey.startsWith('sua_') && !nvidiaKey.startsWith('nvapi-your')) {
    try {
      const isEdit = mode === 'edit' && Boolean(imageUrl);
      const endpoint = isEdit
        ? 'https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit'
        : 'https://ai.api.nvidia.com/v1/genai/qwen/qwen-image';

      const payload: Record<string, any> = {
        prompt: cleanPrompt,
        seed,
      };

      if (isEdit) {
        payload.image = imageUrl;
      }

      const nvidiaRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (nvidiaRes.ok) {
        const data: any = await nvidiaRes.json();
        const base64Data = data?.artifacts?.[0]?.base64;
        if (base64Data) {
          const dataUri = `data:image/jpeg;base64,${base64Data}`;
          return new Response(
            JSON.stringify({
              success: true,
              url: dataUri,
              prompt: cleanPrompt,
              aspect_ratio: aspectRatio,
              provider: isEdit ? 'NVIDIA NIM (Qwen-Image-Edit)' : 'NVIDIA NIM (Qwen-Image)',
              mode: isEdit ? 'edit' : 'generate',
              markdown: `![${safeAltText}](${dataUri})`,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      } else {
        console.warn(`[NVIDIA NIM Image] ${nvidiaRes.status} ${nvidiaRes.statusText} — fallback para Pollinations`);
      }
    } catch (err) {
      console.warn('[NVIDIA NIM Image] Erro na requisição:', err);
    }
  }

  // 2. Fallback resiliente: Pollinations FLUX
  let width = 768;
  let height = 768;

  if (aspectRatio === '16:9') {
    width = 1024;
    height = 576;
  } else if (aspectRatio === '9:16') {
    width = 576;
    height = 1024;
  } else if (aspectRatio === '4:3') {
    width = 800;
    height = 600;
  }

  const safeUrlPrompt = encodeURIComponent(cleanPrompt).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );

  const fallbackUrl = `https://image.pollinations.ai/prompt/${safeUrlPrompt}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

  return new Response(
    JSON.stringify({
      success: true,
      url: fallbackUrl,
      prompt: cleanPrompt,
      dimensions: { width, height },
      aspect_ratio: aspectRatio,
      provider: 'FLUX (Black Forest Labs)',
      markdown: `![${safeAltText}](${fallbackUrl})`,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
