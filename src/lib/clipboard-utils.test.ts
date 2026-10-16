import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractImagesFromClipboardData } from './clipboard-utils';

describe('Clipboard Utils (Direct Screenshot & Image Paste)', () => {
  it('deve retornar array vazio se clipboardData for nulo ou indefinido', () => {
    assert.deepStrictEqual(extractImagesFromClipboardData(null), []);
    assert.deepStrictEqual(extractImagesFromClipboardData(undefined), []);
  });

  it('deve extrair imagem de clipboardData.items quando o usuário cola um print (Ctrl+V)', () => {
    const dummyBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
    const dummyFile = new File([dummyBlob], 'image.png', { type: 'image/png' });

    const mockClipboard = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => dummyFile,
        },
        {
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        },
      ],
    };

    const result = extractImagesFromClipboardData(mockClipboard);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'image/png');
    assert.match(result[0].name, /^print-\d+-1\.png$/);
  });

  it('deve ignorar itens que não sejam imagens (ex: texto puro)', () => {
    const mockClipboard = {
      items: [
        {
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        },
        {
          kind: 'string',
          type: 'text/html',
          getAsFile: () => null,
        },
      ],
    };

    const result = extractImagesFromClipboardData(mockClipboard);
    assert.strictEqual(result.length, 0);
  });

  it('deve extrair imagens de clipboardData.files como fallback', () => {
    const dummyBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    const dummyFile = new File([dummyBlob], 'screenshot.jpeg', { type: 'image/jpeg' });

    const mockClipboard = {
      items: [],
      files: [dummyFile],
    };

    const result = extractImagesFromClipboardData(mockClipboard);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].type, 'image/jpeg');
  });
});
