import { EdgeTTS } from '@andresaya/edge-tts';
import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { text, voice, engine } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Texto não informado para leitura.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ttsVoice = voice || 'pt-BR-AntonioNeural';
    const cleanText = text.trim();

    if (engine === 'gemini') {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey && geminiApiKey.trim() && geminiApiKey !== 'MY_GEMINI_API_KEY') {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(8000),
              body: JSON.stringify({
                contents: [{ parts: [{ text: `Leia em voz alta de forma natural o seguinte texto: ${cleanText}` }] }],
                generationConfig: {
                  responseMimeType: 'audio/mp3',
                },
              }),
            }
          );

          if (geminiRes.ok) {
            const audioArrayBuffer = await geminiRes.arrayBuffer();
            if (audioArrayBuffer.byteLength > 0) {
              return new Response(audioArrayBuffer, {
                status: 200,
                headers: {
                  'Content-Type': 'audio/mp3',
                  'Cache-Control': 'public, max-age=86400',
                  'X-Audio-Engine': 'gemini-2.0-flash',
                },
              });
            }
          }
        } catch (geminiErr) {
          console.warn('Gemini TTS fallback para EdgeTTS:', geminiErr);
        }
      }
    }

    const tts = new EdgeTTS();
    await tts.synthesize(cleanText, ttsVoice);

    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Edge TTS generation error:', error);
    return new Response(
      JSON.stringify({
        error: error?.message || 'Falha ao sintetizar áudio via Edge TTS.',
        fallback: 'web-speech',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
