import { checkAuthAndRateLimit, ALLOWED_MODELS } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  try {
    const securityResponse = checkAuthAndRateLimit(req);
    if (securityResponse) return securityResponse;
  } catch (secErr: any) {
    console.error('Security check error:', secErr);
    // Não bloqueia a requisição por erro de security check — apenas loga
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
      JSON.stringify({
        error: 'NVIDIA_API_KEY não configurada. Por favor, adicione sua chave NVIDIA no arquivo .env.local ou nas Environment Variables da Vercel.',
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
    const { model, reasoning_effort, tools } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma mensagem informada.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (messages.length > 40) {
      // Retém o system prompt (se for o primeiro) + as últimas 39 mensagens
      const sys = messages[0]?.role === 'system' ? [messages[0]] : [];
      messages = [...sys, ...messages.slice(-39)];
    }

    const selectedModel = model || 'z-ai/glm-5.3';
    if (!ALLOWED_MODELS.includes(selectedModel)) {
      return new Response(JSON.stringify({ error: 'Modelo não autorizado.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const selectedEffort = reasoning_effort || 'low';

    // Verify multimodal support
    const hasImages = messages.some((m: any) => m.images && Array.isArray(m.images) && m.images.length > 0);
    const isVisionModel = selectedModel === 'z-ai/glm-5.3-flash' || selectedModel === 'moonshotai/kimi-k3';
    if (hasImages && !isVisionModel) {
      return new Response(
        JSON.stringify({ error: 'Este modelo não suporta imagens. Use o modelo GLM-5.3-Flash ou Kimi K3.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    let lastUserMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsgIndex = i;
        break;
      }
    }

    // Format messages for OpenAI standard, supporting tools & tool results
    const formattedMessages = messages.map((m: any, index: number) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content || '',
          tool_call_id: m.tool_call_id,
        };
      }
      if (m.role === 'assistant' && m.tool_calls) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.tool_calls,
        };
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
            content: `${m.content || ''}\n[Nota do Sistema: ${m.images.length} imagem(ns) enviada(s) omitida(s) do histórico para economizar tokens]`,
          };
        }
      }
      return {
        role: m.role,
        content: m.content || '',
      };
    });

    const createPayload = (includeReasoning = true, includeTools = true) => {
      const p: any = {
        model: selectedModel,
        messages: formattedMessages,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 4096, // Reduzido de 8192 pra diminuir over-thinking e acelerar resposta
      };
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

    const firstFetch = fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
    });

    // O Edge exige o primeiro byte em ~25s. Se a NVIDIA demorar, respondemos já
    // com keepalives SSE e fazemos o pipe quando a resposta chegar.
    const early = await Promise.race([
      firstFetch,
      new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), 15000)),
    ]);

    if (early === 'slow') {
      const enc = new TextEncoder();
      const slowStream = new ReadableStream({
        async start(controller) {
          const timer = setInterval(() => {
            try { controller.enqueue(enc.encode(': keepalive\n\n')); } catch { /* fechado */ }
          }, 8000);
          try {
            controller.enqueue(enc.encode(': keepalive\n\n'));
            const res = await firstFetch;
            if (!res.ok || !res.body) {
              const t = await res.text().catch(() => '');
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ error: `Erro da API NVIDIA (${res.status}) ${t.slice(0, 200)}` })}\n\n`)
              );
            } else {
              const reader = res.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            }
          } catch (e: any) {
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: `Stream interrupted: ${e?.message || 'unknown'}` })}\n\n`));
            } catch { /* fechado */ }
          } finally {
            clearInterval(timer);
            try { controller.close(); } catch { /* fechado */ }
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

    let nvidiaRes = early;

    let fallbackType = 'none';

    // Fallback 1: se der erro de validação/formato e reasoning_effort estava incluído
    if (!nvidiaRes.ok && (nvidiaRes.status === 400 || nvidiaRes.status === 422) && payload.reasoning_effort) {
      await nvidiaRes.body?.cancel().catch(() => {});
      payload = createPayload(false, true);
      nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(payload),
      });
      fallbackType = 'no-reasoning';
    }

    // Fallback 2: se der erro e as ferramentas estavam sendo usadas
    if (!nvidiaRes.ok && (nvidiaRes.status === 400 || nvidiaRes.status === 422) && payload.tools) {
      await nvidiaRes.body?.cancel().catch(() => {});
      payload = createPayload(false, false);
      nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(payload),
      });
      fallbackType = fallbackType === 'no-reasoning' ? 'no-reasoning-and-tools' : 'no-tools';
    }

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text();
      let errMsg = `Erro da API NVIDIA (${nvidiaRes.status})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error?.message) {
          errMsg = parsed.error.message;
        } else if (parsed?.message) {
          errMsg = parsed.message;
        }
      } catch {
        if (errText) errMsg = errText;
      }

      if (nvidiaRes.status === 401) {
        errMsg = 'Chave NVIDIA_API_KEY inválida. Verifique sua chave nas Environment Variables da Vercel.';
      } else if (nvidiaRes.status === 429) {
        errMsg = 'Muitas requisições (Rate Limit). Espere um momento antes de tentar novamente.';
      }

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

    if (fallbackType !== 'none') {
      headers['x-fallback'] = fallbackType;
    }

    if (!nvidiaRes.body) {
      return new Response(JSON.stringify({ error: 'Resposta da NVIDIA veio sem corpo (body vazio).' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = nvidiaRes.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (streamErr: any) {
          console.error('Stream reading error:', streamErr);
          try {
            controller.enqueue(
              new TextEncoder().encode(`\ndata: {"error": "Stream interrupted: ${streamErr?.message || 'unknown'}"}\n\n`)
            );
            controller.close();
          } catch {
            // controller already closed
          }
        }
      },
    });

    return new Response(stream, {
      status: nvidiaRes.status,
      headers,
    });
  } catch (error: any) {
    console.error('Chat API error 500:', {
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
