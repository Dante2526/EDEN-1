import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInpaintPayload,
  getCanvasCoordinates,
  buildInpaintNvidiaPayload,
  buildInpaintCloudflarePayload,
  extractRawBase64,
  normalizeInpaintModel,
  base64ToUint8Array,
  formatInpaintPrompt,
} from './image-inpaint';
import inpaintHandler from '../../api/inpaint';

describe('image-inpaint (Motor Lógico de Inpainting com Máscara)', () => {
  it('deve validar payload e rejeitar prompt vazio ou apenas espaços', () => {
    const res = validateInpaintPayload({
      image: 'data:image/png;base64,AAAA',
      mask: 'data:image/png;base64,BBBB',
      prompt: '   ',
    });
    assert.equal(res.valid, false);
    assert.match(res.error || '', /prompt/i);
  });

  it('deve rejeitar payload sem imagem original', () => {
    const res = validateInpaintPayload({
      image: '',
      mask: 'data:image/png;base64,BBBB',
      prompt: 'troque por um escaravelho',
    });
    assert.equal(res.valid, false);
    assert.match(res.error || '', /imagem/i);
  });

  it('deve rejeitar payload sem máscara de pintura', () => {
    const res = validateInpaintPayload({
      image: 'data:image/png;base64,AAAA',
      mask: '',
      prompt: 'troque por um escaravelho',
    });
    assert.equal(res.valid, false);
    assert.match(res.error || '', /máscara/i);
  });

  it('deve aceitar payload válido e limpar o prompt', () => {
    const res = validateInpaintPayload({
      image: 'data:image/png;base64,AAAA',
      mask: 'data:image/png;base64,BBBB',
      prompt: '  mude a cor para dourado metálico  ',
    });
    assert.equal(res.valid, true);
    assert.equal(res.cleanPrompt, 'mude a cor para dourado metálico');
  });

  it('deve extrair base64 puro removendo cabeçalhos data:image', () => {
    const raw = 'iVBORw0KGgoAAAANSUhEUgAA';
    const withHeader = `data:image/png;base64,${raw}`;
    assert.equal(extractRawBase64(withHeader), raw);
    assert.equal(extractRawBase64(raw), raw);
  });

  it('deve calcular coordenadas de toque com escala correta de canvas (resolução interna vs tela)', () => {
    // Simula um canvas com largura interna de 1000px exibido em tela de 400px (fator 2.5x)
    const rect = {
      left: 20,
      top: 50,
      width: 400,
      height: 400,
    };
    const clientX = 120; // 100px à direita do início
    const clientY = 150; // 100px abaixo do início

    const coords = getCanvasCoordinates(clientX, clientY, rect, 1000, 1000);
    assert.equal(coords.x, 250); // 100 * (1000 / 400) = 250
    assert.equal(coords.y, 250);
  });

  it('deve limitar coordenadas dentro dos limites do canvas (clamp)', () => {
    const rect = { left: 0, top: 0, width: 400, height: 400 };
    const coordsNegative = getCanvasCoordinates(-50, -20, rect, 800, 800);
    assert.equal(coordsNegative.x, 0);
    assert.equal(coordsNegative.y, 0);

    const coordsOver = getCanvasCoordinates(500, 600, rect, 800, 800);
    assert.equal(coordsOver.x, 800);
    assert.equal(coordsOver.y, 800);
  });

  it('deve montar payload padronizado para a API da NVIDIA NIM', () => {
    const payload = buildInpaintNvidiaPayload({
      image: 'data:image/png;base64,AAAA',
      mask: 'data:image/png;base64,BBBB',
      prompt: 'escaravelho dourado',
      seed: 42,
    });
    assert.match(payload.prompt, /gold/i);
    assert.equal(payload.seed, 42);
    assert.ok(payload.image);
    assert.ok(payload.mask);
  });

  it('deve montar payload padronizado para Cloudflare Workers AI inpainting', () => {
    const payload = buildInpaintCloudflarePayload({
      image: 'data:image/png;base64,AAAA',
      mask: 'data:image/png;base64,BBBB',
      prompt: 'escaravelho dourado',
    });
    assert.match(payload.prompt, /gold/i);
    assert.equal(payload.image_b64, 'AAAA');
    assert.equal(payload.mask_b64, 'BBBB');
    assert.equal(payload.num_steps, 20);
    assert.equal(Array.isArray((payload as any).mask), true);
  });

  it('deve normalizar chaves de modelo de inpaint', () => {
    assert.equal(normalizeInpaintModel('flux'), 'flux-kontext');
    assert.equal(normalizeInpaintModel('sd'), 'sd-inpaint');
    assert.equal(normalizeInpaintModel(), 'flux-kontext');
  });

  it('deve rejeitar métodos HTTP diferentes de POST com status 405', async () => {
    const req = new Request('http://localhost/api/inpaint', { method: 'GET' });
    const res = await inpaintHandler(req, {} as any);
    assert.equal(res.status, 405);
    const data: any = await res.json();
    assert.match(data.error, /POST/i);
  });

  it('deve converter base64 para Uint8Array usando atob ou Buffer de forma multiplataforma', () => {
    // "AQIDBA==" representa os bytes [1, 2, 3, 4]
    const b64 = 'AQIDBA==';
    const bytes = base64ToUint8Array(b64);
    assert.equal(bytes.length, 4);
    assert.deepEqual(Array.from(bytes), [1, 2, 3, 4]);

    const withPrefix = `data:image/png;base64,${b64}`;
    const bytesPrefix = base64ToUint8Array(withPrefix);
    assert.deepEqual(Array.from(bytesPrefix), [1, 2, 3, 4]);
  });

  it('deve formatar comandos de prompt de inpaint em português para inglês descritivo de difusão', () => {
    // Caso 1: Grama/musgo para azul
    const p1 = formatInpaintPrompt('MUDA O VERDE DA GRAMA PARAA ZUL');
    assert.match(p1, /blue/i);
    assert.match(p1, /grass|moss/i);

    // Caso 2: Muda para azul direto
    const p2 = formatInpaintPrompt('MUDA PARA AZUL');
    assert.match(p2, /blue/i);

    // Caso 3: Comando de remoção
    const p3 = formatInpaintPrompt('remover objeto da foto');
    assert.match(p3, /clean|seamless|background/i);

    // Caso 4: Prompt já descritivo em inglês
    const p4 = formatInpaintPrompt('a glowing iridescent scarab beetle, 8k');
    assert.match(p4, /glowing iridescent scarab beetle/i);

    // Caso 5: Inversão de cor ("mude o azul para verde")
    const p5 = formatInpaintPrompt('mude o azul para verde');
    assert.match(p5, /green|moss|grass/i);
  });

  it('deve garantir que o payload Cloudflare contenha mask e image como number[] válidos', () => {
    const payload = buildInpaintCloudflarePayload({
      image: 'data:image/png;base64,AQIDBA==',
      mask: 'data:image/png;base64,AQIDBA==',
      prompt: 'muda para azul',
    });
    assert.ok(Array.isArray(payload.mask));
    assert.equal(payload.mask.length, 4);
    assert.deepEqual(payload.mask, [1, 2, 3, 4]);
    assert.ok(Array.isArray(payload.image));
    assert.equal(payload.image?.length, 4);
    assert.match(payload.prompt, /blue/i);
  });
});
