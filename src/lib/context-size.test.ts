import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  COMPACTION_TOKEN_THRESHOLD,
  OLD_DOCUMENT_MAX_CHARS,
  OLD_MESSAGE_MAX_CHARS,
  RECENT_MESSAGES_WINDOW,
  estimateTokens,
  trimMiddle,
  shouldCompact,
  prepareMessagesForApi,
} from './context-compactor';
import type { Conversation, Message } from './types';

function msg(id: string, role: 'user' | 'assistant', content: string, docChars = 0): Message {
  return {
    id,
    role,
    content,
    createdAt: 0,
    documents: docChars
      ? [{ id: `d-${id}`, name: `${id}.ts`, size: docChars, type: 'text/plain', content: 'x'.repeat(docChars) }]
      : undefined,
  };
}

function conv(messages: Message[], compactedUpTo?: string): Conversation {
  return {
    id: 'c',
    title: 't',
    createdAt: 0,
    updatedAt: 0,
    model: 'z-ai/glm-5.3',
    reasoningEffort: 'low',
    messages,
    contextCompaction: compactedUpTo
      ? { summary: 'resumo', compactedUpToMessageId: compactedUpTo, timestamp: 0, originalMessageCount: 1 }
      : undefined,
  } as Conversation;
}

describe('trimMiddle / estimateTokens', () => {
  it('não mexe em texto curto', () => {
    assert.strictEqual(trimMiddle('abc', 10, 'x'), 'abc');
  });

  it('mantém começo e fim e avisa quanto foi omitido', () => {
    const text = 'A'.repeat(1000) + 'B'.repeat(1000);
    const out = trimMiddle(text, 100, 'teste');
    assert.ok(out.startsWith('A'.repeat(65)));
    assert.ok(out.endsWith('B'.repeat(35)));
    assert.ok(out.includes('1900 caracteres omitidos (teste)'));
    assert.ok(out.length < 250);
  });

  it('estima ~4 caracteres por token', () => {
    assert.strictEqual(estimateTokens('a'.repeat(400)), 100);
    assert.strictEqual(estimateTokens(''), 0);
  });
});

describe('prepareMessagesForApi — encurta só o que é antigo', () => {
  const big = 50_000;
  const messages = [
    msg('m0', 'user', 'olha esse arquivo', big), // antiga, com anexo enorme
    msg('m1', 'assistant', 'Z'.repeat(40_000)), // antiga, resposta enorme
    ...Array.from({ length: RECENT_MESSAGES_WINDOW - 1 }, (_, i) => msg(`r${i}`, i % 2 ? 'assistant' : 'user', `recente ${i}`)),
    msg('last', 'user', 'pergunta final', big), // recente, com anexo enorme: NÃO pode ser cortada
  ];
  const out = prepareMessagesForApi(conv(messages), { base: 'sys' });
  const body = out.slice(1); // sem o system

  it('mantém a quantidade e a ordem das mensagens', () => {
    assert.strictEqual(body.length, messages.length);
    assert.deepStrictEqual(body.map((m: any) => m.role), messages.map((m) => m.role));
  });

  it('encurta anexo e texto antigos', () => {
    assert.ok(body[0].content.length < OLD_DOCUMENT_MAX_CHARS + 1000, `anexo antigo: ${body[0].content.length}`);
    assert.ok(body[0].content.includes('anexo antigo'));
    assert.ok(body[1].content.length < OLD_MESSAGE_MAX_CHARS + 500);
    assert.ok(body[1].content.includes('mensagem antiga'));
  });

  it('NÃO encurta as mensagens recentes (nem a última do usuário)', () => {
    const last = body[body.length - 1].content;
    assert.ok(last.length > big, 'anexo da última mensagem tem que ir inteiro');
    assert.ok(!last.includes('omitidos'));
  });
});

describe('shouldCompact — gatilho por tamanho', () => {
  it('poucas mensagens, mas enormes, compactam (antes não compactava)', () => {
    // 12 mensagens (<= 16): pelo critério antigo nunca compactaria
    const big = Array.from({ length: 12 }, (_, i) =>
      msg(`m${i}`, i % 2 ? 'assistant' : 'user', 'Y'.repeat(OLD_MESSAGE_MAX_CHARS), OLD_DOCUMENT_MAX_CHARS * 2),
    );
    assert.strictEqual(shouldCompact(conv(big)), true);
  });

  it('mensagens pequenas não disparam', () => {
    const small = Array.from({ length: 12 }, (_, i) => msg(`m${i}`, i % 2 ? 'assistant' : 'user', 'oi'));
    assert.strictEqual(shouldCompact(conv(small)), false);
  });

  it('só a janela recente grande não dispara (e não recompacta a cada turno)', () => {
    const msgs = Array.from({ length: 12 }, (_, i) => msg(`m${i}`, i % 2 ? 'assistant' : 'user', 'oi'));
    // as 6 últimas são enormes, mas já estão na janela recente
    for (let i = 6; i < 12; i++) msgs[i] = msg(`m${i}`, i % 2 ? 'assistant' : 'user', 'Y'.repeat(200_000));
    assert.strictEqual(shouldCompact(conv(msgs)), false);
    // depois de compactar até m5, restam só as 6 recentes
    assert.strictEqual(shouldCompact(conv(msgs, 'm5')), false);
  });

  it('o limite é em tokens estimados das mensagens fora da janela', () => {
    const chars = (COMPACTION_TOKEN_THRESHOLD + 1) * 4;
    const msgs = [
      msg('m0', 'user', 'A'.repeat(Math.min(chars, OLD_MESSAGE_MAX_CHARS))),
      ...Array.from({ length: RECENT_MESSAGES_WINDOW }, (_, i) => msg(`r${i}`, 'user', 'oi')),
    ];
    // uma única mensagem antiga só chega a OLD_MESSAGE_MAX_CHARS (3k tokens): abaixo do limite
    assert.strictEqual(shouldCompact(conv(msgs)), false);
  });
});
