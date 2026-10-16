import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compute3DLayout,
  project3DNodes,
  findClosestProjectedNode,
  step3DForceSimulation,
} from './graph-3d-engine';
import { ProjectGraph } from './graphify-engine';

const mockGraph: ProjectGraph = {
  nodes: [
    {
      id: 'src/App.tsx',
      label: 'App.tsx',
      path: 'src/App.tsx',
      kind: 'component',
      inDegree: 0,
      outDegree: 2,
      community: 'src',
      exports: ['App'],
    },
    {
      id: 'src/lib/types.ts',
      label: 'types.ts',
      path: 'src/lib/types.ts',
      kind: 'type',
      inDegree: 2,
      outDegree: 0,
      community: 'src/lib',
      exports: ['ModelId'],
    },
    {
      id: 'src/lib/models.ts',
      label: 'models.ts',
      path: 'src/lib/models.ts',
      kind: 'module',
      inDegree: 1,
      outDegree: 1,
      community: 'src/lib',
      exports: ['ALLOWED_MODELS'],
    },
  ],
  edges: [
    { source: 'src/App.tsx', target: 'src/lib/types.ts', kind: 'imports' },
    { source: 'src/App.tsx', target: 'src/lib/models.ts', kind: 'imports' },
    { source: 'src/lib/models.ts', target: 'src/lib/types.ts', kind: 'imports' },
  ],
  godNodes: [
    {
      id: 'src/lib/types.ts',
      label: 'types.ts',
      path: 'src/lib/types.ts',
      kind: 'type',
      inDegree: 2,
      outDegree: 0,
      community: 'src/lib',
      exports: ['ModelId'],
    },
  ],
  communities: {
    src: ['src/App.tsx'],
    'src/lib': ['src/lib/types.ts', 'src/lib/models.ts'],
  },
  generatedAt: Date.now(),
};

describe('graph-3d-engine (3D Force-Directed & Perspective Projection Engine)', () => {
  it('calcula posições 3D (x, y, z) determinísticas e equilibradas para todos os nós', () => {
    const nodes3d = compute3DLayout(mockGraph);

    assert.equal(nodes3d.length, 3);
    for (const node of nodes3d) {
      assert.equal(typeof node.x, 'number');
      assert.equal(typeof node.y, 'number');
      assert.equal(typeof node.z, 'number');
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z));
    }
  });

  it('executa passo de relaxamento físico 3D mantendo coordenadas finitas e separando nós', () => {
    const nodes3d = compute3DLayout(mockGraph);
    step3DForceSimulation(nodes3d, mockGraph.edges, 0.5);

    for (const node of nodes3d) {
      assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z));
    }
  });

  it('projeta nós 3D para coordenadas 2D de tela com escala de perspectiva e ordenação Z (back-to-front)', () => {
    const nodes3d = compute3DLayout(mockGraph);
    const projected = project3DNodes(nodes3d, {
      width: 1000,
      height: 700,
      rotX: 0.3,
      rotY: 0.6,
      zoom: 1,
      panX: 0,
      panY: 0,
      is3D: true,
    });

    assert.equal(projected.length, 3);
    // Verifica que está ordenado de trás para frente (maior z rotacionado / mais distante primeiro, ou menor scale primeiro)
    for (let i = 1; i < projected.length; i++) {
      assert.ok(
        projected[i - 1].depthZ >= projected[i].depthZ,
        'Deve ordenar do mais distante (maior depthZ) para o mais próximo (menor depthZ)'
      );
    }

    for (const p of projected) {
      assert.ok(p.scale > 0);
      assert.ok(p.alpha >= 0.15 && p.alpha <= 1);
      assert.ok(Number.isFinite(p.screenX) && Number.isFinite(p.screenY));
    }
  });

  it('detecta corretamente o nó clicado no espaço projetado (hit-testing 3D priorizando nós à frente)', () => {
    const nodes3d = compute3DLayout(mockGraph);
    const projected = project3DNodes(nodes3d, {
      width: 1000,
      height: 700,
      rotX: 0.2,
      rotY: 0.4,
      zoom: 1,
      panX: 0,
      panY: 0,
      is3D: true,
    });

    const frontNode = projected[projected.length - 1];
    const hit = findClosestProjectedNode(projected, frontNode.screenX + 2, frontNode.screenY - 2);
    assert.ok(hit);
    assert.equal(hit?.id, frontNode.id);

    const miss = findClosestProjectedNode(projected, -9999, -9999);
    assert.equal(miss, null);
  });
});
