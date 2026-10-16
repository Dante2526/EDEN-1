import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

function base64ToBlob(base64: string, mimeType: string = 'audio/webm'): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function getAudioFileName(mimeType: string): string {
  const lower = (mimeType || '').toLowerCase();
  if (lower.includes('wav')) return 'audio.wav';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'audio.m4a';
  if (lower.includes('ogg')) return 'audio.ogg';
  if (lower.includes('mp3') || lower.includes('mpeg')) return 'audio.mp3';
  return 'audio.webm';
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

  const nvidiaApiKey = env.NVIDIA_API_KEY?.trim();
  if (!nvidiaApiKey) {
    return new Response(
      JSON.stringify({
        error:
          'NVIDIA API Key não configurada. Defina NVIDIA_API_KEY nas variáveis de ambiente.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let audioBlob: Blob | null = null;
    let mimeType = 'audio/webm';
    let targetLang = req.headers.get('x-language')?.trim() || 'pt';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = (formData.get('file') || formData.get('audio')) as Blob | null;
      if (!file) {
        return new Response(JSON.stringify({ error: 'Campo `file` ou `audio` ausente no formulário.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      audioBlob = file;
      mimeType = file.type || 'audio/webm';
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
      // Se vier com prefixo data URL (ex: data:audio/webm;base64,...), extrai o mimeType e limpa
      const match = body.audio.match(/^data:([^;]+);base64,/);
      if (match) {
        mimeType = match[1];
      }
      const base64Audio = body.audio.replace(/^data:audio\/[^;]+;base64,/, '').trim();
      audioBlob = base64ToBlob(base64Audio, mimeType);
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
      mimeType = contentType || 'audio/webm';
      audioBlob = new Blob([arrayBuf], { type: mimeType });
    }

    if (!audioBlob || audioBlob.size === 0) {
      return new Response(JSON.stringify({ error: 'Não foi possível extrair o áudio para transcrição.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileName = getAudioFileName(mimeType);
    const outFormData = new FormData();
    outFormData.append('file', audioBlob, fileName);
    outFormData.append('model', 'openai/whisper-large-v3');
    if (targetLang) {
      outFormData.append('language', targetLang);
    }
    outFormData.append('response_format', 'json');

    const nvRes = await fetch('https://integrate.api.nvidia.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${nvidiaApiKey}`,
      },
      body: outFormData,
    });

    const nvData = await nvRes.json().catch(() => ({}));
    if (!nvRes.ok) {
      const errorMsg =
        nvData?.error?.message ||
        nvData?.detail ||
        `Falha ao transcrever áudio na NVIDIA NIM (${nvRes.status})`;
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: nvRes.status || 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const transcribedText = (nvData?.text || '').trim();

    return new Response(
      JSON.stringify({
        text: transcribedText,
        word_count: transcribedText ? transcribedText.split(/\s+/).filter(Boolean).length : 0,
        model: 'openai/whisper-large-v3',
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
      JSON.stringify({ error: err?.message || 'Erro interno ao processar áudio na NVIDIA NIM.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
