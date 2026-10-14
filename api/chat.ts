export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

// ===== INLINE: ALLOWED_MODELS e VISION_MODELS (zero imports externos) =====
const ALLOWED_MODELS = [
  'z-ai/glm-5.3',
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
];

const VISION_MODELS = [
  'z-ai/glm-5.3-flash',
  'moonshotai/kimi-k3',
];

function isVisionModel(model: string): boolean {
  return VISION_MODELS.includes(model);
}

// ===== INLINE: rate limit + auth check (simplificado, sem Redis) =====
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 120;

function getHeader(req: any, name: string): string | null {
  if (!req || !req.headers) return null;
  if (typeof req.headers.get === 'function') {
    return req.headers.get(name);
  }
  const lowerName = name.toLowerCase();
  const val = req.headers[lowerName] ?? req.headers[name];
  if (Array.isArray(val)) return val[0] || null;
  return typeof val === 'string' ? val : null;
}

function getClientIp(req: Request | any): string {
  const xForwardedFor = getHeader(req, 'x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = getHeader(req, 'x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  if ((req as any)?.socket?.remoteAddress) {
    return (req as any).socket.remoteAddress;
  }
  return 'unknown';
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) return false;
  let result = 0;
  for (let i = 0; i < aBytes.byteLength; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

async function checkAuthAndRateLimit(req: Request): Promise<Response | null> {
  const ip = getClientIp(req);
  if (ip !== 'unknown') {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
    const entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    } else {
      entry.count += 1;
      if (entry.count > MAX_REQUESTS_PER_MINUTE) {
        return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        });
      }
    }
  }

  // Auth opcional (só se SYNAP_API_SECRET estiver configurada)
  const expectedSecret = process.env.SYNAP_API_SECRET?.trim();
  if (expectedSecret) {
    const providedKey = getHeader(req, 'x-api-key');
    if (!providedKey || !timingSafeEqualStrings(providedKey, expectedSecret)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  return null;
}

function maxTokensFor(effort: string): number {
  if (effort === 'max') return 24576;
  if (effort === 'high' || effort === 'medium') return 16384;
  return 8192;
}

export default async function handler(req: Request) {
  try {
    const securityResponse = await checkAuthAndRateLimit(req);
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

    if (messages.length > 80) {
      // Retém o system prompt (se for o primeiro) + as últimas 79 mensagens
      const sys = messages[0]?.role === 'system' ? [messages[0]] : [];
      messages = [...sys, ...messages.slice(-79)];
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
    const modelSupportsVision = isVisionModel(selectedModel);
    if (hasImages && !modelSupportsVision) {
      return new Response(
        JSON.stringify({ error: 'Este modelo não suporta imagens. Use o modelo GLM-5.3-Flash, Kimi K3 ou Gemini 3.1 Pro.' }),
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
        max_tokens: maxTokensFor(selectedEffort), // Tokens de raciocínio contam aqui; escala com o nível
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

    // O Node.js permite 60s. Se a NVIDIA demorar mais que 12s pra responder,
    // entramos em slow stream mode com keepalives SSE e fazemos o pipe quando chegar.
    // Importante: o slowStream tem um timeout de 45s pra abortar antes do limite da Vercel (60s).
    const SLOW_STREAM_TIMEOUT_MS = 40_000;
    const early = await Promise.race([
      firstFetch,
      new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), 12000)),
    ]);

    if (early === 'slow') {
      const enc = new TextEncoder();
      const slowStream = new ReadableStream({
        async start(controller) {
          const timer = setInterval(() => {
            try { controller.enqueue(enc.encode(': keepalive\n\n')); } catch { /* fechado */ }
          }, 8000);
          // Timeout: se a NVIDIA não responder em 45s, aborta com erro claro
          const slowTimeout = setTimeout(() => {
            try {
              controller.enqueue(
                enc.encode(`data: ${JSON.stringify({ error: 'A NVIDIA não respondeu a tempo (45s). Tente novamente ou use GLM Flash.' })}\n\n`)
              );
              controller.close();
            } catch { /* fechado */ }
          }, SLOW_STREAM_TIMEOUT_MS);
          try {
            controller.enqueue(enc.encode(': keepalive\n\n'));
            const res = await firstFetch;
            clearTimeout(slowTimeout);
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
            clearTimeout(slowTimeout);
            try {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: `Stream interrupted: ${e?.message || 'unknown'}` })}\n\n`));
            } catch { /* fechado */ }
          } finally {
            clearInterval(timer);
            clearTimeout(slowTimeout);
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
        const startTime = Date.now();
        const MAX_TOTAL_MS = 50_000; // 50s total — margem de 10s antes do limite Vercel (60s)
        // Idle: se parar de receber dados por 30s, aborta
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        // Total: se o stream inteiro passar de 50s, corta e sinaliza continuação
        let totalTimer: ReturnType<typeof setTimeout> | null = null;
        let wasCutByTotalTimeout = false;

        const cleanupTimers = () => {
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (totalTimer) { clearTimeout(totalTimer); totalTimer = null; }
        };

        const resetIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            cleanupTimers();
            try {
              controller.enqueue(
                new TextEncoder().encode(`\ndata: {"error": "Stream parado por 30s (NVIDIA sobrecarregada). Tente GLM Flash."}\n\n`)
              );
              controller.close();
            } catch { /* fechado */ }
          }, 30_000);
        };

        // Timer total: corta em 50s e sinaliza continuação automática
        totalTimer = setTimeout(() => {
          wasCutByTotalTimeout = true;
          cleanupTimers();
          try {
            // Envia um chunk fake com finish_reason=length pro frontend continuar automaticamente
            const fakeChunk = {
              choices: [{ finish_reason: 'length', delta: {} }],
            };
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(fakeChunk)}\n\n`)
            );
            controller.enqueue(
              new TextEncoder().encode(`data: [DONE]\n\n`)
            );
            controller.close();
          } catch { /* fechado */ }
        }, MAX_TOTAL_MS);

        resetIdleTimer();
        try {
          const reader = nvidiaRes.body!.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resetIdleTimer();
            controller.enqueue(value);
          }
          cleanupTimers();
          controller.close();
        } catch (streamErr: any) {
          cleanupTimers();
          if (wasCutByTotalTimeout) return; // já fechou via timeout
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
