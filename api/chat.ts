// api/chat.ts — COMPLETAMENTE SELF-CONTAINED (sem imports externos)
export const config = {
  runtime: 'edge',
};

const ALLOWED_MODELS = ['z-ai/glm-5.3', 'z-ai/glm-5.3-flash', 'moonshotai/kimi-k3'];
const VISION_MODELS = ['z-ai/glm-5.3-flash', 'moonshotai/kimi-k3'];
function isVisionModel(model: string): boolean { return VISION_MODELS.includes(model); }

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(req: Request): Response | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  if (ip === 'unknown') return null;
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) { rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 }); }
  else { entry.count += 1; if (entry.count > 120) return new Response(JSON.stringify({ error: 'Too Many Requests' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }); }
  return null;
}

export default async function handler(req: Request) {
  const rl = checkRateLimit(req);
  if (rl) return rl;
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'nvapi-your-key-here') {
    return new Response(JSON.stringify({ error: 'NVIDIA_API_KEY não configurada na Vercel.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    let { messages } = body;
    const { model, reasoning_effort, tools, temperature: reqTemp, top_p: reqTopP } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Nenhuma mensagem informada.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const ALLOWED_ROLES = ['user', 'assistant', 'system', 'tool'];
    const validMessages = messages.filter((m: any) => m && typeof m === 'object' && typeof m.role === 'string' && ALLOWED_ROLES.includes(m.role));
    if (validMessages.length === 0) return new Response(JSON.stringify({ error: 'Nenhuma mensagem válida.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const systemMsgs = validMessages.filter((m: any) => m.role === 'system');
    let rest = validMessages.filter((m: any) => m.role !== 'system');
    if (rest.length > 60) { rest = rest.slice(-60); while (rest.length > 0 && rest[0].role === 'tool') rest.shift(); }
    messages = [...systemMsgs, ...rest];

    let totalTextLength = 0;
    for (const m of messages) { totalTextLength += (typeof m.content === 'string' ? m.content : '').length; }
    if (totalTextLength > 500000) return new Response(JSON.stringify({ error: 'Conversa muito longa.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const selectedModel = model || 'z-ai/glm-5.3';
    if (!ALLOWED_MODELS.includes(selectedModel)) return new Response(JSON.stringify({ error: 'Modelo não autorizado.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

    const ALLOWED_EFFORTS = ['low', 'medium', 'high', 'max', 'none', 'default'];
    const selectedEffort = typeof reasoning_effort === 'string' && ALLOWED_EFFORTS.includes(reasoning_effort.toLowerCase()) ? reasoning_effort.toLowerCase() : 'low';

    const hasImages = messages.some((m: any) => m.images && Array.isArray(m.images) && m.images.length > 0);
    if (hasImages && !isVisionModel(selectedModel)) return new Response(JSON.stringify({ error: `Use modelo com visão: ${VISION_MODELS.join(', ')}.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    let lastUserMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].role === 'user') { lastUserMsgIndex = i; break; } }

    const formattedMessages = messages.map((m: any, index: number) => {
      if (m.role === 'tool') return { role: 'tool', content: m.content || '', tool_call_id: m.tool_call_id };
      if (m.role === 'assistant' && m.tool_calls) return { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls };
      if (m.role === 'user' && m.images && Array.isArray(m.images) && m.images.length > 0) {
        if (index === lastUserMsgIndex) return { role: 'user', content: [{ type: 'text', text: m.content || '' }, ...m.images.map((img: string) => ({ type: 'image_url', image_url: { url: img } }))] };
        return { role: 'user', content: `${m.content || ''}\n[Nota: ${m.images.length} imagem(ns) omitida(s)]` };
      }
      return { role: m.role, content: m.content || '' };
    });

    const MAX_TOKENS_BY_EFFORT: Record<string, number> = { low: 4096, medium: 8192, high: 8192, max: 16384, none: 8192, default: 8192 };
    const defaultMaxTokens = MAX_TOKENS_BY_EFFORT[selectedEffort] ?? 8192;
    const hasTools = Boolean(tools && Array.isArray(tools) && tools.length > 0);
    const defaultTemperature = hasTools ? 0.2 : 0.6;

    const createPayload = (includeReasoning = true, includeTools = true, maxTokens = defaultMaxTokens, includeSampling = true) => {
      const p: any = { model: selectedModel, messages: formattedMessages, stream: true, stream_options: { include_usage: true }, max_tokens: maxTokens };
      if (includeSampling) { p.temperature = typeof reqTemp === 'number' ? reqTemp : defaultTemperature; p.top_p = typeof reqTopP === 'number' ? reqTopP : 0.95; }
      if (includeReasoning && selectedEffort && selectedEffort !== 'none' && selectedEffort !== 'default') p.reasoning_effort = selectedEffort;
      if (includeTools && tools && Array.isArray(tools) && tools.length > 0) { p.tools = tools; p.tool_choice = 'auto'; }
      return p;
    };

    let payload = createPayload(true, true);
    let fallbackType = 'none';

    let nvidiaRes: Response;
    try {
      nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` }, body: JSON.stringify(payload),
      });
    } catch (primaryErr: any) {
      const isTimeout = primaryErr?.name === 'TimeoutError' || primaryErr?.name === 'AbortError' || primaryErr?.message?.toLowerCase().includes('timeout');
      if (isTimeout) return new Response(JSON.stringify({ error: 'Timeout. Tente novamente ou use Flash.' }), { status: 504, headers: { 'Content-Type': 'application/json' } });
      throw primaryErr;
    }

    if (!nvidiaRes.ok && (nvidiaRes.status === 400 || nvidiaRes.status === 422)) {
      await nvidiaRes.body?.cancel().catch(() => {});
      payload = createPayload(false, false, 4096);
      try { nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` }, body: JSON.stringify(payload) }); } catch { return new Response(JSON.stringify({ error: 'Erro NVIDIA após fallback.' }), { status: 502, headers: { 'Content-Type': 'application/json' } }); }
      fallbackType = 'no-reasoning-and-tools';
    }

    if (!nvidiaRes.ok) {
      const errText = await nvidiaRes.text(); let errMsg = `Erro NVIDIA (${nvidiaRes.status})`;
      try { const parsed = JSON.parse(errText); errMsg = parsed?.error?.message || parsed?.message || errMsg; } catch { if (errText) errMsg = errText; }
      if (nvidiaRes.status === 401) errMsg = 'NVIDIA_API_KEY inválida.'; if (nvidiaRes.status === 429) errMsg = 'Rate limit NVIDIA.';
      return new Response(JSON.stringify({ error: errMsg }), { status: nvidiaRes.status, headers: { 'Content-Type': 'application/json' } });
    }

    const responseHeaders: Record<string, string> = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' };
    if (fallbackType !== 'none') responseHeaders['x-fallback'] = fallbackType;
    if (!nvidiaRes.body) return new Response(JSON.stringify({ error: 'NVIDIA body vazio.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return new Response(nvidiaRes.body, { headers: responseHeaders });

  } catch (error: any) {
    console.error('Chat API error:', { message: error?.message, name: error?.name });
    return new Response(JSON.stringify({ error: error?.message || 'Erro ao processar.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
