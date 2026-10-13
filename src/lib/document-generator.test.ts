import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeFilename, normalizeDocumentSpec, DocumentSpec } from './document-generator';

describe('Document Generator Helpers', () => {
  it('deve sanitizar nomes de arquivos inválidos e garantir extensão correta', () => {
    assert.strictEqual(sanitizeFilename('meu*relatorio?.pdf', 'pdf'), 'meu_relatorio_.pdf');
    assert.strictEqual(sanitizeFilename('planilha_vendas', 'excel'), 'planilha_vendas.xlsx');
    assert.strictEqual(sanitizeFilename('contrato', 'docx'), 'contrato.docx');
    assert.strictEqual(sanitizeFilename('apresentacao', 'pptx'), 'apresentacao.pptx');
  });

  it('deve normalizar especificação de documento garantindo valores padrão', () => {
    const raw: DocumentSpec = {
      type: 'excel',
      filename: 'vendas',
      title: 'Vendas 2026',
      content: {
        sheets: [{ name: 'Resumo', headers: ['Mês', 'Valor'], rows: [['Jan', 1000]] }],
      },
    };
    const normalized = normalizeDocumentSpec(raw);
    assert.strictEqual(normalized.filename, 'vendas.xlsx');
    assert.strictEqual(normalized.title, 'Vendas 2026');
    assert.strictEqual(normalized.type, 'excel');
  });
});
