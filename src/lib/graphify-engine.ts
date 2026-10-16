/**
 * Motor de Grafos e GraphRAG para Contexto de Código (Graphify Engine)
 *
 * Analisa a arquitetura do projeto, mapeando dependências (imports/exports),
 * detectando nós de alto acoplamento (God Nodes), calculando caminhos entre módulos
 * e gerando contexto arquitetural cirúrgico para a IA sem sobrecarregar a janela de tokens.
 */

export type NodeKind = 'component' | 'hook' | 'module' | 'type' | 'file';

export interface GraphNode {
  id: string;
  path: string;
  label: string;
  kind: NodeKind;
  inDegree: number;
  outDegree: number;
  community?: string;
  symbols?: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'imports' | 'calls' | 'depends_on';
}

export interface ProjectGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities: Record<string, string[]>;
  godNodes: GraphNode[];
  root?: string;
}

export interface GraphQueryResult {
  query: string;
  matchedNodes: GraphNode[];
  relevantEdges: GraphEdge[];
  markdownContext: string;
  stats: {
    totalNodes: number;
    totalEdges: number;
    matchedCount: number;
  };
}

export interface FileInput {
  path: string;
  content: string;
}

/**
 * Normaliza caminhos no formato POSIX (barras normais)
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Determina o tipo de nó com base no caminho e conteúdo
 */
function detectNodeKind(filePath: string, content: string): NodeKind {
  const norm = filePath.toLowerCase();
  if (norm.endsWith('.d.ts') || norm.includes('types') || norm.includes('interfaces')) {
    return 'type';
  }
  if (norm.includes('hook') || norm.includes('use-') || norm.includes('use_')) {
    return 'hook';
  }
  if (norm.endsWith('.tsx') || norm.endsWith('.jsx')) {
    return 'component';
  }
  if (norm.endsWith('.ts') || norm.endsWith('.js') || norm.endsWith('.mjs')) {
    return 'module';
  }
  return 'file';
}

/**
 * Resolve um caminho de importação relativo ou alias (@/, src/) a partir do arquivo importador
 */
function resolveRelativePath(importerPath: string, importSpec: string, allPaths: Set<string>): string | null {
  let candidate = '';

  if (importSpec.startsWith('.')) {
    const parts = normalizePath(importerPath).split('/');
    parts.pop(); // Remove o arquivo atual para ficar na pasta base

    const specParts = importSpec.split('/');
    for (const part of specParts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    candidate = parts.join('/');
  } else if (importSpec.startsWith('@/')) {
    candidate = 'src/' + importSpec.slice(2);
  } else if (importSpec.startsWith('~/')) {
    candidate = 'src/' + importSpec.slice(2);
  } else if (importSpec.startsWith('src/') || importSpec.startsWith('/src/')) {
    candidate = normalizePath(importSpec);
  } else {
    // Import de pacote externo (ex: 'react', 'lucide-react')
    return null;
  }

  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '/index.ts', '/index.tsx', '/index.js'];

  for (const ext of extensions) {
    const full = candidate + ext;
    if (allPaths.has(full)) {
      return full;
    }
  }

  // Fallback: tenta casar sem o prefixo 'src/' caso o projeto tenha arquivos na raiz
  if (candidate.startsWith('src/')) {
    const rootCandidate = candidate.slice(4);
    for (const ext of extensions) {
      const full = rootCandidate + ext;
      if (allPaths.has(full)) {
        return full;
      }
    }
  }

  return candidate;
}

/**
 * Extrai todos os caminhos importados por um arquivo de código (estáticos, multiline, type, side-effect e dinâmicos)
 */
function extractImports(content: string): string[] {
  const imports = new Set<string>();
  // Remove comentários de bloco e de linha para evitar falsos positivos
  const cleaned = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // 1. import/export ... from 'spec' (incluindo import type e multiline)
  const fromRegex = /\b(?:import|export)\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = fromRegex.exec(cleaned)) !== null) {
    if (match[1]) imports.add(match[1].trim());
  }

  // 2. side-effect import 'spec'
  const sideEffectRegex = /\bimport\s*['"]([^'"]+)['"]/g;
  while ((match = sideEffectRegex.exec(cleaned)) !== null) {
    if (match[1]) imports.add(match[1].trim());
  }

  // 3. dynamic import('spec') ou require('spec')
  const dynamicRegex = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(cleaned)) !== null) {
    if (match[1]) imports.add(match[1].trim());
  }

  return Array.from(imports);
}

/**
 * Constrói o grafo de dependências a partir de um conjunto de arquivos em memória
 */
export function buildGraphFromFiles(files: FileInput[]): ProjectGraph {
  const allPaths = new Set(files.map((f) => normalizePath(f.path)));
  const nodeMap = new Map<string, GraphNode>();
  const edgeList: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  // 1. Cria nós iniciais
  for (const file of files) {
    const normPath = normalizePath(file.path);
    const label = normPath.split('/').pop() || normPath;
    const kind = detectNodeKind(normPath, file.content);

    nodeMap.set(normPath, {
      id: normPath,
      path: normPath,
      label,
      kind,
      inDegree: 0,
      outDegree: 0,
    });
  }

  // 2. Extrai arestas de importação
  for (const file of files) {
    const sourcePath = normalizePath(file.path);
    const sourceNode = nodeMap.get(sourcePath);
    if (!sourceNode) continue;

    const importedSpecs = extractImports(file.content);
    for (const spec of importedSpecs) {
      const resolved = resolveRelativePath(sourcePath, spec, allPaths);
      if (!resolved || resolved === sourcePath) continue;

      // Garante que o nó de destino exista no mapa
      if (!nodeMap.has(resolved)) {
        nodeMap.set(resolved, {
          id: resolved,
          path: resolved,
          label: resolved.split('/').pop() || resolved,
          kind: detectNodeKind(resolved, ''),
          inDegree: 0,
          outDegree: 0,
        });
      }

      const edgeKey = `${sourcePath}->${resolved}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edgeList.push({
          source: sourcePath,
          target: resolved,
          kind: 'imports',
        });

        sourceNode.outDegree++;
        const targetNode = nodeMap.get(resolved);
        if (targetNode) {
          targetNode.inDegree++;
        }
      }
    }
  }

  const nodes = Array.from(nodeMap.values());

  // 3. Agrupamento em comunidades simples por pasta raiz
  const communities: Record<string, string[]> = {};
  for (const node of nodes) {
    const parts = node.path.split('/');
    const communityName = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0] || 'root';
    node.community = communityName;
    if (!communities[communityName]) {
      communities[communityName] = [];
    }
    communities[communityName].push(node.id);
  }

  // 4. Identifica nós centrais (God Nodes)
  const godNodes = [...nodes]
    .sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree))
    .slice(0, 5);

  return {
    nodes,
    edges: edgeList,
    communities,
    godNodes,
  };
}

/**
 * Encontra o menor caminho direcionado/indirecionado entre dois nós usando Busca em Largura (BFS)
 */
export function findShortestPath(graph: ProjectGraph, source: string, target: string): string[] | null {
  const normSource = normalizePath(source);
  const normTarget = normalizePath(target);

  if (normSource === normTarget) return [normSource];

  const adj = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    if (!adj.has(edge.target)) adj.set(edge.target, new Set());
    adj.get(edge.source)!.add(edge.target);
  }

  const queue: string[][] = [[normSource]];
  const visited = new Set<string>([normSource]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    const neighbors = adj.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (neighbor === normTarget) {
        return [...path, neighbor];
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  return null;
}

/**
 * Identifica os nós com maior grau de conectividade total (God Nodes / Hubs de Código)
 */
export function findGodNodes(graph: ProjectGraph, limit = 5): GraphNode[] {
  return [...graph.nodes]
    .sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree))
    .slice(0, limit);
}

/**
 * Consulta o grafo de arquitetura com GraphRAG e formata resumo contextual cirúrgico para a LLM
 */
export function queryGraphContext(
  graph: ProjectGraph,
  options: {
    query?: string;
    focusFile?: string;
    maxNodes?: number;
  }
): GraphQueryResult {
  const { query = '', focusFile = '', maxNodes = 8 } = options;
  const q = query.toLowerCase().trim();
  const focus = focusFile ? normalizePath(focusFile).toLowerCase() : '';

  // Filtra nós relevantes
  const matchedNodes = graph.nodes.filter((node) => {
    const p = node.path.toLowerCase();
    const l = node.label.toLowerCase();
    if (focus && p.includes(focus)) return true;
    if (q && (p.includes(q) || l.includes(q))) return true;
    return false;
  }).slice(0, maxNodes);

  // Se nenhum nó for encontrado por termo exato, inclui os hubs do sistema
  const finalNodes = matchedNodes.length > 0 ? matchedNodes : graph.godNodes.slice(0, maxNodes);
  const finalNodeIds = new Set(finalNodes.map((n) => n.id));

  // Arestas relevantes (conectando os nós selecionados ou vizinhos imediatos)
  const relevantEdges = graph.edges.filter(
    (e) => finalNodeIds.has(e.source) || finalNodeIds.has(e.target)
  );

  // Monta sumário em Markdown estruturado (GraphRAG)
  const lines: string[] = [];
  lines.push('### 🧭 GraphRAG Architecture Context (Graphify)');
  lines.push(`Total do Repositório: **${graph.nodes.length} nós**, **${graph.edges.length} conexões**.`);

  if (finalNodes.length > 0) {
    lines.push('\n**Módulos Relevantes e Dependências:**');
    for (const node of finalNodes) {
      const importers = graph.edges
        .filter((e) => e.target === node.id)
        .map((e) => e.source.split('/').pop());
      const dependencies = graph.edges
        .filter((e) => e.source === node.id)
        .map((e) => e.target.split('/').pop());

      lines.push(`- **\`${node.path}\`** (${node.kind}):`);
      if (dependencies.length > 0) {
        lines.push(`  - Importa: \`${dependencies.slice(0, 5).join('`, `')}\`${dependencies.length > 5 ? '…' : ''}`);
      }
      if (importers.length > 0) {
        lines.push(`  - Usado por: \`${importers.slice(0, 5).join('`, `')}\`${importers.length > 5 ? '…' : ''}`);
      }
    }
  }

  if (graph.godNodes.length > 0) {
    lines.push('\n**Módulos Centrais (Hubs do Projeto):**');
    for (const god of graph.godNodes.slice(0, 3)) {
      lines.push(`- \`${god.path}\` (${god.inDegree} dependentes, ${god.outDegree} dependências)`);
    }
  }

  return {
    query,
    matchedNodes: finalNodes,
    relevantEdges,
    markdownContext: lines.join('\n'),
    stats: {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      matchedCount: finalNodes.length,
    },
  };
}

/**
 * Faz parsing do arquivo graph.json oficial gerado pelo Graphify CLI Python
 */
export function parseGraphJson(rawJson: any): ProjectGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const rawNodes = Array.isArray(rawJson?.nodes) ? rawJson.nodes : [];
  const rawEdges = Array.isArray(rawJson?.links) ? rawJson.links : Array.isArray(rawJson?.edges) ? rawJson.edges : [];

  for (const rn of rawNodes) {
    const id = rn.id || rn.name || rn.path;
    const path = rn.file || rn.path || id;
    nodes.push({
      id,
      path,
      label: rn.label || path.split('/').pop() || id,
      kind: (rn.kind as NodeKind) || 'module',
      inDegree: 0,
      outDegree: 0,
      community: rn.community ? String(rn.community) : undefined,
    });
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const re of rawEdges) {
    const source = typeof re.source === 'object' ? re.source.id : re.source;
    const target = typeof re.target === 'object' ? re.target.id : re.target;
    if (source && target) {
      edges.push({
        source,
        target,
        kind: re.kind || 'imports',
      });
      const sNode = nodeMap.get(source);
      const tNode = nodeMap.get(target);
      if (sNode) sNode.outDegree++;
      if (tNode) tNode.inDegree++;
    }
  }

  const communities = rawJson?.communities || {};
  const godNodes = [...nodes]
    .sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree))
    .slice(0, 5);

  return {
    nodes,
    edges,
    communities,
    godNodes,
  };
}
