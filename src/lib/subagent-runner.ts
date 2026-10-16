import { ModelId } from './types';

export interface SubagentConfig {
  role: string;
  task: string;
  context?: string;
  model: ModelId;
  apiKeySecret?: string;
  signal?: AbortSignal;
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
 * Executa o subagente despachando uma chamada isolada para a API interna de chat.
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
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Execute a tarefa: ${task}` },
  ];

  const timeoutMs = 35000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link signal if provided
  if (config.signal) {
    config.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKeySecret || '',
      },
      body: JSON.stringify({
        messages,
        model: config.model,
        reasoning_effort: 'low',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
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

    // Leitura resiliente da resposta (suporta tanto application/json quanto text/event-stream)
    const contentType = res.headers?.get?.('content-type') || '';
    let accumulatedText = '';

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
              const deltaContent = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content;
              if (deltaContent) {
                accumulatedText += deltaContent;
              }
            } catch {}
          }
        }
      }
    } else {
      const data = await res.json();
      accumulatedText =
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.delta?.content ||
        (typeof data === 'string' ? data : JSON.stringify(data));
    }

    const { report, reasoning } = parseSubagentResult(accumulatedText);

    return {
      success: true,
      role,
      task,
      report: report || accumulatedText,
      reasoning,
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
