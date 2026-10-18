import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Check,
  X,
  AlertTriangle,
  Lightbulb,
  ShieldAlert,
  FileCode,
  ListTree,
  Loader2,
  Sparkles,
  Brain,
  Search,
  Zap,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  User,
  GitBranch,
  FolderGit2,
  Paperclip,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
import { ActiveRepoState, AttachedDocument, Skill, McpServer } from '../lib/types';
import { ProjectGraph } from '../lib/graphify-engine';
import { StudioSession, StudioStep, StudioTimelineEntry, TimelineActor } from './studio-types';
import { loadStudioConfig } from '../lib/studio-config';
import { generateId, fileToBase64, readFileAsText } from '../lib/utils';
import { runPlanner, runReviewer, runImplementer } from './studio-engine';
import { usePendingChanges } from '../lib/pending-changes';
import { useProjects } from '../lib/project-context';
import { VoiceButton } from '../components/voice-button';
import { FileAttachmentPreviews } from '../components/image-attachment';
import { ThinkingOrb } from 'thinking-orbs';

interface Props {
  activeRepo: ActiveRepoState | null;
  skills?: Skill[];
  mcpServers?: McpServer[];
  projectGraph?: ProjectGraph | null;
  onOpenRepoSelector?: () => void;
  onOpenSourceControl?: () => void;
  onOpenSettings?: () => void;
  onBackToChat?: () => void;
}

const ACTOR_CONFIG: Record<
  TimelineActor,
  { icon: React.FC<{ className?: string }>; color: string; bg: string; label: string }
> = {
  user: { icon: User, color: 'text-[color:var(--c-fg-f3efe6)]', bg: 'bg-[color:var(--c-bg-25231e)]', label: 'Você' },
  planner: { icon: Brain, color: 'text-amber-400', bg: 'bg-amber-950/40', label: 'Planner (Kimi K3)' },
  reviewer: { icon: Search, color: 'text-sky-400', bg: 'bg-sky-950/40', label: 'Reviewer (GLM-5.3)' },
  implementer: { icon: Zap, color: 'text-violet-400', bg: 'bg-violet-950/40', label: 'Implementer' },
  system: { icon: Bot, color: 'text-[color:var(--c-fg-d97757)]', bg: 'bg-[#d97757]/15', label: 'Sistema' },
};

export const StudioPanel: React.FC<Props> = ({
  activeRepo,
  skills,
  mcpServers,
  projectGraph,
  onOpenRepoSelector,
  onOpenSourceControl,
  onBackToChat,
}) => {
  const [task, setTask] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [timeline, setTimeline] = useState<StudioTimelineEntry[]>([]);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [refactorPromptOpen, setRefactorPromptOpen] = useState(false);
  const [refactorFeedback, setRefactorFeedback] = useState('');

  const { changes, addChange } = usePendingChanges();
  const { activeProject, updateProjectFiles } = useProjects();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseContentRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);
  const prevTimelineLenRef = useRef<number>(0);

  // Garantir que a página comece no topo ao abrir o Studio
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  // Rolagem para o final apenas quando novos itens forem adicionados à timeline
  useEffect(() => {
    if (scrollRef.current) {
      if (timeline.length === 0) {
        scrollRef.current.scrollTop = 0;
      } else if (timeline.length > prevTimelineLenRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      prevTimelineLenRef.current = timeline.length;
    }
  }, [timeline]);

  const addEntry = (entry: Omit<StudioTimelineEntry, 'id' | 'timestamp'>): string => {
    const id = generateId();
    setTimeline((prev) => [
      ...prev,
      {
        ...entry,
        id,
        timestamp: Date.now(),
      },
    ]);
    return id;
  };

  const updateEntry = (id: string, updates: Partial<StudioTimelineEntry>) => {
    setTimeline((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  };

  // Process selected files for attachment
  const processFiles = async (files: FileList | File[]) => {
    const newImages: string[] = [];
    const newDocs: AttachedDocument[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        try {
          const base64 = await fileToBase64(file);
          newImages.push(base64);
        } catch (err: any) {
          console.error('Erro ao ler imagem:', err);
        }
      } else {
        try {
          const text = await readFileAsText(file);
          newDocs.push({
            id: generateId(),
            name: file.name,
            size: file.size,
            type: file.type || 'text/plain',
            content: text,
          });
        } catch (err: any) {
          console.error(`Erro ao ler arquivo ${file.name}:`, err);
        }
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
    }
    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (isWorking) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Real-time microphone dictation handler
  const handleVoiceTranscript = (text: string) => {
    if (!isListeningRef.current) {
      baseContentRef.current = task;
      isListeningRef.current = true;
    }
    const prefix = baseContentRef.current ? `${baseContentRef.current.trim()} ` : '';
    setTask(`${prefix}${text}`);
  };

  const handleVoiceStateChange = (listening: boolean) => {
    if (!listening) {
      isListeningRef.current = false;
      baseContentRef.current = '';
    }
  };

  // Core Studio Orchestrator (Planner -> Reviewer -> Implementer)
  const startStudio = async (customFeedback?: string) => {
    if (!activeRepo) return;
    const taskToRun = task.trim() || session?.task;
    if (!taskToRun && images.length === 0 && documents.length === 0) return;

    const currentImages = [...images];
    const currentDocs = [...documents];

    // Build the augmented task description if attachments are present
    let enrichedTask = taskToRun || 'Analisar arquivos anexados e aplicar alterações no repositório.';
    if (currentDocs.length > 0) {
      const docSnippets = currentDocs
        .map((doc) => `\n\n--- Arquivo Anexo: ${doc.name} (${doc.type}) ---\n${doc.content.slice(0, 4000)}`)
        .join('');
      enrichedTask = `${enrichedTask}${docSnippets}`;
    }
    if (currentImages.length > 0) {
      enrichedTask = `${enrichedTask}\n\n[O usuário anexou ${currentImages.length} imagem(ns) como referência visual.]`;
    }

    setIsWorking(true);
    setRefactorPromptOpen(false);

    const config = await loadStudioConfig();
    const sessionId = session?.id || generateId();
    const newSession: StudioSession = {
      id: sessionId,
      task: taskToRun || 'Tarefa com anexos',
      repo: activeRepo.fullName,
      branch: activeRepo.branch,
      status: 'planning',
      startedAt: session?.startedAt || Date.now(),
      agentConfig: config,
    };
    setSession(newSession);

    // 1. Adiciona mensagem do usuário
    if (!customFeedback) {
      addEntry({
        actor: 'user',
        type: 'message',
        content: taskToRun || 'Tarefa com arquivos anexados:',
        images: currentImages.length > 0 ? currentImages : undefined,
        documents: currentDocs.length > 0 ? currentDocs : undefined,
      });
      setTask('');
      setImages([]);
      setDocuments([]);
    } else {
      addEntry({
        actor: 'user',
        type: 'message',
        content: `Refazer plano com orientações: "${customFeedback}"`,
        images: currentImages.length > 0 ? currentImages : undefined,
        documents: currentDocs.length > 0 ? currentDocs : undefined,
      });
      setTask('');
      setImages([]);
      setDocuments([]);
    }

    // 2. Card do Planner (em progresso)
    const plannerEntryId = addEntry({
      actor: 'planner',
      type: 'plan',
      title: `Planejando tarefa com ${config.planner.model}`,
      status: 'info',
      content: 'Analisando estrutura do repositório, dependências e código-fonte...',
    });

    try {
      const plan = await runPlanner(enrichedTask, activeRepo, config.planner, customFeedback, {
        skills,
        mcpServers,
        projectGraph: projectGraph || undefined,
        pendingChanges: changes,
      });

      // Atualiza card do Planner com o plano gerado
      updateEntry(plannerEntryId, {
        title: `Plano gerado por ${config.planner.model}`,
        steps: plan,
        content: `Plano estruturado em ${plan.length} passos verificados no repositório.`,
        status: 'success',
      });

      newSession.status = 'reviewing';
      newSession.plan = plan;
      setSession({ ...newSession });

      // 3. Card do Revisor (com try/catch isolado para não sobrescrever o card do Planner se o Revisor falhar)
      const reviewerEntryId = addEntry({
        actor: 'reviewer',
        type: 'review',
        title: `Revisando plano com ${config.reviewer.model}`,
        status: 'info',
        content: 'Validando riscos, impacto arquitetural e integridade...',
      });

      const approvalActions = [
        {
          label: 'Aprovar e Implementar',
          variant: 'primary' as const,
          onClick: () => approveAndImplement(plan, newSession),
        },
        {
          label: 'Refazer Plano',
          variant: 'secondary' as const,
          onClick: () => {
            setRefactorPromptOpen(true);
          },
        },
        {
          label: 'Cancelar',
          variant: 'danger' as const,
          onClick: () => cancelSession(newSession),
        },
      ];

      try {
        const review = await runReviewer(plan, enrichedTask, activeRepo, config.reviewer, {
          skills,
          mcpServers,
          projectGraph: projectGraph || undefined,
          pendingChanges: changes,
        });

        updateEntry(reviewerEntryId, {
          title: `Revisão de ${config.reviewer.model}`,
          observations: review.observations,
          content: review.summary,
          status: review.approved ? 'success' : 'warning',
          actions: approvalActions,
        });

        newSession.status = 'awaiting_approval';
        newSession.review = review;
        setSession({ ...newSession });
      } catch (reviewErr: any) {
        updateEntry(reviewerEntryId, {
          title: 'Erro na revisão automática',
          content: `${reviewErr?.message || 'Falha ao executar o Reviewer.'} Você ainda pode aprovar e implementar o plano gerado pelo Planner.`,
          status: 'warning',
          actions: approvalActions,
        });
        newSession.status = 'awaiting_approval';
        setSession({ ...newSession });
      }
    } catch (err: any) {
      updateEntry(plannerEntryId, {
        title: 'Erro no planejamento',
        content: err?.message || 'Falha ao executar o Planner no repositório.',
        status: 'error',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const approveAndImplement = async (plan: StudioStep[], currentSession: StudioSession) => {
    if (!activeRepo) return;
    setIsWorking(true);

    currentSession.status = 'implementing';
    setSession({ ...currentSession });

    // Card do Implementador
    const implEntryId = addEntry({
      actor: 'implementer',
      type: 'progress',
      title: `Executando plano com ${currentSession.agentConfig.implementer.model}`,
      steps: plan.map((s) => ({ ...s })),
      status: 'info',
      content: 'Aplicando modificações atômicas de código no Source Control...',
    });

    try {
      await runImplementer(
        plan,
        activeRepo,
        currentSession.agentConfig.implementer,
        (updatedStep) => {
          setTimeline((prev) =>
            prev.map((e) => {
              if (e.id !== implEntryId) return e;
              return {
                ...e,
                steps: e.steps?.map((s) => (s.id === updatedStep.id ? updatedStep : s)),
              };
            })
          );
        },
        async (path, content, type, originalContent) => {
          if (!activeRepo) return;
          const repoFullName = `${activeRepo.owner}/${activeRepo.repo}`;
          await addChange({
            path,
            newContent: content,
            repo: repoFullName,
            branch: activeRepo.branch,
            type: type === 'create' ? 'added' : type === 'delete' ? 'deleted' : 'modified',
            originalContent: originalContent ?? '',
          });
          if (activeProject && activeProject.sourceRepoFullName === repoFullName) {
            await updateProjectFiles([
              {
                path,
                content,
                action: type === 'create' ? 'create' : type === 'delete' ? 'delete' : 'update',
              },
            ]);
          }
        },
        {
          skills,
          mcpServers,
          projectGraph: projectGraph || undefined,
          pendingChanges: changes,
        }
      );

      updateEntry(implEntryId, {
        title: 'Implementação concluída com sucesso',
        content: 'Todas as modificações de arquivos foram preparadas e registradas no Source Control.',
        status: 'success',
        actions: [
          {
            label: 'Ver no Source Control',
            variant: 'primary',
            onClick: () => onOpenSourceControl?.(),
          },
        ],
      });

      currentSession.status = 'completed';
      currentSession.completedAt = Date.now();
      setSession({ ...currentSession });
    } catch (err: any) {
      updateEntry(implEntryId, {
        title: 'Erro na implementação',
        content: err?.message || 'Falha ao gerar o código para os arquivos.',
        status: 'error',
      });
    } finally {
      setIsWorking(false);
    }
  };

  const cancelSession = (currentSession: StudioSession) => {
    currentSession.status = 'cancelled';
    setSession({ ...currentSession });
    addEntry({
      actor: 'system',
      type: 'message',
      content: 'Sessão cancelada pelo usuário.',
      status: 'warning',
    });
  };

  const resetForNewTask = () => {
    setTimeline([]);
    setSession(null);
    setTask('');
    setImages([]);
    setDocuments([]);
    setRefactorPromptOpen(false);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  const canSubmit = task.trim().length > 0 || images.length > 0 || documents.length > 0;

  // Botão "Enviar": inicia a tarefa ou envia orientações/ajustes
  const handleSend = () => {
    if (isWorking || !activeRepo) return;
    if (!canSubmit && session?.status !== 'completed' && session?.status !== 'cancelled') {
      textareaRef.current?.focus();
      return;
    }

    if (session?.status === 'awaiting_approval' && task.trim()) {
      startStudio(task.trim());
    } else if (session?.status === 'completed' || session?.status === 'cancelled') {
      if (canSubmit) {
        startStudio();
      } else {
        resetForNewTask();
      }
    } else {
      startStudio();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[color:var(--c-bg-0e0d0b)]">
      {/* Top Session Bar */}
      <div className="h-11 px-3 sm:px-6 border-b border-[color:var(--c-bg-1f1d18)] bg-[color:var(--c-bg-12110e)] flex items-center justify-between text-xs font-mono text-[color:var(--c-fg-8c867a)]">
        <div className="flex items-center gap-2.5 truncate">
          {onBackToChat && (
            <button
              type="button"
              onClick={onBackToChat}
              title="Retornar para a conversa de Chat"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[color:var(--c-bg-23211d)] hover:bg-[color:var(--c-bg-2d2a24)] border border-[color:var(--c-bg-3e3b33)] text-xs font-sans font-medium text-[color:var(--c-fg-f3efe6)] hover:text-[color:var(--c-on-strong)] transition cursor-pointer shrink-0 shadow-xs active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
              <span>Voltar ao Chat</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 text-[color:var(--c-fg-a39d93)] truncate">
            <span className="inline-flex w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[color:var(--c-fg-f3efe6)] font-medium font-sans">Studio</span>
            {activeRepo ? (
              <>
                <span className="text-[#3e3b33]">|</span>
                <span className="text-[color:var(--c-fg-a39d93)] truncate max-w-[160px]">{activeRepo.fullName}</span>
                <span className="text-[color:var(--c-fg-6d685e)]">({activeRepo.branch})</span>
              </>
            ) : (
              <span className="text-amber-400/80 font-sans">Nenhum repositório conectado</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {session && (
            <span
              className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                session.status === 'completed'
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                  : session.status === 'cancelled'
                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                  : session.status === 'awaiting_approval'
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                  : 'bg-sky-950/60 text-sky-400 border border-sky-800/40'
              }`}
            >
              {session.status.replace('_', ' ')}
            </span>
          )}
          {timeline.length > 0 && (
            <button
              type="button"
              onClick={resetForNewTask}
              disabled={isWorking}
              title="Nova Tarefa"
              className="text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] p-1 rounded hover:bg-[color:var(--c-bg-1a1916)] transition-colors cursor-pointer disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Área central com rolagem (Empty State Hero ou Timeline) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {timeline.length === 0 ? (
          // ============ EMPTY STATE HERO & SUGESTÕES ============
          <div className="flex flex-col items-center justify-center px-4 sm:px-6 py-10 max-w-3xl mx-auto w-full min-h-full">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d97757]/20 via-[color:var(--c-bg-1e1c17)] to-amber-500/20 border border-[#d97757]/30 mb-4 shadow-xl">
                <Bot className="w-8 h-8 text-[color:var(--c-fg-d97757)]" />
              </div>
              <h1 className="text-3xl font-serif text-[color:var(--c-fg-f3efe6)] mb-2 tracking-tight">Studio</h1>
              <p className="text-sm text-[color:var(--c-fg-8c867a)] max-w-md mx-auto leading-relaxed">
                Três agentes IA trabalham em sequência:{' '}
                <span className="text-amber-400 font-medium">Kimi K3</span> planeja,{' '}
                <span className="text-sky-400 font-medium">GLM-5.3</span> revisa e o{' '}
                <span className="text-violet-400 font-medium">Implementador</span> executa tarefas
                complexas.
              </p>

              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                {onBackToChat && (
                  <button
                    type="button"
                    onClick={onBackToChat}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[color:var(--c-bg-23211d)] hover:bg-[color:var(--c-bg-2d2a24)] border border-[color:var(--c-bg-3e3b33)] text-xs font-sans text-[color:var(--c-fg-f3efe6)] transition cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                    <span>Ir para o Chat</span>
                  </button>
                )}
                {activeRepo ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[color:var(--c-bg-181714)] border border-[color:var(--c-bg-2d2b26)] text-xs font-mono text-[color:var(--c-fg-c4bfb6)]">
                    <FolderGit2 className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                    <span>{activeRepo.fullName}</span>
                    <span className="text-[color:var(--c-fg-6d685e)]">·</span>
                    <GitBranch className="w-3 h-3 text-[color:var(--c-fg-8c867a)]" />
                    <span className="text-[color:var(--c-fg-8c867a)]">{activeRepo.branch}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenRepoSelector?.()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-950/40 border border-amber-800/40 text-xs font-sans text-amber-300 hover:bg-amber-950/60 transition cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Conectar um repositório para começar</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sugestões de tarefas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {[
                {
                  title: 'Refatorar função',
                  desc: 'Quebrar módulos grandes em funções modulares, puras e tipadas.',
                  icon: FileCode,
                },
                {
                  title: 'Adicionar nova feature',
                  desc: 'Construir funcionalidade criando arquivos e integrando aos componentes.',
                  icon: Sparkles,
                },
                {
                  title: 'Corrigir bugs & erros',
                  desc: 'Rastrear fluxo e tratar exceções e comportamentos inesperados.',
                  icon: AlertTriangle,
                },
                {
                  title: 'Escrever testes unitários',
                  desc: 'Criar cobertura de testes automatizados para os arquivos principais.',
                  icon: ListTree,
                },
              ].map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setTask(s.desc);
                    textareaRef.current?.focus();
                  }}
                  disabled={!activeRepo}
                  className="text-left p-4 rounded-xl border border-[color:var(--c-bg-2d2b26)] bg-[color:var(--c-bg-181714)] hover:bg-[color:var(--c-bg-1f1d18)] hover:border-[color:var(--c-bg-3b3831)] transition-all disabled:opacity-40 disabled:cursor-not-allowed group cursor-pointer"
                >
                  <s.icon className="w-5 h-5 text-[color:var(--c-fg-d97757)] mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-[color:var(--c-fg-f3efe6)]">{s.title}</div>
                  <div className="text-xs text-[color:var(--c-fg-8c867a)] mt-1 line-clamp-2 leading-relaxed">
                    {s.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // ============ TIMELINE DE CARDS CONVERSACIONAIS ============
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
            {timeline.map((entry) => (
              <TimelineCard
                key={entry.id}
                entry={entry}
                onAction={(action) => {
                  action.onClick();
                }}
              />
            ))}

            {/* Caixa de feedback para refazer plano */}
            {refactorPromptOpen && (
              <div className="rounded-xl border border-amber-500/40 bg-[color:var(--c-bg-1e1c18)] p-4 animate-in fade-in duration-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Orientações para o Planner refazer o plano</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRefactorPromptOpen(false)}
                    className="text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-on-strong)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <textarea
                  value={refactorFeedback}
                  onChange={(e) => setRefactorFeedback(e.target.value)}
                  placeholder="Ex: Mantenha retrocompatibilidade em utils.ts, adicione validação de entrada e use TypeScript estrito..."
                  rows={2}
                  className="w-full bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-3b3831)] rounded-lg px-3 py-2 text-xs text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-5c5851)] focus:outline-none focus:border-amber-400/50"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRefactorPromptOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-on-strong)] hover:bg-[color:var(--c-bg-282621)] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fb = refactorFeedback.trim();
                      setRefactorFeedback('');
                      startStudio(fb || 'Ajuste os passos conforme as observações do revisor.');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                  >
                    Refazer com Feedback
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input fixo no rodapé com Microfone, Anexos, Iniciar e Enviar */}
      <div className="border-t border-[color:var(--c-bg-1f1d18)] bg-[color:var(--c-bg-0e0d0b)] px-3 sm:px-6 py-3 sm:py-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.log,.sql,.sh,.xml,.yaml,.yml,.c,.cpp,.java,.doc,.docx"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={isWorking}
        />

        <div className="max-w-3xl mx-auto">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="rounded-2xl border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-181714)] focus-within:border-[#d97757]/50 focus-within:ring-1 focus-within:ring-[#d97757]/30 transition-all shadow-xl overflow-hidden"
          >
            {/* Previews de arquivos e imagens anexadas */}
            {(images.length > 0 || documents.length > 0) && (
              <FileAttachmentPreviews
                images={images}
                documents={documents}
                onRemoveImage={(idx) => setImages(images.filter((_, i) => i !== idx))}
                onRemoveDocument={(id) => setDocuments(documents.filter((d) => d.id !== id))}
              />
            )}

            {/* Textarea */}
            <div className="p-3 sm:p-3.5">
              <textarea
                ref={textareaRef}
                className="w-full bg-transparent text-sm sm:text-base text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-5c5851)] resize-none border-0 focus:outline-none leading-relaxed font-sans"
                rows={2}
                placeholder={
                  isWorking
                    ? 'Aguardando conclusão do agente atual...'
                    : session?.status === 'awaiting_approval'
                    ? 'Digite orientações para refazer o plano ou perguntas...'
                    : session?.status === 'completed' || session?.status === 'cancelled'
                    ? 'Escreva uma nova tarefa ou peça refinamentos...'
                    : 'Escreva uma mensagem ou descreva a tarefa para o Studio...'
                }
                value={task}
                onChange={(e) => setTask(e.target.value)}
                disabled={isWorking}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isWorking) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />

              {/* Toolbar inferior com ferramentas e botões */}
              <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-[color:var(--c-bg-23211c)]">
                {/* Ferramentas esquerdas: Anexar arquivo e Microfone */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {/* Botão Anexar Arquivos */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isWorking) fileInputRef.current?.click();
                    }}
                    disabled={isWorking}
                    aria-label="Anexar arquivos ou imagens"
                    title="Anexar arquivos, código ou imagens"
                    className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                      isWorking
                        ? 'text-[#48453f] cursor-not-allowed opacity-40'
                        : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-25231e)]'
                    }`}
                  >
                    <Paperclip className="w-4 h-4" />
                    {(images.length > 0 || documents.length > 0) && (
                      <span className="text-[11px] font-mono text-[color:var(--c-fg-d97757)] font-medium">
                        {images.length + documents.length}
                      </span>
                    )}
                  </button>

                  {/* Botão de Microfone com fala em tempo real */}
                  <VoiceButton
                    onTranscript={handleVoiceTranscript}
                    onStateChange={handleVoiceStateChange}
                    disabled={isWorking}
                  />
                </div>

                {/* Ferramentas direitas: Botão Enviar único */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={
                      !activeRepo ||
                      (!canSubmit && session?.status !== 'completed' && session?.status !== 'cancelled') ||
                      isWorking
                    }
                    aria-label="Enviar mensagem ou tarefa"
                    title="Enviar mensagem ou tarefa (Enter)"
                    className={`px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                      canSubmit && !isWorking && activeRepo
                        ? 'bg-[#d97757] hover:bg-[#c96442] text-white shadow-md active:scale-95'
                        : 'bg-[color:var(--c-bg-25231e)] text-[color:var(--c-fg-6b675e)] border border-[color:var(--c-bg-3b3831)] opacity-50 cursor-not-allowed'
                    }`}
                  >
                    {isWorking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5" />
                    )}
                    <span>Enviar</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ COMPONENTE: TimelineCard ============
interface TimelineCardProps {
  entry: StudioTimelineEntry;
  onAction: (action: NonNullable<StudioTimelineEntry['actions']>[0]) => void;
}

const TimelineCard: React.FC<TimelineCardProps> = ({ entry, onAction }) => {
  const [expanded, setExpanded] = useState(true);
  const actor = ACTOR_CONFIG[entry.actor] || ACTOR_CONFIG.system;

  const statusColor = {
    success: 'border-l-emerald-500',
    warning: 'border-l-amber-500',
    error: 'border-l-rose-500',
    info: 'border-l-sky-500',
  }[entry.status || 'info'];

  return (
    <div
      className={`pl-3 sm:pl-4 border-l-2 ${statusColor} ${
        entry.actor === 'user' ? 'ml-auto max-w-[90%] sm:max-w-[85%]' : 'w-full'
      } animate-in fade-in slide-in-from-bottom-1 duration-200`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-6 h-6 rounded-lg ${actor.bg} border border-[color:var(--c-bg-2d2b26)] flex items-center justify-center overflow-hidden`}
        >
          {entry.status === 'info' && entry.actor !== 'user' ? (
            <ThinkingOrb 
              state={entry.actor === 'planner' ? 'shaping' : entry.actor === 'reviewer' ? 'weaving' : 'composing'} 
              size={20} 
              theme="dark" 
              speed={entry.actor === 'implementer' ? 2.0 : 1.5} 
            />
          ) : (
            <actor.icon className={`w-3.5 h-3.5 ${actor.color} ${entry.status === 'success' ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : ''}`} />
          )}
        </div>
        <span className="text-xs font-medium text-[color:var(--c-fg-c4bfb6)]">{actor.label}</span>
        <span className="text-[10px] text-[color:var(--c-fg-5c5851)] font-mono">
          {new Date(entry.timestamp).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Card content */}
      <div className="synap-card overflow-hidden">
        {entry.title && (
          <div className="px-3.5 sm:px-4 py-2.5 text-xs font-medium text-[color:var(--c-fg-c4bfb6)] border-b border-[color:var(--c-bg-2d2b26)]/60 flex items-center justify-between bg-[color:var(--c-bg-141310)]">
            <span className="truncate pr-2">{entry.title}</span>
            {entry.steps && entry.steps.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-[color:var(--c-fg-5c5851)] hover:text-[color:var(--c-fg-8c867a)] transition-colors p-1 cursor-pointer"
                aria-label={expanded ? 'Recolher passos' : 'Expandir passos'}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}
          </div>
        )}

        {expanded && (
          <div className="p-3.5 sm:p-4 space-y-3">
            {/* Conteúdo textual */}
            {entry.content && (
              <p className="text-xs sm:text-sm text-[color:var(--c-fg-c4bfb6)] leading-relaxed whitespace-pre-wrap font-sans">
                {entry.content}
              </p>
            )}

            {/* Arquivos e Imagens anexados pelo usuário */}
            {((entry.images && entry.images.length > 0) ||
              (entry.documents && entry.documents.length > 0)) && (
              <div className="pt-2 border-t border-[color:var(--c-bg-23211c)]">
                <FileAttachmentPreviews
                  images={entry.images || []}
                  documents={entry.documents || []}
                  readOnly
                />
              </div>
            )}

            {/* Lista de passos (Plano do Planner) */}
            {entry.steps && entry.type === 'plan' && (
              <ol className="space-y-2 mt-2">
                {entry.steps.map((step) => (
                  <li
                    key={step.id}
                    className="flex items-start gap-2.5 text-xs sm:text-sm p-2 rounded-lg bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-26241e)]"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-mono font-bold flex-shrink-0 mt-0.5">
                      {step.index}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[color:var(--c-fg-f3efe6)] font-medium leading-snug">
                        {step.description}
                      </div>
                      {step.targetFile && (
                        <div className="text-[11px] text-[color:var(--c-fg-8c867a)] font-mono mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-[color:var(--c-bg-201e19)] text-emerald-400 text-[10px] uppercase font-bold">
                            {step.action}
                          </span>
                          <span className="truncate">{step.targetFile}</span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {/* Lista de passos (Progresso da Implementação) */}
            {entry.steps && entry.type === 'progress' && (
              <div className="space-y-2 mt-2">
                {entry.steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-2.5 text-xs sm:text-sm p-2.5 rounded-xl synap-card-subtle"
                  >
                    <span className="flex-shrink-0 mt-0.5">
                      {step.status === 'completed' ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : step.status === 'in_progress' ? (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center overflow-hidden">
                          <ThinkingOrb state="working" size={20} theme="dark" speed={1.5} />
                        </div>
                      ) : step.status === 'failed' ? (
                        <X className="w-4 h-4 text-rose-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[color:var(--c-bg-3b3831)]" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`leading-snug ${
                          step.status === 'completed'
                            ? 'text-[color:var(--c-fg-8c867a)] line-through'
                            : 'text-[color:var(--c-fg-f3efe6)] font-medium'
                        }`}
                      >
                        {step.description}
                      </div>
                      {step.result && (
                        <div className="text-[11px] text-[color:var(--c-fg-a39d93)] mt-1 font-mono">{step.result}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Observações do Revisor */}
            {entry.observations && entry.observations.length > 0 && (
              <div className="space-y-1.5 mt-2 pt-2 border-t border-[color:var(--c-bg-26241e)]">
                <div className="text-[11px] font-mono uppercase text-[color:var(--c-fg-8c867a)] tracking-wider mb-1">
                  Observações do Revisor
                </div>
                {entry.observations.map((obs, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs p-2 rounded bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-26241e)]"
                  >
                    {obs.type === 'warning' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    {obs.type === 'suggestion' && (
                      <Lightbulb className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    )}
                    {obs.type === 'risk' && (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    {obs.type === 'approval' && (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    <span className="text-[color:var(--c-fg-c4bfb6)] leading-relaxed">
                      {obs.step && (
                        <span className="font-mono text-emerald-400 mr-1.5 font-bold">
                          [Passo {obs.step}]
                        </span>
                      )}
                      {obs.message}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Ações interativas (ex: botões de Aprovar / Refazer / Cancelar) */}
            {entry.actions && entry.actions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[color:var(--c-bg-26241e)]">
                {entry.actions.map((act, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onAction(act)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm cursor-pointer ${
                      act.variant === 'primary'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                        : act.variant === 'danger'
                        ? 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40'
                        : 'bg-[color:var(--c-bg-201e19)] hover:bg-[color:var(--c-bg-2a2821)] text-[color:var(--c-fg-c4bfb6)] border border-[color:var(--c-bg-3b3831)]'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
