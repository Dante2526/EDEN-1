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

  // Motor Exclusivo: NVIDIA NIM (Qwen-Image / Qwen-Image-Edit)
  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (!nvidiaKey || nvidiaKey.startsWith('sua_') || nvidiaKey.startsWith('nvapi-your')) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'NVIDIA_API_KEY não configurada. Defina sua chave de API da NVIDIA nas variáveis de ambiente do Cloudflare Pages.',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

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
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Nenhum artefato de imagem base64 retornado pela NVIDIA NIM.',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const errorBody = await nvidiaRes.text();
    return new Response(
      JSON.stringify({
        success: false,
        error: `Erro na API da NVIDIA NIM (${nvidiaRes.status} ${nvidiaRes.statusText}): ${errorBody}`,
      }),
      {
        status: nvidiaRes.status >= 400 && nvidiaRes.status < 600 ? nvidiaRes.status : 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Falha de rede ao conectar com a NVIDIA NIM: ${err?.message || 'Erro desconhecido'}`,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
