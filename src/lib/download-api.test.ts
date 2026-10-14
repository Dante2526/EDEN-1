import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import handler from '../../api/download';

type FetchFn = typeof globalThis.fetch;
const realFetch = globalThis.fetch;
const ENV_KEYS = ['COBALT_API_URL', 'COBALT_API_KEY', 'DOWNLOAD_BUDGET_MS', 'DOWNLOAD_REQUEST_TIMEOUT_MS', 'SYNAP_API_SECRET'];

function post(body: unknown): Request {
  return new Request('http://localhost/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// fetch que nunca responde, mas respeita o AbortSignal (como o fetch de verdade)
const hangingFetch: FetchFn = ((_url: any, init: any) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal.reason));
  })) as FetchFn;

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('api/download', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('exporta runtime edge (como as demais funções) e sem maxDuration', async () => {
    const mod = await import('../../api/download');
    assert.deepStrictEqual(mod.config, { runtime: 'edge' });
  });

  it('retorna JSON 400 quando falta a url', async () => {
    const res = await handler(post({}));
    assert.strictEqual(res.status, 400);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    assert.strictEqual((await res.json()).ok, false);
  });

  it('rejeita URLs locais/privadas', async () => {
    const res = await handler(post({ url: 'http://192.168.0.10/video.mp4' }));
    assert.strictEqual(res.status, 400);
    assert.match((await res.json()).error, /privados/);
  });

  it('retorna JSON 400 pra body inválido', async () => {
    const res = await handler(new Request('http://localhost/api/download', { method: 'POST', body: 'não é json' }));
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'Body JSON inválido.');
  });

  it('sucesso (tunnel) na primeira instância', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ status: 'tunnel', url: 'https://api.cobalt.tools/tunnel?id=1', filename: 'video.mp4' })) as FetchFn;
    const res = await handler(post({ url: YT }));
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.url, 'https://api.cobalt.tools/tunnel?id=1');
    assert.strictEqual(data.platform, 'YouTube');
    assert.strictEqual(data.instance, 'api.cobalt.tools');
  });

  it('cascata: pula instância com erro de auth e usa a próxima', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return jsonResponse({ status: 'error', error: { code: 'error.api.auth.jwt.missing' } }, 400);
      return jsonResponse({ status: 'redirect', url: 'https://cdn.example/v.mp4' });
    }) as FetchFn;
    const res = await handler(post({ url: YT }));
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.instance, 'cobalt-api.kwiatekmiki.com');
    assert.strictEqual(calls, 2);
  });

  it('todas exigem auth: 502 em JSON, com o erro real e a dica da instância própria', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ status: 'error', error: { code: 'error.api.auth.jwt.missing' } }, 400)) as FetchFn;
    const res = await handler(post({ url: YT }));
    const data = await res.json();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(data.ok, false);
    assert.match(data.error, /error\.api\.auth\.jwt\.missing/);
    assert.match(data.error, /COBALT_API_URL/);
    assert.strictEqual(data.attempts.length, 5);
  });

  it('resposta HTML (não-JSON) de uma instância não derruba a função', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return new Response('<html>Just a moment...</html>', { status: 403 });
      return jsonResponse({ status: 'tunnel', url: 'https://x.example/t' });
    }) as FetchFn;
    const res = await handler(post({ url: YT }));
    assert.strictEqual((await res.json()).ok, true);
  });

  it('instância própria (COBALT_API_URL) vem primeiro e envia Authorization: Api-Key', async () => {
    process.env.COBALT_API_URL = 'https://meu-cobalt.exemplo.com/';
    process.env.COBALT_API_KEY = 'chave-123';
    const seen: Array<{ url: string; auth?: string }> = [];
    globalThis.fetch = (async (url: any, init: any) => {
      seen.push({ url: String(url), auth: init?.headers?.Authorization });
      return jsonResponse({ status: 'tunnel', url: 'https://meu-cobalt.exemplo.com/tunnel?id=9' });
    }) as FetchFn;
    const data = await (await handler(post({ url: YT }))).json();
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].url, 'https://meu-cobalt.exemplo.com');
    assert.strictEqual(seen[0].auth, 'Api-Key chave-123');
    assert.strictEqual(data.instance, 'meu-cobalt.exemplo.com');
  });

  it('audioOnly vira downloadMode "audio" no pedido ao cobalt', async () => {
    let sent: any;
    globalThis.fetch = (async (_u: any, init: any) => {
      sent = JSON.parse(init.body);
      return jsonResponse({ status: 'tunnel', url: 'https://x.example/a.mp3' });
    }) as FetchFn;
    await handler(post({ url: YT, audioOnly: true }));
    assert.strictEqual(sent.downloadMode, 'audio');
    assert.strictEqual(sent.filenameStyle, 'basic');
    assert.strictEqual(sent.url, YT);
  });

  it('erro inesperado (fetch lançando) continua virando JSON', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as FetchFn;
    const res = await handler(post({ url: YT }));
    assert.strictEqual(res.status, 502);
    assert.match((await res.json()).error, /fetch failed/);
  });

  it('instâncias que nunca respondem: responde JSON dentro do orçamento (não estoura os ~25s da Edge)', async () => {
    process.env.DOWNLOAD_BUDGET_MS = '3000';
    process.env.DOWNLOAD_REQUEST_TIMEOUT_MS = '1000';
    globalThis.fetch = hangingFetch;
    // No Node o timer do AbortSignal.timeout não segura o processo vivo; num servidor real há outras coisas rodando.
    const keepAlive = setInterval(() => {}, 100);
    const started = Date.now();
    let res: Response;
    try {
      res = await handler(post({ url: YT }));
    } finally {
      clearInterval(keepAlive);
    }
    const elapsed = Date.now() - started;
    const data = await res.json();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(data.ok, false);
    assert.match(data.error, /tempo esgotado|não respondeu a tempo/);
    assert.ok(elapsed < 5000, `demorou ${elapsed}ms`);
  });
});
