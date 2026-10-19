import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileText,
  ListTodo,
  FileCode,
  ExternalLink,
  Loader2,
  Terminal,
  RefreshCw,
  GitMerge,
  Layers,
  GitBranch,
  Zap,
  AlertTriangle,
  Globe,
  Download,
  Table,
  Brain,
  BookOpen,
  Bot,
  ChevronUp,
  Network,
  Sparkles,
} from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import { Message } from '../lib/types';
import { formatFileSize } from '../lib/utils';
import { CodeBlock } from './code-block';
import { SpeakButton } from './speak-button';
import { ClaudeLogo } from './claude-logo';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onViewDiff?: (path: string) => void;
  onOpenTerminal?: () => void;
  onOpenSourceControl?: () => void;
  onOpenGraph?: (focusFile?: string) => void;
  onApprovePlan?: () => void;
  onTogglePlanMode?: () => void;
  onApproveRemoteAction?: (messageId: string) => void;
  onRejectRemoteAction?: (messageId: string) => void;
}

const ChatImage: React.FC<{ src?: string; alt?: string }> = ({ src, alt }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 8;
  const INITIAL_DELAY = 1500;

  React.useEffect(() => {
    if (!src) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let attempt = 0;

    const tryLoad = () => {
      if (cancelled) return;
      attempt++;
      setRetryCount(attempt);
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setStatus('ready');
      };
      img.onerror = () => {
        if (cancelled) return;
        if (attempt >= MAX_RETRIES) {
          setStatus('error');
          return;
        }
        // Backoff exponencial: 1.5s, 2.5s, 4s, 6s, 9s, 13s, 18s, 24s = ~78s total
        const delay = Math.min(INITIAL_DELAY * Math.pow(1.6, attempt - 1), 25000);
        timeoutId = setTimeout(tryLoad, delay);
      };
      // Cache buster só no retry, não no primeiro
      const url = attempt === 1 ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${attempt}`;
      img.src = url;
    };

    setStatus('loading');
    setRetryCount(0);
    tryLoad();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [src]);

  const handleManualRetry = () => {
    setStatus('loading');
    setRetryCount(1);
    const url = `${src}${src?.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    if (url) {
      const img = new Image();
      img.onload = () => setStatus('ready');
      img.onerror = () => setStatus('error');
      img.src = url;
    }
  };

  if (!src) return null;

  return (
    <div className="my-3 flex flex-col items-start max-w-md w-full">
      <div className="relative w-full aspect-square max-w-[440px] rounded-2xl overflow-hidden border border-[color:var(--c-bg-3e392f)] bg-[color:var(--c-bg-1d1b18)] shadow-md group">
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 bg-[color:var(--c-bg-1d1b18)] z-10">
            <ThinkingOrb
              state="shaping"
              size={64}
              theme="dark"
              speed={1.5}
              aria-label="Criando a imagem…"
            />
            <span className="text-xs font-medium text-[color:var(--c-fg-f09a7d)] animate-pulse">
              Criando a imagem…
            </span>
            {retryCount > 1 && (
              <span className="text-[10px] text-[color:var(--c-fg-8c867a)]">
                Tentativa {retryCount} de {MAX_RETRIES}…
              </span>
            )}
          </div>
        )}

        {status === 'ready' && (
          <img
            src={src}
            alt={alt || 'Imagem gerada por IA'}
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover rounded-2xl transition-opacity duration-500 opacity-100 block"
          />
        )}

        {status === 'ready' && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-md p-1 rounded-xl z-20">
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              title="Abrir imagem em tamanho real"
              className="p-1.5 rounded-lg text-[color:var(--c-on-strong)]/80 hover:text-[color:var(--c-on-strong)] hover:bg-white/20 transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center gap-3 text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-2xl z-10">
            <span className="text-xs font-medium">A geração da imagem demorou mais do que o esperado.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRetry}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#d97757] hover:bg-[#c86646] text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar novamente</span>
              </button>
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] underline text-[color:var(--c-fg-d97757)] hover:text-[color:var(--c-fg-e08868)] p-1.5"
              >
                Ver link direto
              </a>
            </div>
          </div>
        )}
      </div>

      {alt && alt !== 'image' && !alt.startsWith('http') && status === 'ready' && (
        <span className="text-[11px] text-[color:var(--c-fg-8c867a)] mt-1.5 italic px-1 font-sans">
          {alt}
        </span>
      )}
    </div>
  );
};

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  isStreaming = false,
  onViewDiff,
  onOpenTerminal,
  onOpenSourceControl,
  onOpenGraph,
  onApprovePlan,
  onTogglePlanMode,
  onApproveRemoteAction,
  onRejectRemoteAction,
}) => {
  const isUser = message.role === 'user';
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTokenDetails, setShowTokenDetails] = useState(false);
  const [isToolsExpanded, setIsToolsExpanded] = useState(false);

  // Extract reasoning if formatted with <think>...</think> tags or message.reasoning
  let thinkingContent = message.reasoning || '';
  let displayContent = message.content;

  if (!thinkingContent && displayContent.includes('<think>')) {
    const thinkMatch = displayContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
    if (thinkMatch) {
      thinkingContent = thinkMatch[1].trim();
      displayContent = displayContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
    }
  }

  const runningTool = message.toolCalls?.find((tc) => tc.status === 'running');
  const waitingTool = message.toolCalls?.find(
    (tc) => tc.status === 'waiting' || tc.status === 'pending'
  );
  const hasRunningTool = Boolean(runningTool);
  const isEditingFile = runningTool?.name === 'edit_file' || runningTool?.name === 'patch_file';
  const isWebSearch = runningTool?.name === 'web_search' || runningTool?.name === 'search_web';

  // Normaliza markdown de imagens para evitar quebras de linha entre ![...] e (...)
  let cleanContent = displayContent.replace(
    /!\[([^\]]*)\]\s*\n+\s*\((https?:\/\/[^\s)]+)\)/g,
    '![$1]($2)'
  );

  // Remove tags de declaração [Habilidade: ...] do texto bruto (elas são renderizadas nas badges visuais)
  cleanContent = cleanContent.replace(/\[Habilidade(?:s)?(?:\s*Usada(?:s)?)?:\s*[^\]]+\]/gi, '').trimEnd();

  // Apenas considera que há conteúdo se houver texto real após trim (evita flicker com \n ou espaços)
  const hasRealContent = Boolean(cleanContent && cleanContent.trim().length > 0);

  // Quando ferramentas já foram acionadas e a IA está aguardando conclusão em segundo plano para dar o OK do serviço
  const isAwaitingCompletion =
    Boolean(waitingTool) ||
    (isStreaming &&
      !hasRealContent &&
      Boolean(message.toolCalls && message.toolCalls.length > 0) &&
      !hasRunningTool);

  const getToolActionLabel = (toolName?: string) => {
    if (toolName?.startsWith('mcp__context7__')) {
      return 'Consultando Context7…';
    }
    if (toolName?.startsWith('mcp__')) {
      return 'Consultando MCP…';
    }
    switch (toolName) {
      case 'query_code_graph':
      case 'query_architecture_graph':
        return 'Mapeando arquitetura…';
      case 'dispatch_subagent':
        return 'Subagente em ação…';
      case 'generate_document':
        return 'Compilando documento…';
      case 'save_memory':
        return 'Guardando na memória…';
      case 'forget_memory':
        return 'Atualizando memória…';
      case 'run_terminal_command':
      case 'terminal':
        return 'Executando comando…';
      case 'run_python':
        return 'Executando Python…';
      case 'web_search':
      case 'search_web':
        return 'Juntando as fontes…';
      case 'fetch_url':
        return 'Lendo página…';
      case 'patch_file':
        return 'Aplicando patch cirúrgico…';
      case 'edit_file':
        return 'Editando arquivo…';
      case 'read_file':
        return 'Lendo arquivo…';
      case 'list_files':
        return 'Listando arquivos…';
      case 'search_code':
        return 'Buscando código…';
      default:
        return 'Executando…';
    }
  };

  // Verifica se está na fase inicial de conexão antes do handshake HTTP 200 ou de receber tokens
  const isConnecting =
    isStreaming && !message.isConnected && !thinkingContent && !hasRealContent && !hasRunningTool;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div className="py-4 px-3 sm:px-6 w-full max-w-3xl mx-auto">
      {isUser ? (
        /* ================= USER MESSAGE (Claude warm card on right) ================= */
        <div className="flex flex-col items-end group">
          <div className="bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-3e3b34)] rounded-2xl px-4 py-2.5 max-w-[90%] sm:max-w-[80%] shadow-xs">
            {message.isPlanMode && (
              <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-[color:var(--c-bg-3e3b34)] text-[11px] font-mono font-medium text-[color:var(--c-fg-f09a7d)]">
                <ListTodo className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                <span>Modo Plano Ativado</span>
              </div>
            )}

            {/* Attached images for user */}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.images.map((img, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border border-[color:var(--c-bg-4a473f)]">
                    <img
                      src={img}
                      alt="Anexo"
                      className="max-h-48 max-w-full rounded-xl object-contain bg-black/40"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Attached documents for user */}
            {message.documents && message.documents.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-444038)] text-xs text-[color:var(--c-fg-f3efe6)]"
                  >
                    <FileText className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] flex-shrink-0" />
                    <span className="font-medium truncate max-w-[150px]">{doc.name}</span>
                    <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-mono">{formatFileSize(doc.size)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[15px] leading-relaxed break-words whitespace-pre-wrap font-sans">
              {displayContent}
            </div>
          </div>

          {/* User Message Action Bar (Copiar mensagem) */}
          {Boolean(displayContent && displayContent.trim().length > 0) && (
            <div
              className={`flex items-center gap-1 mt-1 mr-1 text-[color:var(--c-fg-8c867a)] transition-opacity duration-150 ${
                copied ? 'opacity-100' : 'opacity-80 sm:opacity-0 sm:group-hover:opacity-100'
              }`}
            >
              <button
                type="button"
                onClick={handleCopy}
                title="Copiar mensagem"
                aria-label="Copiar mensagem"
                className="px-2 py-1 rounded-lg hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)] transition-colors cursor-pointer flex items-center gap-1 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-400 font-medium">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copiar</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ================= CLAUDE / ASSISTANT RESPONSE (Editorial Document Style) ================= */
        <div className="flex flex-col items-start w-full">
          {/* Claude Icon / Header */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <ClaudeLogo className="w-5 h-5 text-[color:var(--c-fg-d97757)]" />
            <span className="font-serif text-sm font-medium text-[color:var(--c-fg-c4bfb6)]">Éden</span>
            {hasRunningTool ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#d97757]/15 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/30 shadow-2xs">
                <ThinkingOrb
                  state={isWebSearch ? 'weaving' : 'composing'}
                  size={20}
                  theme="dark"
                  speed={1.5}
                  aria-label={
                    isWebSearch
                      ? 'Juntando as fontes…'
                      : 'Executando…'
                  }
                />
                <span>{isWebSearch ? 'Pesquisando' : 'Executando'}</span>
                <span className="px-1.5 py-0.2 rounded bg-[#d97757]/25 text-[color:var(--c-fg-f3efe6)] text-[9px] border border-[#d97757]/40">
                  {isEditingFile
                    ? 'Editando arquivo…'
                    : isWebSearch
                    ? 'Juntando as fontes…'
                    : getToolActionLabel(runningTool?.name)}
                </span>
              </span>
            ) : isAwaitingCompletion ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#d97757]/15 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/30 shadow-2xs">
                <ThinkingOrb state="working" size={20} theme="dark" speed={1.5} aria-label="Aguardando…" />
                <span>Aguardando</span>
                <span className="px-1.5 py-0.2 rounded bg-[#d97757]/25 text-[color:var(--c-fg-f3efe6)] text-[9px] border border-[#d97757]/40">
                  Concluindo serviço…
                </span>
              </span>
            ) : isConnecting ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#d97757]/15 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/30 shadow-2xs">
                <ThinkingOrb state="working" size={20} theme="dark" speed={1.5} aria-label="Conectando…" />
                <span>Conectando…</span>
              </span>
            ) : isStreaming ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#d97757]/15 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/30 shadow-2xs">
                <ThinkingOrb state="working" size={20} theme="dark" speed={1.5} aria-label="Pensando…" />
                <span>Pensando…</span>
              </span>
            ) : null}
            {message.isPlanMode && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-[#d97757]/15 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/30 shadow-xs">
                <ListTodo className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                <span>Plano Estratégico</span>
              </span>
            )}
          </div>

          {/* Thinking Process Accordion (Dynamic label reflecting selected mode: low / high / max) */}
          {thinkingContent && (
            <div className="w-full mb-3.5 synap-card overflow-hidden backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setShowReasoning(!showReasoning)}
                className="w-full px-3.5 py-2.5 min-h-[42px] flex items-center justify-between text-xs text-zinc-700 dark:text-[color:var(--c-fg-a39d93)] hover:text-zinc-950 dark:hover:text-[color:var(--c-fg-f3efe6)] hover:bg-zinc-100/70 dark:hover:bg-[color:var(--c-bg-2c2925)]/80 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2 font-mono flex-wrap">
                  {showReasoning ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[#d97757] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[#d97757] flex-shrink-0" />
                  )}
                  <span className="font-medium text-zinc-900 dark:text-[color:var(--c-fg-c4bfb6)]">
                    {message.reasoningEffort === 'low'
                      ? 'Pensamento rápido'
                      : message.reasoningEffort === 'high'
                      ? 'Pensamento aprofundado'
                      : message.reasoningEffort === 'max'
                      ? 'Pensamento estendido'
                      : 'Processo de raciocínio'}
                  </span>

                  {/* Mode Pill Badge */}
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase font-bold border ${
                      message.reasoningEffort === 'max'
                        ? 'bg-[#d97757]/20 text-[#a34423] dark:text-[color:var(--c-fg-f09a7d)] border-[#d97757]/40'
                        : message.reasoningEffort === 'high'
                        ? 'bg-amber-100/90 dark:bg-[color:var(--c-bg-38332a)] text-amber-900 dark:text-[color:var(--c-fg-e0a96d)] border-amber-300 dark:border-[color:var(--c-bg-4d4536)]'
                        : 'bg-zinc-200/80 dark:bg-[color:var(--c-bg-292723)] text-zinc-800 dark:text-[color:var(--c-fg-a8a296)] border-zinc-300/80 dark:border-[color:var(--c-bg-3d3a33)]'
                    }`}
                  >
                    {message.reasoningEffort ? `Modo ${message.reasoningEffort}` : 'Raciocínio'}
                  </span>

                  {message.isPlanMode && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-[#d97757]/20 text-[#a34423] dark:text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/30 font-medium">
                      <ListTodo className="w-2.5 h-2.5 text-[#d97757]" />
                      Modo Plano
                    </span>
                  )}

                  <span className="text-[11px] text-zinc-600 dark:text-[color:var(--c-fg-736e65)]">
                    ({thinkingContent.length.toLocaleString()} caracteres)
                  </span>
                </span>
                <span className="text-[10px] text-zinc-600 dark:text-[color:var(--c-fg-736e65)] font-mono font-medium flex-shrink-0 ml-2 hover:underline">
                  {showReasoning ? 'Ocultar' : 'Ver processo'}
                </span>
              </button>

              {showReasoning && (
                <div className="px-3.5 py-2.5 text-xs text-zinc-800 dark:text-[color:var(--c-fg-b8b2a5)] font-mono border-t border-zinc-200 dark:border-[color:var(--c-bg-312f2a)] bg-zinc-50/80 dark:bg-[color:var(--c-bg-1d1b18)] leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {thinkingContent}
                </div>
              )}
            </div>
          )}

          {/* Tool Calls Execution Status - 1 orb (último running) + ferramentas concluídas agrupadas */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="w-full mb-3 space-y-2">
              {(() => {
                const all = message.toolCalls || [];
                const running = all.filter(tc => tc.status === 'running');
                const waiting = all.filter(tc => tc.status === 'waiting' || tc.status === 'pending');
                const activeRunning = running.length > 0 ? running[running.length - 1] : null;

                const isChipTool = (tc: any) => {
                  if (tc.name === 'run_terminal_command' || tc.name === 'terminal') return false;
                  if (tc.name === 'run_python') return false;
                  if (tc.name === 'generate_document') return false;
                  if (tc.name === 'save_memory' || tc.name === 'forget_memory') return false;
                  if (tc.name === 'dispatch_subagent') return false;
                  if (tc.name === 'query_code_graph' || tc.name === 'query_architecture_graph') return false;
                  return true;
                };

                const completedTools = all.filter(tc => tc.status !== 'running' && tc.status !== 'waiting' && tc.status !== 'pending');
                const completedChipTools = completedTools.filter(isChipTool);
                const completedRichTools = completedTools.filter(tc => !isChipTool(tc));

                const renderToolItem = (tc: any) => {
                  let parsedArgs: any = {};
                try {
                  parsedArgs = JSON.parse(tc.arguments || '{}');
                } catch {}
                const targetParam = parsedArgs.filename || parsedArgs.code || parsedArgs.url || parsedArgs.path || parsedArgs.query || parsedArgs.prompt || '';

                if (tc.status === 'running') {
                  const isThisWebSearch = tc.name === 'web_search' || tc.name === 'search_web';
                  const isThisFetchUrl = tc.name === 'fetch_url';
                  const isThisPython = tc.name === 'run_python';
                  const isThisDocGen = tc.name === 'generate_document';
                  const isThisMemory = tc.name === 'save_memory' || tc.name === 'forget_memory';
                  const isThisSubagent = tc.name === 'dispatch_subagent';
                  const isThisGraph = tc.name === 'query_code_graph' || tc.name === 'query_architecture_graph';
                  const orbState = isThisWebSearch || isThisFetchUrl || isThisMemory || isThisSubagent || isThisGraph
                    ? 'weaving'
                    : 'composing';
                  const orbLabel = isThisGraph
                    ? 'Mapeando arquitetura…'
                    : isThisMemory
                    ? (tc.name === 'save_memory' ? 'Guardando na memória…' : 'Atualizando memória…')
                    : isThisDocGen
                    ? 'Compilando documento…'
                    : isThisPython
                    ? 'Executando Python…'
                    : isThisFetchUrl
                    ? 'Lendo página…'
                    : isThisWebSearch
                    ? 'Juntando as fontes…'
                    : 'Executando…';
                  const actionTitle = isThisGraph
                    ? 'Mapeando Arquitetura do Projeto'
                    : isThisSubagent
                    ? (parsedArgs.role ? `Subagente: ${parsedArgs.role}` : 'Subagente em Ação')
                    : isThisMemory
                    ? (tc.name === 'save_memory' ? 'Salvando na Memória' : 'Atualizando Memória')
                    : isThisDocGen
                    ? 'Compilando Documento'
                    : isThisPython
                    ? 'Executando Python 3'
                    : isThisFetchUrl
                    ? 'Lendo Página Web'
                    : isThisWebSearch
                    ? 'Pesquisando na Internet'
                    : 'Executando';
                  const actionBadge = isThisGraph
                    ? 'Graphify (GraphRAG)'
                    : isThisSubagent
                    ? 'Orquestração Paralela'
                    : isThisDocGen
                    ? `${parsedArgs.type ? parsedArgs.type.toUpperCase() : 'Office'} Engine`
                    : isThisPython
                    ? 'WebAssembly Engine'
                    : isThisFetchUrl
                    ? 'Extraindo conteúdo…'
                    : isThisWebSearch
                    ? 'Juntando as fontes…'
                    : tc.name === 'patch_file'
                    ? 'Aplicando patch cirúrgico…'
                    : tc.name === 'edit_file'
                    ? 'Editando arquivo…'
                    : getToolActionLabel(tc.name);
                  const actionDescription = isThisSubagent
                    ? (parsedArgs.task || 'Executando subtarefa autônoma em segundo plano…')
                    : isThisDocGen
                    ? 'Compilando arquivo binário e preparando link para download no navegador…'
                    : isThisPython
                    ? 'Executando script no navegador via Pyodide sem travar a interface…'
                    : isThisFetchUrl
                    ? 'Baixando e higienizando texto do artigo ou documentação…'
                    : isThisWebSearch
                    ? 'Consultando a web e cruzando informações de fontes confiáveis'
                    : tc.name === 'patch_file' || tc.name === 'edit_file'
                    ? 'Alteração em andamento — pronta para revisão no Source Control'
                    : 'Consultando repositório GitHub…';

                  return (
                    <div
                      key={tc.id}
                      className="flex items-center gap-3.5 p-3 synap-card border-[#d97757]/40"
                    >
                      <ThinkingOrb
                        state={orbState}
                        size={64}
                        theme="dark"
                        speed={1.5}
                        aria-label={orbLabel}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)]">
                            {actionTitle}
                          </span>
                          <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-md bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/35">
                            {actionBadge}
                          </span>
                        </div>
                        {targetParam && (
                          <span className="text-[11px] text-[color:var(--c-fg-f09a7d)] font-mono mt-0.5 truncate max-w-[260px] sm:max-w-[420px]">
                            {isThisWebSearch ? `"${targetParam}"` : targetParam}
                          </span>
                        )}
                        <span className="text-[10px] text-[color:var(--c-fg-8c867a)] mt-1 font-sans">
                          {actionDescription}
                        </span>
                      </div>
                    </div>
                  );
                }

                if (tc.status === 'waiting' || tc.status === 'pending') {
                  return (
                    <div
                      key={tc.id}
                      className="flex items-center gap-3.5 p-3 synap-card border-[#d97757]/40"
                    >
                      <ThinkingOrb
                        state="working"
                        size={64}
                        theme="dark"
                        speed={1.5}
                        aria-label="Aguardando…"
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)]">
                            Aguardando
                          </span>
                          <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-md bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/35">
                            Aguardando conclusão…
                          </span>
                        </div>
                        {targetParam && (
                          <span className="text-[11px] text-[color:var(--c-fg-f09a7d)] font-mono mt-0.5 truncate max-w-[260px] sm:max-w-[420px]">
                            {targetParam}
                          </span>
                        )}
                        <span className="text-[10px] text-[color:var(--c-fg-8c867a)] mt-1 font-sans">
                          Aguardando ferramenta em segundo plano para confirmar o serviço concluído…
                        </span>
                      </div>
                    </div>
                  );
                }

                if (tc.name === 'run_terminal_command' || tc.name === 'terminal') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = tc.result ? JSON.parse(tc.result) : null;
                  } catch {}

                  const cmd = targetParam || parsedResult?.command || 'comando';
                  const stdout = parsedResult?.stdout || '';
                  const stderr = parsedResult?.stderr || parsedResult?.error || '';
                  const exitCode = parsedResult?.exitCode ?? (tc.status === 'error' ? 1 : 0);

                  return (
                    <div
                      key={tc.id}
                      className="synap-card overflow-hidden my-2 font-mono text-xs w-full"
                    >
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[color:var(--c-bg-1f1d19)] border-b border-[color:var(--c-bg-2d2a23)]">
                        <div className="flex items-center gap-2 truncate">
                          <Terminal className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
                          <span className="text-[color:var(--c-fg-d97757)] font-bold select-none">$</span>
                          <span className="text-[color:var(--c-fg-f3efe6)] font-semibold truncate">{cmd}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {exitCode === 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              exit 0
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              exit {exitCode}
                            </span>
                          )}
                          {onOpenTerminal && (
                            <button
                              type="button"
                              onClick={onOpenTerminal}
                              title="Abrir no Terminal interativo"
                              className="text-[10px] text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f09a7d)] px-2 py-0.5 rounded bg-[color:var(--c-bg-292620)] hover:bg-[color:var(--c-bg-343028)] transition cursor-pointer"
                            >
                              Abrir Terminal
                            </button>
                          )}
                        </div>
                      </div>

                      {(stdout || stderr) && (
                        <div className="p-3 max-h-56 overflow-y-auto space-y-1.5 text-[11px] leading-relaxed bg-[color:var(--c-bg-11100d)]">
                          {stdout && (
                            <pre className="text-[color:var(--c-fg-d8d3c9)] whitespace-pre-wrap break-words">
                              {stdout}
                            </pre>
                          )}
                          {stderr && (
                            <pre className="text-rose-300 bg-rose-950/20 p-2 rounded border border-rose-900/30 whitespace-pre-wrap break-words">
                              {stderr}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                if (tc.name === 'fetch_url') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = JSON.parse(tc.result || '{}');
                  } catch {}
                  const pageTitle = parsedResult?.title || '';
                  const isTruncated = parsedResult?.truncated;
                  return (
                    <div
                      key={tc.id}
                      className="flex items-center gap-2 px-3.5 py-2 synap-card text-xs font-mono text-[color:var(--c-fg-c4bfb6)] my-1.5"
                    >
                      {tc.status === 'error' ? (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                      <span className="font-semibold text-[color:var(--c-fg-f3efe6)]">
                        {pageTitle ? `Página: ${pageTitle}` : 'fetch_url'}
                      </span>
                      {targetParam && (
                        <span className="text-[color:var(--c-fg-a39d93)] truncate max-w-[220px] sm:max-w-[360px]" title={targetParam}>
                          ({targetParam})
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[color:var(--c-fg-787268)] shrink-0 font-sans">
                        {tc.status === 'error' ? 'falhou' : isTruncated ? 'lida (truncada)' : 'lida com sucesso'}
                      </span>
                    </div>
                  );
                }

                if (tc.name === 'run_python') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = JSON.parse(tc.result || '{}');
                  } catch {}
                  const codeContent = parsedResult?.code || parsedArgs?.code || '';
                  const stdout = parsedResult?.stdout || '';
                  const stderr = parsedResult?.stderr || parsedResult?.error || '';
                  const executionTimeMs = parsedResult?.executionTimeMs;
                  const isSuccess = parsedResult?.success !== false && !parsedResult?.error;

                  return (
                    <div
                      key={tc.id}
                      className="synap-card overflow-hidden my-2 font-mono text-xs w-full"
                    >
                      <div className="flex items-center justify-between px-3 py-2 bg-[color:var(--c-bg-1f1d19)] border-b border-[color:var(--c-bg-2d2a23)]">
                        <div className="flex items-center gap-2 truncate">
                          <Terminal className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-[color:var(--c-fg-f3efe6)] font-semibold">Python 3 (WASM)</span>
                          {executionTimeMs !== undefined && (
                            <span className="text-[10px] text-[color:var(--c-fg-8c867a)]">
                              ({executionTimeMs}ms)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isSuccess ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              sucesso
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              erro
                            </span>
                          )}
                        </div>
                      </div>

                      {codeContent && (
                        <div className="p-3 bg-[color:var(--c-bg-171612)] border-b border-[color:var(--c-bg-24211a)] max-h-40 overflow-y-auto">
                          <pre className="text-[color:var(--c-fg-e2dcce)] whitespace-pre-wrap break-words leading-relaxed">
                            {codeContent}
                          </pre>
                        </div>
                      )}

                      {(stdout || stderr) && (
                        <div className="p-3 max-h-56 overflow-y-auto space-y-1.5 text-[11px] leading-relaxed bg-[color:var(--c-bg-11100d)]">
                          {stdout && (
                            <pre className="text-emerald-300 whitespace-pre-wrap break-words">
                              {stdout}
                            </pre>
                          )}
                          {stderr && (
                            <pre className="text-rose-300 bg-rose-950/20 p-2 rounded border border-rose-900/30 whitespace-pre-wrap break-words">
                              {stderr}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                if (tc.name === 'generate_document') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = JSON.parse(tc.result || '{}');
                  } catch {}
                  const docType: string = parsedResult?.type || parsedArgs?.type || 'pdf';
                  const filename: string = parsedResult?.filename || parsedArgs?.filename || 'documento';
                  const title: string = parsedResult?.title || parsedArgs?.title || filename;
                  const sizeBytes: number = parsedResult?.sizeBytes || 0;
                  const downloadUrl: string = parsedResult?.url || '';
                  const hasError = tc.status === 'error' || Boolean(parsedResult?.error);

                  // Estilos e ícones por formato
                  let badgeBg = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
                  let iconElement = <FileText className="w-5 h-5 text-rose-400 shrink-0" />;
                  let typeLabel = 'PDF';

                  if (docType === 'excel') {
                    badgeBg = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                    iconElement = <Table className="w-5 h-5 text-emerald-400 shrink-0" />;
                    typeLabel = 'Excel';
                  } else if (docType === 'docx') {
                    badgeBg = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
                    iconElement = <FileText className="w-5 h-5 text-sky-400 shrink-0" />;
                    typeLabel = 'Word';
                  } else if (docType === 'pptx') {
                    badgeBg = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                    iconElement = <Layers className="w-5 h-5 text-amber-400 shrink-0" />;
                    typeLabel = 'PowerPoint';
                  }

                  return (
                    <div
                      key={tc.id}
                      className="rounded-2xl p-3.5 my-2.5 bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3e392f)] shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-2d2a23)]">
                          {iconElement}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                              {title}
                            </span>
                            <span className={`text-[10px] font-sans font-bold px-1.5 py-0.5 rounded border ${badgeBg}`}>
                              {typeLabel}
                            </span>
                          </div>
                          <span className="text-[11px] text-[color:var(--c-fg-a39d93)] font-mono mt-0.5 truncate">
                            {filename} {sizeBytes > 0 && `• ${formatFileSize(sizeBytes)}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {downloadUrl && !hasError ? (
                          <a
                            href={downloadUrl}
                            download={filename}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#d97757] hover:bg-[#c26547] text-white text-xs font-semibold transition shadow-xs cursor-pointer select-none"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Baixar Arquivo</span>
                          </a>
                        ) : hasError ? (
                          <span className="text-[11px] text-rose-400 font-mono">
                            Falha na geração
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                if (tc.name === 'save_memory') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = JSON.parse(tc.result || '{}');
                  } catch {}
                  const factText: string = parsedResult?.fact || parsedArgs?.fact || '';
                  const category: string = parsedResult?.category || parsedArgs?.category || 'general';
                  const memId: string = parsedResult?.id || '';

                  return (
                    <div
                      key={tc.id}
                      className="rounded-2xl p-3 my-2 bg-[color:var(--c-bg-1b1e24)] border border-sky-500/30 shadow-xs flex items-center justify-between gap-3 w-full"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
                          <Brain className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold text-sky-200">
                              Memória Retida
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold uppercase">
                              {category}
                            </span>
                            {memId && (
                              <span className="text-[10px] text-[color:var(--c-fg-6b655b)] font-mono">
                                {memId}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[color:var(--c-fg-dcd7cb)] leading-snug truncate max-w-xl">
                            {factText}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Check className="w-3 h-3" />
                        <span>Salvo</span>
                      </div>
                    </div>
                  );
                }

                if (tc.name === 'forget_memory') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = JSON.parse(tc.result || '{}');
                  } catch {}
                  const instruction: string = parsedResult?.instruction || 'Memória atualizada.';

                  return (
                    <div
                      key={tc.id}
                      className="rounded-2xl p-3 my-2 bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3e392f)] shadow-xs flex items-center justify-between gap-3 w-full"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-2d2a23)] text-amber-400 shrink-0">
                          <Brain className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] font-semibold text-[color:var(--c-fg-f3efe6)]">
                            Memória Atualizada
                          </span>
                          <p className="text-xs text-[color:var(--c-fg-8c867a)] leading-snug">
                            {instruction}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] text-zinc-500 font-mono">
                        forget_memory
                      </div>
                    </div>
                  );
                }

                if (tc.name === 'dispatch_subagent') {
                  let parsedResult: any = null;
                  try {
                    parsedResult = tc.result ? JSON.parse(tc.result) : null;
                  } catch {}

                  const role = parsedResult?.role || parsedArgs?.role || 'Subagente';
                  const task = parsedResult?.task || parsedArgs?.task || 'Subtarefa em execução';
                  const report = parsedResult?.report || (typeof tc.result === 'string' && !parsedResult?.status ? tc.result : '');
                  const reasoning = parsedResult?.reasoning;
                  const durationMs = parsedResult?.durationMs;
                  const isError = tc.status === 'error' || parsedResult?.status === 'error';

                  return (
                    <div
                      key={tc.id}
                      className="rounded-2xl my-2 synap-card overflow-hidden border border-emerald-500/25 bg-[color:var(--c-bg-1c211f)] shadow-xs"
                    >
                      <div className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            {isError ? (
                              <AlertTriangle className="w-4 h-4 text-rose-400" />
                            ) : (
                              <Bot className="w-4 h-4 text-emerald-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                                Subagente: {role}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                                  isError
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {isError ? 'Falhou' : 'Concluído'}
                              </span>
                              {durationMs && (
                                <span className="text-[10px] text-zinc-500 font-mono">
                                  {(durationMs / 1000).toFixed(1)}s
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[color:var(--c-fg-8c867a)] truncate max-w-lg mt-0.5" title={task}>
                              {task}
                            </p>
                          </div>
                        </div>

                        {report && (
                          <button
                            type="button"
                            onClick={() => {
                              const el = document.getElementById(`subagent-report-${tc.id}`);
                              if (el) {
                                el.classList.toggle('hidden');
                              }
                            }}
                            className="shrink-0 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer font-medium"
                          >
                            <span>Relatório</span>
                          </button>
                        )}
                      </div>

                      {report && (
                        <div
                          id={`subagent-report-${tc.id}`}
                          className="hidden p-3.5 text-xs text-[color:var(--c-fg-d8d3c9)] border-t border-emerald-500/20 bg-[color:var(--c-bg-141816)] leading-relaxed space-y-2"
                        >
                          {reasoning && (
                            <div className="text-[11px] text-zinc-400 font-mono italic border-l-2 border-emerald-500/40 pl-2 mb-2">
                              {reasoning}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap font-sans">
                            {report}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                if (tc.name.startsWith('mcp__')) {
                  const parts = tc.name.split('__');
                  const serverId = parts[1];
                  const toolName = parts.slice(2).join('__');
                  const isContext7 = serverId === 'context7';

                  return (
                    <div
                      key={tc.id}
                      className="flex items-center gap-2 px-3.5 py-2 synap-card text-xs font-mono text-[color:var(--c-fg-c4bfb6)] my-1.5"
                    >
                      {tc.status === 'error' ? (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      ) : (
                        <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="font-semibold text-[color:var(--c-fg-f3efe6)]">
                        {isContext7 ? `Context7 (${toolName})` : `MCP: ${toolName}`}
                      </span>
                      {targetParam && (
                        <span className="text-[color:var(--c-fg-a39d93)] truncate max-w-[220px] sm:max-w-[360px]" title={targetParam}>
                          ({targetParam})
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-[color:var(--c-fg-787268)] shrink-0 font-sans">
                        {tc.status === 'error' ? 'falhou' : 'documentação consultada'}
                      </span>
                    </div>
                  );
                }

                if (tc.name === 'query_code_graph' || tc.name === 'query_architecture_graph') {
                  return (
                    <div
                      key={tc.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 synap-card border-emerald-500/30 bg-[color:var(--c-bg-1c211f)] text-xs text-[color:var(--c-fg-c4bfb6)] my-1.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <Network className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              Graphify (Contexto de Arquitetura)
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                              GraphRAG
                            </span>
                          </div>
                          {targetParam && (
                            <span className="text-[11px] text-[color:var(--c-fg-8c867a)] font-mono truncate block">
                              Consulta: {targetParam}
                            </span>
                          )}
                        </div>
                      </div>

                      {onOpenGraph && (
                        <button
                          type="button"
                          onClick={() => onOpenGraph(parsedArgs?.focus_file || parsedArgs?.query)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <Network className="w-3 h-3" />
                          <span>Abrir Mapa</span>
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={tc.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[color:var(--c-bg-24211d)] border border-[color:var(--c-bg-383329)] text-xs font-mono text-[color:var(--c-fg-c4bfb6)] shadow-2xs"
                  >
                    {tc.status === 'error' ? (
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="font-semibold text-[color:var(--c-fg-f3efe6)]">{tc.name}</span>
                    {targetParam && (
                      <span className="text-[color:var(--c-fg-a39d93)] truncate max-w-[260px] sm:max-w-[400px]">
                        {targetParam}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-[color:var(--c-fg-787268)] shrink-0 font-sans">
                      {tc.status === 'error' ? 'falhou' : 'concluído'}
                    </span>
                  </div>
                  );
                };

                return (
                  <>
                    {/* Tool ativa em execução com orb animado */}
                    {activeRunning && renderToolItem(activeRunning)}

                    {/* Tools aguardando confirmação em segundo plano */}
                    {waiting.map((tc) => renderToolItem(tc))}

                    {/* Ferramentas ricas concluídas (terminal, python, doc, memória, subagente, grafo) */}
                    {completedRichTools.map((tc) => renderToolItem(tc))}

                    {/* Ferramentas concluídas agrupadas (list_files, read_file, edit_file, etc.) */}
                    {completedChipTools.length > 0 && (
                      <div className="w-full space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setIsToolsExpanded((prev) => !prev)}
                          className="w-full rounded-xl bg-[color:var(--c-bg-201e1a)] hover:bg-[color:var(--c-bg-27241f)] border border-[color:var(--c-bg-383329)] transition-colors p-2.5 text-xs select-none cursor-pointer flex items-center justify-between gap-2.5 shadow-2xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                              {completedChipTools.length === 1
                                ? '1 ferramenta executada'
                                : `${completedChipTools.length} ferramentas executadas`}
                            </span>
                            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                              {Array.from(new Set(completedChipTools.map((t) => t.name))).map((toolName) => (
                                <span
                                  key={toolName}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[color:var(--c-bg-27241f)] text-[color:var(--c-fg-a39d93)] border border-[color:var(--c-bg-3e392f)]"
                                >
                                  {toolName}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--c-fg-8c867a)] group-hover:text-[color:var(--c-fg-f3efe6)] transition shrink-0 ml-auto">
                            <span>{isToolsExpanded ? 'Recolher' : 'Expandir'}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                isToolsExpanded ? 'rotate-180 text-[color:var(--c-fg-d97757)]' : ''
                              }`}
                            />
                          </div>
                        </button>

                        {isToolsExpanded && (
                          <div className="space-y-1.5 pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                            {completedChipTools.map((tc) => renderToolItem(tc))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Habilidades Aplicadas pela IA */}
          {(() => {
            let skillsToDisplay: string[] = message.usedSkills || [];
            if (skillsToDisplay.length === 0 && message.content) {
              const regex = /\[Habilidade(?:s)?(?:\s*Usada(?:s)?)?:\s*([^\]]+)\]/gi;
              let match: RegExpExecArray | null;
              const set = new Set<string>();
              while ((match = regex.exec(message.content)) !== null) {
                match[1].split(/[,;e]/).forEach((n) => {
                  const c = n.trim();
                  if (c) set.add(c);
                });
              }
              skillsToDisplay = Array.from(set);
            }

            if (skillsToDisplay.length === 0) return null;

            return (
              <div className="flex flex-wrap items-center gap-1.5 my-2.5">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-amber-200 text-[11px]">
                    Habilidade(s) Aplicada(s):
                  </span>
                  <div className="flex flex-wrap items-center gap-1 ml-0.5">
                    {skillsToDisplay.map((skill, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/30 text-amber-100"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Edited Files Cards / Batch Refactoring Card */}
          {message.editedFiles && message.editedFiles.length > 0 && (
            <div className="w-full mb-3 space-y-2">
              {/* If multiple files were edited or batchRefactor is present: Show prominent Batch Refactor Card */}
              {(message.batchRefactor || message.editedFiles.length >= 2) ? (
                <div className="synap-card overflow-hidden">
                  {/* Card Header */}
                  <div className="p-3.5 bg-[color:var(--c-bg-27241f)] border-b border-[color:var(--c-bg-3b362b)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[#d97757]/20 border border-[#d97757]/40 flex items-center justify-center text-[color:var(--c-fg-f09a7d)] shrink-0">
                        <Layers className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                            {message.batchRefactor?.summary || 'Refatoração Multi-arquivo'}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40 shrink-0">
                            {message.editedFiles.length} arquivos
                          </span>
                        </div>
                        <p className="text-[11px] text-[color:var(--c-fg-8c867a)] mt-0.5 truncate">
                          Alterações aplicadas e sincronizadas no Source Control
                        </p>
                      </div>
                    </div>

                    {onOpenSourceControl && (
                      <button
                        type="button"
                        onClick={onOpenSourceControl}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#d97757] hover:bg-[#c26647] text-white text-xs font-medium transition cursor-pointer shrink-0 shadow-xs active:scale-[0.98]"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Revisar no Source Control</span>
                        <span className="sm:hidden">Revisar</span>
                      </button>
                    )}
                  </div>

                  {/* Files List in Batch */}
                  <div className="divide-y divide-[color:var(--c-bg-2d2a23)]">
                    {message.editedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 px-3.5 hover:bg-[color:var(--c-bg-25221d)] transition flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                              file.type === 'modified'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : file.type === 'added'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {file.type === 'modified' ? 'Modificado' : file.type === 'added' ? 'Novo' : 'Excluído'}
                          </span>
                          <span className="text-[color:var(--c-fg-f3efe6)] font-mono text-xs truncate">
                            {file.path}
                          </span>
                        </div>

                        {onViewDiff && (
                          <button
                            type="button"
                            onClick={() => onViewDiff(file.path)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[color:var(--c-bg-2e2a22)] hover:bg-[color:var(--c-bg-3d372c)] text-[color:var(--c-fg-d8d3c9)] hover:text-[color:var(--c-on-strong)] text-[11px] font-medium border border-[color:var(--c-bg-3e382d)] transition cursor-pointer shrink-0"
                          >
                            <span>Diff</span>
                            <ExternalLink className="w-3 h-3 text-[color:var(--c-fg-d97757)]" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Single file card fallback */
                message.editedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 synap-card flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2e2a22)] flex items-center justify-center text-[color:var(--c-fg-d97757)] shrink-0">
                        <FileCode className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[color:var(--c-fg-f3efe6)] font-mono font-medium truncate">
                            {file.path}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                              file.type === 'modified'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : file.type === 'added'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {file.type === 'modified' ? 'Editado' : file.type === 'added' ? 'Criado' : 'Removido'}
                          </span>
                        </div>
                        <p className="text-[10px] text-[color:var(--c-fg-8c867a)] mt-0.5">
                          Alteração pronta para revisão no Source Control
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {onViewDiff && (
                        <button
                          type="button"
                          onClick={() => onViewDiff(file.path)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--c-bg-2f2b23)] hover:bg-[color:var(--c-bg-3d372c)] text-[color:var(--c-fg-f3efe6)] text-xs font-medium border border-[color:var(--c-bg-484133)] transition cursor-pointer shadow-xs"
                        >
                          <span>Ver diff</span>
                          <ExternalLink className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {message.fallbackWarning && (
            <div className="flex items-start gap-2.5 p-3 my-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">Fallback Acionado</span>
                <span className="text-xs opacity-80 leading-relaxed mt-0.5">{message.fallbackWarning}</span>
              </div>
            </div>
          )}

          {/* Assistant Rendered Markdown */}
          <div className="w-full prose prose-invert max-w-none text-[15px] sm:text-[16px] text-[color:var(--c-fg-f3efe6)] leading-relaxed break-words font-sans">
            {hasRealContent ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match && !String(children).includes('\n');
                    if (isInline) {
                      return (
                        <code
                          className="bg-[color:var(--c-bg-2a2824)] text-[color:var(--c-fg-f09a7d)] px-1.5 py-0.5 rounded-md text-[13px] font-mono border border-[color:var(--c-bg-3b3831)]"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <CodeBlock
                        language={match ? match[1] : 'text'}
                        value={String(children).replace(/\n$/, '')}
                      />
                    );
                  },
                  table({ children }) {
                    return (
                      <div className="my-3 overflow-x-auto rounded-xl border border-[color:var(--c-bg-3b3831)]">
                        <table className="min-w-full divide-y divide-[color:var(--c-bg-3b3831)] text-left text-sm">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="bg-[color:var(--c-bg-24221e)] px-4 py-2 font-semibold text-[color:var(--c-fg-f3efe6)]">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="px-4 py-2 text-[color:var(--c-fg-d1cbc0)] border-t border-[color:var(--c-bg-312f2a)]">
                        {children}
                      </td>
                    );
                  },
                  p({ children }) {
                    return <div className="my-2.5 leading-relaxed">{children}</div>;
                  },
                  img({ src, alt }) {
                    return <ChatImage src={src} alt={alt} />;
                  },
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--c-fg-d97757)] hover:text-[color:var(--c-fg-f09a7d)] underline underline-offset-2"
                      >
                        {children}
                      </a>
                    );
                  },
                  ul({ children }) {
                    return <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>;
                  },
                }}
              >
                {cleanContent}
              </ReactMarkdown>
            ) : isStreaming && !hasRunningTool ? (
              <div className="flex flex-col items-start gap-3 py-3 my-1">
                <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-[color:var(--c-bg-24211d)] border border-[color:var(--c-bg-3a352a)] shadow-xs">
                  <ThinkingOrb
                    state="working"
                    size={64}
                    theme="dark"
                    speed={1.5}
                    aria-label={
                      isAwaitingCompletion
                        ? 'Aguardando…'
                        : isConnecting
                        ? 'Conectando…'
                        : 'Pensando…'
                    }
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] flex items-center gap-1.5 font-sans">
                      <span>
                        {isAwaitingCompletion
                          ? 'Aguardando…'
                          : isConnecting
                          ? 'Conectando…'
                          : 'Pensando…'}
                      </span>
                      <span className="inline-flex gap-1 text-[color:var(--c-fg-d97757)]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#d97757] animate-pulse" />
                      </span>
                    </span>
                    <span className="text-[11px] text-[color:var(--c-fg-9c9589)] font-mono mt-0.5">
                      {isAwaitingCompletion
                        ? 'Aguardando ferramenta em segundo plano para confirmar o serviço concluído…'
                        : isConnecting
                        ? 'Estabelecendo conexão com o modelo de IA…'
                        : thinkingContent
                        ? `Processando raciocínio (${thinkingContent.length.toLocaleString()} caracteres)`
                        : message.isPlanMode
                        ? 'Estruturando plano de ação detalhado'
                        : 'Analisando contexto e gerando resposta'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {hasRealContent && isStreaming && !hasRunningTool && (
              <div className="flex items-center gap-2.5 mt-3 px-3 py-2 rounded-xl bg-[color:var(--c-bg-24211d)]/80 border border-[color:var(--c-bg-3a352a)] w-fit">
                <span className="w-2 h-2 rounded-full bg-[#d97757] animate-pulse shrink-0" />
                <span className="text-[11px] text-[color:var(--c-fg-9c9589)] font-mono">
                  {isAwaitingCompletion
                    ? 'Aguardando confirmação das ferramentas em segundo plano…'
                    : thinkingContent
                    ? `Processando próxima etapa (${thinkingContent.length.toLocaleString()} caracteres de raciocínio)…`
                    : 'Executando próxima etapa…'}
                </span>
              </div>
            )}
          </div>

          {/* Card de Aprovação do Modo Plano Obrigatório (Hard-Gate) */}
          {message.isPlanMode && hasRealContent && !isStreaming && onApprovePlan && (
            <div className="w-full mt-4 p-3.5 sm:p-4 rounded-2xl bg-[color:var(--c-bg-221f1b)] border border-[#d97757]/40 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-[#d97757]/15 border border-[#d97757]/30 shrink-0">
                  <ListTodo className="w-4 h-4 text-[#d97757]" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)]">
                    Plano pronto para revisão (Hard-Gate Ativo)
                  </span>
                  <span className="text-[11px] text-[color:var(--c-fg-9c9589)] mt-0.5 leading-snug">
                    Nenhuma alteração de arquivo foi feita ainda. Aprove para liberar a execução ou envie ajustes no chat.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {onTogglePlanMode && (
                  <button
                    type="button"
                    onClick={onTogglePlanMode}
                    title="Desligar a obrigatoriedade de plano para as próximas mensagens"
                    className="px-3 py-2 rounded-xl bg-[color:var(--c-bg-2c2924)] hover:bg-[color:var(--c-bg-36322c)] border border-[color:var(--c-bg-3e3a33)] text-[color:var(--c-fg-b8b3a8)] hover:text-[color:var(--c-fg-f3efe6)] text-xs font-medium transition cursor-pointer"
                  >
                    Desligar Plano
                  </button>
                )}
                <button
                  type="button"
                  onClick={onApprovePlan}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#d97757] hover:bg-[#c4663f] text-white text-xs font-semibold transition shadow-sm cursor-pointer select-none"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Aprovar e Executar Plano</span>
                </button>
              </div>
            </div>
          )}

          {/* Card de Autorização Obrigatória para Envio à VPS / Deploy Remoto (Hard-Gate) */}
          {message.pendingRemoteAction && (
            <div className="w-full mt-4 p-3.5 sm:p-4 rounded-2xl bg-[color:var(--c-bg-221f1b)] border border-[#d97757]/50 shadow-md flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="p-2 rounded-xl bg-[#d97757]/15 border border-[#d97757]/30 shrink-0">
                    <Terminal className="w-4 h-4 text-[#d97757]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)]">
                      {message.pendingRemoteAction.status === 'pending'
                        ? `Autorização exigida para envio à VPS / Remoto (${message.pendingRemoteAction.targetHost})`
                        : message.pendingRemoteAction.status === 'approved'
                        ? `Enviando para ${message.pendingRemoteAction.targetHost}…`
                        : message.pendingRemoteAction.status === 'executed'
                        ? `Envio para VPS concluído (${message.pendingRemoteAction.targetHost})`
                        : message.pendingRemoteAction.status === 'rejected'
                        ? 'Envio para VPS cancelado pelo usuário'
                        : 'Falha no envio remoto'}
                    </span>
                    <span className="text-[11px] text-[color:var(--c-fg-9c9589)] mt-0.5 leading-snug">
                      {message.pendingRemoteAction.summary}
                    </span>
                    {message.pendingRemoteAction.filesOrCommand && (
                      <code className="text-[10px] font-mono text-[color:var(--c-fg-d1cbc0)] bg-[color:var(--c-bg-181714)] px-2 py-1 rounded-lg mt-1.5 border border-[color:var(--c-bg-312f2a)] truncate">
                        {message.pendingRemoteAction.filesOrCommand}
                      </code>
                    )}
                    {message.pendingRemoteAction.resultMessage && (
                      <span
                        className={`text-[11px] mt-1 font-mono ${
                          message.pendingRemoteAction.status === 'executed'
                            ? 'text-emerald-400'
                            : message.pendingRemoteAction.status === 'failed'
                            ? 'text-rose-400'
                            : 'text-[color:var(--c-fg-9c9589)]'
                        }`}
                      >
                        {message.pendingRemoteAction.resultMessage}
                      </span>
                    )}
                  </div>
                </div>

                {message.pendingRemoteAction.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {onRejectRemoteAction && (
                      <button
                        type="button"
                        onClick={() => onRejectRemoteAction(message.id)}
                        className="px-3 py-2 rounded-xl bg-[color:var(--c-bg-2c2924)] hover:bg-[color:var(--c-bg-36322c)] border border-[color:var(--c-bg-3e3a33)] text-[color:var(--c-fg-b8b3a8)] hover:text-[color:var(--c-fg-f3efe6)] text-xs font-medium transition cursor-pointer"
                      >
                        Cancelar Envio
                      </button>
                    )}
                    {onApproveRemoteAction && (
                      <button
                        type="button"
                        onClick={() => onApproveRemoteAction(message.id)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#d97757] hover:bg-[#c4663f] text-white text-xs font-semibold transition shadow-sm cursor-pointer select-none"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Autorizar e Enviar para VPS</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Bar (Claude style subtle bottom icons) */}
          {displayContent && !isStreaming && (
            <div className="flex items-center gap-1 mt-3 pt-2 text-[color:var(--c-fg-8c867a)]">
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copiar mensagem"
                title="Copiar texto"
                className="p-1.5 rounded-lg hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)] transition-colors cursor-pointer flex items-center gap-1 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copiar</span>
                  </>
                )}
              </button>

              <SpeakButton text={displayContent} />

              {message.isTruncated && (
                <span
                  title="O modelo atingiu a cota máxima de tokens nesta resposta."
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Tokens esgotados</span>
                </span>
              )}

              {message.streamError && (
                <span
                  title={message.streamError}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>Stream interrompido</span>
                </span>
              )}

              {message.tokenUsage && (
                <div className="ml-auto relative">
                  <button
                    type="button"
                    onClick={() => setShowTokenDetails((prev) => !prev)}
                    title="Clique para ver detalhamento do consumo de tokens"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--c-bg-1e1c18)] border border-[color:var(--c-bg-312f2a)] hover:border-[#d97757]/50 shadow-inner cursor-pointer text-[color:var(--c-fg-c4bcaa)] hover:text-[color:var(--c-fg-f3efe6)] transition-colors group select-none"
                  >
                    <Zap className="w-3 h-3 text-[color:var(--c-fg-d97757)] group-hover:scale-110 transition-transform" />
                    <span className="text-[11px] font-medium font-mono">
                      {message.tokenUsage.totalTokens.toLocaleString()}{' '}
                      <span className="text-[10px] text-[color:var(--c-fg-8c867a)]">tokens</span>
                    </span>
                  </button>

                  {/* Tooltip / Modal popover on hover or click */}
                  <div
                    className={`absolute bottom-full right-0 mb-2 w-52 sm:w-56 p-3 rounded-xl bg-[color:var(--c-bg-1e1c18)]/95 backdrop-blur-md border border-[color:var(--c-bg-3b3831)] shadow-2xl transition-all duration-200 z-30 flex flex-col gap-1.5 ${
                      showTokenDetails
                        ? 'opacity-100 visible translate-y-0'
                        : 'opacity-0 invisible pointer-events-none translate-y-1'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-[color:var(--c-bg-312f2a)] pb-1.5 mb-0.5">
                      <div className="text-[10px] uppercase tracking-wider text-[color:var(--c-fg-d97757)] font-semibold flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>Consumo de Tokens</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTokenDetails(false);
                        }}
                        className="text-[color:var(--c-fg-736e63)] hover:text-[color:var(--c-fg-f3efe6)] text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[color:var(--c-fg-9c9589)]">Prompt (Entrada)</span>
                      <span className="text-[color:var(--c-fg-f3efe6)] font-mono">{message.tokenUsage.promptTokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[color:var(--c-fg-9c9589)]">Resposta (Saída)</span>
                      <span className="text-[color:var(--c-fg-f3efe6)] font-mono">{message.tokenUsage.completionTokens.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-px bg-[color:var(--c-bg-312f2a)] my-0.5" />
                    <div className="flex justify-between items-center text-xs font-medium">
                      <span className="text-[color:var(--c-fg-d97757)]">Total Consumido</span>
                      <span className="text-[color:var(--c-fg-d97757)] font-mono">{message.tokenUsage.totalTokens.toLocaleString()}</span>
                    </div>
                    <div className="text-[9px] text-[color:var(--c-fg-736e63)] mt-1 pt-1 border-t border-[color:var(--c-bg-2a2822)]">
                      Limite por requisição: 8.192 tokens
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
