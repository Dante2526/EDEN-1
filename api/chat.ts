import { checkAuthAndRateLimit, ALLOWED_MODELS, isAbhibotsModel, isVisionModel } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

function maxTokensFor(effort: string): number {
  if (effort === 'max') return 16384;
  if (effort === 'high' || effort === 'medium') return 12288;
  return 8192;
}

/** Helper: faz fetch pro provedor correto (NVIDIA ou Abhibots) */
function providerFetch(payload: any, apiKey: string, endpoint: string) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Função única que tenta obter resposta com fallbacks.
 * Tenta: (reasoning+tools) → (no-reasoning+tools) → (no-reasoning+no-tools).
 */
async function getResponseWithFallbacks(
  initialFetchPromise: Promise<Response>,
  createPayload: (includeReasoning: boolean, includeTools: boolean) => any,
  apiKey: string,
  endpoint: string
): Promise<{ res: Response; fallbackType: string }> {
  let res = await initialFetchPromise;
  let fallbackType = 'none';

  // Fallback 1: 400/422 + reasoning → tenta sem reasoning
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    const payload1 = createPayload(false, true);
    if (payload1.reasoning_effort !== undefined || payload1.tools) {
      await res.body?.cancel().catch(() => {});
      res = await providerFetch(payload1, apiKey, endpoint);
      fallbackType = 'no-reasoning';
    }
  }

  // Fallback 2: ainda 400/422 + tools → tenta sem tools nem reasoning
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    const payload2 = createPayload(false, false);
    if (payload2.tools !== undefined) {
      await res.body?.cancel().catch(() => {});
      res = await providerFetch(payload2, apiKey, endpoint);
      fallbackType = fallbackType === 'no-reasoning' ? 'no-reasoning-and-tools' : 'no-tools';
    }
  }

  return { res, fallbackType };
}

export default async function handler(req: Request) {
  try {
    const securityResponse = await checkAuthAndRateLimit(req);
    if (securityResponse) return securityResponse;
  } catch (secErr: any) {
    console.error('Security check error:', secErr);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    let { messages } = body;
    const { model, reasoning_effort, tools } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma mensagem informada.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // FIX 6: Corte de 80 mensagens — não deixar tool órfã no início
    if (messages.length > 80) {
      const sys = messages[0]?.role === 'system' ? [messages[0]] : [];
      let trimmed = messages.slice(-79);
      // Se a primeira mensagem do trimmed é role: 'tool' (órfã sem assistant antes),
      // remove até achar uma mensagem válida
      while (trimmed.length > 0 && trimmed[0].role === 'tool') {
        trimmed = trimmed.slice(1);
      }
      messages = [...sys, ...trimmed];
    }

    const selectedModel = model || 'z-ai/glm-5.3';
    if (!ALLOWED_MODELS.includes(selectedModel)) {
      return new Response(JSON.stringify({ error: 'Modelo não autorizado.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Detecta provedor: Abhibots (Claude) ou NVIDIA
    const useAbhibots = isAbhibotsModel(selectedModel);
    const apiKey = useAbhibots
      ? process.env.ABHIBOTS_API_KEY
      : process.env.NVIDIA_API_KEY;
    const apiEndpoint = useAbhibots
      ? 'https://opus.abhibots.com/v1/chat/completions'
      : 'https://integrate.api.nvidia.com/v1/chat/completions';
    const apiKeyName = useAbhibots ? 'BHIBOTS_API_KEY' : 'NVIDIA_API_KEY';

    if (!apiKey || apiKey.trim() === '') {
      return new Response(
        JSON.stringify({
          error: `${apiKeyName} não configurada. Adicione sua chave nas Environment Variables da Vercel.`,
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const selectedEffort = reasoning_effort || 'low';

    // Verify multimodal support
    const hasImages = messages.some((m: any) => m.images && Array.isArray(m.images) && m.images.length > 0);
    const isVisionModel = selectedModel === 'z-ai/glm-5.3-flash' || selectedModel === 'moonshotai/kimi-k3';
    if (hasImages && !isVisionModel) {
      return new Response(
        JSON.stringify({ error: 'Este modelo não suporta imagens. Use o modelo GLM-5.3-Flash ou Kimi K3.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let lastUserMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserMsgIndex = i; break; }
    }

    const formattedMessages = messages.map((m: any, index: number) => {
      if (m.role === 'tool') {
        return { role: 'tool', content: m.content || '', tool_call_id: m.tool_call_id };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls };
      }
      if (m.role === 'user' && m.images && Array.isArray(m.images) && m.images.length > 0) {
        if (index === lastUserMsgIndex) {
          return {
            role: 'user',
            content: [
              { type: 'text', text: m.content || '' },
              ...m.images.map((img: string) => ({ type: 'image_url', image_url: { url: img } })),
            ],
          };
        } else {
          return { role: 'user', content: `${m.content || ''}\n[Nota: ${m.images.length} imagem(ns) omitida(s)]` };
        }
      }
      return { role: m.role, content: m.content || '' };
    });

    const createPayload = (includeReasoning = true, includeTools = true) => {
      const p: any = {
        model: selectedModel,
        messages: formattedMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokensFor(selectedEffort),
      };
      if (includeReasoning && selectedEffort && selectedEffort !== 'none' && selectedEffort !== 'default' && !useAbhibots) {
        // reasoning_effort só funciona nos modelos NVIDIA (GLM/Kimi)
        // Claude (Abhibots) não suporta esse parâmetro
        p.reasoning_effort = selectedEffort;
      }
      if (includeTools && tools && Array.isArray(tools) && tools.length > 0) {
        p.tools = tools;
        p.tool_choice = 'auto';
      }
      return p;
    };

    const initialPayload = createPayload(true, true);
    const firstFetchPromise = providerFetch(initialPayload, apiKey, apiEndpoint);

    // Race: se a NVIDIA não responder em 15s, entra no slow stream mode
    const early = await Promise.race([
      firstFetchPromise,
      new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), 15000)),
    ]);

    // ===== SLOW STREAM MODE (NVIDIA demorou >15s pra responder) =====
    if (early === 'slow') {
      const enc = new TextEncoder();
      const slowStream = new ReadableStream({
        async start(controller) {
          // FIX 1: Keepalive só quando último byte fechou evento (\n\n)
          // Se a resposta da NVIDIA tá no meio de um data: {..., o keepalive
          // não deve colar — só mandar entre eventos completos.
          let lastChunkEndedWithNewline = true; // começa true (pode mandar keepalive)
          let nvidiaReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

          const sendKeepalive = () => {
            if (lastChunkEndedWithNewline) {
              try { controller.enqueue(enc.encode(': keepalive\n\n')); } catch { /* fechado */ }
            }
          };

          const timer = setInterval(sendKeepalive, 5000);
          sendKeepalive(); // keepalive imediato

          // FIX 2: Aviso de 90s — usa chave que o cliente ignora (não é "error")
          // Não mente sobre tentar Flash, apenas avisa que ainda tá esperando
          const warnTimer = setTimeout(() => {
            try {
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ info: 'A IA ainda está processando (90s+). Aguarde...' })}\n\n`)
              );
            } catch { /* fechado */ }
          }, 90_000);

          try {
            // FIX 3: Usa getResponseWithFallbacks no modo lento também
            const { res } = await getResponseWithFallbacks(firstFetchPromise, createPayload, apiKey, apiEndpoint);
            clearTimeout(warnTimer);

            if (!res.ok || !res.body) {
              const t = await res.text().catch(() => '');
              // FIX 5: JSON.stringify escapa aspas automaticamente
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ error: `Erro da API NVIDIA (${res.status}): ${t.slice(0, 300)}` })}\n\n`)
              );
            } else {
              nvidiaReader = res.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                // Verifica se o chunk termina com \n\n (evento SSE completo)
                if (value.length >= 2) {
                  lastChunkEndedWithNewline = value[value.length - 2] === 0x0A && value[value.length - 1] === 0x0A;
                }
                controller.enqueue(value);
              }
            }
          } catch (e: any) {
            clearTimeout(warnTimer);
            try {
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ error: `Stream interrupted: ${e?.message || 'unknown'}` })}\n\n`)
              );
            } catch { /* fechado */ }
          } finally {
            clearInterval(timer);
            clearTimeout(warnTimer);
            try { controller.close(); } catch { /* fechado */ }
          }
        },
        // FIX 4: cancel() — usuário fechou/parou → cancela reader da NVIDIA
        async cancel() {
          if (nvidiaReader) {
            try { await nvidiaReader.cancel(); } catch { /* já fechado */ }
          }
        },
      });
      return new Response(slowStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // ===== FAST MODE (NVIDIA respondeu em <15s) =====
    // FIX 3: Usa getResponseWithFallbacks no modo rápido também
    const { res: nvidiaRes, fallbackType } = await getResponseWithFallbacks(
      Promise.resolve(early), createPayload, apiKey, apiEndpoint
    );

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      let errMsg = `Erro da API NVIDIA (${nvidiaRes.status})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error?.message) errMsg = parsed.error.message;
        else if (parsed?.message) errMsg = parsed.message;
      } catch {
        if (errText) errMsg = errText.slice(0, 500);
      }
      if (nvidiaRes.status === 401) errMsg = 'Chave NVIDIA_API_KEY inválida. Verifique nas Environment Variables da Vercel.';
      else if (nvidiaRes.status === 429) errMsg = 'Muitas requisições (Rate Limit). Espere um momento.';

      return new Response(JSON.stringify({ error: errMsg }), {
        status: nvidiaRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    };
    if (fallbackType !== 'none') headers['x-fallback'] = fallbackType;

    if (!nvidiaRes.body) {
      return new Response(JSON.stringify({ error: 'Resposta da NVIDIA veio sem corpo.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // FIX 4: stream com cancel() que cancela reader da NVIDIA
    let fastReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const stream = new ReadableStream({
      async start(controller) {
        try {
          fastReader = nvidiaRes.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (streamErr: any) {
          console.error('Stream reading error:', streamErr);
          try {
            // FIX 5: JSON.stringify escapa aspas automaticamente
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ error: `Stream interrupted: ${streamErr?.message || 'unknown'}` })}\n\n`)
            );
            controller.close();
          } catch { /* already closed */ }
        }
      },
      async cancel() {
        // FIX 4: usuário fechou/parou → cancela reader da NVIDIA (economiza tokens)
        if (fastReader) {
          try { await fastReader.cancel(); } catch { /* já fechado */ }
        }
      },
    });

    return new Response(stream, {
      status: nvidiaRes.status,
      headers,
    });
  } catch (error: any) {
    console.error('Chat API error:', {
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 5).join(' | '),
      name: error?.name,
    });
    const errMsg = error?.message || 'Erro ao processar mensagem.';
    return new Response(JSON.stringify({ error: errMsg, errorName: error?.name || 'Unknown' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
