import { Conversation, Message, ContextCompaction } from './types';

export const COMPACTION_TRIGGER_THRESHOLD = 16;
export const RECENT_MESSAGES_WINDOW = 6;

/**
 * Gatilho por TAMANHO: tokens estimados das mensagens que já saíram da janela recente
 * (e que seriam enviadas à IA). Pouca mensagem enorme (código, anexos) também compacta.
 */
export const COMPACTION_TOKEN_THRESHOLD = 16_000;

/**
 * Mensagens FORA da janela recente são enviadas encurtadas à IA. Quanto menor o prompt,
 * mais rápido o 1º token. As mensagens recentes (e a última do usuário) vão sempre inteiras.
 */
export const OLD_DOCUMENT_MAX_CHARS = 4_000;
export const OLD_MESSAGE_MAX_CHARS = 12_000;

/** Estimativa grosseira (~4 caracteres por token), suficiente pra decidir quando compactar. */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/** Mantém o começo e o fim do texto e troca o meio por um aviso. */
export function trimMiddle(text: string, maxChars: number, label: string): string {
  if (!text || text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = maxChars - head;
  const omitted = text.length - maxChars;
  return (
    `${text.slice(0, head)}\n[... ${omitted} caracteres omitidos (${label}) para acelerar a resposta ...]\n` +
    text.slice(text.length - tail)
  );
}

/** Texto da mensagem como vai pra API (anexos inline). `trim` encurta anexos/texto longos. */
function renderMessageContent(m: Message, trim: boolean): string {
  let content = m.content || '';
  if (trim) content = trimMiddle(content, OLD_MESSAGE_MAX_CHARS, 'mensagem antiga');
  if (m.documents && m.documents.length > 0) {
    const docsBlock = m.documents
      .map((d) => {
        const body = trim ? trimMiddle(d.content || '', OLD_DOCUMENT_MAX_CHARS, 'anexo antigo') : d.content;
        return `[Arquivo anexado: ${d.name}]\n\`\`\`\n${body}\n\`\`\``;
      })
      .join('\n\n');
    content = docsBlock + (content ? `\n\n${content}` : '');
  }
  return content;
}

/** Tokens estimados do que está FORA da janela recente (já encurtado, como é enviado). */
function olderMessagesTokens(messages: Message[]): number {
  const olderCount = Math.max(0, messages.length - RECENT_MESSAGES_WINDOW);
  let total = 0;
  for (let i = 0; i < olderCount; i++) total += estimateTokens(renderMessageContent(messages[i], true));
  return total;
}

function countBasedTrigger(conversation: Conversation): boolean {
  if (!conversation.messages || conversation.messages.length <= COMPACTION_TRIGGER_THRESHOLD) {
    return false;
  }
  const lastCompactedId = conversation.contextCompaction?.compactedUpToMessageId;
  if (!lastCompactedId) {
    return conversation.messages.length > COMPACTION_TRIGGER_THRESHOLD;
  }
  const lastIndex = conversation.messages.findIndex((m) => m.id === lastCompactedId);
  if (lastIndex === -1) return true;
  const uncompactedCount = conversation.messages.length - (lastIndex + 1);
  return uncompactedCount > COMPACTION_TRIGGER_THRESHOLD - RECENT_MESSAGES_WINDOW;
}

function sizeBasedTrigger(conversation: Conversation): boolean {
  const messages = conversation.messages || [];
  const lastCompactedId = conversation.contextCompaction?.compactedUpToMessageId;
  const lastIndex = lastCompactedId ? messages.findIndex((m) => m.id === lastCompactedId) : -1;
  const uncompacted = lastIndex >= 0 ? messages.slice(lastIndex + 1) : messages;
  if (uncompacted.length <= RECENT_MESSAGES_WINDOW) return false;
  return olderMessagesTokens(uncompacted) > COMPACTION_TOKEN_THRESHOLD;
}

/**
 * Avalia se a conversa deve ser compactada: por volume de mensagens OU por tamanho em tokens.
 */
export function shouldCompact(conversation: Conversation): boolean {
  if (!conversation.messages || conversation.messages.length === 0) return false;
  return countBasedTrigger(conversation) || sizeBasedTrigger(conversation);
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
  systemPrompts: { repo?: string; base?: string; plan?: string; skills?: string; memories?: string } = {}
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

  const recentStart = Math.max(0, effectiveMessages.length - RECENT_MESSAGES_WINDOW);
  const formatted = effectiveMessages.map((m, index) => ({
    role: m.role,
    // Fora da janela recente: anexos/textos enormes vão encurtados (1º token mais rápido)
    content: renderMessageContent(m, index < recentStart),
    images: m.images,
  }));

  const finalMessages: any[] = [];
  if (systemPrompts.base) finalMessages.push({ role: 'system', content: systemPrompts.base });
  if (systemPrompts.memories) finalMessages.push({ role: 'system', content: systemPrompts.memories });
  if (systemPrompts.skills) finalMessages.push({ role: 'system', content: systemPrompts.skills });
  if (systemPrompts.repo) finalMessages.push({ role: 'system', content: systemPrompts.repo });
  if (systemPrompts.plan) finalMessages.push({ role: 'system', content: systemPrompts.plan });
  if (compactedSummaryPrompt) finalMessages.push(compactedSummaryPrompt);

  return [...finalMessages, ...formatted];
}
