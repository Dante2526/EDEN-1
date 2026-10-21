import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isDynamicChunkError } from './lazy-retry';

describe('Lazy Retry & Dynamic Chunk Resilience', () => {
  it('identifica erro padrão de chunk dinâmico do navegador/Vite', () => {
    const err = new TypeError('Failed to fetch dynamically imported module: https://synap-8yq.pages.dev/assets/project-workspace-B6OIUaNP.js');
    assert.strictEqual(isDynamicChunkError(err), true);
  });

  it('identifica variações de erro de importação de script', () => {
    assert.strictEqual(
      isDynamicChunkError(new Error('error loading dynamically imported module: foo.js')),
      true
    );
    assert.strictEqual(
      isDynamicChunkError(new Error('Importing a module script failed.')),
      true
    );
    assert.strictEqual(
      isDynamicChunkError('Failed to fetch dynamically imported module'),
      true
    );
  });

  it('não confunde erros comuns de aplicação com erros de chunk dinâmico', () => {
    assert.strictEqual(isDynamicChunkError(new Error('Cannot read properties of undefined')), false);
    assert.strictEqual(isDynamicChunkError(new Error('Network request failed')), false);
    assert.strictEqual(isDynamicChunkError(null), false);
    assert.strictEqual(isDynamicChunkError(undefined), false);
  });
});
