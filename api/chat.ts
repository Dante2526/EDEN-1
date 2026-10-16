import { checkAuthAndRateLimit, ALLOWED_MODELS, isCloudflareModel, isVisionModel, isToolCapableModel } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

function maxTokensFor(effort: string): number {
  // Aumentado pra permitir respostas mais longas quando IA tá em modo agentic
  // (resolvendo problema complexo sem parar no meio).
  // Limite real da NVIDIA GLM-5.3 é 16K tokens por resposta.
  if (effort === 'max') return 16384;
  if (effort === 'high' || effort === 'medium') return 12288;
  return 8192;
}

// ===========================================================================
// Transformador SSE: extrai <think>...</think> do delta.content da Cloudflare
// e reescreve como delta.reasoning_content, mantendo o resto em delta.content.
//
// Por que isso existe?
//   - O DeepSeek R1-Distill-Qwen-32B da Cloudflare retorna o raciocínio embutido
//     em `delta.content` entre tags <think>...</think>.
//   - O frontend do Synap já sabe separar `delta.reasoning_content` (mostrado na
//     Safe Thinking Orb e ignorado pelo TTS) de `delta.content` (resposta final).
//   - Então interceptamos os chunks SSE aqui no backend e "traduzimos" o formato
//     da Cloudflare para o formato NVIDIA/GLM, deixando o frontend intacto.
//
// Como funciona:
//   - Mantemos um buffer acumulando o `content` de todos os chunks recebidos.
//   - A cada novo chunk, processamos o buffer acumulado procurando por <think> e
//     </think>, emitindo deltas de reasoning ou de content conforme apropriado.
//   - Sempre preservamos o texto incompleto (ex.: "<thi" sem fechar) para o
//     próximo chunk.
//   - No fim do stream (DONE), fazemos um flush final.
// ===========================================================================
class CloudflareThinkSplitter {
  private contentBuffer: string = '';
  private inThinking: boolean = false;
  private thinkTagEmitted: boolean = false;

  /** Processa um chunk de content (string) e retorna os SSEs a emitir. */
  feed(contentDelta: string): { reasoningDelta?: string; contentDelta?: string } {
    if (!contentDelta) return {};
    this.contentBuffer += contentDelta;

    const out: { reasoningDelta?: string; contentDelta?: string } = {};
    const OPEN = String.fromCharCode(60, 116, 104, 105, 110, 107, 62);   //  Dems
    const CLOSE = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62); //  Democrats

    // Loop: em um único feed podemos ter OPEN ... CLOSE ... OPEN ... CLOSE.
    // IMPORTANTE: depois de cada slice() no contentBuffer, tudo que sobra é
    // "não emitido por construção", então não rastreamos offsets — só
    // mantemos um lookahead de OPEN/CLOSE.length chars no fim (caso a tag
    // venha cortada entre dois chunks) e soltamos o resto no flush().
    while (true) {
      if (!this.inThinking) {
        const openIdx = this.contentBuffer.indexOf(OPEN);
        if (openIdx !== -1) {
          // Emite como content tudo que veio antes do OPEN.
          if (openIdx > 0) {
            out.contentDelta = (out.contentDelta || '') + this.contentBuffer.slice(0, openIdx);
          }
          this.contentBuffer = this.contentBuffer.slice(openIdx + OPEN.length);
          this.inThinking = true;
          this.thinkTagEmitted = true;
          continue; // volta pro while pra procurar CLOSE
        }
        // Não achou OPEN: emite tudo exceto os últimos OPEN.length chars
        // (lookahead de segurança, caso a tag venha cortada no próximo chunk).
        if (this.contentBuffer.length > OPEN.length) {
          const safeLen = this.contentBuffer.length - OPEN.length;
          out.contentDelta = (out.contentDelta || '') + this.contentBuffer.slice(0, safeLen);
          this.contentBuffer = this.contentBuffer.slice(safeLen);
        }
        break; // buffer pequeno e sem OPEN: espera próximo chunk
      }

      // Estamos dentro de  Dems... Democrats: procura o fechamento.
      const closeIdx = this.contentBuffer.indexOf(CLOSE);
      if (closeIdx !== -1) {
        if (closeIdx > 0) {
          out.reasoningDelta = (out.reasoningDelta || '') + this.contentBuffer.slice(0, closeIdx);
        }
        this.contentBuffer = this.contentBuffer.slice(closeIdx + CLOSE.length);
        this.inThinking = false;
        continue; // volta pro while pra procurar próximo OPEN
      }
      // Não fechou ainda: emite tudo exceto os últimos CLOSE.length chars
      // (lookahead de segurança, caso a tag de fechamento venha cortada).
      if (this.contentBuffer.length > CLOSE.length) {
        const safeLen = this.contentBuffer.length - CLOSE.length;
        out.reasoningDelta = (out.reasoningDelta || '') + this.contentBuffer.slice(0, safeLen);
        this.contentBuffer = this.contentBuffer.slice(safeLen);
      }
      break; // buffer pequeno e sem CLOSE: espera próximo chunk
    }
    return out;
  }

  /** Flush final: solta qualquer texto restante no buffer. */
  flush(): { reasoningDelta?: string; contentDelta?: string } {
    const out: { reasoningDelta?: string; contentDelta?: string } = {};
    if (this.inThinking) {
      // Nunca fechou  Dems: emite tudo como reasoning (caso patológico).
      if (this.contentBuffer) out.reasoningDelta = this.contentBuffer;
    } else {
      if (this.contentBuffer) out.contentDelta = this.contentBuffer;
    }
    this.contentBuffer = '';
    return out;
  }
}

export default async function handler(req: Request, envArg?: Env) {
  const env = getEnv(envArg);
  try {
    const securityResponse = await checkAuthAndRateLimit(req, env);
    if (securityResponse) return securityResponse;
  } catch (secErr: any) {
    console.error('Security check error:', secErr);
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    let { messages } = body;
    const {
      model,
      reasoning_effort,
      tools,
      max_tokens: customMaxTokens,
      temperature: customTemperature,
    } = body;

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

    const usingCloudflare = isCloudflareModel(selectedModel);

    // ====== VALIDAÇÃO DE CREDENCIAIS POR PROVEDOR ======
    let apiKey: string | undefined;
    let cfAccountId: string | undefined;
    let cfApiToken: string | undefined;

    if (usingCloudflare) {
      cfAccountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
      cfApiToken = env.CLOUDFLARE_API_TOKEN?.trim();
      if (!cfAccountId || !cfApiToken) {
        return new Response(
          JSON.stringify({
            error:
              'Cloudflare não configurada. Defina CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN nas variáveis de ambiente (CF Pages dashboard).',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else {
      apiKey = env.NVIDIA_API_KEY;
      if (!apiKey || apiKey === 'sua_key_aqui' || apiKey === 'nvapi-your-key-here' || apiKey.trim() === '') {
        return new Response(
          JSON.stringify({ error: 'NVIDIA_API_KEY não configurada. Adicione nas Environment Variables da Vercel.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const selectedEffort = reasoning_effort || 'low';
    const apiEffort = selectedEffort === 'max' ? 'high' : selectedEffort;

    // IMPORTANTE: não bloqueamos mais se o histórico contiver imagens e o modelo
    // atual não for vision. Em vez disso, filtramos as imagens do histórico
    // (substituindo por nota textual) na função buildFormattedMessages abaixo.
    //
    // Cenário que isso resolve: usuário anexou foto no início da conversa
    // usando GLM-5.3-Flash, depois trocou pra Qwen Coder / R1 / DeepSeek.
    // Antes, o backend bloqueava com 400 "Este modelo não suporta imagens"
    // mesmo o usuário não anexando foto nova. Agora, as imagens antigas
    // viram texto "[Nota: N imagem(ns) omitida(s)]" e o modelo consegue responder.
    //
    // Só bloqueamos se a ÚLTIMA mensagem do usuário (a que tá sendo enviada
    // AGORA) tiver imagem anexada e o modelo não for vision — nesse caso não
    // tem o que fazer, a imagem é essencial pra pergunta.
    const lastUserMsgIndexPre = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return i;
      }
      return -1;
    })();
    const lastUserMsg = lastUserMsgIndexPre >= 0 ? messages[lastUserMsgIndexPre] : null;
    const lastUserHasImages = Boolean(
      lastUserMsg &&
      lastUserMsg.images &&
      Array.isArray(lastUserMsg.images) &&
      lastUserMsg.images.length > 0
    );

    // Validação de visão: GLM-5.3-Flash e Gemma 4 31B suportam imagens.
    // Só bloqueamos se a última mensagem do usuário (a atual) tiver imagem.
    const isVisionCapable = isVisionModel(selectedModel);
    if (lastUserHasImages && !isVisionCapable) {
      return new Response(
        JSON.stringify({ error: 'Este modelo não suporta imagens. Use GLM-5.3-Flash ou Gemma 4 31B.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let lastUserMsgIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserMsgIndex = i; break; }
    }

    // Formata mensagens adaptando caso o modelo não use tools (evita erro 400 no DeepSeek/Kimi/CF)
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
          return { role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls };
        }
        if (m.role === 'user' && m.images && Array.isArray(m.images) && m.images.length > 0) {
          if (index === lastUserMsgIndex && isVisionCapable) {
            // Última mensagem do usuário + modelo vision = manda imagem real
            return {
              role: 'user',
              content: [
                { type: 'text', text: m.content || '' },
                ...m.images.map((img: string) => ({ type: 'image_url', image_url: { url: img } })),
              ],
            };
          }
          // Histórico antigo com imagem, OU última mensagem mas modelo não é vision:
          // manda só o texto, sem mencionar que tinha imagem (evita modelo recusar
          // responder dizendo "não tenho olhos").
          return { role: 'user', content: m.content || '' };
        }
        return { role: m.role, content: m.content || '' };
      });
    };

    // Modelos que suportam tools (centralizados em TOOL_MODELS):
    const modelSupportsTools = isToolCapableModel(selectedModel);

    // ====== BUILDER DE PAYLOAD — NUVEM (NVIDIA) ======
    const createNvidiaPayload = (includeReasoning = true, includeTools = true, safeTokenLimit = false) => {
      const hasToolsActive = includeTools && modelSupportsTools && tools && Array.isArray(tools) && tools.length > 0;
      const baseMaxTokens = safeTokenLimit ? 4096 : maxTokensFor(selectedEffort);
      const tokenLimit = typeof customMaxTokens === 'number' && customMaxTokens > 0
        ? Math.min(customMaxTokens, baseMaxTokens)
        : baseMaxTokens;
      const p: any = {
        model: selectedModel,
        messages: buildFormattedMessages(Boolean(hasToolsActive)),
        stream: true,
        max_tokens: tokenLimit,
      };
      if (typeof customTemperature === 'number') {
        p.temperature = customTemperature;
      }
      if (selectedModel === 'z-ai/glm-5.3') {
        p.stream_options = { include_usage: true };
      }
      if (includeReasoning && apiEffort && apiEffort !== 'default') {
        if (selectedModel === 'z-ai/glm-5.3') {
          p.reasoning_effort = apiEffort;
        } else if (selectedModel === 'google/gemma-4-31b-it' || selectedModel === 'nvidia/nemotron-3-ultra-550b-a55b') {
          p.chat_template_kwargs = { enable_thinking: true };
        }
      }
      if (hasToolsActive) {
        p.tools = tools;
        p.tool_choice = 'auto';
      }
      return p;
    };

    // ====== BUILDER DE PAYLOAD — CLOUDFLARE WORKERS AI ======
    // O R1-Distill 32B da CF:
    //   - max_tokens ampliado para até 16.384 no modo 'max' para permitir conclusão integral do raciocínio (<think>).
    //   - Qwen 2.5 Coder suporta tools via endpoint OpenAI-compat da Cloudflare.
    //   - Retorna o raciocínio embutido em delta.content entre <think>...</think>.
    //     O transformador CloudflareThinkSplitter cuida de separar isso em delta.reasoning_content.
    const createCloudflarePayload = (includeTools = true, safeTokenLimit = false) => {
      let cfMaxTokens = 8192;
      if (safeTokenLimit) {
        cfMaxTokens = 4096;
      } else if (selectedEffort === 'max') {
        cfMaxTokens = 16384;
      } else if (selectedEffort === 'high' || selectedEffort === 'medium') {
        cfMaxTokens = 12288;
      }
      const tokenLimit = typeof customMaxTokens === 'number' && customMaxTokens > 0
        ? Math.min(customMaxTokens, cfMaxTokens)
        : cfMaxTokens;
      const hasToolsActive = includeTools && modelSupportsTools && tools && Array.isArray(tools) && tools.length > 0;
      const p: any = {
        model: selectedModel,
        messages: buildFormattedMessages(Boolean(hasToolsActive)),
        stream: true,
        max_tokens: tokenLimit,
        temperature: typeof customTemperature === 'number'
          ? customTemperature
          : selectedModel.includes('deepseek-r1') ? 0.6 : 0.7,
      };
      if (hasToolsActive) {
        p.tools = tools;
        p.tool_choice = 'auto';
      }
      return p;
    };

    let payload = usingCloudflare
      ? createCloudflarePayload(true)
      : createNvidiaPayload(true, true, false);

    console.log(
      `[chat] provider=${usingCloudflare ? 'cloudflare' : 'nvidia'} model=${selectedModel} effort=${selectedEffort}->${apiEffort} tools=${payload.tools?.length || 0} max_tokens=${payload.max_tokens}`
    );

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastActivity = Date.now();
        let isMidChunk = false;
        let wasIdleTimeout = false;

        // 1. Primeiro byte imediato para destravar o TTFB de 25s da Vercel
        controller.enqueue(enc.encode(': keepalive\n\n'));

        // 2. Heartbeat a cada 5s enquanto aguarda a IA pensar
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

        // ====== FETCH COM TIMEOUT (45s) ======
        const fetchWithTimeout = async (bodyPayload: any) => {
          const url = usingCloudflare
            ? `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/v1/chat/completions`
            : 'https://integrate.api.nvidia.com/v1/chat/completions';

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (usingCloudflare) {
            headers['Authorization'] = `Bearer ${cfApiToken}`;
          } else {
            headers['Authorization'] = `Bearer ${(apiKey as string).trim()}`;
          }

          const fetchCtrl = new AbortController();
          const fetchTimer = setTimeout(() => fetchCtrl.abort(), 75000); // 75s (teto seguro para início de raciocínio nas GPUs da Cloudflare)
          try {
            const r = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(bodyPayload),
              signal: fetchCtrl.signal,
            });
            clearTimeout(fetchTimer);
            return r;
          } catch (err) {
            clearTimeout(fetchTimer);
            throw err;
          }
        };

        // ====== PIPE DE ERRO PADRÃO ======
        const sendErrorAndClose = (errMsg: string, isInterruption = false) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: errMsg, isInterruption })}\n\n`));
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({
                  choices: [{ index: 0, delta: { content: `\n\n⚠️ **Erro:** ${errMsg}` }, finish_reason: isInterruption ? 'error' : 'stop' }],
                })}\n\n`
              )
            );
            controller.enqueue(enc.encode('data: [DONE]\n\n'));
            controller.close();
          } catch {}
          clearInterval(timer);
        };

        try {
          let res = await fetchWithTimeout(payload);

          // Auto-retry para Rate Limit (429) ou erro temporário de gateway (502/503/504)
          if ((res.status === 429 || res.status >= 502) && !req.signal?.aborted) {
            await res.body?.cancel().catch(() => {});
            await new Promise((r) => setTimeout(r, 2000));
            res = await fetchWithTimeout(payload);
          }

          // ====== FALLBACKS ======
          if (usingCloudflare) {
            // Fallback 1: Se Cloudflare der 400/422 com tools -> tenta sem tools
            if (!res.ok && (res.status === 400 || res.status === 422) && payload.tools) {
              await res.body?.cancel().catch(() => {});
              payload = createCloudflarePayload(false, false);
              res = await fetchWithTimeout(payload);
            }
            // Fallback 2: Se Cloudflare der 400/422 por excesso de max_tokens -> reduz para 4096
            if (!res.ok && (res.status === 400 || res.status === 422) && payload.max_tokens > 4096) {
              await res.body?.cancel().catch(() => {});
              payload = createCloudflarePayload(false, true);
              res = await fetchWithTimeout(payload);
            }
          } else {
            // Fallback 1: 400/422 com reasoning_effort -> tenta sem reasoning_effort
            if (!res.ok && (res.status === 400 || res.status === 422) && payload.reasoning_effort) {
              await res.body?.cancel().catch(() => {});
              payload = createNvidiaPayload(false, true, false);
              res = await fetchWithTimeout(payload);
            }
            // Fallback 2: 400/422 com tools -> tenta sem tools
            if (!res.ok && (res.status === 400 || res.status === 422) && payload.tools) {
              await res.body?.cancel().catch(() => {});
              payload = createNvidiaPayload(false, false, false);
              res = await fetchWithTimeout(payload);
            }
            // Fallback 3: 400/422 por excesso de max_tokens -> reduz para 4096
            if (!res.ok && (res.status === 400 || res.status === 422) && payload.max_tokens > 4096) {
              await res.body?.cancel().catch(() => {});
              payload = createNvidiaPayload(false, false, true);
              res = await fetchWithTimeout(payload);
            }
          }

          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => 'Erro desconhecido');
            let errMsg = usingCloudflare
              ? `Erro da API Cloudflare (${res.status})`
              : `Erro da API NVIDIA (${res.status})`;
            try {
              const parsed = JSON.parse(errText);
              if (usingCloudflare && parsed?.errors?.length) {
                errMsg = parsed.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
              } else if (parsed?.error?.message) {
                errMsg = parsed.error.message;
              } else if (parsed?.message) {
                errMsg = parsed.message;
              } else if (parsed?.detail) {
                errMsg = String(parsed.detail);
              }
            } catch {
              if (errText) errMsg = errText.slice(0, 300);
            }
            if (res.status === 401) {
              errMsg = usingCloudflare
                ? 'CLOUDFLARE_API_TOKEN inválido ou sem permissão de Workers AI.'
                : 'Chave NVIDIA_API_KEY inválida.';
            } else if (usingCloudflare && errText && errText.includes('not available on the Workers Free plan')) {
              errMsg = `Este modelo (@cf) exige Workers Paid plan ($5/mês). Detalhe: ${errMsg}`;
            } else if (res.status === 429) {
              errMsg = 'Limite de requisições atingido (Rate Limit). Aguarde alguns segundos.';
            }
            sendErrorAndClose(errMsg);
            return;
          }

          // ====== PIPE DOS DADOS REAIS ======
          // Se for Cloudflare, interceptamos o stream para separar <think> do content.
          const reader = res.body.getReader();
          let idleTimer: ReturnType<typeof setTimeout> | null = null;
          wasIdleTimeout = false;
          const resetIdleTimer = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              wasIdleTimeout = true;
              console.log('[chat] IDLE TIMEOUT: provedor não mandou dados por 90s, abortando leitor...');
              try { reader.cancel(); } catch {}
            }, 90000);
          };
          resetIdleTimer();

          // Instanciado só quando necessário (CF). Para NVIDIA, é null e pulamos o rewrite.
          const splitter: CloudflareThinkSplitter | null = usingCloudflare ? new CloudflareThinkSplitter() : null;
          // Buffer de linha SSE bruta (para o caso de um chunk cortar no meio de uma linha)
          let sseBuffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              resetIdleTimer();
              lastActivity = Date.now();
              const textChunk = dec.decode(value, { stream: true });

              if (splitter) {
                const sp = splitter;
                // ====== MODO TRANSFORMADOR: parse SSE, separa <think>, reescreve ======
                sseBuffer += textChunk;
                isMidChunk = !sseBuffer.endsWith('\n');
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop() || '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  if (trimmed.startsWith(':')) continue; // comentário keepalive
                  if (!trimmed.startsWith('data:')) continue;

                  const dataStr = trimmed.replace(/^data:\s*/, '');
                  if (dataStr === '[DONE]') {
                    // Flush final antes de propagar o DONE
                    const flushed = sp.flush();
                    if (flushed.reasoningDelta) {
                      controller.enqueue(
                        enc.encode(
                          `data: ${JSON.stringify({
                            choices: [{ index: 0, delta: { reasoning_content: flushed.reasoningDelta } }],
                          })}\n\n`
                        )
                      );
                    }
                    if (flushed.contentDelta) {
                      controller.enqueue(
                        enc.encode(
                          `data: ${JSON.stringify({
                            choices: [{ index: 0, delta: { content: flushed.contentDelta } }],
                          })}\n\n`
                        )
                      );
                    }
                    controller.enqueue(enc.encode('data: [DONE]\n\n'));
                    continue;
                  }

                  try {
                    const parsed = JSON.parse(dataStr);
                    const choice = parsed.choices?.[0];
                    const delta = choice?.delta || choice?.message;

                    if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
                      const split = sp.feed(delta.content);
                      // Se esse chunk já veio com finish_reason, faz o flush de qualquer resto no buffer
                      if (choice?.finish_reason) {
                        const flushed = sp.flush();
                        if (flushed.reasoningDelta) split.reasoningDelta = (split.reasoningDelta || '') + flushed.reasoningDelta;
                        if (flushed.contentDelta) split.contentDelta = (split.contentDelta || '') + flushed.contentDelta;
                      }
                      // Constrói um novo chunk preservando tudo do original, só trocando o delta
                      const newDelta: any = { ...delta };
                      delete newDelta.content;
                      if (split.reasoningDelta) newDelta.reasoning_content = split.reasoningDelta;
                      if (split.contentDelta) newDelta.content = split.contentDelta;

                      if (split.reasoningDelta || split.contentDelta || choice?.finish_reason || delta.tool_calls) {
                        const newParsed = {
                          ...parsed,
                          choices: [{ ...choice, delta: newDelta }],
                        };
                        controller.enqueue(enc.encode(`data: ${JSON.stringify(newParsed)}\n\n`));
                      }
                      // Se nenhum dos dois veio (texto no buffer de lookahead), não emite nada
                      // ainda — vai ser emitido nos próximos chunks quando o lookahead fechar.
                    } else {
                      // Chunk sem content (ex.: só role, tool_calls, finish_reason) — repassa direto
                      controller.enqueue(enc.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                    }
                  } catch {
                    // JSON malformado (raro): repassa a linha original
                    controller.enqueue(enc.encode(`${line}\n`));
                  }
                }
              } else {
                // ====== MODO PIPE DIRETO (NVIDIA) ======
                isMidChunk = !textChunk.endsWith('\n');
                controller.enqueue(value);
              }
            }

            // Após o loop: se ainda há SSE buffer pendente no modo transformador, processa
            if (splitter && sseBuffer.trim()) {
              const spFinal = splitter;
              const trimmed = sseBuffer.trim();
              if (trimmed.startsWith('data:') && trimmed.replace(/^data:\s*/, '') === '[DONE]') {
                const flushed = spFinal.flush();
                if (flushed.reasoningDelta) {
                  controller.enqueue(
                    enc.encode(
                      `data: ${JSON.stringify({
                        choices: [{ index: 0, delta: { reasoning_content: flushed.reasoningDelta } }],
                      })}\n\n`
                    )
                  );
                }
                if (flushed.contentDelta) {
                  controller.enqueue(
                    enc.encode(
                      `data: ${JSON.stringify({
                        choices: [{ index: 0, delta: { content: flushed.contentDelta } }],
                      })}\n\n`
                    )
                  );
                }
                controller.enqueue(enc.encode('data: [DONE]\n\n'));
              } else if (trimmed.startsWith('data:')) {
                // Tenta processar como JSON normal (chunk final sem \n)
                try {
                  const dataStr = trimmed.replace(/^data:\s*/, '');
                  const parsed = JSON.parse(dataStr);
                  const choice = parsed.choices?.[0];
                  const delta = choice?.delta || choice?.message;
                  if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
                    const split = spFinal.feed(delta.content);
                    const flushed = spFinal.flush();
                    const reasoningFull = (split.reasoningDelta || '') + (flushed.reasoningDelta || '');
                    const contentFull = (split.contentDelta || '') + (flushed.contentDelta || '');
                    const newDelta: any = { ...delta };
                    delete newDelta.content;
                    if (reasoningFull) newDelta.reasoning_content = reasoningFull;
                    if (contentFull) newDelta.content = contentFull;
                    if (reasoningFull || contentFull) {
                      controller.enqueue(
                        enc.encode(
                          `data: ${JSON.stringify({
                            ...parsed,
                            choices: [{ ...choice, delta: newDelta }],
                          })}\n\n`
                        )
                      );
                    }
                  } else {
                    controller.enqueue(enc.encode(`data: ${dataStr}\n\n`));
                  }
                } catch {
                  // ignora linha truncada irreconhecível
                }
              }
            }
          } finally {
            if (idleTimer) clearTimeout(idleTimer);
          }
          clearInterval(timer);
          controller.close();
        } catch (err: any) {
          clearInterval(timer);
          if (!req.signal?.aborted) {
            let errMsg = err?.message || 'Falha na conexão com a IA';
            const isAbortedError =
              errMsg.includes('The operation was aborted') ||
              errMsg.includes('operation was aborted') ||
              errMsg.includes('AbortError') ||
              errMsg.includes('aborted');
            const isInterruption =
              wasIdleTimeout ||
              isAbortedError ||
              errMsg.includes('Stream was cancelled') ||
              errMsg.includes('stream cancelled') ||
              errMsg.includes('Stream interrupted') ||
              errMsg.includes('fetch failed');
            if (wasIdleTimeout) {
              errMsg = 'Stream interrupted: A IA demorou mais de 90s para gerar os dados.';
            } else if (isAbortedError) {
              errMsg = 'Stream interrupted: Conexão interrompida pelo servidor da IA durante o processamento.';
            }
            sendErrorAndClose(errMsg, isInterruption);
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
