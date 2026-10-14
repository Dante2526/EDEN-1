import { checkAuthAndRateLimit, ALLOWED_MODELS } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

function maxTokensFor(effort: string): number {
  if (effort === 'max') return 16384;
  if (effort === 'high' || effort === 'medium') return 12288;
  return 8192;
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

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'sua_key_aqui' || apiKey === 'nvapi-your-key-here' || apiKey.trim() === '') {
    return new Response(
      JSON.stringify({ error: 'NVIDIA_API_KEY não configurada. Adicione nas Environment Variables da Vercel.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
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

    // FIX 6: Corte de 80 mensagens — não deixar tool órfã
    if (messages.length > 80) {
      const sys = messages[0]?.role === 'system' ? [messages[0]] : [];
      let trimmed = messages.slice(-79);
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

    const selectedEffort = reasoning_effort || 'low';

    const hasImages = messages.some((m: any) => m.images && Array.isArray(m.images) && m.images.length > 0);
    const isVisionModel = selectedModel === 'z-ai/glm-5.3-flash' || selectedModel === 'moonshotai/kimi-k3';
    if (hasImages && !isVisionModel) {
      return new Response(
        JSON.stringify({ error: 'Este modelo não suporta imagens. Use GLM-5.3-Flash ou Kimi K3.' }),
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
        max_tokens: maxTokensFor(selectedEffort),
      };
      // stream_options só pra GLM-5.3
      if (selectedModel === 'z-ai/glm-5.3') {
        p.stream_options = { include_usage: true };
      }
      // reasoning_effort SÓ funciona no GLM-5.3
      if (includeReasoning && selectedEffort && selectedEffort !== 'none' && selectedEffort !== 'default') {
        if (selectedModel === 'z-ai/glm-5.3') {
          p.reasoning_effort = selectedEffort;
        }
      }
      // Tools só pra GLM-5.3 e Flash
      if (includeTools && tools && Array.isArray(tools) && tools.length > 0) {
        if (selectedModel === 'z-ai/glm-5.3' || selectedModel === 'z-ai/glm-5.3-flash') {
          p.tools = tools;
          p.tool_choice = 'auto';
        }
      }
      return p;
    };

    let payload = createPayload(true, true);
    console.log(`[chat] modelo=${selectedModel} effort=${selectedEffort} tools=${payload.tools?.length || 0}`);

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // ===== STREAM UNIFICADO COM 5 MELHORIAS =====
    // 1. TTFB instantâneo (manda keepalive em t=0)
    // 2. Keepalive inteligente durante TODO o stream (só se silêncio >4.5s e !isMidChunk)
    // 3. Auto-retry invisível se NVIDIA der 429/502/503
    // 4. Headers anti-buffer completos
    // 5. Limpeza se usuário fechar app (req.signal abort)

    const stream = new ReadableStream({
      async start(controller) {
        let lastActivity = Date.now();
        let isMidChunk = false;

        // 1. Primeiro byte IMEDIATO — garante TTFB de 0ms na Vercel
        controller.enqueue(enc.encode(': keepalive {"status":"connected"}\n\n'));

        // 2. Heartbeat inteligente: só dispara se silêncio >4.5s E não estiver mid-chunk
        const timer = setInterval(() => {
          if (Date.now() - lastActivity >= 4500 && !isMidChunk) {
            try {
              controller.enqueue(enc.encode(`: keepalive {"ts":${Date.now()}}\n\n`));
            } catch {
              clearInterval(timer);
            }
          }
        }, 5000);

        // 5. Se usuário fechar app/parar, limpa tudo
        req.signal?.addEventListener('abort', () => {
          clearInterval(timer);
          try { controller.close(); } catch {}
        });

        try {
          // 3. Fetch com auto-retry invisível (429/502/503)
          let res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify(payload),
            signal: req.signal,
          });

          // Auto-retry se 429/502/503 (rate limit ou servidor sobrecarregado)
          if ((res.status === 429 || res.status >= 502) && !req.signal?.aborted) {
            console.log(`[chat] NVIDIA ${res.status}, tentando de novo em 2s...`);
            controller.enqueue(enc.encode(': keepalive {"status":"retrying"}\n\n'));
            await new Promise((r) => setTimeout(r, 2000));
            res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey.trim()}`,
              },
              body: JSON.stringify(payload),
              signal: req.signal,
            });
          }

          // Fallback 1: 400/422 + reasoning → sem reasoning
          if (!res.ok && (res.status === 400 || res.status === 422) && payload.reasoning_effort) {
            await res.body?.cancel().catch(() => {});
            payload = createPayload(false, true);
            controller.enqueue(enc.encode(': keepalive {"status":"fallback-no-reasoning"}\n\n'));
            res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
              body: JSON.stringify(payload),
              signal: req.signal,
            });
          }

          // Fallback 2: ainda 400/422 + tools → sem tools
          if (!res.ok && (res.status === 400 || res.status === 422) && payload.tools) {
            await res.body?.cancel().catch(() => {});
            payload = createPayload(false, false);
            controller.enqueue(enc.encode(': keepalive {"status":"fallback-no-tools"}\n\n'));
            res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
              body: JSON.stringify(payload),
              signal: req.signal,
            });
          }

          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => 'Erro desconhecido');
            let errMsg = `Erro da API NVIDIA (${res.status})`;
            try {
              const parsed = JSON.parse(errText);
              if (parsed?.error?.message) errMsg = parsed.error.message;
              else if (parsed?.message) errMsg = parsed.message;
            } catch { if (errText) errMsg = errText.slice(0, 300); }
            if (res.status === 401) errMsg = 'Chave NVIDIA_API_KEY inválida.';
            else if (res.status === 429) errMsg = 'Rate limit. Aguarde um momento.';
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
            clearInterval(timer);
            controller.close();
            return;
          }

          // 4. Pipe dos dados reais com proteção contra pausas no reasoning
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            lastActivity = Date.now();
            // Verifica se chunk terminou com \n (evento SSE completo)
            const textChunk = dec.decode(value, { stream: true });
            isMidChunk = !textChunk.endsWith('\n');
            controller.enqueue(value);
          }
          clearInterval(timer);
          controller.close();
        } catch (err: any) {
          clearInterval(timer);
          if (!req.signal?.aborted) {
            const errMsg = err?.message || 'Falha na conexão com a IA';
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
              controller.close();
            } catch {}
          }
        }
      },
      // 5. cancel() — usuário fechou/parou → cancela reader da NVIDIA
      async cancel() {
        // O reader será cancelado pelo garbage collector do Edge
      },
    });

    // 4. Headers anti-buffer completos
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'X-Content-Type-Options': 'nosniff',
      },
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
