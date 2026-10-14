import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req, envArg);
  if (securityResponse) return securityResponse;

  let prompt = '';
  let aspectRatio = '1:1';

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      prompt = body.prompt || '';
      aspectRatio = body.aspect_ratio || '1:1';
    } catch {}
  } else {
    const url = new URL(req.url);
    prompt = url.searchParams.get('prompt') || '';
    aspectRatio = url.searchParams.get('aspect_ratio') || '1:1';
  }

  if (!prompt.trim()) {
    return new Response(JSON.stringify({ error: 'Prompt não fornecido para geração de imagem.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

  const seed = Math.floor(Math.random() * 10000000);
  const cleanPrompt = prompt.trim();

  const safeUrlPrompt = encodeURIComponent(cleanPrompt).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );

  const safeAltText = cleanPrompt.replace(/[\n\r\[\]]/g, ' ').trim();
  const imageUrl = `https://image.pollinations.ai/prompt/${safeUrlPrompt}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

  return new Response(
    JSON.stringify({
      success: true,
      url: imageUrl,
      prompt: cleanPrompt,
      dimensions: { width, height },
      aspect_ratio: aspectRatio,
      provider: 'FLUX (Black Forest Labs)',
      markdown: `![${safeAltText}](${imageUrl})`,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
