import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphFromFiles } from './graphify-engine';

describe('graphify-engine (buildGraphFromFiles)', () => {
  it('calcula com precisão inDegree (Usado por) e outDegree (Importa) para imports relativos, multiline, type e aliases', () => {
    const files = [
      {
        path: '/src/main.tsx',
        content: `
          import React from 'react';
          import App from './App';
          import './index.css';
        `,
      },
      {
        path: '/src/App.tsx',
        content: `
          import {
            type SynapProject,
            type ProjectFile
          } from './lib/types';
          import { buildGraphFromFiles } from '@/lib/graphify-engine';
          const LazyModal = () => import('./components/graph-modal');
        `,
      },
      {
        path: '/src/components/graph-modal.tsx',
        content: `
          import type { KnowledgeGraph } from '../lib/graphify-engine';
          import { compute3DLayout } from 'src/lib/graph-3d-engine';
        `,
      },
      {
        path: '/src/lib/graphify-engine.ts',
        content: `export interface KnowledgeGraph {}`,
      },
      {
        path: '/src/lib/graph-3d-engine.ts',
        content: `import type { KnowledgeGraph } from './graphify-engine';`,
      },
      {
        path: '/src/lib/types.ts',
        content: `export interface SynapProject {}`,
      },
      {
        path: '/src/index.css',
        content: `@tailwind base;`,
      },
    ];

    const graph = buildGraphFromFiles(files);
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

    // Caminhos iniciados com '/' devem ser normalizados
    assert.ok(byId['src/App.tsx'], 'src/App.tsx deve estar normalizado sem barra inicial');
    assert.ok(byId['src/main.tsx'], 'src/main.tsx deve estar normalizado sem barra inicial');

    // main.tsx importa App.tsx e index.css -> outDegree = 2, inDegree = 0
    assert.equal(byId['src/main.tsx'].outDegree, 2);
    assert.equal(byId['src/main.tsx'].inDegree, 0);

    // App.tsx é usado por main.tsx (inDegree = 1) e importa types.ts, graphify-engine.ts, graph-modal.tsx (outDegree = 3)
    assert.equal(byId['src/App.tsx'].inDegree, 1);
    assert.equal(byId['src/App.tsx'].outDegree, 3);

    // graphify-engine.ts é usado por App.tsx, graph-modal.tsx e graph-3d-engine.ts -> inDegree = 3
    assert.equal(byId['src/lib/graphify-engine.ts'].inDegree, 3);
    assert.equal(byId['src/lib/graphify-engine.ts'].outDegree, 0);
    assert.ok(graph.godNodes.some((g) => g.id === 'src/lib/graphify-engine.ts'));
  });
});
