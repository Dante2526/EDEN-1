import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);

  try {
    const secRes = await checkAuthAndRateLimit(req, env);
    if (secRes) return secRes;
  } catch (err) {
    console.warn('[transcribe] Security check warning:', err);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  const hasAiBinding = Boolean(env.AI && typeof env.AI.run === 'function');

  if (!hasAiBinding && (!cfAccountId || !cfApiToken)) {
    return new Response(
      JSON.stringify({
        error:
          'Cloudflare Workers AI não configurada. Defina CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN nas variáveis de ambiente do Cloudflare Pages.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let base64Audio = '';
    let targetLang = 'pt';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = (formData.get('file') || formData.get('audio')) as Blob | null;
      if (!file) {
        return new Response(JSON.stringify({ error: 'Campo `file` ou `audio` ausente no formulário.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const arrayBuf = await file.arrayBuffer();
      base64Audio = arrayBufferToBase64(arrayBuf);
      const formLang = formData.get('language');
      if (typeof formLang === 'string' && formLang.trim()) {
        targetLang = formLang.trim();
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      if (!body.audio || typeof body.audio !== 'string') {
        return new Response(JSON.stringify({ error: 'Campo `audio` (base64) obrigatório no payload JSON.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Se vier com prefixo data URL (ex: data:audio/webm;base64,...), limpa
      base64Audio = body.audio.replace(/^data:audio\/[^;]+;base64,/, '').trim();
      if (body.language && typeof body.language === 'string') {
        targetLang = body.language.trim();
      }
    } else {
      // Áudio binário direto no body (audio/webm, audio/wav, audio/ogg, etc.)
      const arrayBuf = await req.arrayBuffer();
      if (!arrayBuf || arrayBuf.byteLength === 0) {
        return new Response(JSON.stringify({ error: 'Corpo da requisição de áudio está vazio.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      base64Audio = arrayBufferToBase64(arrayBuf);
    }

    if (!base64Audio) {
      return new Response(JSON.stringify({ error: 'Não foi possível extrair o áudio para transcrição.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const modelId = '@cf/openai/whisper-large-v3-turbo';
    let result: any = null;

    if (hasAiBinding) {
      result = await env.AI!.run(modelId, {
        audio: base64Audio,
        language: targetLang,
        task: 'transcribe',
      });
    } else {
      const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${modelId}`;
      const cfRes = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: base64Audio,
          language: targetLang,
          task: 'transcribe',
        }),
      });

      const cfData = await cfRes.json().catch(() => ({}));
      if (!cfRes.ok) {
        const errorMsg =
          cfData?.errors?.map((e: any) => e.message).join('; ') ||
          `Falha ao processar áudio na Cloudflare (${cfRes.status})`;
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: cfRes.status || 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      result = cfData.result;
    }

    const transcribedText = (result?.text || '').trim();

    return new Response(
      JSON.stringify({
        text: transcribedText,
        word_count: result?.word_count || transcribedText.split(/\s+/).filter(Boolean).length,
        vtt: result?.vtt || null,
        model: modelId,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: any) {
    console.error('[transcribe] Erro inesperado:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Erro interno ao processar áudio.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
