import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildGraphFromFiles,
  findShortestPath,
  findGodNodes,
  queryGraphContext,
  parseGraphJson,
} from './graphify-engine';

describe('Graphify Engine (GraphRAG)', () => {
  const sampleFiles = [
    {
      path: 'src/App.tsx',
      content: `
        import React from 'react';
        import { ChatMessage } from './components/chat-message';
        import { ChatHeader } from './components/chat-header';
        import { storage } from './lib/storage';
        export function App() { return <div>App</div>; }
      `,
    },
    {
      path: 'src/components/chat-message.tsx',
      content: `
        import React from 'react';
        import { formatFileSize } from '../lib/utils';
        import { Message } from '../lib/types';
        export const ChatMessage = () => null;
      `,
    },
    {
      path: 'src/components/chat-header.tsx',
      content: `
        import React from 'react';
        import { formatFileSize } from '../lib/utils';
        export const ChatHeader = () => null;
      `,
    },
    {
      path: 'src/lib/storage.ts',
      content: `
        import { Message } from './types';
        export const storage = {};
      `,
    },
    {
      path: 'src/lib/utils.ts',
      content: `
        export function formatFileSize(size: number) { return size + 'B'; }
      `,
    },
    {
      path: 'src/lib/types.ts',
      content: `
        export interface Message { id: string; }
      `,
    },
  ];

  it('buildGraphFromFiles extrai nós e arestas de imports relativos corretamente', () => {
    const graph = buildGraphFromFiles(sampleFiles);

    assert.ok(graph.nodes.length >= 6, 'Deve conter pelo menos 6 nós de arquivos');
    assert.ok(graph.edges.length > 0, 'Deve conter arestas de dependência');

    const appNode = graph.nodes.find((n) => n.path === 'src/App.tsx');
    assert.ok(appNode, 'Nó src/App.tsx deve existir');
    assert.strictEqual(appNode.outDegree >= 3, true, 'App.tsx deve importar pelo menos 3 módulos');

    const utilsNode = graph.nodes.find((n) => n.path === 'src/lib/utils.ts');
    assert.ok(utilsNode, 'Nó src/lib/utils.ts deve existir');
    assert.strictEqual(utilsNode.inDegree >= 2, true, 'utils.ts deve ser importado por chat-message e chat-header');
  });

  it('findShortestPath encontra o caminho entre dois nós via BFS', () => {
    const graph = buildGraphFromFiles(sampleFiles);
    const path = findShortestPath(graph, 'src/App.tsx', 'src/lib/utils.ts');

    assert.ok(path, 'Caminho deve existir');
    assert.strictEqual(path[0], 'src/App.tsx');
    assert.strictEqual(path[path.length - 1], 'src/lib/utils.ts');
    assert.strictEqual(path.length, 3, 'Caminho deve ter tamanho 3 (App -> Component -> utils)');
  });

  it('findGodNodes identifica módulos mais acoplados/centrais do projeto', () => {
    const graph = buildGraphFromFiles(sampleFiles);
    const gods = findGodNodes(graph, 3);

    assert.ok(gods.length <= 3, 'Deve respeitar o limite solicitado');
    assert.ok(gods.length > 0, 'Deve retornar nós centrais');
    assert.ok(
      gods.some((g) => g.path === 'src/App.tsx' || g.path === 'src/lib/utils.ts'),
      'App.tsx ou utils.ts devem estar entre os hubs'
    );
  });

  it('queryGraphContext formata resumo cirúrgico GraphRAG para a LLM', () => {
    const graph = buildGraphFromFiles(sampleFiles);
    const result = queryGraphContext(graph, { query: 'formatFileSize' });

    assert.ok(result.markdownContext.includes('GraphRAG Architecture Context'));
    assert.ok(result.markdownContext.includes('src/lib/utils.ts'));
    assert.ok(result.matchedNodes.length > 0);
  });

  it('parseGraphJson aceita e normaliza saída oficial do CLI graphify.json', () => {
    const cliJson = {
      nodes: [
        { id: 'module_a', label: 'Module A', file: 'src/a.ts' },
        { id: 'module_b', label: 'Module B', file: 'src/b.ts' },
      ],
      links: [{ source: 'module_a', target: 'module_b', kind: 'imports' }],
      communities: { '0': ['module_a', 'module_b'] },
    };

    const graph = parseGraphJson(cliJson);
    assert.strictEqual(graph.nodes.length, 2);
    assert.strictEqual(graph.edges.length, 1);
    assert.strictEqual(graph.edges[0].source, 'module_a');
  });
});
