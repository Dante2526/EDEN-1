import { checkAuthAndRateLimit, ALLOWED_MODELS, VISION_MODELS, isVisionModel } from './_security.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
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

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'nvapi-your-key-here') {
    return new Response(
      JSON.stringify({
        error: 'NVIDIA_API_KEY não configurada na Vercel.',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await req.json();
    let { messages } = body;
    const { model, reasoning_effort, tools, temperature: reqTemp, top_p: reqTopP } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma mensagem informada.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ALLOWED_ROLES = ['user', 'assistant', 'system', 'tool'];
    const validMessages = messages.filter(
      (m: any) => m && typeof m === 'object' && typeof m.role === 'string' && ALLOWED_ROLES.includes(m.role)
    );

    if (validMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma mensagem válida informada.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemMsgs = validMessages.filter((m: any) => m.role === 'system');
    let rest = validMessages.filter((m: any) => m.role !== 'system');

    if (rest.length > 60) {
      rest = rest.slice(-60);
      while (rest.length > 0 && rest[0].role === 'tool') {
        rest.shift();
      }
    }
    messages = [...systemMsgs, ...rest];

    let totalTextLength = 0;
    for (const m of messages) {
      totalTextLength += (typeof m.content === 'string' ? m.content : '').length;
    }

    if (totalTextLength > 500000) {
      return new Response(JSON.stringify({ error: 'Conversa muito longa.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const selectedModel = model || 'z-ai/glm-5.3';
    if (!ALLOWED_MODELS.includes(selectedModel)) {
      return new Response(JSON.stringify({ error: 'Modelo não autorizado.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ALLOWED_EFFORTS = ['low', 'medium', 'high', 'max', 'none', 'default'];
    const selectedEffort =
      typeof reasoning_effort === 'string' && ALLOWED_EFFORTS.includes(reasoning_effort.toLowerCase())
        ? reasoning_effort.toLowerCase()
        : 'low';

    const hasImages = messages.some((m: any) => m.images && Array.isArray(m.images) && m.images.length > 0);
    if (hasImages && !isVisionModel(selectedModel)) {
      return new Response(
        JSON.stringify({ error: `O modelo selecionado não suporta visão. Use ${VISION_MODELS.join(', ')}.` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let lastUserMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
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
              ...m.images.map((img: string) => ({
                type: 'image_url',
                image_url: { url: img },
              })),
            ],
          };
        } else {
          return {
            role: 'user',
            content: `${m.content || ''}\n[Nota: ${m.images.length} imagem(ns) omitida(s)]`,
          };
        }
      }
      return { role: m.role, content: m.content || '' };
    });

    const MAX_TOKENS_BY_EFFORT: Record<string, number> = {
      low: 4096,
      medium: 8192,
      high: 8192,
      max: 16384,
      none: 8192,
      default: 8192,
    };
    const defaultMaxTokens = MAX_TOKENS_BY_EFFORT[selectedEffort] ?? 8192;
    const hasTools = Boolean(tools && Array.isArray(tools) && tools.length > 0);
    const defaultTemperature = hasTools ? 0.2 : 0.6;

    const createPayload = (
      includeReasoning = true,
      includeTools = true,
      maxTokens = defaultMaxTokens,
      includeSampling = true
    ) => {
      const p: any = {
        model: selectedModel,
        messages: formattedMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: maxTokens,
      };
      if (includeSampling) {
        p.temperature = typeof reqTemp === 'number' ? reqTemp : defaultTemperature;
        p.top_p = typeof reqTopP === 'number' ? reqTopP : 0.95;
      }
      if (includeReasoning && selectedEffort && selectedEffort !== 'none' && selectedEffort !== 'default') {
        p.reasoning_effort = selectedEffort;
      }
      if (includeTools && tools && Array.isArray(tools) && tools.length > 0) {
        p.tools = tools;
        p.tool_choice = 'auto';
      }
      return p;
    };

    let payload = createPayload(true, true);
    let fallbackType = 'none';

    const callNvidia = async (bodyPayload: any, timeoutMs = 35000) => {
      return fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(bodyPayload),
      });
    };

    let nvidiaRes: Response;
    try {
      nvidiaRes = await callNvidia(payload, 30000);
    } catch (primaryErr: any) {
      const isTimeout =
        primaryErr?.name === 'TimeoutError' ||
        primaryErr?.name === 'AbortError' ||
        primaryErr?.message?.toLowerCase().includes('timeout') ||
        primaryErr?.message?.toLowerCase().includes('aborted');

      if (isTimeout) {
        console.warn(`[Auto-Retry] Modelo (${selectedModel}) excedeu 30s. Tentando re-solicitação...`);
        payload = createPayload(false, true, 4096);
        payload.model = selectedModel;
        fallbackType = 'auto-retry-same-model';
        try {
          nvidiaRes = await callNvidia(payload, 22000);
        } catch {
          return new Response(
            JSON.stringify({ error: 'A API da NVIDIA não respondeu a tempo (timeout de conexão).' }),
            { status: 504, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        throw primaryErr;
      }
    }

    if (!nvidiaRes.ok && (nvidiaRes.status === 400 || nvidiaRes.status === 422)) {
      await nvidiaRes.body?.cancel().catch(() => {});
      payload = createPayload(false, false, 4096);
      try {
        nvidiaRes = await callNvidia(payload, 20000);
        fallbackType = 'no-reasoning-and-tools';
      } catch {
        return new Response(
          JSON.stringify({ error: 'Erro ao contatar a NVIDIA após fallback.' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      let errMsg = `Erro NVIDIA (${nvidiaRes.status})`;
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed?.error?.message || parsed?.message || errMsg;
      } catch {
        if (errText) errMsg = errText;
      }
      if (nvidiaRes.status === 401) errMsg = 'NVIDIA_API_KEY inválida.';
      if (nvidiaRes.status === 429) errMsg = 'Rate limit NVIDIA.';
      return new Response(JSON.stringify({ error: errMsg }), {
        status: nvidiaRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    };
    if (fallbackType !== 'none') responseHeaders['x-fallback'] = fallbackType;

    if (!nvidiaRes.body) {
      return new Response(JSON.stringify({ error: 'Resposta da NVIDIA sem corpo.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const stream = new ReadableStream({
      async start(controller) {
        let streamTimer: NodeJS.Timeout | null = null;
        const armStreamTimer = () => {
          if (streamTimer) clearTimeout(streamTimer);
          streamTimer = setTimeout(() => {
            console.warn('[Stream Timeout] Nenhum token recebido por 12s.');
            try {
              const timeoutMsg = JSON.stringify({
                error: 'A conexão com a NVIDIA oscilou. Nenhum token recebido nos últimos 12s.',
              });
              controller.enqueue(new TextEncoder().encode(`\ndata: ${timeoutMsg}\n\n`));
            } catch {}
            try { controller.close(); } catch {}
            try { reader?.cancel().catch(() => {}); } catch {}
          }, 12000);
        };

        try {
          reader = nvidiaRes.body!.getReader();
          armStreamTimer();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            armStreamTimer();
            controller.enqueue(value);
          }

          if (streamTimer) clearTimeout(streamTimer);
          controller.close();
        } catch (streamErr: any) {
          if (streamTimer) clearTimeout(streamTimer);
          try {
            const errPayload = JSON.stringify({ error: `Stream interrompida: ${streamErr?.message || 'desconhecido'}` });
            controller.enqueue(new TextEncoder().encode(`\ndata: ${errPayload}\n\n`));
            controller.close();
          } catch {}
        } finally {
          if (streamTimer) clearTimeout(streamTimer);
          reader = null;
        }
      },
      async cancel() {
        try {
          if (reader) await reader.cancel();
        } catch {}
      },
    });

    return new Response(stream, { headers: responseHeaders });
  } catch (error: any) {
    console.error('Chat API error:', { message: error?.message, name: error?.name });
    return new Response(JSON.stringify({ error: error?.message || 'Erro ao processar.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
