import { describe, it } from 'node:test';
import assert from 'node:assert';
import { box2dToPercent, snapBBoxToPixels, computeBBoxResize, RawBBox } from './image-bbox-snapper';

describe('image-bbox-snapper (Enquadramento Preciso de Elementos)', () => {
  it('converte box_2d [ymin, xmin, ymax, xmax] (0-1000) em porcentagens exatas { x, y, width, height }', () => {
    // Exemplo: objeto de 200 a 800 em X (width 60%, center X 50%), de 100 a 500 em Y (height 40%, center Y 30%)
    const box2d: [number, number, number, number] = [100, 200, 500, 800];
    const converted = box2dToPercent(box2d);

    assert.strictEqual(converted.x, 50);
    assert.strictEqual(converted.y, 30);
    assert.strictEqual(converted.width, 60);
    assert.strictEqual(converted.height, 40);
  });

  it('ajusta e imanta (snap) uma caixa delimitadora frouxa aos pixels reais do elemento', () => {
    // Cria imagem 100x100 branca com um quadrado preto (foreground) exatamente em x: 30..70 (w=40), y: 20..60 (h=40)
    const W = 100;
    const H = 100;
    const pixels = new Uint8ClampedArray(W * H * 4);

    // Preenche tudo com branco (255, 255, 255, 255)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
    }

    // Desenha o objeto preto em X: 30..69, Y: 20..59
    for (let y = 20; y < 60; y++) {
      for (let x = 30; x < 70; x++) {
        const idx = (y * W + x) * 4;
        pixels[idx] = 0;     // R
        pixels[idx + 1] = 0; // G
        pixels[idx + 2] = 0; // B
        pixels[idx + 3] = 255;
      }
    }

    // Suponha que o VLM tenha estimado de forma imprecisa:
    // Centro em (48, 45) com w=50, h=50 (frouxa e deslocada)
    const looseBBox: RawBBox = {
      x: 48,
      y: 45,
      width: 50,
      height: 50,
    };

    const snapped = snapBBoxToPixels(pixels, W, H, looseBBox);

    // O objeto real está exatamente em:
    // X de 30 a 70 -> width=40%, center X = 50%
    // Y de 20 a 60 -> height=40%, center Y = 40%
    assert.strictEqual(snapped.width, 40);
    assert.strictEqual(snapped.height, 40);
    assert.strictEqual(snapped.x, 50);
    assert.strictEqual(snapped.y, 40);
  });

  it('respeita padPixels quando uma folga configurável é solicitada', () => {
    const W = 100;
    const H = 100;
    const pixels = new Uint8ClampedArray(W * H * 4);
    pixels.fill(255);
    for (let y = 20; y < 60; y++) {
      for (let x = 30; x < 70; x++) {
        const idx = (y * W + x) * 4;
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 255;
      }
    }
    const loose: RawBBox = { x: 50, y: 40, width: 60, height: 60 };
    const snapped = snapBBoxToPixels(pixels, W, H, loose, { padPixels: 2 });
    assert.strictEqual(snapped.width, 44);
    assert.strictEqual(snapped.height, 44);
  });

  describe('computeBBoxResize (Ajuste e manipulação manual)', () => {
    const box: RawBBox = { x: 50, y: 50, width: 40, height: 40 };

    it('move a caixa inteira preservando dimensões', () => {
      const moved = computeBBoxResize(box, 'move', 5, -10);
      assert.strictEqual(moved.x, 55);
      assert.strictEqual(moved.y, 40);
      assert.strictEqual(moved.width, 40);
      assert.strictEqual(moved.height, 40);
    });

    it('redimensiona a partir do canto sudeste (se)', () => {
      const resized = computeBBoxResize(box, 'se', 10, 10);
      assert.strictEqual(resized.x, 55);
      assert.strictEqual(resized.y, 55);
      assert.strictEqual(resized.width, 50);
      assert.strictEqual(resized.height, 50);
    });

    it('redimensiona a partir do canto noroeste (nw)', () => {
      const resized = computeBBoxResize(box, 'nw', -5, -5);
      assert.strictEqual(resized.x, 47.5);
      assert.strictEqual(resized.y, 47.5);
      assert.strictEqual(resized.width, 45);
      assert.strictEqual(resized.height, 45);
    });

    it('impede redimensionamento menor que minSizePct', () => {
      const collapsed = computeBBoxResize(box, 'e', -50, 0, 2);
      assert.ok(collapsed.width >= 2);
    });
  });

  it('mantém o box original com segurança se nenhum pixel foreground for detectado (fallback)', () => {
    // Imagem 50x50 totalmente uniforme (sem elemento)
    const W = 50;
    const H = 50;
    const pixels = new Uint8ClampedArray(W * H * 4);
    pixels.fill(200);

    const initial: RawBBox = { x: 50, y: 50, width: 30, height: 30 };
    const snapped = snapBBoxToPixels(pixels, W, H, initial);

    // Deve retornar o original intacto
    assert.deepStrictEqual(snapped, initial);
  });

  it('ignora ruído isolado de 1-2 pixels e preserva estabilidade', () => {
    const W = 50;
    const H = 50;
    const pixels = new Uint8ClampedArray(W * H * 4);
    pixels.fill(255);

    // Apenas 2 pixels pretos de sujeira/ruído
    pixels[100] = 0;
    pixels[101] = 0;
    pixels[102] = 0;
    pixels[104] = 0;

    const initial: RawBBox = { x: 25, y: 25, width: 20, height: 20 };
    const snapped = snapBBoxToPixels(pixels, W, H, initial, { minForegroundPixels: 10 });

    assert.deepStrictEqual(snapped, initial);
  });
});
