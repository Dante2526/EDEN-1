import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInpaintPayload,
  getCanvasCoordinates,
  buildInpaintNvidiaPayload,
  buildInpaintCloudflarePayload,
  extractRawBase64,
  normalizeInpaintModel,
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
    assert.equal(payload.prompt, 'escaravelho dourado');
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
    assert.equal(payload.prompt, 'escaravelho dourado');
    assert.equal(payload.image_b64, 'AAAA');
    assert.equal(payload.mask_b64, 'BBBB');
    assert.equal(payload.num_steps, 20);
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

  it('deve rejeitar payload com prompt ausente com status 400', async () => {
    const req = new Request('http://localhost/api/inpaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/png;base64,AAAA', mask: 'data:image/png;base64,BBBB', prompt: '' }),
    });
    const res = await inpaintHandler(req, {} as any);
    assert.equal(res.status, 400);
    const data: any = await res.json();
    assert.match(data.error, /prompt/i);
  });
});
