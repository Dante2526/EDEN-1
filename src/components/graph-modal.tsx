import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  Network,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  FileCode,
  Box,
  Orbit,
  Pause,
  Play,
} from 'lucide-react';
import { ProjectGraph, GraphNode } from '../lib/graphify-engine';
import {
  compute3DLayout,
  project3DNodes,
  findClosestProjectedNode,
  Node3D,
  ProjectedNode3D,
} from '../lib/graph-3d-engine';

interface GraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: ProjectGraph;
  initialFocusNodeId?: string;
  onSelectFile?: (filePath: string) => void;
}

interface ColorPalette {
  main: string;
  light: string;
  dark: string;
  glow: string;
}

function getNodePalette(
  node: GraphNode,
  selectedNodeId: string | null,
  godSet: Set<string>
): ColorPalette {
  if (node.id === selectedNodeId) {
    return {
      main: '#f97316',
      light: '#ffedd5',
      dark: '#9a3412',
      glow: 'rgba(249, 115, 22, 0.55)',
    };
  }
  if (godSet.has(node.id)) {
    return {
      main: '#10b981',
      light: '#d1fae5',
      dark: '#065f46',
      glow: 'rgba(16, 185, 129, 0.45)',
    };
  }
  if (node.kind === 'component') {
    return {
      main: '#38bdf8',
      light: '#e0f2fe',
      dark: '#0369a1',
      glow: 'rgba(56, 189, 248, 0.4)',
    };
  }
  if (node.kind === 'hook') {
    return {
      main: '#a855f7',
      light: '#f3e8ff',
      dark: '#581c87',
      glow: 'rgba(168, 85, 247, 0.4)',
    };
  }
  if (node.kind === 'type') {
    return {
      main: '#f59e0b',
      light: '#fef3c7',
      dark: '#92400e',
      glow: 'rgba(245, 158, 11, 0.4)',
    };
  }
  return {
    main: '#94a3b8',
    light: '#f1f5f9',
    dark: '#334155',
    glow: 'rgba(148, 163, 184, 0.28)',
  };
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
  const [is3D, setIs3D] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1.08);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);

  // Estado mutável de alta frequência da câmera 3D para 60 FPS sem re-renders do React
  const cameraRef = useRef({
    rotX: 0.28,
    rotY: -0.45,
    targetRotX: null as number | null,
    targetRotY: null as number | null,
    velRotX: 0,
    velRotY: 0,
    panX: 0,
    panY: 0,
    zoom: 1.08,
    isDragging: false,
    dragMode: 'orbit' as 'orbit' | 'pan',
    dragStartX: 0,
    dragStartY: 0,
    pointerMovedDistance: 0,
  });

  const projectedNodesRef = useRef<ProjectedNode3D[]>([]);

  useEffect(() => {
    cameraRef.current.zoom = zoom;
  }, [zoom]);

  const godSet = useMemo(() => new Set(graph.godNodes.map((g) => g.id)), [graph.godNodes]);

  // Layout 3D calculado com física de forças
  const nodes3D = useMemo<Node3D[]>(() => {
    return compute3DLayout(graph, 55);
  }, [graph]);

  // Inicializa foco no nó principal
  useEffect(() => {
    if (!isOpen) return;
    if (initialFocusNodeId && graph.nodes.some((n) => n.id === initialFocusNodeId)) {
      setSelectedNodeId(initialFocusNodeId);
    } else if (graph.godNodes.length > 0 && !selectedNodeId) {
      setSelectedNodeId(graph.godNodes[0].id);
    } else if (graph.nodes.length > 0 && !selectedNodeId) {
      setSelectedNodeId(graph.nodes[0].id);
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

  const matchingNodeIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return new Set(
      graph.nodes
        .filter((n) => n.path.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
        .map((n) => n.id)
    );
  }, [graph.nodes, search]);

  // Referência sincronizada para o loop de 60 FPS ler sem reiniciar o canvas
  const sceneRef = useRef({
    nodes3D,
    graph,
    selectedNodeId,
    is3D,
    autoRotate,
    godSet,
    matchingNodeIds,
  });
  sceneRef.current = {
    nodes3D,
    graph,
    selectedNodeId,
    is3D,
    autoRotate,
    godSet,
    matchingNodeIds,
  };

  const selectedNode = useMemo(() => {
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [graph.nodes, selectedNodeId]);

  const { incomingEdges, outgoingEdges } = useMemo(() => {
    if (!selectedNodeId) return { incomingEdges: [], outgoingEdges: [] };
    return {
      incomingEdges: graph.edges.filter((e) => e.target === selectedNodeId),
      outgoingEdges: graph.edges.filter((e) => e.source === selectedNodeId),
    };
  }, [graph.edges, selectedNodeId]);

  // Centraliza suavemente a câmera 3D na direção do nó escolhido
  const focusCameraOnNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      const target = nodes3D.find((n) => n.id === nodeId);
      if (!target || !is3D) return;

      // Calcula ângulos yaw/pitch para trazer o nó para a frente (z negativo)
      const targetYaw = Math.atan2(-target.x, -target.z);
      const horizDist = Math.sqrt(target.x * target.x + target.z * target.z) || 1;
      const targetPitch = Math.max(-0.85, Math.min(0.85, Math.atan2(target.y, horizDist) * 0.55));

      cameraRef.current.targetRotY = targetYaw;
      cameraRef.current.targetRotX = targetPitch;
    },
    [nodes3D, is3D]
  );

  const resetView = useCallback(() => {
    setZoom(1.08);
    cameraRef.current.zoom = 1.08;
    cameraRef.current.panX = 0;
    cameraRef.current.panY = 0;
    cameraRef.current.targetRotX = 0.28;
    cameraRef.current.targetRotY = -0.45;
    cameraRef.current.velRotX = 0;
    cameraRef.current.velRotY = 0;
  }, []);

  // Loop de renderização 3D contínuo a 60 FPS no Canvas HiDPI (sem reiniciar em hover/click)
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationFrameId = 0;
    let width = Math.max(300, container.clientWidth || 900);
    let height = Math.max(300, container.clientHeight || 650);

    const updateCanvasSize = () => {
      if (!container || !canvas) return;
      const nextWidth = Math.max(300, container.clientWidth);
      const nextHeight = Math.max(300, container.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetPixelWidth = Math.floor(nextWidth * dpr);
      const targetPixelHeight = Math.floor(nextHeight * dpr);

      width = nextWidth;
      height = nextHeight;

      if (canvas.width !== targetPixelWidth || canvas.height !== targetPixelHeight) {
        canvas.width = targetPixelWidth;
        canvas.height = targetPixelHeight;
        canvas.style.width = `${nextWidth}px`;
        canvas.style.height = `${nextHeight}px`;
      }
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    const renderFrame = (time: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const {
        nodes3D: curNodes3D,
        graph: curGraph,
        selectedNodeId: curSelectedId,
        is3D: curIs3D,
        autoRotate: curAutoRotate,
        godSet: curGodSet,
        matchingNodeIds: curMatchingIds,
      } = sceneRef.current;
      const curHoveredId = hoveredNodeIdRef.current;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      const cam = cameraRef.current;

      // 1. Atualiza física de câmera (interpolação suave ou auto-rotação)
      if (!cam.isDragging) {
        if (cam.targetRotY !== null && cam.targetRotX !== null) {
          const diffY = cam.targetRotY - cam.rotY;
          const diffX = cam.targetRotX - cam.rotX;
          cam.rotY += diffY * 0.12;
          cam.rotX += diffX * 0.12;
          if (Math.abs(diffY) < 0.003 && Math.abs(diffX) < 0.003) {
            cam.targetRotY = null;
            cam.targetRotX = null;
          }
        } else {
          if (curAutoRotate && curIs3D) {
            cam.rotY += 0.0032;
          }
          cam.rotY += cam.velRotY;
          cam.rotX = Math.max(-1.25, Math.min(1.25, cam.rotX + cam.velRotX));
          cam.velRotY *= 0.92;
          cam.velRotX *= 0.92;
        }
      }

      // 2. Fundo espacial profundo com vinheta radial 3D
      ctx.clearRect(0, 0, width, height);
      const bgGrad = ctx.createRadialGradient(
        width / 2 + cam.panX * 0.3,
        height / 2 + cam.panY * 0.3,
        20,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75
      );
      bgGrad.addColorStop(0, '#1e1c18');
      bgGrad.addColorStop(0.55, '#141310');
      bgGrad.addColorStop(1, '#0c0b09');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Desenha anéis orbitais 3D holográficos de referência no espaço
      if (curIs3D) {
        const orbitalRadii = [115, 250];
        const cosX = Math.cos(cam.rotX);
        const sinX = Math.sin(cam.rotX);
        const centerX = width / 2 + cam.panX;
        const centerY = height / 2 + cam.panY;

        for (const r of orbitalRadii) {
          ctx.save();
          ctx.beginPath();
          const steps = 64;
          for (let s = 0; s <= steps; s++) {
            const angle = (s / steps) * Math.PI * 2 + cam.rotY;
            const ox = Math.cos(angle) * r;
            const oz = Math.sin(angle) * r;
            const oy2 = -oz * sinX;
            const oz2 = oz * cosX;
            const persp = (780 / Math.max(180, 780 + oz2)) * cam.zoom;
            const sx = centerX + ox * persp;
            const sy = centerY + oy2 * persp;
            if (s === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = r === 115 ? 'rgba(16, 185, 129, 0.11)' : 'rgba(56, 189, 248, 0.08)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. Projeta todos os nós 3D para 2D com ordenação Z
      const projected = project3DNodes(curNodes3D, {
        width,
        height,
        rotX: cam.rotX,
        rotY: cam.rotY,
        zoom: cam.zoom,
        panX: cam.panX,
        panY: cam.panY,
        is3D: curIs3D,
      });
      projectedNodesRef.current = projected;

      const projMap = new Map<string, ProjectedNode3D>();
      for (const p of projected) {
        projMap.set(p.id, p);
      }

      // 5. Renderiza Arestas 3D + Partículas de Fluxo de Dados
      const pulsePhase = (time * 0.00065) % 1;
      for (let i = 0; i < curGraph.edges.length; i++) {
        const edge = curGraph.edges[i];
        const s = projMap.get(edge.source);
        const t = projMap.get(edge.target);
        if (!s || !t) continue;

        const isOutgoingFromSelected = curSelectedId === edge.source;
        const isIncomingToSelected = curSelectedId === edge.target;
        const isHoveredEdge =
          curHoveredId && (edge.source === curHoveredId || edge.target === curHoveredId);
        const isHighlighted = isOutgoingFromSelected || isIncomingToSelected || isHoveredEdge;

        const avgAlpha = (s.alpha + t.alpha) * 0.5;
        const searchDim =
          curMatchingIds && !curMatchingIds.has(s.id) && !curMatchingIds.has(t.id) ? 0.2 : 1;

        // Curva suave 3D em direção ao centro
        const midX = (s.screenX + t.screenX) * 0.5;
        const midY =
          (s.screenY + t.screenY) * 0.5 - (curIs3D ? 12 * ((s.scale + t.scale) * 0.5) : 0);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(s.screenX, s.screenY);
        ctx.quadraticCurveTo(midX, midY, t.screenX, t.screenY);

        if (isHighlighted) {
          const edgeColor = isIncomingToSelected
            ? 'rgba(16, 185, 129, 0.88)' // Verde Esmeralda = Quem depende deste arquivo
            : 'rgba(249, 115, 22, 0.9)'; // Coral = Módulos que este arquivo importa
          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = Math.max(1.6, 2.4 * ((s.scale + t.scale) * 0.5));
          ctx.shadowColor = isIncomingToSelected ? '#10b981' : '#f97316';
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = `rgba(148, 163, 184, ${(0.22 * avgAlpha * searchDim).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.8, 1.1 * ((s.scale + t.scale) * 0.5));
        }

        if (edge.kind === 'depends_on') {
          ctx.setLineDash([4, 4]);
        }
        ctx.stroke();

        // Partículas luminosas fluindo nas conexões ativas (source -> target)
        if (isHighlighted) {
          for (let pIdx = 0; pIdx < 2; pIdx++) {
            const u = (pulsePhase + pIdx * 0.5 + (i % 5) * 0.13) % 1;
            const invU = 1 - u;
            const px = invU * invU * s.screenX + 2 * invU * u * midX + u * u * t.screenX;
            const py = invU * invU * s.screenY + 2 * invU * u * midY + u * u * t.screenY;

            ctx.beginPath();
            ctx.arc(px, py, 2.8 * ((s.scale + t.scale) * 0.5), 0, Math.PI * 2);
            ctx.fillStyle = isIncomingToSelected ? '#6ee7b7' : '#fed7aa';
            ctx.shadowColor = isIncomingToSelected ? '#10b981' : '#f97316';
            ctx.shadowBlur = 10;
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // 6. Renderiza Esferas 3D Volumétricas (ordenadas de trás para frente)
      const pulseScale = 1 + Math.sin(time * 0.004) * 0.08;

      for (const node of projected) {
        const isSelected = node.id === curSelectedId;
        const isHovered = node.id === curHoveredId;
        const isConnectedToSelected =
          curSelectedId &&
          curGraph.edges.some(
            (e) =>
              (e.source === curSelectedId && e.target === node.id) ||
              (e.target === curSelectedId && e.source === node.id)
          );

        const isSearchMatch = !curMatchingIds || curMatchingIds.has(node.id);
        const dimFactor = isSearchMatch ? 1 : 0.22;
        const finalAlpha = Math.max(0.15, Math.min(1, node.alpha * dimFactor));

        const palette = getNodePalette(node, curSelectedId, curGodSet);
        const r =
          node.projectedRadius *
          (isSelected ? 1.32 : isHovered ? 1.18 : 1);

        ctx.save();
        ctx.globalAlpha = finalAlpha;

        // Halo volumétrico externo para Hubs, Selecionado ou Hover
        if (isSelected || node.isGod || isHovered) {
          const haloRadius = r * (isSelected ? 2.35 * pulseScale : 1.85);
          const haloGrad = ctx.createRadialGradient(
            node.screenX,
            node.screenY,
            r * 0.4,
            node.screenX,
            node.screenY,
            haloRadius
          );
          haloGrad.addColorStop(0, palette.glow);
          haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, haloRadius, 0, Math.PI * 2);
          ctx.fillStyle = haloGrad;
          ctx.fill();
        }

        // Corpo da Esfera 3D com iluminação especular (fonte de luz superior esquerda)
        const lightOffsetX = -r * 0.35;
        const lightOffsetY = -r * 0.35;
        const sphereGrad = ctx.createRadialGradient(
          node.screenX + lightOffsetX,
          node.screenY + lightOffsetY,
          r * 0.12,
          node.screenX,
          node.screenY,
          r
        );
        sphereGrad.addColorStop(0, palette.light);
        sphereGrad.addColorStop(0.38, palette.main);
        sphereGrad.addColorStop(1, palette.dark);

        ctx.beginPath();
        ctx.arc(node.screenX, node.screenY, r, 0, Math.PI * 2);
        ctx.fillStyle = sphereGrad;
        ctx.shadowColor = palette.glow;
        ctx.shadowBlur = isSelected ? 18 : node.isGod ? 10 : 4;
        ctx.fill();

        // Anel orbital ao redor do nó selecionado
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.screenX, node.screenY, r + 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 237, 213, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Rótulo 3D flutuante com pílula translúcida de alto contraste
        const shouldShowLabel =
          isSelected ||
          isHovered ||
          node.isGod ||
          isConnectedToSelected ||
          node.scale > 0.78 ||
          curGraph.nodes.length <= 28;

        if (shouldShowLabel) {
          const fontSize = Math.max(9.5, Math.min(13.5, (isSelected ? 12 : 10.5) * node.scale));
          ctx.font = `${isSelected || node.isGod ? '600' : '500'} ${fontSize.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          const textWidth = ctx.measureText(node.label).width;
          const labelY = node.screenY + r + fontSize + 4;
          const padX = 6;
          const padY = 3;

          // Pílula de fundo
          ctx.fillStyle = isSelected
            ? 'rgba(249, 115, 22, 0.22)'
            : 'rgba(20, 19, 16, 0.78)';
          ctx.strokeStyle = isSelected
            ? 'rgba(249, 115, 22, 0.65)'
            : 'rgba(62, 59, 52, 0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(
            node.screenX - textWidth / 2 - padX,
            labelY - fontSize + 1 - padY,
            textWidth + padX * 2,
            fontSize + padY * 2,
            6
          );
          ctx.fill();
          ctx.stroke();

          // Texto do módulo
          ctx.fillStyle = isSelected ? '#ffffff' : isHovered ? '#f8fafc' : '#e5e0d5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(node.label, node.screenX, labelY);
        }

        ctx.restore();
      }

      ctx.restore();
      animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    animationFrameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getPointerCoords = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cam = cameraRef.current;
    cam.isDragging = true;
    cam.targetRotX = null;
    cam.targetRotY = null;
    cam.dragMode = e.button === 2 || e.shiftKey || !is3D ? 'pan' : 'orbit';
    cam.dragStartX = e.clientX;
    cam.dragStartY = e.clientY;
    cam.pointerMovedDistance = 0;
    e.currentTarget.style.cursor = 'grabbing';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cam = cameraRef.current;
    const { x, y } = getPointerCoords(e.clientX, e.clientY);

    if (!cam.isDragging) {
      const hovered = findClosestProjectedNode(projectedNodesRef.current, x, y);
      hoveredNodeIdRef.current = hovered ? hovered.id : null;
      e.currentTarget.style.cursor = hovered ? 'pointer' : 'grab';
      return;
    }

    const dx = e.clientX - cam.dragStartX;
    const dy = e.clientY - cam.dragStartY;
    cam.dragStartX = e.clientX;
    cam.dragStartY = e.clientY;
    cam.pointerMovedDistance += Math.hypot(dx, dy);

    if (cam.dragMode === 'orbit' && is3D) {
      const rotSpeed = 0.0065;
      cam.rotY += dx * rotSpeed;
      cam.rotX = Math.max(-1.25, Math.min(1.25, cam.rotX - dy * rotSpeed));
      cam.velRotY = dx * rotSpeed * 0.35;
      cam.velRotX = -dy * rotSpeed * 0.35;
    } else {
      cam.panX += dx;
      cam.panY += dy;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cam = cameraRef.current;
    const wasClick = cam.pointerMovedDistance < 6;
    cam.isDragging = false;
    e.currentTarget.style.cursor = hoveredNodeIdRef.current ? 'pointer' : 'grab';

    if (wasClick) {
      const { x, y } = getPointerCoords(e.clientX, e.clientY);
      const clickedNode = findClosestProjectedNode(projectedNodesRef.current, x, y, 10);
      if (clickedNode) {
        focusCameraOnNode(clickedNode.id);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => {
      const next = Math.max(0.45, Math.min(2.8, prev * factor));
      cameraRef.current.zoom = next;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl h-full sm:h-[92vh] bg-[color:var(--c-bg-23211d)] border-0 sm:border border-[color:var(--c-bg-3e3b34)] rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[color:var(--c-fg-f3efe6)] font-sans">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-[color:var(--c-bg-3e3b34)] bg-[color:var(--c-bg-1c1a17)]/95 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 shadow-inner shrink-0">
              <Network className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="font-serif font-semibold text-xs sm:text-base text-[color:var(--c-fg-f3efe6)] truncate max-w-[150px] xs:max-w-[200px] sm:max-w-none">
                  Mapa de Arquitetura 3D
                </h2>
                <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 font-mono">
                  3D Engine · 60 FPS
                </span>
                <span className="hidden md:inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono">
                  GraphRAG Ativo
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[color:var(--c-fg-8c867a)] truncate">
                {graph.nodes.length} módulos · {graph.edges.length} conexões
              </p>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[color:var(--c-fg-8c867a)]" />
              <input
                type="text"
                placeholder="Buscar arquivo ou módulo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-8c867a)] focus:outline-none focus:border-sky-400 w-44 lg:w-52"
              />
            </div>

            {/* Botão 3D / 2D */}
            <button
              type="button"
              onClick={() => setIs3D((prev) => !prev)}
              title={is3D ? 'Alternar para visão 2D Plana' : 'Alternar para Esfera 3D'}
              className={`flex items-center gap-1 px-2 py-1.5 sm:px-2.5 rounded-lg sm:rounded-xl border text-xs font-mono transition cursor-pointer ${
                is3D
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-[color:var(--c-bg-302e2a)] border-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-c4bfb6)]'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>{is3D ? '3D' : '2D'}</span>
            </button>

            {/* Botão Auto-Giro 3D */}
            {is3D && (
              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                title={autoRotate ? 'Pausar rotação orbital' : 'Ativar rotação orbital automática'}
                className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition cursor-pointer ${
                  autoRotate
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-[color:var(--c-bg-302e2a)] border-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-c4bfb6)] hover:text-white'
                }`}
              >
                {autoRotate ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            )}

            <button
              type="button"
              onClick={resetView}
              title="Resetar câmera 3D"
              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] hover:bg-[color:var(--c-bg-3e3b34)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Fechar mapa"
              className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-[color:var(--c-bg-302e2a)] border border-[color:var(--c-bg-3e3b34)] hover:bg-rose-500/20 hover:border-rose-500/40 text-[color:var(--c-fg-c4bfb6)] hover:text-rose-300 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="relative flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Interactive 3D Canvas Viewport */}
          <div
            ref={containerRef}
            className="relative bg-[#0c0b09] overflow-hidden select-none h-[42vh] sm:h-[50vh] lg:h-auto lg:flex-1 shrink-0 lg:shrink"
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                hoveredNodeIdRef.current = null;
              }}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              style={{ touchAction: 'none' }}
              className="w-full h-full block cursor-grab"
            />

            {/* Dica de Interação Orbital & Legenda 3D reposicionada no topo para mobile */}
            <div className="absolute top-2 left-2 sm:top-auto sm:bottom-3 sm:left-3 pointer-events-none flex flex-col gap-1 z-10 max-w-[calc(100%-60px)] sm:max-w-none">
              <div className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-black/75 border border-white/10 backdrop-blur-md flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" />
                  Selecionado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                  Hub Central
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Componente
                </span>
                <span className="hidden sm:flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Tipo / Hook
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 text-[10px] text-zinc-400 font-mono">
                <Orbit className="w-3 h-3 text-sky-400" />
                <span>Arraste para girar em 360° · Scroll para Zoom · Clique num módulo para focar</span>
              </div>
            </div>

            {/* Float Controls (Zoom In / Out) */}
            <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 flex flex-col gap-1 p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-[color:var(--c-bg-23211d)]/90 border border-[color:var(--c-bg-3e3b34)] shadow-lg backdrop-blur-sm z-10">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.8, z + 0.2))}
                title="Aumentar zoom 3D"
                className="p-1.5 rounded-md hover:bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.45, z - 0.2))}
                title="Diminuir zoom 3D"
                className="p-1.5 rounded-md hover:bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-c4bfb6)] hover:text-white transition cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {/* Drawer / Sidebar: Selected Node Details */}
          <div className="flex-1 min-h-0 lg:flex-none lg:w-88 xl:w-96 border-t lg:border-t-0 lg:border-l border-[color:var(--c-bg-3e3b34)] bg-[color:var(--c-bg-23211d)] p-3 sm:p-4 flex flex-col overflow-y-auto pb-8 sm:pb-4">
            {/* Pill/Handle indicador de gaveta no mobile */}
            <div className="w-8 h-1 rounded-full bg-zinc-600/60 mx-auto mb-2 lg:hidden shrink-0" />
            {selectedNode ? (
              <div className="space-y-4">
                <div className="pb-3 border-b border-[color:var(--c-bg-3e3b34)]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: getNodePalette(selectedNode, selectedNodeId, godSet).main,
                      }}
                    />
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-8c867a)] uppercase tracking-wider">
                      {selectedNode.kind}
                    </span>
                    {godSet.has(selectedNode.id) && (
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
                          onClick={() => focusCameraOnNode(e.source)}
                          className="w-full text-left p-1.5 rounded-lg bg-[color:var(--c-bg-1c1a17)] hover:bg-[color:var(--c-bg-302e2a)] border border-transparent hover:border-[color:var(--c-bg-3e3b34)] text-xs text-[color:var(--c-fg-c4bfb6)] hover:text-white transition flex items-center justify-between group cursor-pointer"
                        >
                          <span className="truncate">{e.source.split('/').pop()}</span>
                          <span className="text-[10px] text-[color:var(--c-fg-8c867a)] group-hover:text-sky-400 font-mono">
                            Focar 3D →
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
                          onClick={() => focusCameraOnNode(e.target)}
                          className="w-full text-left p-1.5 rounded-lg bg-[color:var(--c-bg-1c1a17)] hover:bg-[color:var(--c-bg-302e2a)] border border-transparent hover:border-[color:var(--c-bg-3e3b34)] text-xs text-[color:var(--c-fg-c4bfb6)] hover:text-white transition flex items-center justify-between group cursor-pointer"
                        >
                          <span className="truncate">{e.target.split('/').pop()}</span>
                          <span className="text-[10px] text-[color:var(--c-fg-8c867a)] group-hover:text-sky-400 font-mono">
                            Focar 3D →
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
                <p className="text-xs">
                  Clique em qualquer esfera 3D do mapa para focar a câmera e inspecionar suas conexões.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
