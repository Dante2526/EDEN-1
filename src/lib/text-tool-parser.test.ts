import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTextToolCalls,
  buildTextToolProtocolPrompt,
} from './text-tool-parser';

describe('text-tool-parser (Text-Based Tool & File Edit Extractor)', () => {
  it('extrai <synap_edit path="..." type="..."> preservando conteúdo multilinhas sem exigir JSON escape', () => {
    const raw = [
      'Analisei o componente e apliquei a correção:',
      '<synap_edit path="src/components/Button.tsx" type="modified">',
      'import React from "react";',
      '',
      'export function Button({ label }: { label: string }) {',
      '  return <button className="px-4 py-2">{label}</button>;',
      '}',
      '</synap_edit>',
      'Alteração enviada para revisão.',
    ].join('\n');

    const { toolCalls, cleanedText } = extractTextToolCalls(raw);

    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].name, 'edit_file');
    const parsedArgs = JSON.parse(toolCalls[0].arguments);
    assert.equal(parsedArgs.path, 'src/components/Button.tsx');
    assert.equal(parsedArgs.type, 'modified');
    assert.ok(parsedArgs.content.includes('export function Button'));
    assert.ok(!cleanedText.includes('<synap_edit'));
    assert.ok(cleanedText.includes('Analisei o componente'));
  });

  it('extrai <synap_tool name="..."> com payload JSON para read_file, list_files, search_code ou submit_plan', () => {
    const raw = [
      'Vou ler o package.json e listar a pasta src:',
      '<synap_tool name="read_file">{"path": "package.json"}</synap_tool>',
      '<synap_tool name="list_files">{"path": "src"}</synap_tool>',
    ].join('\n');

    const { toolCalls, cleanedText } = extractTextToolCalls(raw);

    assert.equal(toolCalls.length, 2);
    assert.equal(toolCalls[0].name, 'read_file');
    assert.deepEqual(JSON.parse(toolCalls[0].arguments), { path: 'package.json' });
    assert.equal(toolCalls[1].name, 'list_files');
    assert.deepEqual(JSON.parse(toolCalls[1].arguments), { path: 'src' });
    assert.ok(!cleanedText.includes('<synap_tool'));
  });

  it('extrai bloco de código markdown anotado com path="..." quando usado como fallback de edição', () => {
    const raw = [
      'Aqui está a atualização do arquivo:',
      '```tsx path="src/utils/math.ts"',
      'export const sum = (a: number, b: number) => a + b;',
      '```',
    ].join('\n');

    const { toolCalls } = extractTextToolCalls(raw);

    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].name, 'edit_file');
    const args = JSON.parse(toolCalls[0].arguments);
    assert.equal(args.path, 'src/utils/math.ts');
    assert.equal(args.type, 'modified');
    assert.equal(args.content, 'export const sum = (a: number, b: number) => a + b;');
  });

  it('retorna lista vazia e texto intacto quando não houver tags de ferramenta', () => {
    const raw = 'Esta é apenas uma resposta explicativa normal com ```ts\nconst x = 1;\n```.';
    const { toolCalls, cleanedText } = extractTextToolCalls(raw);

    assert.equal(toolCalls.length, 0);
    assert.equal(cleanedText, raw);
  });

  it('gera prompt de protocolo textual claro com instruções de leitura e edição de repositório', () => {
    const promptWithRepo = buildTextToolProtocolPrompt(true, 'Dante2526/Synap', 'main');
    assert.ok(promptWithRepo.includes('Dante2526/Synap'));
    assert.ok(promptWithRepo.includes('<synap_edit'));
    assert.ok(promptWithRepo.includes('<synap_tool'));

    const promptWithoutRepo = buildTextToolProtocolPrompt(false);
    assert.ok(promptWithoutRepo.includes('<synap_tool'));
    assert.ok(promptWithoutRepo.includes('Nenhum repositório GitHub está selecionado'));
  });

  it('inclui catálogo de ferramentas MCP conectadas no prompt textual quando fornecido', () => {
    const mcpTools = [
      {
        type: 'function',
        function: {
          name: 'mcp__context7__resolve_library_id',
          description: 'Resolve library ID no Context7',
          parameters: {
            type: 'object',
            properties: {
              libraryName: { type: 'string' },
            },
            required: ['libraryName'],
          },
        },
      },
    ];

    const prompt = buildTextToolProtocolPrompt(true, 'Dante2526/Synap', 'main', mcpTools);
    assert.ok(prompt.includes('mcp__context7__resolve_library_id'));
    assert.ok(prompt.includes('Resolve library ID no Context7'));
    assert.ok(prompt.includes('libraryName'));
  });
});

