import { checkAuthAndRateLimit, ALLOWED_MODELS } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

function maxTokensFor(effort: string): number {
  if (effort === 'max') return 12288;
  if (effort === 'high' || effort === 'medium') return 8192;
  return 4096;
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
      status: 405, headers: { 'Content-Type': 'application/json' },
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

    // Corte de 80 mensagens — sem deixar tool órfã no início
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
    // A API OpenAI/NVIDIA só aceita 'low' | 'medium' | 'high' (nunca 'max')
    const apiEffort = selectedEffort === 'max' ? 'high' : selectedEffort;

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

    // Formata mensagens adaptando caso o modelo não use tools (evita erro 400 no DeepSeek/Kimi)
    const buildFormattedMessages = (allowToolsInHistory: boolean) => {
      return messages.map((m: any, index: number) => {
        if (m.role === 'tool') {
          if (!allowToolsInHistory) {
            return { role: 'user', content: `[Resultado da ferramenta ${m.tool_call_id || ''}]: ${m.content || ''}` };
          }
          return { role: 'tool', content: m.content || '', tool_call_id: m.tool_call_id };
        }
        if (m.role === 'assistant' && m.tool_calls) {
          if (!allowToolsInHistory) {
            return { role: 'assistant', content: m.content || 'Executando ferramentas...' };
          }
          return { role: 'assistant', content: m.content || null, tool_calls: m.tool_calls };
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
          }
          return { role: 'user', content: `${m.content || ''}\n[Nota: ${m.images.length} imagem(ns) omitida(s)]` };
        }
        return { role: m.role, content: m.content || '' };
      });
    };

    const modelSupportsTools = selectedModel === 'z-ai/glm-5.3' || selectedModel === 'z-ai/glm-5.3-flash';

    const createPayload = (includeReasoning = true, includeTools = true, safeTokenLimit = false) => {
      const hasToolsActive = includeTools && modelSupportsTools && tools && Array.isArray(tools) && tools.length > 0;
      const p: any = {
        model: selectedModel,
        messages: buildFormattedMessages(Boolean(hasToolsActive)),
        stream: true,
        max_tokens: safeTokenLimit ? 4096 : maxTokensFor(selectedEffort),
      };
      if (selectedModel === 'z-ai/glm-5.3') {
        p.stream_options = { include_usage: true };
      }
      if (includeReasoning && apiEffort && apiEffort !== 'none' && apiEffort !== 'default') {
        if (selectedModel === 'z-ai/glm-5.3') {
          p.reasoning_effort = apiEffort;
        }
      }
      if (hasToolsActive) {
        p.tools = tools;
        p.tool_choice = 'auto';
      }
      return p;
    };

    let payload = createPayload(true, true, false);
    console.log(`[chat] modelo=${selectedModel} effort=${selectedEffort}->${apiEffort} tools=${payload.tools?.length || 0}`);

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastActivity = Date.now();
        let isMidChunk = false;

        // 1. Primeiro byte imediato para destravar o TTFB de 25s da Vercel
        controller.enqueue(enc.encode(': keepalive\n\n'));

        // 2. Heartbeat a cada 5s enquanto aguarda a NVIDIA pensar
        const timer = setInterval(() => {
          if (Date.now() - lastActivity >= 4500 && !isMidChunk) {
            try {
              controller.enqueue(enc.encode(': keepalive\n\n'));
            } catch {
              clearInterval(timer);
            }
          }
        }, 5000);

        req.signal?.addEventListener('abort', () => {
          clearInterval(timer);
          try { controller.close(); } catch {}
        });

        const callNvidia = async (bodyPayload: any) => {
          return fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify(bodyPayload),
            signal: req.signal,
          });
        };

        try {
          let res = await callNvidia(payload);

          // Auto-retry para Rate Limit (429) ou erro temporário de gateway (502/503/504)
          if ((res.status === 429 || res.status >= 502) && !req.signal?.aborted) {
            await res.body?.cancel().catch(() => {});
            await new Promise((r) => setTimeout(r, 2000));
            res = await callNvidia(payload);
          }

          // Fallback 1: 400/422 com reasoning_effort -> tenta sem reasoning_effort
          if (!res.ok && (res.status === 400 || res.status === 422) && payload.reasoning_effort) {
            await res.body?.cancel().catch(() => {});
            payload = createPayload(false, true, false);
            res = await callNvidia(payload);
          }

          // Fallback 2: 400/422 com tools -> tenta sem tools (e limpa tool_calls do histórico)
          if (!res.ok && (res.status === 400 || res.status === 422) && payload.tools) {
            await res.body?.cancel().catch(() => {});
            payload = createPayload(false, false, false);
            res = await callNvidia(payload);
          }

          // Fallback 3: 400/422 por excesso de max_tokens -> reduz max_tokens para 4096
          if (!res.ok && (res.status === 400 || res.status === 422) && payload.max_tokens > 4096) {
            await res.body?.cancel().catch(() => {});
            payload = createPayload(false, false, true);
            res = await callNvidia(payload);
          }

          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => 'Erro desconhecido');
            let errMsg = `Erro da API NVIDIA (${res.status})`;
            try {
              const parsed = JSON.parse(errText);
              if (parsed?.error?.message) errMsg = parsed.error.message;
              else if (parsed?.message) errMsg = parsed.message;
              else if (parsed?.detail) errMsg = String(parsed.detail);
            } catch {
              if (errText) errMsg = errText.slice(0, 300);
            }
            if (res.status === 401) errMsg = 'Chave NVIDIA_API_KEY inválida.';
            else if (res.status === 429) errMsg = 'Limite de requisições atingido (Rate Limit). Aguarde alguns segundos.';

            // Envia tanto no formato de erro customizado quanto em chunk OpenAI + [DONE]
            // para garantir que o front-end saia do estado "Conectando na IA..."
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({
                  choices: [{ index: 0, delta: { content: `\n\n⚠️ **Erro:** ${errMsg}` }, finish_reason: 'stop' }],
                })}\n\n`
              )
            );
            controller.enqueue(enc.encode('data: [DONE]\n\n'));
            clearInterval(timer);
            controller.close();
            return;
          }

          // 4. Pipe dos dados reais da IA
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            lastActivity = Date.now();
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
              controller.enqueue(
                enc.encode(
                  `data: ${JSON.stringify({
                    choices: [{ index: 0, delta: { content: `\n\n⚠️ **Erro:** ${errMsg}` }, finish_reason: 'stop' }],
                  })}\n\n`
                )
              );
              controller.enqueue(enc.encode('data: [DONE]\n\n'));
              controller.close();
            } catch {}
          }
        }
      },
      async cancel() {},
    });

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
