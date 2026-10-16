import { ModelId } from './types';

export interface SubagentConfig {
  role: string;
  task: string;
  context?: string;
  model: ModelId;
  apiKeySecret?: string;
  signal?: AbortSignal;
  tools?: any[];
  onExecuteTool?: (name: string, args: any) => Promise<string>;
  maxIterations?: number;
}

export interface SubagentResult {
  success: boolean;
  role: string;
  task: string;
  report: string;
  reasoning?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Constrói o system prompt focado e restrito para o subagente.
 */
export function buildSubagentSystemPrompt(role: string, task: string, context?: string): string {
  return [
    `Você é um subagente autônomo com o papel de: "${role}".`,
    'Sua missão é resolver EXCLUSIVAMENTE a subtarefa delimitada abaixo, sem se desviar para outros tópicos.',
    '',
    `🎯 TAREFA PRINCIPAL:\n${task}`,
    context ? `\n📋 CONTEXTO & DADOS FORNECIDOS:\n${context}` : '',
    '',
    'DIRETRIZES DO SUBAGENTE:',
    '1. Responda com um relatório objetivo, técnico e pronto para ser consumido pelo agente coordenador principal.',
    '2. Seja direto e evite enrolações, preâmbulos vazios ou introduções dispensáveis.',
    '3. Se a tarefa exigir código ou configuração, forneça os trechos completos e formatados.',
    '4. Estruture as conclusões em tópicos Markdown concisos.',
    '5. Se tiver ferramentas disponíveis (como read_file, list_files, search_code, web_search, fetch_url), use-as imediatamente para coletar evidências reais antes de redigir o relatório.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Normaliza e separa o raciocínio (<think>...</think>) do relatório final.
 */
export function parseSubagentResult(rawText: string): { report: string; reasoning?: string } {
  if (!rawText) {
    return { report: '' };
  }

  let reasoning: string | undefined = undefined;
  let report = rawText;

  const thinkMatch = rawText.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  if (thinkMatch) {
    reasoning = thinkMatch[1].trim();
    report = rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
  }

  return {
    report: report.trim(),
    reasoning: reasoning || undefined,
  };
}

/**
 * Executa o subagente despachando uma chamada isolada (com loop opcional de tools) para a API interna de chat.
 */
export async function runSubagent(config: SubagentConfig): Promise<SubagentResult> {
  const startTime = Date.now();
  const role = config.role?.trim();
  const task = config.task?.trim();

  if (!role || !task) {
    return {
      success: false,
      role: role || 'Subagente',
      task: task || 'Indefinida',
      report: '',
      error: 'Parâmetros role e task são obrigatórios para disparar um subagente.',
    };
  }

  const systemPrompt = buildSubagentSystemPrompt(role, task, config.context);
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Execute a tarefa: ${task}` },
  ];

  const maxIterations = config.maxIterations ?? 5;
  const timeoutMs = 45000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link signal if provided
  if (config.signal) {
    config.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    let finalAccumulatedText = '';
    let finalAccumulatedReasoning = '';

    for (let iter = 0; iter < maxIterations; iter++) {
      const requestBody: any = {
        messages,
        model: config.model,
        reasoning_effort: 'low',
      };
      if (config.tools && Array.isArray(config.tools) && config.tools.length > 0) {
        requestBody.tools = config.tools;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKeySecret || '',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        clearTimeout(timeoutId);
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          role,
          task,
          report: '',
          durationMs: Date.now() - startTime,
          error: `Falha na requisição do subagente (HTTP ${res.status}): ${errText || res.statusText}`,
        };
      }

      const contentType = res.headers?.get?.('content-type') || '';
      let turnText = '';
      let turnReasoning = '';
      const toolCallsAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};

      if (contentType.includes('text/event-stream') && res.body && typeof (res.body as any).getReader === 'function') {
        const reader = (res.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.replace(/^data:\s*/, '').trim();
              if (dataStr === '[DONE]') break;
              try {
                const parsed = JSON.parse(dataStr);
                const choice = parsed.choices?.[0];
                const delta = choice?.delta || choice?.message;
                if (delta) {
                  if (delta.content) turnText += delta.content;
                  if (delta.reasoning_content) turnReasoning += delta.reasoning_content;
                  if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCallsAccumulator[idx]) {
                        toolCallsAccumulator[idx] = {
                          id: tc.id || `call_sub_${Date.now()}_${idx}`,
                          name: tc.function?.name || '',
                          arguments: '',
                        };
                      }
                      if (tc.id) toolCallsAccumulator[idx].id = tc.id;
                      if (tc.function?.name) toolCallsAccumulator[idx].name = tc.function.name;
                      if (tc.function?.arguments) toolCallsAccumulator[idx].arguments += tc.function.arguments;
                    }
                  }
                }
              } catch {}
            }
          }
        }
      } else {
        const data = await res.json();
        const msg = data.choices?.[0]?.message || data.choices?.[0]?.delta;
        turnText =
          msg?.content ||
          (typeof data === 'string' ? data : msg?.tool_calls ? '' : JSON.stringify(data));
        if (msg?.reasoning_content) {
          turnReasoning = msg.reasoning_content;
        }
        if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
          msg.tool_calls.forEach((tc: any, idx: number) => {
            toolCallsAccumulator[idx] = {
              id: tc.id || `call_sub_${Date.now()}_${idx}`,
              name: tc.function?.name || '',
              arguments:
                typeof tc.function?.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || {}),
            };
          });
        }
      }

      if (turnText) {
        finalAccumulatedText = finalAccumulatedText ? `${finalAccumulatedText}\n\n${turnText}` : turnText;
      }
      if (turnReasoning) {
        finalAccumulatedReasoning = finalAccumulatedReasoning
          ? `${finalAccumulatedReasoning}\n\n${turnReasoning}`
          : turnReasoning;
      }

      const detectedCalls = Object.values(toolCallsAccumulator).filter((c) => c && c.name);
      if (detectedCalls.length > 0 && config.onExecuteTool) {
        messages.push({
          role: 'assistant',
          content: turnText || '',
          tool_calls: detectedCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: {
              name: c.name,
              arguments: c.arguments,
            },
          })),
        });

        for (const tc of detectedCalls) {
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(tc.arguments || '{}');
          } catch {
            parsedArgs = {};
          }
          let toolResult = '';
          try {
            toolResult = await config.onExecuteTool(tc.name, parsedArgs);
          } catch (toolErr: any) {
            toolResult = JSON.stringify({ error: toolErr?.message || 'Erro ao executar ferramenta no subagente.' });
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult,
          });
        }
        continue;
      }

      break;
    }

    clearTimeout(timeoutId);
    const { report, reasoning } = parseSubagentResult(finalAccumulatedText);
    const combinedReasoning = [finalAccumulatedReasoning, reasoning].filter(Boolean).join('\n\n') || undefined;

    return {
      success: true,
      role,
      task,
      report: report || finalAccumulatedText,
      reasoning: combinedReasoning,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError';
    return {
      success: false,
      role,
      task,
      report: '',
      durationMs: Date.now() - startTime,
      error: isTimeout
        ? `Tempo limite excedido (${timeoutMs / 1000}s) na execução do subagente.`
        : `Erro no subagente: ${err?.message || 'Falha de comunicação'}`,
    };
  }
}
