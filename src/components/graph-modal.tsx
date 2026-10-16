import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Search,
  Network,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  ArrowRight,
  ArrowLeft,
  FileCode,
  Box,
  Cpu,
  Sparkles,
} from 'lucide-react';
import { ProjectGraph, GraphNode } from '../lib/graphify-engine';

interface GraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: ProjectGraph;
  initialFocusNodeId?: string;
  onSelectFile?: (filePath: string) => void;
}

export const GraphModal: React.FC<GraphModalProps> = ({
  isOpen,
  onClose,
  graph,
  initialFocusNodeId,
  onSelectFile,
}) => {
  const [search, setSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Inicializa com o foco inicial, se fornecido
  useEffect(() => {
    if (initialFocusNodeId && graph.nodes.some((n) => n.id === initialFocusNodeId)) {
      setSelectedNodeId(initialFocusNodeId);
    } else if (graph.godNodes.length > 0 && !selectedNodeId) {
      setSelectedNodeId(graph.godNodes[0].id);
    }
  }, [initialFocusNodeId, graph, isOpen]);

  // Tecla ESC para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtra nós pela busca
  const filteredNodes = useMemo(() => {
    if (!search.trim()) return graph.nodes;
    const q = search.toLowerCase();
    return graph.nodes.filter(
      (n) => n.path.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)
    );
  }, [graph.nodes, search]);

  const selectedNode = useMemo(() => {
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [graph.nodes, selectedNodeId]);

  // Dependentes e dependências do nó selecionado
  const { incomingEdges, outgoingEdges } = useMemo(() => {
    if (!selectedNodeId) return { incomingEdges: [], outgoingEdges: [] };
    return {
      incomingEdges: graph.edges.filter((e) => e.target === selectedNodeId),
      outgoingEdges: graph.edges.filter((e) => e.source === selectedNodeId),
    };
  }, [graph.edges, selectedNodeId]);

  // Layout determinístico do grafo (posicionamento orgânico em grid/órbita)
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const total = graph.nodes.length;
    if (total === 0) return positions;

    const width = 1200;
    const height = 800;
    const centerX = width / 2;
    const centerY = height / 2;

    // Hubs (God Nodes) no centro
    const godSet = new Set(graph.godNodes.map((g) => g.id));
    const nonGods = graph.nodes.filter((n) => !godSet.has(n.id));

    // Posiciona hubs em um círculo interior
    graph.godNodes.forEach((node, i) => {
      const angle = (i / Math.max(1, graph.godNodes.length)) * 2 * Math.PI;
      const radius = 120;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });

    // Posiciona os demais nós por comunidade em anéis externos
    const communities = Object.keys(graph.communities);
    nonGods.forEach((node, i) => {
      const commIdx = communities.indexOf(node.community || 'root');
      const baseAngle = (commIdx / Math.max(1, communities.length)) * 2 * Math.PI;
      const offsetAngle = ((i % 12) / 12) * (Math.PI / 2) - Math.PI / 4;
      const radius = 260 + (i % 3) * 80;

      const finalAngle = baseAngle + offsetAngle;
      positions.set(node.id, {
        x: centerX + Math.cos(finalAngle) * radius,
        y: centerY + Math.sin(finalAngle) * radius,
      });
    });

    return positions;
  }, [graph]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getNodeColor = (node: GraphNode) => {
    if (node.id === selectedNodeId) return '#d97757'; // Coral Claude
    if (graph.godNodes.some((g) => g.id === node.id)) return '#10b981'; // Esmeralda Hub
    if (node.kind === 'component') return '#3b82f6'; // Azul
    if (node.kind === 'hook') return '#8b5cf6'; // Roxo
    if (node.kind === 'type') return '#f59e0b'; // Âmbar
    return '#64748b'; // Neutro
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-[90vh] bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-3e3b34)] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[color:var(--c-fg-f3efe6)] font-sans">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--c-bg-3e3b34)] bg-[color:var(--c-bg-1c1a17)]/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-d97757)]">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif font-semibold text-base text-[color:var(--c-fg-f3efe6)]">
                  Mapa de Arquitetura (Graphify)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono">
                  GraphRAG Ativo
                </span>
              </div>
              <p className="text-xs text-[color:var(--c-fg-8c867a)]">
                {graph.nodes.length} módulos · {graph.edges.length} dependências · {Object.keys(graph.communities).length} agrupamentos
              </p>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[color:var(--c-fg-8c867a)]" />
              <input
                type="text"
                placeholder="Buscar arquivo ou módulo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-8c867a)] focus:outline-none focus:border-[color:var(--c-fg-d97757)] w-56"
              />
            </div>

            <button
              type="button"
              onClick={resetView}
              title="Resetar visão"
              className="p-2 rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] hover:bg-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Fechar mapa"
              className="p-2 rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] hover:bg-rose-500/20 hover:border-rose-500/40 text-[color:var(--c-fg-c4bfb6)] hover:text-rose-300 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="relative flex-1 flex overflow-hidden">
          {/* Interactive Graph Canvas / SVG */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`flex-1 relative bg-[color:var(--c-bg-1c1a17)] overflow-hidden cursor-${isDragging ? 'grabbing' : 'grab'}`}
          >
            {/* Background grid pattern */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage: `radial-gradient(circle, var(--c-bg-4a473f) 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
              }}
            />

            <svg
              className="w-full h-full"
              viewBox="0 0 1200 800"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
            >
              {/* Edges */}
              <g className="edges">
                {graph.edges.map((edge, i) => {
                  const s = nodePositions.get(edge.source);
                  const t = nodePositions.get(edge.target);
                  if (!s || !t) return null;

                  const isHighlighted =
                    selectedNodeId &&
                    (edge.source === selectedNodeId || edge.target === selectedNodeId);

                  return (
                    <line
                      key={`${edge.source}->${edge.target}-${i}`}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={isHighlighted ? '#d97757' : 'var(--c-bg-3e3b34)'}
                      strokeWidth={isHighlighted ? 2.5 : 1}
                      strokeOpacity={isHighlighted ? 0.9 : 0.4}
                      strokeDasharray={edge.kind === 'depends_on' ? '4 4' : undefined}
                    />
                  );
                })}
              </g>

              {/* Nodes */}
              <g className="nodes">
                {graph.nodes.map((node) => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;

                  const isSelected = node.id === selectedNodeId;
                  const isGod = graph.godNodes.some((g) => g.id === node.id);
                  const radius = isSelected ? 18 : isGod ? 14 : 10;
                  const color = getNodeColor(node);

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId(node.id);
                      }}
                      className="cursor-pointer group"
                    >
                      {/* Glow for selected/hub */}
                      {(isSelected || isGod) && (
                        <circle
                          r={radius + 6}
                          fill={color}
                          opacity={isSelected ? 0.35 : 0.15}
                          className="animate-pulse"
                        />
                      )}

                      <circle
                        r={radius}
                        fill={color}
                        stroke="#1c1a17"
                        strokeWidth={2}
                        className="transition-transform duration-200 group-hover:scale-125"
                      />

                      <text
                        y={radius + 14}
                        textAnchor="middle"
                        fill={isSelected ? '#ffffff' : 'var(--c-fg-c4bfb6)'}
                        fontSize={isSelected ? 12 : 10}
                        fontWeight={isSelected || isGod ? 'bold' : 'normal'}
                        className="pointer-events-none select-none"
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Float Controls (Zoom In / Out) */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 p-1.5 rounded-xl bg-[color:var(--c-bg-23211d)]/90 border border-[color:var(--c-bg-3e3b34)] shadow-lg backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                title="Aumentar zoom"
                className="p-1.5 rounded-lg hover:bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
                title="Diminuir zoom"
                className="p-1.5 rounded-lg hover:bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Sidebar: Selected Node Details */}
          <div className="w-80 sm:w-96 border-l border-[color:var(--c-bg-3e3b34)] bg-[color:var(--c-bg-23211d)] p-4 flex flex-col overflow-y-auto">
            {selectedNode ? (
              <div className="space-y-4">
                <div className="pb-3 border-b border-[color:var(--c-bg-3e3b34)]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getNodeColor(selectedNode) }}
                    />
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-8c867a)] uppercase tracking-wider">
                      {selectedNode.kind}
                    </span>
                    {graph.godNodes.some((g) => g.id === selectedNode.id) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                        Hub Central
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm text-white break-words">
                    {selectedNode.label}
                  </h3>
                  <p className="text-[11px] text-[color:var(--c-fg-8c867a)] font-mono break-all mt-1">
                    {selectedNode.path}
                  </p>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-[color:var(--c-bg-1c1a17)] border border-[color:var(--c-bg-3e3b34)]">
                    <div className="text-[10px] text-[color:var(--c-fg-8c867a)] flex items-center gap-1">
                      <ArrowLeft className="w-3 h-3 text-emerald-400" />
                      Usado por
                    </div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {incomingEdges.length}{' '}
                      <span className="text-xs font-normal text-[color:var(--c-fg-8c867a)]">
                        arquivos
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[color:var(--c-bg-1c1a17)] border border-[color:var(--c-bg-3e3b34)]">
                    <div className="text-[10px] text-[color:var(--c-fg-8c867a)] flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 text-[color:var(--c-fg-d97757)]" />
                      Importa
                    </div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {outgoingEdges.length}{' '}
                      <span className="text-xs font-normal text-[color:var(--c-fg-8c867a)]">
                        módulos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Who imports this (Dependentes) */}
                <div>
                  <h4 className="text-xs font-medium text-[color:var(--c-fg-c4bfb6)] mb-2 flex items-center gap-1.5">
                    <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                    Quem depende deste arquivo ({incomingEdges.length})
                  </h4>
                  {incomingEdges.length > 0 ? (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {incomingEdges.map((e) => (
                        <button
                          key={e.source}
                          type="button"
                          onClick={() => setSelectedNodeId(e.source)}
                          className="w-full text-left p-1.5 rounded-lg bg-[color:var(--c-bg-1c1a17)] hover:bg-[color:var(--c-bg-302e2a)] border border-transparent hover:border-[color:var(--c-bg-3e3b34)] text-xs text-[color:var(--c-fg-c4bfb6)] hover:text-white transition flex items-center justify-between group cursor-pointer"
                        >
                          <span className="truncate">{e.source.split('/').pop()}</span>
                          <span className="text-[10px] text-[color:var(--c-fg-8c867a)] group-hover:text-[color:var(--c-fg-d97757)] font-mono">
                            Ver nó →
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[color:var(--c-fg-8c867a)] italic">
                      Nenhum arquivo local importa este nó diretamente (ponto de entrada ou raiz).
                    </p>
                  )}
                </div>

                {/* What it imports (Dependências) */}
                <div>
                  <h4 className="text-xs font-medium text-[color:var(--c-fg-c4bfb6)] mb-2 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                    Módulos importados ({outgoingEdges.length})
                  </h4>
                  {outgoingEdges.length > 0 ? (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {outgoingEdges.map((e) => (
                        <button
                          key={e.target}
                          type="button"
                          onClick={() => setSelectedNodeId(e.target)}
                          className="w-full text-left p-1.5 rounded-lg bg-[color:var(--c-bg-1c1a17)] hover:bg-[color:var(--c-bg-302e2a)] border border-transparent hover:border-[color:var(--c-bg-3e3b34)] text-xs text-[color:var(--c-fg-c4bfb6)] hover:text-white transition flex items-center justify-between group cursor-pointer"
                        >
                          <span className="truncate">{e.target.split('/').pop()}</span>
                          <span className="text-[10px] text-[color:var(--c-fg-8c867a)] group-hover:text-[color:var(--c-fg-d97757)] font-mono">
                            Ver nó →
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[color:var(--c-fg-8c867a)] italic">
                      Este módulo não importa outros arquivos locais.
                    </p>
                  )}
                </div>

                {onSelectFile && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectFile(selectedNode.path);
                      onClose();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-[color:var(--c-bg-302e2a)] hover:bg-[color:var(--c-bg-3e3b34)] border border-[color:var(--c-bg-3e3b34)] text-xs text-[color:var(--c-fg-f3efe6)] hover:text-white font-medium flex items-center justify-center gap-2 transition cursor-pointer mt-2"
                  >
                    <FileCode className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />
                    Abrir no Editor
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-[color:var(--c-fg-8c867a)]">
                <Network className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs">Clique em qualquer nó do mapa para ver suas dependências e métricas de acoplamento.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
