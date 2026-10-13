import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractCleanContent } from './html-extractor';

describe('extractCleanContent', () => {
  it('deve extrair o título e limpar tags script, style, nav e footer', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>React 19 - Documentação</title>
          <style>.hide { display: none; }</style>
        </head>
        <body>
          <nav><a href="/">Home</a><a href="/docs">Docs</a></nav>
          <main>
            <h1>Novidades do React 19</h1>
            <p>O hook use() simplifica o consumo de Promises e Context.</p>
          </main>
          <script>console.log("tracking");</script>
          <footer>Copyright 2026</footer>
        </body>
      </html>
    `;

    const result = extractCleanContent(rawHtml);
    assert.strictEqual(result.title, 'React 19 - Documentação');
    assert.ok(result.content.includes('Novidades do React 19'));
    assert.ok(result.content.includes('O hook use() simplifica'));
    assert.ok(!result.content.includes('console.log'));
    assert.ok(!result.content.includes('Home'));
    assert.ok(!result.content.includes('Copyright 2026'));
  });

  it('deve truncar quando o texto ultrapassar o limite configurado', () => {
    const longHtml = `<html><body><article><p>${'A'.repeat(500)}</p></article></body></html>`;
    const result = extractCleanContent(longHtml, 100);
    assert.strictEqual(result.truncated, true);
    assert.ok(result.content.includes('[... Conteúdo truncado para otimização de contexto ...]'));
  });
});
