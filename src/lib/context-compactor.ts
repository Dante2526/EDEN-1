import { Conversation, Message, ContextCompaction } from './types';

export const COMPACTION_TRIGGER_THRESHOLD = 12; // Antes era 16 — mais agressivo pra evitar stream cancelled
export const RECENT_MESSAGES_WINDOW = 6;
// Limiar de tokens: se passar de 12K tokens acumulados, compacta mesmo com poucas mensagens
// (cenário: poucas mensagens mas cada uma com muito código/tool calls longos)
export const COMPACTION_TOKEN_THRESHOLD = 12000;

/**
 * Estima o total de tokens de uma conversa somando o conteúdo de todas as mensagens.
 * Estimativa simples: ~4 chars = 1 token (regra de polegar comum pra inglês/português).
 * Não é perfeita mas é suficiente pra decidir quando compactar.
 */
export function estimateConversationTokens(conversation: Conversation): number {
  if (!conversation.messages) return 0;
  let totalChars = 0;
  for (const m of conversation.messages) {
    if (m.content) totalChars += m.content.length;
    if (m.reasoning) totalChars += m.reasoning.length;
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        if (tc.arguments) totalChars += tc.arguments.length;
        if (tc.result) totalChars += tc.result.length;
      }
    }
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Avalia se uma conversa atingiu o critério de volume para disparo de compactação de contexto.
 * DISPARA se QUALQUER destas condições for verdadeira:
 *   1. Número de mensagens > COMPACTION_TRIGGER_THRESHOLD (12)
 *   2. Tokens estimados > COMPACTION_TOKEN_THRESHOLD (12K)
 * Isso evita o cenário "poucas mensagens mas cada uma enorme" que causava stream cancelled.
 */
export function shouldCompact(conversation: Conversation): boolean {
  if (!conversation.messages || conversation.messages.length <= RECENT_MESSAGES_WINDOW) {
    return false;
  }

  // Critério 1: número de mensagens
  const lastCompactedId = conversation.contextCompaction?.compactedUpToMessageId;
  let uncompactedCount: number;
  if (!lastCompactedId) {
    uncompactedCount = conversation.messages.length;
  } else {
    const lastIndex = conversation.messages.findIndex((m) => m.id === lastCompactedId);
    if (lastIndex === -1) {
      uncompactedCount = conversation.messages.length;
    } else {
      uncompactedCount = conversation.messages.length - (lastIndex + 1);
    }
  }

  if (uncompactedCount > COMPACTION_TRIGGER_THRESHOLD) {
    return true;
  }

  // Critério 2: tokens estimados (só conta mensagens não compactadas)
  const estimatedTokens = estimateConversationTokens(conversation);
  if (estimatedTokens > COMPACTION_TOKEN_THRESHOLD && uncompactedCount > RECENT_MESSAGES_WINDOW) {
    return true;
  }

  return false;
}

/**
 * Constrói o prompt estruturado de compactação técnica de contexto.
 */
export function buildCompactionPrompt(messages: Message[], existingSummary?: string): string {
  const serializedHistory = messages
    .map((m) => {
      let docText = '';
      if (m.documents && m.documents.length > 0) {
        docText = m.documents.map((d) => `\n[Doc: ${d.name}]`).join('');
      }
      return `[${m.role.toUpperCase()}]: ${m.content}${docText}`;
    })
    .join('\n\n');

  return (
    `Você é o módulo de Context Compaction do Synap.\n` +
    `Sua missão é resumir o histórico técnico a seguir para que a IA das próximas iterações compreenda perfeitamente o contexto sem consumir a janela inteira de tokens.\n\n` +
    (existingSummary ? `RESUMO ANTERIOR DA SESSÃO:\n${existingSummary}\n\nNOVO HISTÓRICO A INCORPORAR:\n` : '') +
    `${serializedHistory}\n\n` +
    `ESTRUTURE OBRIGATORIAMENTE EM MARKDOWN COM AS SEGUINTES SEÇÕES:\n` +
    `### 🎯 Objetivo Principal & Requisitos\n` +
    `### 🛠️ Decisões Técnicas & Arquitetura\n` +
    `### 📂 Arquivos Lidos, Modificados & Estado do Código\n` +
    `### ⏳ Pendências & Próximos Passos Imediatos`
  );
}

/**
 * Executa a chamada em background para /api/chat gerando o resumo estruturado via glm-5.3-flash.
 */
export async function compactConversation(
  conversation: Conversation,
  apiKey: string
): Promise<ContextCompaction | null> {
  try {
    const totalMsgs = conversation.messages.length;
    if (totalMsgs <= RECENT_MESSAGES_WINDOW) return null;
    const splitIndex = totalMsgs - RECENT_MESSAGES_WINDOW;
    const messagesToCompact = conversation.messages.slice(0, splitIndex);
    const lastMessageToCompact = messagesToCompact[messagesToCompact.length - 1];

    if (!lastMessageToCompact) return null;

    const prompt = buildCompactionPrompt(messagesToCompact, conversation.contextCompaction?.summary);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        // GLM-5.3 Flash: rápido e estável para compactação.
        // Não usa tools nem reasoning_effort (flash não suporta reasoning).
        model: 'z-ai/glm-5.3-flash',
        reasoning_effort: 'low',
        tools: [],
      }),
    });

    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let summary = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) summary += delta;
          } catch {}
        }
      }
    }

    if (!summary.trim()) return null;

    return {
      summary: summary.trim(),
      compactedUpToMessageId: lastMessageToCompact.id,
      timestamp: Date.now(),
      originalMessageCount: messagesToCompact.length,
    };
  } catch (err) {
    console.error('Falha silenciosa na compactação de contexto:', err);
    return null;
  }
}

/**
 * Prepara a lista de mensagens para envio à API:
 * Injeta o resumo compactado (se houver) e apenas as mensagens recentes após o corte.
 */
export function prepareMessagesForApi(
  conversation: Conversation,
  systemPrompts: { repo?: string; base?: string; plan?: string; skills?: string; memories?: string; liveWeb?: string } = {}
): any[] {
  let effectiveMessages = [...conversation.messages];
  let compactedSummaryPrompt: any = null;

  if (conversation.contextCompaction) {
    const cutoffId = conversation.contextCompaction.compactedUpToMessageId;
    const cutoffIndex = effectiveMessages.findIndex((m) => m.id === cutoffId);
    if (cutoffIndex !== -1) {
      effectiveMessages = effectiveMessages.slice(cutoffIndex + 1);
    }
    compactedSummaryPrompt = {
      role: 'system',
      content: `[CONTEXT COMPACTION SUMMARY - Histórico anterior resumido para economia de tokens]:\n${conversation.contextCompaction.summary}`,
    };
  }

  const formatted = effectiveMessages.map((m) => {
    let content = m.content || '';
    if (m.documents && m.documents.length > 0) {
      const docsBlock = m.documents
        .map((d) => `[Arquivo anexado: ${d.name}]\n\`\`\`\n${d.content}\n\`\`\``)
        .join('\n\n');
      content = docsBlock + (content ? `\n\n${content}` : '');
    }
    return {
      role: m.role,
      content,
      images: m.images,
    };
  });

  const finalMessages: any[] = [];
  if (systemPrompts.base) finalMessages.push({ role: 'system', content: systemPrompts.base });
  if (systemPrompts.memories) finalMessages.push({ role: 'system', content: systemPrompts.memories });
  if (systemPrompts.liveWeb) finalMessages.push({ role: 'system', content: systemPrompts.liveWeb });
  if (systemPrompts.skills) finalMessages.push({ role: 'system', content: systemPrompts.skills });
  if (systemPrompts.repo) finalMessages.push({ role: 'system', content: systemPrompts.repo });
  if (systemPrompts.plan) finalMessages.push({ role: 'system', content: systemPrompts.plan });
  if (compactedSummaryPrompt) finalMessages.push(compactedSummaryPrompt);

  return [...finalMessages, ...formatted];
}
