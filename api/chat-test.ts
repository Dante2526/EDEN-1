import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

/**
 * Endpoint de diagnóstico: testa uma chamada NON-STREAMING pra NVIDIA
 * com o modelo Flash + reasoning_effort=low. Retorna o que a NVIDIA
 * respondeu, com timing de cada etapa.
 *
 * Uso:
 *   GET /api/chat-test?model=z-ai/glm-5.3-flash
 *   GET /api/chat-test?model=z-ai/glm-5.3
 *
 * Retorna JSON com:
 *   - ttfbMs: tempo até primeiro byte
 *   - totalMs: tempo total
 *   - status: HTTP code da NVIDIA
 *   - body: resposta da NVIDIA (truncada)
 *   - error: mensagem de erro (se houve)
 */
export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  const url = new URL(req.url);
  const model = url.searchParams.get('model') || 'z-ai/glm-5.3-flash';

  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'nvapi-your-key-here') {
    return new Response(
      JSON.stringify({ error: 'NVIDIA_API_KEY não configurada.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const t0 = Date.now();
  let ttfbMs = 0;
  let totalMs = 0;
  let status = 0;
  let bodyPreview = '';
  let errMsg: string | null = null;

  // Payload MÍNIMO — sem streaming, sem tools, sem reasoning_effort, sem stream_options
  // Pra isolar se o problema é algum desses parâmetros.
  const payload: any = {
    model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Reply in Portuguese.' },
      { role: 'user', content: 'Diga "olá" em uma palavra.' },
    ],
    stream: false,
    max_tokens: 50,
  };

  // Pra Flash que tava dando timeout silencioso, aumentamos pra 60s
  // pra ver se a NVIDIA eventualmente responde com erro.
  const timeoutMs = 60000;
  try {
    const fetchCtrl = new AbortController();
    const fetchTimer = setTimeout(() => fetchCtrl.abort(), timeoutMs);

    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
      signal: fetchCtrl.signal,
    });

    ttfbMs = Date.now() - t0;
    status = res.status;

    const text = await res.text();
    totalMs = Date.now() - t0;
    clearTimeout(fetchTimer);

    bodyPreview = text.slice(0, 800);

    if (!res.ok) {
      try {
        const parsed = JSON.parse(text);
        errMsg = parsed?.error?.message || parsed?.message || `HTTP ${res.status}`;
      } catch {
        errMsg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      }
    }
  } catch (err: any) {
    totalMs = Date.now() - t0;
    errMsg = err?.name === 'AbortError'
      ? `Timeout após ${timeoutMs / 1000}s (AbortController) — NVIDIA ficou em silêncio total, nem erro retornou. Provável causa: quota excedida ou modelo em manutenção.`
      : (err?.message || String(err));
  }

  return new Response(
    JSON.stringify({
      model,
      ttfbMs,
      totalMs,
      status,
      error: errMsg,
      bodyPreview,
      // Análise automática
      diagnosis: errMsg
        ? `❌ Falhou: ${errMsg}`
        : status === 200 && totalMs < 5000
        ? `✅ OK — respondeu em ${totalMs}ms`
        : status === 200 && totalMs < 15000
        ? `⚠️ OK mas lento — ${totalMs}ms`
        : status === 200
        ? `🔴 Muito lento — ${totalMs}ms (pode dar timeout no frontend)`
        : `❌ Status ${status}`,
      // Dicas extras para o caso do Flash
      hints:
        model === 'z-ai/glm-5.3-flash' && errMsg && errMsg.includes('Timeout')
          ? [
              '🚨 GLM-5.3 Flash em silêncio total (nem erro retornou).',
              'Causas mais prováveis:',
              '1. Quota do modelo Flash excedida na sua key NVIDIA',
              '2. Modelo em manutenção temporária na NVIDIA',
              '3. Sua key não tem permissão pro Flash',
              '',
              'Como confirmar:',
              '- Acesse https://build.nvidia.com e tente usar GLM-5.3 Flash lá',
              '- Se não funcionar lá também, é problema global da NVIDIA',
              '- Se funcionar lá, é problema com sua key específica',
              '',
              'Soluções:',
              '- Troque pro GLM-5.3 full (confirmado funcionando em 3.1s)',
              '- Ou crie uma nova key NVIDIA',
              '- Ou use os modelos @cf/* (Cloudflare) que estão funcionando',
            ]
          : model === 'z-ai/glm-5.3' && status === 200
          ? [
              '✅ GLM-5.3 full funcionando perfeitamente.',
              'Recomendado: use este modelo como padrão.',
            ]
          : [],
    }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
