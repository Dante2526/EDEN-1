import { ProjectGraph, GraphNode, GraphEdge } from './graphify-engine';

export interface Node3D extends GraphNode {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  isGod: boolean;
  baseRadius: number;
}

export interface Camera3DState {
  width: number;
  height: number;
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
  is3D: boolean;
  fov?: number;
}

export interface ProjectedNode3D extends Node3D {
  screenX: number;
  screenY: number;
  depthZ: number;
  scale: number;
  alpha: number;
  projectedRadius: number;
}

/**
 * Gera hash numérico determinístico a partir do id do arquivo para distribuição 3D consistente.
 */
function deterministicHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Calcula o layout tridimensional (Fibonacci Sphere + Comunidades Orbitais + Relaxamento Físico Inicial).
 */
export function compute3DLayout(graph: ProjectGraph, warmupIterations = 45): Node3D[] {
  const total = graph.nodes.length;
  if (total === 0) return [];

  const godSet = new Set(graph.godNodes.map((g) => g.id));
  const communities = Object.keys(graph.communities);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const nodes3d: Node3D[] = graph.nodes.map((node, index) => {
    const isGod = godSet.has(node.id);
    const commIdx = Math.max(0, communities.indexOf(node.community || 'root'));
    const h = deterministicHash(node.id);

    // Fibonacci sphere distribution
    const t = total > 1 ? index / (total - 1) : 0.5;
    const yNorm = 1 - t * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
    const theta = goldenAngle * index + (commIdx / Math.max(1, communities.length)) * Math.PI * 0.8;

    // Hubs ficam no núcleo interno (raio ~95..140), demais módulos em órbitas 3D (~210..320)
    const shellRadius = isGod
      ? 90 + (index % 3) * 22
      : 215 + (commIdx % 4) * 35 + (h - 0.5) * 30;

    const x = Math.cos(theta) * radiusAtY * shellRadius;
    const y = yNorm * shellRadius * 0.82;
    const z = Math.sin(theta) * radiusAtY * shellRadius;

    const degreeBoost = Math.min(8, Math.sqrt(node.inDegree + node.outDegree) * 1.8);
    const baseRadius = isGod ? 14 + degreeBoost * 0.6 : 8.5 + degreeBoost * 0.5;

    return {
      ...node,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      isGod,
      baseRadius,
    };
  });

  // Warmup físico para organizar clusters conectados de forma orgânica em 3D
  for (let i = 0; i < warmupIterations; i++) {
    const alpha = Math.max(0.08, 1 - i / warmupIterations);
    step3DForceSimulation(nodes3d, graph.edges, alpha);
  }

  return nodes3d;
}

/**
 * Executa um passo de simulação física 3D (Repulsão de Coulomb + Molas de Hooke + Gravidade Orbital).
 */
export function step3DForceSimulation(
  nodes: Node3D[],
  edges: GraphEdge[],
  alpha = 0.25
): void {
  const n = nodes.length;
  if (n <= 1) return;

  const nodeMap = new Map<string, Node3D>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // 1. Repulsão 3D entre todos os pares
  const repulsionStrength = 4800;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const distSq = dx * dx + dy * dy + dz * dz + 120;
      const dist = Math.sqrt(distSq);
      const force = (repulsionStrength * alpha) / distSq;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      a.vx += fx;
      a.vy += fy;
      a.vz += fz;
      b.vx -= fx;
      b.vy -= fy;
      b.vz -= fz;
    }
  }

  // 2. Atração elástica nas arestas (Hooke's Law)
  const springStrength = 0.042 * alpha;
  const idealLength = 155;
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target || source === target) continue;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dz = target.z - source.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const displacement = dist - idealLength;
    const force = displacement * springStrength;

    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    const fz = (dz / dist) * force;

    source.vx += fx;
    source.vy += fy;
    source.vz += fz;
    target.vx -= fx;
    target.vy -= fy;
    target.vz -= fz;
  }

  // 3. Gravidade suave em direção à casca orbital e amortecimento
  const damping = 0.72;
  for (const node of nodes) {
    const targetRadius = node.isGod ? 100 : 250;
    const currentRadius = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z) || 1;
    const radialDiff = targetRadius - currentRadius;
    const radialForce = radialDiff * 0.03 * alpha;

    node.vx = (node.vx + (node.x / currentRadius) * radialForce) * damping;
    node.vy = (node.vy + (node.y / currentRadius) * radialForce) * damping;
    node.vz = (node.vz + (node.z / currentRadius) * radialForce) * damping;

    node.x += node.vx;
    node.y += node.vy;
    node.z += node.vz;
  }
}

/**
 * Projeta os nós 3D para o espaço 2D da tela com câmera orbital, perspectiva e ordenação Z (Painter's Algorithm).
 */
export function project3DNodes(nodes: Node3D[], camera: Camera3DState): ProjectedNode3D[] {
  const fov = camera.fov ?? 780;
  const centerX = camera.width / 2 + camera.panX;
  const centerY = camera.height / 2 + camera.panY;

  const cosY = Math.cos(camera.rotY);
  const sinY = Math.sin(camera.rotY);
  const cosX = Math.cos(camera.rotX);
  const sinX = Math.sin(camera.rotX);

  const projected: ProjectedNode3D[] = nodes.map((node) => {
    if (!camera.is3D) {
      const scale2D = camera.zoom;
      return {
        ...node,
        screenX: centerX + node.x * scale2D,
        screenY: centerY + node.y * scale2D,
        depthZ: 0,
        scale: scale2D,
        alpha: 1,
        projectedRadius: Math.max(4, node.baseRadius * scale2D),
      };
    }

    // Rotação em torno do eixo Y (Yaw)
    const x1 = node.x * cosY - node.z * sinY;
    const z1 = node.z * cosY + node.x * sinY;

    // Rotação em torno do eixo X (Pitch)
    const y2 = node.y * cosX - z1 * sinX;
    const z2 = z1 * cosX + node.y * sinX;

    // depthZ > 0 significa mais fundo na tela; depthZ < 0 significa mais próximo da câmera
    const cameraDistance = fov + z2;
    const safeDistance = Math.max(140, cameraDistance);
    const perspective = (fov / safeDistance) * camera.zoom;

    const screenX = centerX + x1 * perspective;
    const screenY = centerY + y2 * perspective;

    // Cálculo de opacidade por profundidade (Depth of Field / Atmospheric Fog)
    const normalizedDepth = Math.max(-1, Math.min(1, z2 / 340));
    const alpha = Math.max(0.28, Math.min(1, 0.78 - normalizedDepth * 0.38));

    return {
      ...node,
      screenX,
      screenY,
      depthZ: z2,
      scale: perspective,
      alpha,
      projectedRadius: Math.max(4, node.baseRadius * perspective),
    };
  });

  // Ordena do mais distante (maior depthZ) para o mais próximo (menor depthZ)
  projected.sort((a, b) => b.depthZ - a.depthZ);
  return projected;
}

/**
 * Encontra o nó projetado sob o cursor (x, y), priorizando os nós mais próximos da câmera (frente para trás).
 */
export function findClosestProjectedNode(
  projectedNodes: ProjectedNode3D[],
  pointerX: number,
  pointerY: number,
  hitPadding = 8
): ProjectedNode3D | null {
  // Percorre do fim (mais próximo da câmera) para o início (mais fundo)
  for (let i = projectedNodes.length - 1; i >= 0; i--) {
    const node = projectedNodes[i];
    const dx = pointerX - node.screenX;
    const dy = pointerY - node.screenY;
    const hitRadius = node.projectedRadius + hitPadding;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return node;
    }
  }
  return null;
}
