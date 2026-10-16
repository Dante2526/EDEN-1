import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  calculateBoundingBox,
  describeRegion,
  buildRegionEditPrompt,
  hasActiveMask,
  type Point,
} from './image-mask-helper.js';

describe('Image Mask Helper (Retoque Visual)', () => {
  test('hasActiveMask deve detectar se há traços desenhados', () => {
    assert.strictEqual(hasActiveMask([]), false);
    assert.strictEqual(hasActiveMask([{ x: 10, y: 10 }]), true);
  });

  test('calculateBoundingBox deve calcular coordenadas normalizadas e porcentagens', () => {
    const points: Point[] = [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ];
    const box = calculateBoundingBox(points, 400, 400);
    assert.strictEqual(box.minX, 100);
    assert.strictEqual(box.minY, 100);
    assert.strictEqual(box.maxX, 300);
    assert.strictEqual(box.maxY, 200);
    assert.strictEqual(box.widthPercent, 50); // (300-100)/400 = 50%
    assert.strictEqual(box.heightPercent, 25); // (200-100)/400 = 25%
  });

  test('describeRegion deve identificar a localização na imagem em linguagem natural', () => {
    // Top-left
    const boxTL = {
      minX: 10,
      minY: 10,
      maxX: 50,
      maxY: 50,
      widthPercent: 20,
      heightPercent: 20,
      centerXPercent: 15,
      centerYPercent: 15,
    };
    assert.strictEqual(describeRegion(boxTL), 'no canto superior esquerdo');

    // Center
    const boxCenter = {
      minX: 150,
      minY: 150,
      maxX: 250,
      maxY: 250,
      widthPercent: 25,
      heightPercent: 25,
      centerXPercent: 50,
      centerYPercent: 50,
    };
    assert.strictEqual(describeRegion(boxCenter), 'no centro da imagem');

    // Bottom-right
    const boxBR = {
      minX: 300,
      minY: 300,
      maxX: 390,
      maxY: 390,
      widthPercent: 22,
      heightPercent: 22,
      centerXPercent: 86,
      centerYPercent: 86,
    };
    assert.strictEqual(describeRegion(boxBR), 'no canto inferior direito');
  });

  test('buildRegionEditPrompt deve enriquecer a instrução com a localização precisa', () => {
    const box = {
      minX: 100,
      minY: 100,
      maxX: 300,
      maxY: 300,
      widthPercent: 50,
      heightPercent: 50,
      centerXPercent: 50,
      centerYPercent: 50,
    };
    const prompt = buildRegionEditPrompt('mude a cor para vermelho', box);
    assert.ok(prompt.includes('mude a cor para vermelho'));
    assert.ok(prompt.includes('no centro da imagem'));
    assert.ok(prompt.includes('50%'));
  });

  test('buildRegionEditPrompt deve retornar o prompt original se não houver bounding box', () => {
    const prompt = buildRegionEditPrompt('clareie a foto', null);
    assert.strictEqual(prompt, 'clareie a foto');
  });
});
