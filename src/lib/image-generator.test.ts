import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import imageHandler, {
  resolveDimensions,
  normalizeModelKey,
  buildNvidiaPayload,
  arrayBufferToBase64,
} from '../../api/image.js';

describe('Motor de Geração de Imagens FLUX (NVIDIA NIM & Fallbacks)', () => {
  it('deve resolver corretamente dimensões e proporções de tela', () => {
    assert.deepEqual(resolveDimensions('1:1'), { width: 1024, height: 1024, cfSize: '1024x1024' });
    assert.deepEqual(resolveDimensions('16:9'), { width: 1344, height: 768, cfSize: '1024x576' });
    assert.deepEqual(resolveDimensions('9:16'), { width: 768, height: 1344, cfSize: '576x1024' });
    assert.deepEqual(resolveDimensions('4:3'), { width: 1024, height: 768, cfSize: '800x600' });
    assert.deepEqual(resolveDimensions('3:4'), { width: 768, height: 1024, cfSize: '600x800' });
    assert.deepEqual(resolveDimensions(''), { width: 1024, height: 1024, cfSize: '1024x1024' });
    assert.deepEqual(resolveDimensions(undefined), { width: 1024, height: 1024, cfSize: '1024x1024' });
  });

  it('deve normalizar chaves e variações de nomes dos modelos FLUX', () => {
    assert.equal(normalizeModelKey('flux-1-schnell'), 'flux-1-schnell');
    assert.equal(normalizeModelKey('flux.1-schnell'), 'flux-1-schnell');
    assert.equal(normalizeModelKey('black-forest-labs/flux.1-schnell'), 'flux-1-schnell');

    assert.equal(normalizeModelKey('flux-1-dev'), 'flux-1-dev');
    assert.equal(normalizeModelKey('flux.1-dev'), 'flux-1-dev');
    assert.equal(normalizeModelKey('black-forest-labs/flux.1-dev'), 'flux-1-dev');
    assert.equal(normalizeModelKey(''), 'flux-1-dev');
    assert.equal(normalizeModelKey(undefined), 'flux-1-dev');
  });

  it('deve montar o payload correto para a API da NVIDIA NIM', () => {
    const dims = { width: 1024, height: 1024 };

    // FLUX Schnell: 4 steps, cfg_scale 0
    const schnellPayload = buildNvidiaPayload('um gato neon', 'flux-1-schnell', dims, 12345);
    assert.equal(schnellPayload.prompt, 'um gato neon');
    assert.equal(schnellPayload.mode, 'base');
    assert.equal(schnellPayload.width, 1024);
    assert.equal(schnellPayload.height, 1024);
    assert.equal(schnellPayload.steps, 4);
    assert.equal(schnellPayload.cfg_scale, 0.0);
    assert.equal(schnellPayload.seed, 12345);

    // FLUX Dev: 25 steps, cfg_scale 3.5
    const devPayload = buildNvidiaPayload('paisagem cinematográfica', 'flux-1-dev', dims, 99999);
    assert.equal(devPayload.prompt, 'paisagem cinematográfica');
    assert.equal(devPayload.steps, 25);
    assert.equal(devPayload.cfg_scale, 3.5);
  });

  it('deve converter ArrayBuffer volumoso (>150KB) para Base64 sem RangeError de call stack', () => {
    // 200KB buffer (excede os ~125k argumentos de função no V8)
    const largeBuffer = new Uint8Array(200 * 1024);
    for (let i = 0; i < largeBuffer.length; i++) {
      largeBuffer[i] = i % 256;
    }
    const b64 = arrayBufferToBase64(largeBuffer.buffer);
    assert.ok(b64.length > 200 * 1024);
  });

  it('deve rejeitar requisição sem prompt com HTTP 400', async () => {
    const req = new Request('http://localhost:3000/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });

    const res = await imageHandler(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Prompt não fornecido/);
  });

  it('deve gerar imagem via NVIDIA NIM com sucesso quando NVIDIA_API_KEY estiver presente', async () => {
    const originalFetch = globalThis.fetch;
    const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    let capturedUrl = '';
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    try {
      globalThis.fetch = (async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers;
        capturedBody = JSON.parse(init?.body);

        return new Response(
          JSON.stringify({
            artifacts: [{ base64: fakeBase64, finishReason: 'SUCCESS', seed: 42 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as any;

      const req = new Request('http://localhost:3000/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'futuristic spaceship',
          aspect_ratio: '16:9',
          model: 'flux-1-dev',
        }),
      });

      const env = { NVIDIA_API_KEY: 'nvapi-valid-test-key-12345' };
      const res = await imageHandler(req, env);

      assert.equal(res.status, 200);
      assert.equal(capturedUrl, 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev');
      assert.equal(capturedHeaders['Authorization'], 'Bearer nvapi-valid-test-key-12345');
      assert.equal(capturedBody.width, 1344);
      assert.equal(capturedBody.height, 768);

      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.provider, 'NVIDIA NIM (Black Forest Labs)');
      assert.equal(data.is_data_url, true);
      assert.match(data.url, /^data:image\/jpeg;base64,/);
      assert.match(data.markdown, /!\[futuristic spaceship\]\(data:image\/jpeg;base64,/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve usar fallback da Cloudflare Workers AI quando NVIDIA falhar mas credenciais CF existirem', async () => {
    const originalFetch = globalThis.fetch;
    const fakeImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes

    try {
      globalThis.fetch = (async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('api.nvidia.com')) {
          // NVIDIA NIM falha com erro 500
          return new Response(JSON.stringify({ error: 'NVIDIA server error' }), { status: 500 });
        }
        if (urlStr.includes('api.cloudflare.com')) {
          // Cloudflare responde com imagem binária
          return new Response(fakeImageBytes, {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          });
        }
        return new Response(null, { status: 404 });
      }) as any;

      const req = new Request('http://localhost:3000/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'glowing mushroom forest',
          aspect_ratio: '1:1',
        }),
      });

      const env = {
        NVIDIA_API_KEY: 'nvapi-key',
        CLOUDFLARE_ACCOUNT_ID: 'cf-acc-123',
        CLOUDFLARE_API_TOKEN: 'cf-token-456',
      };
      const res = await imageHandler(req, env);

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.provider, 'Cloudflare Workers AI');
      assert.equal(data.is_data_url, true);
      assert.match(data.url, /^data:image\/png;base64,/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve acionar fallback resiliente do Pollinations FLUX truncando prompts longos para evitar HTTP 414', async () => {
    const veryLongPrompt = 'a'.repeat(1200);
    const req = new Request('http://localhost:3000/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: veryLongPrompt,
        aspect_ratio: '1:1',
      }),
    });

    const env = { NVIDIA_API_KEY: undefined, CLOUDFLARE_API_TOKEN: undefined };
    const res = await imageHandler(req, env);

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.success, true);
    assert.equal(data.provider, 'FLUX (Pollinations Fallback)');
    assert.equal(data.is_data_url, false);
    // Verifica que o prompt na URL foi truncado em até 800 caracteres
    const urlPromptPart = data.url.split('/prompt/')[1].split('?')[0];
    assert.ok(decodeURIComponent(urlPromptPart).length <= 800);
  });
});
