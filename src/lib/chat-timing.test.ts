import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import handler from '../../api/chat';

const UPSTREAM =
  'data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n' +
  'data: {"choices":[{"delta":{"content":" mundo"},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

function nvidiaResponse(): Response {
  return new Response(UPSTREAM, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function chatRequest(): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] }),
  });
}

describe('api/chat — medição de tempo não altera o stream', () => {
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  const realLog = console.log;
  let logs: string[][] = [];

  before(() => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';
    // só o race de 15s do "modo lento" é acelerado (o de 90s e os demais ficam como estão)
    (globalThis as any).setTimeout = (fn: any, ms?: number, ...rest: any[]) =>
      realSetTimeout(fn, ms === 15000 ? 20 : ms, ...rest);
    console.log = (...args: any[]) => {
      logs.push(args.map(String));
    };
  });

  after(() => {
    globalThis.fetch = realFetch;
    (globalThis as any).setTimeout = realSetTimeout;
    console.log = realLog;
  });

  it('caminho rápido: repassa a resposta idêntica, com Server-Timing e log', async () => {
    logs = [];
    globalThis.fetch = (async () => nvidiaResponse()) as any;
    const res = await handler(chatRequest());
    assert.strictEqual(res.status, 200);
    assert.ok(/^upstream-ready;dur=\d+$/.test(res.headers.get('Server-Timing') || ''));
    assert.ok(Number(res.headers.get('X-Synap-Prompt-Chars')) > 0);
    assert.strictEqual(await res.text(), UPSTREAM, 'o stream tem que passar byte a byte igual');
    const line = logs.find((l) => l[0] === '[chat-timing]');
    assert.ok(line, 'deveria logar [chat-timing]');
    const t = JSON.parse(line![1]);
    assert.strictEqual(t.path, 'fast');
    assert.ok(t.firstChunkMs >= 0 && t.totalMs >= t.firstChunkMs && t.promptChars > 0);
  });

  it('caminho lento (NVIDIA demora): keepalive inicial + resposta idêntica + log', async () => {
    logs = [];
    globalThis.fetch = (async () => {
      await new Promise((r) => realSetTimeout(r, 150));
      return nvidiaResponse();
    }) as any;
    const res = await handler(chatRequest());
    assert.strictEqual(res.status, 200);
    assert.ok(Number(res.headers.get('X-Synap-Prompt-Chars')) > 0);
    const text = await res.text();
    assert.ok(text.startsWith(': keepalive\n\n'), 'primeiro byte é o keepalive');
    assert.ok(text.endsWith(UPSTREAM), 'depois vem a resposta da NVIDIA, sem alteração');
    const line = logs.find((l) => l[0] === '[chat-timing]');
    assert.ok(line, 'deveria logar [chat-timing]');
    const t = JSON.parse(line![1]);
    assert.strictEqual(t.path, 'slow');
    assert.ok(t.headersMs >= 100 && t.firstChunkMs >= t.headersMs);
  });
});
