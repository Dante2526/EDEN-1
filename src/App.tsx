import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, WifiOff, X, GitBranch, ExternalLink, FileCode, Check } from 'lucide-react';
import {
  Conversation,
  Message,
  ModelId,
  ReasoningEffort,
  AppSettings,
  AttachedDocument,
  ActiveRepoState,
  PendingChange,
  MessageEditedFile,
  MessageToolCall,
  ChangeType,
  Skill,
  McpServer,
} from './lib/types';
import {
  loadConversations,
  saveConversations,
  loadSettings,
  saveSettings,
  clearAllConversations,
  DEFAULT_SETTINGS,
  loadSkills,
  saveSkills,
  loadMcpServers,
  saveMcpServers,
} from './lib/storage';
import { generateId, generateTitleFromMessage, formatFileSize } from './lib/utils';
import { ChatHeader } from './components/chat-header';
import { ChatSidebar } from './components/chat-sidebar';
import { ChatMessage } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { SettingsModal } from './components/settings-modal';
import { ClaudeLogo } from './components/claude-logo';
import { PendingChangesProvider, usePendingChanges } from './lib/pending-changes';
import { DiffViewer } from './components/source-control/diff-viewer';
import { fetchFileContent, fetchRepoContents, searchCode } from './lib/github';
import { TerminalPanel, TerminalEntry } from './components/terminal-panel';
import { executeEmulatedCommand } from './lib/git-terminal-emulator';
import { commitStagedChanges } from './lib/github-commit';
import { StudioPanel } from './studio/studio-panel';
import { ErrorModal, AppErrorInfo } from './components/error-modal';
import { CompactionMarker } from './components/compaction-marker';
import { executePythonCode, formatPythonOutput } from './lib/pyodide-client';
import { prepareMessagesForApi, shouldCompact, compactConversation } from './lib/context-compactor';
import {
  convertMcpToolsToOpenAi,
  testMcpConnection,
  executeMcpToolCall,
} from './lib/mcp-client';
import { ThemeMode, getInitialTheme, applyTheme, toggleThemeWithTransition } from './lib/theme';

const MODEL_STORAGE_KEY = 'nim_chat_selected_model';
const REASONING_STORAGE_KEY = 'nim_chat_reasoning_effort';

const GITHUB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê conteúdo de um arquivo do repositório ativo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo (ex: src/App.tsx)' },
          branch: { type: 'string', description: 'Branch opcional (padrão: branch ativa)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Lista arquivos e diretórios de um caminho no repositório ativo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo (vazio para a raiz do repositório)' },
          branch: { type: 'string', description: 'Branch opcional' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description:
        'Busca por ocorrências de texto, funções ou classes exclusivamente no repositório ativo (equivalente à busca de arquivos do VS Code Ctrl+Shift+F). Retorna caminhos e trechos de código (snippets).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca, nome de função, variável ou classe' },
          path: { type: 'string', description: 'Caminho ou pasta opcional para filtrar a busca (ex: src/)' },
          extension: { type: 'string', description: 'Extensão de arquivo opcional para filtrar (ex: ts, tsx, js, py)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Edita ou cria um arquivo no repositório ativo. A alteração fica pendente no Source Control para revisão do usuário e NÃO commita automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo (ex: src/lib/utils.ts)' },
          content: { type: 'string', description: 'Novo conteúdo completo do arquivo' },
          type: {
            type: 'string',
            enum: ['modified', 'added', 'deleted'],
            description: 'Tipo de modificação: modified (padrão), added ou deleted',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_edit_files',
      description:
        'Aplica uma refatoração em lote em múltiplos arquivos de uma só vez no repositório ativo. Todas as alterações ficam pendentes no Source Control para revisão atômica e unificada pelo usuário.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Breve resumo ou título da refatoração realizada (ex: Refatoração de componentes de UI e tipos)',
          },
          files: {
            type: 'array',
            description: 'Lista de arquivos a serem criados, alterados ou removidos',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Caminho relativo do arquivo (ex: src/components/button.tsx)' },
                content: { type: 'string', description: 'Conteúdo completo do arquivo' },
                type: {
                  type: 'string',
                  enum: ['modified', 'added', 'deleted'],
                  description: 'Tipo de alteração: modified (padrão), added ou deleted',
                },
              },
              required: ['path', 'content'],
            },
          },
        },
        required: ['summary', 'files'],
      },
    },
  },
];

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Pesquisa informações atualizadas, documentações, referências e fontes na Internet',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de pesquisa na internet' },
      },
      required: ['query'],
    },
  },
};

const FETCH_URL_TOOL = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Lê e extrai o conteúdo textual limpo de uma página web, documentação ou artigo online a partir de uma URL. ' +
      'Use após `web_search` para acessar os detalhes de um link encontrado ou diretamente quando o usuário enviar um link.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A URL completa e válida (começando com http:// ou https://) da página a ser lida.',
        },
      },
      required: ['url'],
    },
  },
};

const PYTHON_TOOL = {
  type: 'function',
  function: {
    name: 'run_python',
    description:
      'Executa scripts Python 3 reais no navegador via WebAssembly (Pyodide). ' +
      'Use SEMPRE para cálculos matemáticos complexos, estatística, testes de algoritmos, simulações ou manipulação de dados.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'O script Python completo e executável a ser rodado.',
        },
      },
      required: ['code'],
    },
  },
};

const IMAGE_GEN_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      'Gera uma imagem artística, fotografia ou ilustração de alta qualidade com modelo FLUX. ' +
      'Use SEMPRE esta ferramenta para gerar imagens. NUNCA gere ou invente URLs ou sintaxe de imagem markdown no texto antes de chamar a ferramenta.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Descrição detalhada da imagem a ser gerada' },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3'],
          description: 'Proporção da imagem (padrão 1:1)',
        },
      },
      required: ['prompt'],
    },
  },
};

const TERMINAL_TOOL = {
  type: 'function',
  function: {
    name: 'run_terminal_command',
    description:
      'Executa comandos no Emulador de Terminal Git (ex: git status, git log, git branch, git checkout, git commit, git diff, ls, cat, pwd, echo, clear). Traduz e executa operações reais no repositório GitHub ativo.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando do shell/bash a ser executado' },
      },
      required: ['command'],
    },
  },
};

const DEFAULT_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, PYTHON_TOOL, IMAGE_GEN_TOOL, TERMINAL_TOOL];
const ALL_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, PYTHON_TOOL, IMAGE_GEN_TOOL, TERMINAL_TOOL, ...GITHUB_TOOLS];

export default function App() {
  return (
    <PendingChangesProvider>
      <AppContent />
    </PendingChangesProvider>
  );
}

function AppContent() {
  const {
    changes,
    addChange,
    stageChange,
    unstageChange,
    discardChange,
    updateChangeContent,
    clearCommitted,
  } = usePendingChanges();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [hasGitHubToken, setHasGitHubToken] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [activeError, setActiveError] = useState<AppErrorInfo | null>(null);
  const [errorHistory, setErrorHistory] = useState<AppErrorInfo[]>([]);

  const reportAppError = useCallback((title: string, message: string, options?: { status?: number; endpoint?: string; rawResponse?: string; stack?: string }) => {
    const newErr: AppErrorInfo = {
      id: generateId(),
      title,
      message,
      status: options?.status,
      endpoint: options?.endpoint,
      rawResponse: options?.rawResponse,
      stack: options?.stack,
      timestamp: Date.now(),
    };
    setActiveError(newErr);
    setErrorHistory((prev) => [newErr, ...prev.slice(0, 19)]);
    setIsErrorModalOpen(true);
  }, []);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // GitHub, Source Control & Extensions state
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'repos' | 'source-control' | 'skills'>('chats');
  const [activeRepo, setActiveRepo] = useState<ActiveRepoState | null>(null);
  const [isStudioMode, setIsStudioMode] = useState<boolean>(false);

  // Skills & MCP state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);

  // Theme state (dark / light mode)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const [diffViewingChange, setDiffViewingChange] = useState<PendingChange | null>(null);
  const [toastNotification, setToastNotification] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  // Model & Reasoning Effort
  const [selectedModel, setSelectedModel] = useState<ModelId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (saved === 'z-ai/glm-5.3' || saved === 'z-ai/glm-5.3-flash' || saved === 'moonshotai/kimi-k3') return saved;
    }
    return 'z-ai/glm-5.3-flash'; // Default mais rápido (Flash) - GLM-5.3 full demora muito pra responder
  });

  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(REASONING_STORAGE_KEY);
      if (saved === 'low' || saved === 'high' || saved === 'max') return saved;
    }
    return 'low'; // Always low by default - 'max' is slow and 'high' is unnecessary for most tasks
  });

  // One-time migration: if user has 'max' or 'high' saved, reset to 'low' for faster responses
  // This runs once when the app loads to fix slow responses from previous settings
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(REASONING_STORAGE_KEY);
    const MIGRATION_KEY = 'synap_reasoning_migration_v1';
    const migrated = localStorage.getItem(MIGRATION_KEY);
    if (!migrated && (saved === 'max' || saved === 'high')) {
      localStorage.setItem(REASONING_STORAGE_KEY, 'low');
      localStorage.setItem(MIGRATION_KEY, 'true');
      setReasoningEffort('low');
      console.log('[Synap] Reasoning effort reset to low for faster responses (one-time migration)');
    }
  }, []);

  const [isPlanMode, setIsPlanMode] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [isTerminalRunning, setIsTerminalRunning] = useState<boolean>(false);
  const [terminalCwd, setTerminalCwd] = useState<string>('/');

  // Reset window scroll position when switching modes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [isStudioMode]);

  // Terminal shortcut (Ctrl + ` or Alt + T)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === '`') || (e.altKey && (e.key === 't' || e.key === 'T'))) {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const isUserScrollingRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderRef = useRef<number>(0);

  // Check backend server status
  useEffect(() => {
    fetch('/api/status', { headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' } })
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(Boolean(data.hasApiKey));
        setHasGeminiKey(Boolean(data.hasGeminiKey));
        setHasGitHubToken(Boolean(data.hasGitHubToken));
      })
      .catch((err) => {
        console.warn('Could not verify server status:', err);
        setHasApiKey(false);
        setHasGitHubToken(false);
      });
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load Settings and Conversations
  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);

    loadConversations().then((loaded) => {
      // Backfill tokenUsage for any past assistant messages that don't have it
      const enhanced = loaded.map((conv) => ({
        ...conv,
        messages: conv.messages.map((m) => {
          if (m.role === 'assistant' && !m.tokenUsage && m.content) {
            const promptEstimate = 45;
            const completionEstimate = Math.max(1, Math.round(m.content.length / 3.6));
            return {
              ...m,
              tokenUsage: {
                promptTokens: promptEstimate,
                completionTokens: completionEstimate,
                totalTokens: promptEstimate + completionEstimate,
              },
            };
          }
          return m;
        }),
      }));
      setConversations(enhanced);
      if (enhanced.length > 0) {
        setActiveId(enhanced[0].id);
        if (enhanced[0].model) setSelectedModel(enhanced[0].model as ModelId);
        if (enhanced[0].reasoningEffort) setReasoningEffort(enhanced[0].reasoningEffort);
        if (enhanced[0].isPlanMode !== undefined) setIsPlanMode(enhanced[0].isPlanMode);
        if (enhanced[0].activeRepo) setActiveRepo(enhanced[0].activeRepo);
        else setActiveRepo(null);
      }
    });

    loadSkills().then((loadedSkills) => {
      setSkills(loadedSkills);
    });

    loadMcpServers().then((loadedServers) => {
      setMcpServers(loadedServers);
    });
  }, []);

  // Persist conversations
  useEffect(() => {
    if (conversations.length > 0 && settings.saveHistoryLocally) {
      saveConversations(conversations);
    }
  }, [conversations, settings.saveHistoryLocally]);

  // Persist skills
  useEffect(() => {
    if (skills.length > 0) {
      saveSkills(skills);
    }
  }, [skills]);

  // Persist mcpServers
  useEffect(() => {
    if (mcpServers.length > 0) {
      saveMcpServers(mcpServers);
    }
  }, [mcpServers]);

  // Handle user scroll detection on message container
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Considera que está no fim se estiver a menos de 100px do fundo
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom <= 100;

    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 250);
  }, []);

  // Controlled scroll to bottom without locking user gestures
  const scrollToBottom = useCallback((force = false, smooth = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (force || (isAtBottomRef.current && !isUserScrollingRef.current)) {
      if (smooth) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, []);

  // Auto-scroll when messages stream or change (apenas se o usuário já estiver no fundo e não estiver interagindo)
  useEffect(() => {
    if (isAtBottomRef.current && !isUserScrollingRef.current && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      requestAnimationFrame(() => {
        if (isAtBottomRef.current && !isUserScrollingRef.current && el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, [conversations, isStreaming]);

  // Reset scroll to bottom when switching conversation
  useEffect(() => {
    isAtBottomRef.current = true;
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeId]);

  // Active conversation helper
  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  // Active conversation token usage helper
  const conversationTokens = React.useMemo(() => {
    if (!activeConversation) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
    return activeConversation.messages.reduce(
      (acc, m) => {
        if (m.tokenUsage) {
          acc.promptTokens += m.tokenUsage.promptTokens || 0;
          acc.completionTokens += m.tokenUsage.completionTokens || 0;
          acc.totalTokens += m.tokenUsage.totalTokens || 0;
        }
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    );
  }, [activeConversation]);

  // Active repo changes count
  const pendingChangesCount = React.useMemo(() => {
    return activeRepo
      ? changes.filter(
          (c) => c.repo === activeRepo.fullName && c.branch === activeRepo.branch
        ).length
      : 0;
  }, [activeRepo, changes]);

  const handleSelectRepo = useCallback((repo: ActiveRepoState) => {
    setActiveRepo(repo);
    if (activeId) {
      setConversations((all) =>
        all.map((c) =>
          c.id === activeId ? { ...c, activeRepo: repo, updatedAt: Date.now() } : c
        )
      );
    }
  }, [activeId]);

  const handleCloseRepo = useCallback(() => {
    setActiveRepo(null);
    if (activeId) {
      setConversations((all) =>
        all.map((c) =>
          c.id === activeId ? { ...c, activeRepo: null, updatedAt: Date.now() } : c
        )
      );
    }
  }, [activeId]);

  const handleChangeBranch = useCallback((branch: string) => {
    if (!activeRepo) return;
    const updated = { ...activeRepo, branch };
    setActiveRepo(updated);
    if (activeId) {
      setConversations((all) =>
        all.map((c) =>
          c.id === activeId ? { ...c, activeRepo: updated, updatedAt: Date.now() } : c
        )
      );
    }
  }, [activeRepo, activeId]);

  // Skills & MCP Handlers
  const handleToggleSkill = useCallback((id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const handleAddSkill = useCallback((skillData: Omit<Skill, 'id' | 'isBuiltin'>) => {
    const newSkill: Skill = {
      ...skillData,
      id: generateId(),
      isBuiltin: false,
    };
    setSkills((prev) => [...prev, newSkill]);
  }, []);

  const handleDeleteSkill = useCallback((id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id || s.isBuiltin));
  }, []);

  const handleAddMcpServer = useCallback(async (serverData: { name: string; url: string; transport: 'sse' | 'http'; apiKey?: string }) => {
    const newServer: McpServer = {
      id: generateId(),
      name: serverData.name,
      url: serverData.url,
      transport: serverData.transport,
      apiKey: serverData.apiKey,
      enabled: true,
      status: 'disconnected',
      tools: [],
    };
    setMcpServers((prev) => [...prev, newServer]);
    setTestingServerId(newServer.id);
    const result = await testMcpConnection(newServer);
    setMcpServers((prev) =>
      prev.map((s) =>
        s.id === newServer.id
          ? {
              ...s,
              status: result.success ? 'connected' : 'error',
              tools: result.tools,
              errorMessage: result.error,
            }
          : s
      )
    );
    setTestingServerId(null);
  }, []);

  const handleToggleMcpServer = useCallback((id: string) => {
    setMcpServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const handleDeleteMcpServer = useCallback((id: string) => {
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleTestMcpServer = useCallback(async (id: string) => {
    const target = mcpServers.find((s) => s.id === id);
    if (!target) return;
    setTestingServerId(id);
    const result = await testMcpConnection(target);
    setMcpServers((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: result.success ? 'connected' : 'error',
              tools: result.tools,
              errorMessage: result.error,
            }
          : s
      )
    );
    setTestingServerId(null);
  }, [mcpServers]);

  const handleOpenTerminal = useCallback(() => {
    setIsTerminalOpen(true);
  }, []);

  const handleToggleTheme = useCallback((e?: React.MouseEvent) => {
    toggleThemeWithTransition(theme, e, (newTheme) => {
      setTheme(newTheme);
    });
  }, [theme]);

  const handleViewDiffForPath = useCallback((path: string) => {
    const found = changes.find(
      (c) => c.path === path && (activeRepo ? c.repo === activeRepo.fullName : true)
    );
    if (found) {
      setDiffViewingChange(found);
    } else {
      setSidebarTab('source-control');
      setIsSidebarOpen(true);
    }
  }, [changes, activeRepo]);

  const handleTogglePlanMode = useCallback(() => {
    setIsPlanMode((prev) => {
      const next = !prev;
      if (next && reasoningEffort === 'low') {
        setReasoningEffort('high');
        localStorage.setItem(REASONING_STORAGE_KEY, 'high');
      }
      if (activeId) {
        setConversations((all) =>
          all.map((c) => (c.id === activeId ? { ...c, isPlanMode: next } : c))
        );
      }
      return next;
    });
  }, [reasoningEffort, activeId]);

  const handleSelectModel = useCallback((model: ModelId) => {
    setSelectedModel(model);
    localStorage.setItem(MODEL_STORAGE_KEY, model);
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, model, updatedAt: Date.now() } : c))
      );
    }
  }, [activeId]);

  const handleSelectReasoningEffort = useCallback((effort: ReasoningEffort) => {
    setReasoningEffort(effort);
    localStorage.setItem(REASONING_STORAGE_KEY, effort);
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, reasoningEffort: effort, updatedAt: Date.now() } : c
        )
      );
    }
  }, [activeId]);

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setIsPlanMode(false);
    setActiveRepo(null);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
    const target = conversations.find((c) => c.id === id);
    if (target) {
      if (target.model) setSelectedModel(target.model as ModelId);
      if (target.reasoningEffort) setReasoningEffort(target.reasoningEffort);
      if (target.isPlanMode !== undefined) {
        setIsPlanMode(target.isPlanMode);
      } else {
        setIsPlanMode(false);
      }
      setActiveRepo(target.activeRepo || null);
    }
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [conversations]);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        if (remaining[0].model) setSelectedModel(remaining[0].model as ModelId);
        if (remaining[0].reasoningEffort) setReasoningEffort(remaining[0].reasoningEffort);
        if (remaining[0].isPlanMode !== undefined) setIsPlanMode(remaining[0].isPlanMode);
        setActiveRepo(remaining[0].activeRepo || null);
      } else {
        setActiveId(null);
        setIsPlanMode(false);
        setActiveRepo(null);
      }
    }
  }, [activeId, conversations]);

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  }, []);

  const handleUpdateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearAllConversations();
    setConversations([]);
    setActiveId(null);
    setIsPlanMode(false);
  }, []);

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // Helper to execute client-side GitHub and web tools
  const executeGitHubTool = async (
    name: string,
    args: any,
    currentRepo: ActiveRepoState | null
  ): Promise<{
    result: string;
    editedFile?: MessageEditedFile;
    editedFiles?: MessageEditedFile[];
    batchRefactor?: { summary: string; files: MessageEditedFile[] };
  }> => {
    if (name === 'web_search' || name === 'search_web') {
      try {
        const query = args.query || args.q || '';
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' }
        });
        if (!res.ok) throw new Error(`Falha na busca web (${res.status})`);
        const searchResults = await res.json();
        return { result: JSON.stringify(searchResults) };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao pesquisar ${args.query}` }) };
      }
    }

    if (name === 'fetch_url') {
      try {
        const targetUrl = args.url || args.link || '';
        const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(targetUrl)}`, {
          headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' },
        });
        const data = await res.json();
        if (!res.ok) {
          return { result: JSON.stringify({ error: data.error || `Erro HTTP ${res.status}` }) };
        }
        return {
          result: JSON.stringify({
            url: data.url,
            title: data.title,
            content: data.content,
            truncated: data.truncated,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao ler URL ${args.url}` }) };
      }
    }

    if (name === 'run_python') {
      try {
        const code = args.code || args.script || '';
        const execRes = await executePythonCode(code);
        const formatted = formatPythonOutput(execRes);
        return {
          result: JSON.stringify({
            code,
            success: execRes.success,
            stdout: execRes.stdout,
            stderr: execRes.stderr,
            result: execRes.result,
            executionTimeMs: execRes.executionTimeMs,
            error: execRes.error,
            output: formatted,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao executar código Python' }) };
      }
    }

    if (name === 'generate_image') {
      try {
        const prompt = args.prompt || '';
        const aspect_ratio = args.aspect_ratio || '1:1';
        const res = await fetch('/api/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify({ prompt, aspect_ratio }),
        });
        if (!res.ok) throw new Error(`Falha ao gerar imagem (${res.status})`);
        const imgData = await res.json();
        return {
          result: JSON.stringify({
            status: 'success',
            url: imgData.url,
            prompt: imgData.prompt,
            markdown: imgData.markdown,
            instruction:
              `A imagem já foi pré-renderizada e está disponível no servidor. Apresente-a usando exatamente: ${imgData.markdown} sem quebrar linha entre [ e (.`,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Erro ao gerar imagem' }) };
      }
    }

    if (name === 'run_terminal_command' || name === 'terminal') {
      try {
        const cmd = args.command || args.cmd || '';
        const termData = await executeEmulatedCommand(cmd, {
          activeRepo,
          changes,
          cwd: terminalCwd,
          setCwd: setTerminalCwd,
          gitHubUser: null,
          onChangeBranch: (newBranch) => {
            if (activeRepo) {
              setActiveRepo({ ...activeRepo, branch: newBranch });
            }
          },
          onCommitChanges: async (msg) => {
            const repoFullName = activeRepo?.fullName || `${activeRepo?.owner}/${activeRepo?.repo}`;
            const repoChanges = changes.filter((c) => !c.repo || c.repo === repoFullName);
            if (!activeRepo || repoChanges.length === 0) return false;

            const res = await commitStagedChanges(
              null,
              activeRepo.owner,
              activeRepo.repo,
              activeRepo.branch,
              msg,
              repoChanges
            );
            await clearCommitted(repoChanges);
            return true;
          },
          onClearTerminal: () => setTerminalEntries([]),
        });

        const entry: TerminalEntry = {
          id: generateId(),
          command: cmd,
          stdout: termData.stdout || '',
          stderr: termData.stderr || '',
          exitCode: termData.exitCode,
          cwd: termData.cwd || terminalCwd,
          executionTimeMs: termData.executionTimeMs,
          timestamp: Date.now(),
        };
        setTerminalEntries((prev) => [...prev, entry]);

        return {
          result: JSON.stringify({
            command: cmd,
            stdout: termData.stdout,
            stderr: termData.stderr,
            exitCode: termData.exitCode,
            success: termData.success,
          }),
        };
      } catch (err: any) {
        return {
          result: JSON.stringify({ error: err?.message || 'Falha ao executar comando no terminal.' }),
        };
      }
    }

    if (!currentRepo) {
      return {
        result: JSON.stringify({
          error: 'Nenhum repositório GitHub está vinculado a esta conversa. Selecione um repositório no menu superior.',
        }),
      };
    }

    if (name === 'edit_file') {
      const { path, content = '', type = 'modified' } = args;

      if (!path) {
        return {
          result: JSON.stringify({ error: 'Parâmetro path é obrigatório para edit_file.' }),
        };
      }

      let originalContent: string | undefined = undefined;

      // Try fetching original file content if modifying or deleting
      if (type === 'modified' || type === 'deleted') {
        try {
          originalContent = await fetchFileContent(
            null,
            currentRepo.owner,
            currentRepo.repo,
            path,
            currentRepo.branch
          );
        } catch {
          // New file or unable to read original
        }
      }

      await addChange({
        path,
        repo: currentRepo.fullName,
        branch: currentRepo.branch,
        type: (type as ChangeType) || 'modified',
        originalContent,
        newContent: content || '',
      });

      // Show toast
      setToastNotification({
        message: `IA editou ${path} — revise em Source Control`,
        actionLabel: 'Ver Diff',
        onAction: () => {
          handleViewDiffForPath(path);
        },
      });

      setTimeout(() => {
        setToastNotification(null);
      }, 5000);

      const editedFile: MessageEditedFile = {
        path,
        type: (type as ChangeType) || 'modified',
      };

      return {
        result: JSON.stringify({
          success: true,
          message: `Arquivo '${path}' alterado com sucesso e salvo no Source Control local para revisão do usuário.`,
        }),
        editedFile,
      };
    }

    if (name === 'batch_edit_files') {
      const summary = args.summary || 'Refatoração multi-arquivo';
      const files = Array.isArray(args.files) ? args.files : [];

      if (files.length === 0) {
        return {
          result: JSON.stringify({ error: 'Nenhum arquivo fornecido para refatoração em lote.' }),
        };
      }

      const processedFiles: MessageEditedFile[] = [];

      for (const item of files) {
        if (!item.path) continue;
        const itemType = (item.type as ChangeType) || 'modified';
        let originalContent: string | undefined = undefined;

        if (itemType === 'modified' || itemType === 'deleted') {
          try {
            originalContent = await fetchFileContent(
              null,
              currentRepo.owner,
              currentRepo.repo,
              item.path,
              currentRepo.branch
            );
          } catch {
            // New file or unable to read original
          }
        }

        await addChange({
          path: item.path,
          repo: currentRepo.fullName,
          branch: currentRepo.branch,
          type: itemType,
          originalContent,
          newContent: item.content || '',
        });

        processedFiles.push({
          path: item.path,
          type: itemType,
        });
      }

      setToastNotification({
        message: `IA refatorou ${processedFiles.length} arquivos — revise em Source Control`,
        actionLabel: 'Ver Source Control',
        onAction: () => {
          setSidebarTab('source-control');
          setIsSidebarOpen(true);
        },
      });

      setTimeout(() => {
        setToastNotification(null);
      }, 5000);

      return {
        result: JSON.stringify({
          success: true,
          summary,
          filesCount: processedFiles.length,
          files: processedFiles.map((f) => f.path),
          message: `Refatoração multi-arquivo concluída com sucesso (${processedFiles.length} arquivos preparados para revisão no Source Control).`,
        }),
        editedFiles: processedFiles,
        batchRefactor: {
          summary,
          files: processedFiles,
        },
      };
    }

    if (name === 'read_file') {
      try {
        const fileContent = await fetchFileContent(
          null,
          currentRepo.owner,
          currentRepo.repo,
          args.path,
          args.branch || currentRepo.branch
        );
        return { result: fileContent };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao ler arquivo ${args.path}` }) };
      }
    }

    if (name === 'list_files') {
      try {
        const contents = await fetchRepoContents(
          null,
          currentRepo.owner,
          currentRepo.repo,
          args.path || '',
          args.branch || currentRepo.branch
        );
        return { result: JSON.stringify(contents.map((c) => ({ name: c.name, path: c.path, type: c.type }))) };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao listar diretório ${args.path}` }) };
      }
    }

    if (name === 'search_code') {
      try {
        const items = await searchCode(
          null,
          args.query,
          currentRepo.owner,
          currentRepo.repo,
          args.path,
          args.extension
        );
        return {
          result: JSON.stringify(items),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro na busca de código: ${args.query}` }) };
      }
    }

    return { result: JSON.stringify({ error: `Ferramenta desconhecida: ${name}` }) };
  };

  const handleExecuteTerminalCommand = useCallback(async (command: string) => {
    setIsTerminalRunning(true);
    try {
      const termData = await executeEmulatedCommand(command, {
        activeRepo,
        changes,
        cwd: terminalCwd,
        setCwd: setTerminalCwd,
        gitHubUser: null,
        onChangeBranch: (newBranch) => {
          if (activeRepo) {
            setActiveRepo({ ...activeRepo, branch: newBranch });
          }
        },
        onCommitChanges: async (msg) => {
          const repoFullName = activeRepo?.fullName || `${activeRepo?.owner}/${activeRepo?.repo}`;
          const repoChanges = changes.filter((c) => !c.repo || c.repo === repoFullName);
          if (!activeRepo || repoChanges.length === 0) return false;

          const res = await commitStagedChanges(
            null,
            activeRepo.owner,
            activeRepo.repo,
            activeRepo.branch,
            msg,
            repoChanges
          );
          await clearCommitted(repoChanges);
          return true;
        },
        onClearTerminal: () => setTerminalEntries([]),
      });

      const newEntry: TerminalEntry = {
        id: generateId(),
        command,
        stdout: termData.stdout || '',
        stderr: termData.stderr || '',
        exitCode: termData.exitCode,
        cwd: termData.cwd || terminalCwd,
        executionTimeMs: termData.executionTimeMs,
        timestamp: Date.now(),
      };
      setTerminalEntries((prev) => [...prev, newEntry]);
    } catch (err: any) {
      setTerminalEntries((prev) => [
        ...prev,
        {
          id: generateId(),
          command,
          stdout: '',
          stderr: err?.message || 'Erro ao executar comando no emulador.',
          exitCode: 1,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsTerminalRunning(false);
    }
  }, [activeRepo, changes, terminalCwd, clearCommitted]);

  const handleClearTerminal = useCallback(() => {
    setTerminalEntries([]);
  }, []);

  // Send Message with Tools support
  const handleSendMessage = useCallback(async (
    text: string,
    images: string[] = [],
    documents: AttachedDocument[] = [],
    overridePlanMode?: boolean
  ) => {
    if (!text && images.length === 0 && documents.length === 0) return;
    setErrorMessage(null);

    const activePlan = overridePlanMode !== undefined ? overridePlanMode : isPlanMode;

    let effectiveModel = selectedModel;
    const isVisionModel = selectedModel === 'z-ai/glm-5.3-flash' || selectedModel === 'moonshotai/kimi-k3';
    if (images.length > 0 && !isVisionModel) {
      effectiveModel = 'z-ai/glm-5.3-flash';
      setSelectedModel('z-ai/glm-5.3-flash');
      localStorage.setItem(MODEL_STORAGE_KEY, 'z-ai/glm-5.3-flash');
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      images: images.length > 0 ? images : undefined,
      documents: documents.length > 0 ? documents : undefined,
      isPlanMode: activePlan,
      createdAt: Date.now(),
    };

    let currentConvId = activeId;
    let currentConv = activeConversation;

    if (!currentConvId || !currentConv) {
      const newId = generateId();
      const firstDocName = documents[0]?.name;
      const titleFallback = firstDocName
        ? `Arquivo: ${firstDocName}`
        : images.length > 0
        ? 'Imagem'
        : 'Nova conversa';
      const newTitle = generateTitleFromMessage(text || titleFallback);
      const newConv: Conversation = {
        id: newId,
        title: newTitle,
        messages: [userMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: effectiveModel,
        reasoningEffort: reasoningEffort,
        isPlanMode: activePlan,
        activeRepo: activeRepo || null,
      };

      currentConvId = newId;
      currentConv = newConv;
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(newId);
    } else {
      const updatedMessages = [...currentConv.messages, userMessage];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId
            ? { ...c, messages: updatedMessages, isPlanMode: activePlan, updatedAt: Date.now() }
            : c
        )
      );
    }

    const assistantMessageId = generateId();
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      reasoning: '',
      reasoningEffort: reasoningEffort,
      isPlanMode: activePlan,
      createdAt: Date.now(),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConvId
          ? { ...c, messages: [...c.messages, assistantPlaceholder] }
          : c
      )
    );

    setIsStreaming(true);
    setTimeout(() => scrollToBottom(true, true), 50);

    // Injetar contexto de repositório apenas se vinculado a esta conversa
    const chatActiveRepo = activeRepo || (currentConv?.activeRepo ? currentConv.activeRepo : null);

    const repoPrompt = chatActiveRepo
      ? `Você está conectado ao repositório GitHub ativo EXCLUSIVO DESTA CONVERSA: "${chatActiveRepo.fullName}" na branch "${chatActiveRepo.branch}".\n` +
        `Você tem acesso às ferramentas de código: read_file, list_files, search_code e edit_file APENAS para o repositório "${chatActiveRepo.fullName}".\n` +
        `Você NÃO tem permissão nem acesso a nenhum outro repositório do usuário. Cada conversa possui isolamento estrito de repositório.\n` +
        `Ao propor alterações ou códigos para o repositório, utilize OBRIGATORIAMENTE a ferramenta edit_file. ` +
        `A alteração ficará salva localmente no Source Control para o usuário revisar o diff e commitar.`
      : undefined;

    const basePrompt =
      'Você é o assistente Synap com ferramentas avançadas integradas.\n' +
      'Regras estritas para ferramentas:\n' +
      '1. Geração de Imagens: Quando o usuário pedir qualquer imagem ou ilustração, execute OBRIGATORIAMENTE a ferramenta `generate_image`. NUNCA invente, presuma ou escreva links de imagens ou sintaxe markdown como `![...](https://...)` no seu texto antes da execução da ferramenta.\n' +
      '2. Emulador de Terminal Git: Você tem acesso à ferramenta `run_terminal_command` para executar comandos no Emulador de Terminal Git (ex: `git status`, `git log`, `git branch`, `git checkout`, `git commit`, `git diff`, `ls`, `cat <arquivo>`, `pwd`, `grep`, `echo`, etc.). Os comandos operam no repositório GitHub ativo. Sempre que o usuário pedir para executar comandos Git/Unix ou inspecionar o estado do repositório via terminal, EXECUTE a ferramenta `run_terminal_command` e relate a saída.\n' +
      '3. Navegação e Busca Web: Use `web_search` para encontrar fontes e links na internet. Use `fetch_url` para acessar e ler o conteúdo completo de artigos, tutoriais, documentações técnicas ou URLs fornecidas diretamente pelo usuário.\n' +
      '4. Execução de Python: Você tem a ferramenta `run_python` para executar código Python 3 real no navegador via WebAssembly (Pyodide). Use-a sempre que precisar fazer cálculos matemáticos exatos, simulações, testar algoritmos, analisar dados ou quando o usuário pedir para rodar código Python.';

    const planPrompt = activePlan
      ? 'Você é um estrategista e arquiteto de planejamento sênior. O MODO PLANO (FUNÇÃO PLAN) está ATIVADO. Para a solicitação do usuário, crie OBRIGATORIAMENTE um PLANO DE AÇÃO COMPLETO, PRÁTICO E EXECUTÁVEL, formatado estritamente com os seguintes tópicos em Markdown:\n\n' +
        '🎯 1. OBJETIVO & RESULTADO ESPERADO (Definição clara da meta)\n' +
        '📋 2. PRÉ-REQUISITOS & RECURSOS (Ferramentas, materiais ou conhecimentos prévios)\n' +
        '🗓️ 3. FASES CRONOLÓGICAS PASSO A PASSO (Etapas divididas em Fases/Semanas com ações práticas numeradas)\n' +
        '⚠️ 4. RISCOS, DESAFIOS & CONTINGÊNCIAS (Possíveis obstáculos e soluções preventivas)\n' +
        '✅ 5. CRITÉRIOS DE SUCESSO & PRIMEIRO PASSO IMEDIATO (A primeira ação para começar hoje mesmo).'
      : undefined;

    // Injetar habilidades modulares ativas (Skills)
    const activeSkills = skills.filter((s) => s.enabled);
    const skillsPrompt = activeSkills.length > 0
      ? '--- HABILIDADES MODULARES ATIVAS (SKILLS) ---\n' +
        activeSkills
          .map((s) => `### Habilidade: ${s.name}\n${s.systemPrompt}`)
          .join('\n\n')
      : undefined;

    // Obter ferramentas ativas de servidores MCP conectados
    const activeMcpServers = mcpServers.filter((s) => s.enabled && s.status === 'connected' && s.tools.length > 0);
    const mcpOpenAiTools = activeMcpServers.flatMap((s) => convertMcpToolsToOpenAi(s.tools, s.id));
    const baseTools = chatActiveRepo ? ALL_CHAT_TOOLS : DEFAULT_CHAT_TOOLS;
    const requestTools = [...baseTools, ...mcpOpenAiTools];

    const convForPayload: Conversation = currentConv
      ? { ...currentConv, messages: [...currentConv.messages, userMessage] }
      : {
          id: currentConvId,
          title: generateTitleFromMessage(userMessage.content),
          messages: [userMessage],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: effectiveModel,
          reasoningEffort,
          isPlanMode: activePlan,
          activeRepo: chatActiveRepo,
        };

    const contextMessages = prepareMessagesForApi(convForPayload, {
      base: basePrompt,
      repo: repoPrompt,
      plan: planPrompt,
      skills: skillsPrompt,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let currentMessagesForApi = [...contextMessages];
      let hasToolCallsToProcess = true;
      const MAX_TOOL_ITERATIONS = 45;
      let loopCount = 0;
      const allEditedFiles: MessageEditedFile[] = [];
      const allToolCalls: MessageToolCall[] = [];
      let currentBatchRefactor: { summary: string; files: MessageEditedFile[] } | undefined = undefined;
      let accumulatedAssistantText = '';
      let accumulatedReasoningText = '';

      while (hasToolCallsToProcess && loopCount < MAX_TOOL_ITERATIONS) {
        loopCount++;
        hasToolCallsToProcess = false;

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_SECRET || ''
          },
          body: JSON.stringify({
            messages: currentMessagesForApi,
            model: effectiveModel,
            reasoning_effort: reasoningEffort,
            tools: requestTools.length > 0 ? requestTools : undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errMessage = `Erro na requisição (${response.status})`;
          try {
            // Tenta ler como texto primeiro (Vercel pode retornar HTML em erros 500/502)
            const text = await response.text();
            try {
              const errData = JSON.parse(text);
              if (errData.error) errMessage = errData.error;
              else if (errData.message) errMessage = errData.message;
            } catch {
              // Não é JSON — provavelmente é HTML de erro da Vercel
              if (text && text.length < 500) {
                errMessage = `Erro ${response.status}: ${text.substring(0, 200)}`;
              } else if (response.status === 500) {
                errMessage = 'Erro interno do servidor (500). Verifique os logs da Vercel em vercel.com/dashboard. Pode ser problema de build ou variável de ambiente faltando.';
              } else if (response.status === 502) {
                errMessage = 'Erro de gateway (502). A função serverless demorou demais ou caiu. Tente novamente.';
              }
            }
          } catch {}
          throw new Error(errMessage);
        }

        if (!response.body) {
          throw new Error('Nenhuma resposta retornada pelo servidor.');
        }

        const fallbackType = response.headers.get('x-fallback');
        let fallbackWarning: string | undefined = undefined;
        if (fallbackType === 'no-reasoning') {
          fallbackWarning = 'O modelo negou o uso de raciocínio profundo para esta requisição (downgrade).';
        } else if (fallbackType === 'no-tools') {
          fallbackWarning = 'O modelo negou o uso de ferramentas nativas nesta requisição (downgrade).';
        } else if (fallbackType === 'no-reasoning-and-tools') {
          fallbackWarning = 'O modelo recusou raciocínio profundo e ferramentas (downgrade).';
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let iterationText = '';
        let iterationReasoning = '';
        let buffer = '';
        const toolCallsAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};
        let iterationTokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined = undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const choice = parsed.choices?.[0];
              const delta = choice?.delta || choice?.message;

              if (parsed.usage) {
                iterationTokenUsage = {
                  promptTokens: parsed.usage.prompt_tokens || 0,
                  completionTokens: parsed.usage.completion_tokens || 0,
                  totalTokens: parsed.usage.total_tokens || 0,
                };
              }

              if (delta) {
                if (delta.reasoning_content) {
                  iterationReasoning += delta.reasoning_content;
                } else if (delta.reasoning) {
                  iterationReasoning += delta.reasoning;
                }

                if (delta.content) {
                  iterationText += delta.content;
                }

                // Accumulate tool calls (OpenAI standard format)
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallsAccumulator[idx]) {
                      toolCallsAccumulator[idx] = {
                        id: tc.id || `call_${Date.now()}_${idx}`,
                        name: tc.function?.name || '',
                        arguments: '',
                      };
                    }
                    if (tc.id) toolCallsAccumulator[idx].id = tc.id;
                    if (tc.function?.name) toolCallsAccumulator[idx].name = tc.function.name;
                    if (tc.function?.arguments) toolCallsAccumulator[idx].arguments += tc.function.arguments;
                  }
                } else if (delta.function_call) {
                  // Legacy function_call fallback
                  if (!toolCallsAccumulator[0]) {
                    toolCallsAccumulator[0] = {
                      id: `call_${Date.now()}_0`,
                      name: delta.function_call.name || '',
                      arguments: '',
                    };
                  }
                  if (delta.function_call.name) toolCallsAccumulator[0].name = delta.function_call.name;
                  if (delta.function_call.arguments) toolCallsAccumulator[0].arguments += delta.function_call.arguments;
                }

                const currentCombinedText = accumulatedAssistantText
                  ? `${accumulatedAssistantText}\n\n${iterationText}`
                  : iterationText;

                const currentCombinedReasoning = accumulatedReasoningText
                  ? `${accumulatedReasoningText}\n\n${iterationReasoning}`
                  : iterationReasoning;

                // Throttle de renderização: atualiza UI no máximo a cada 50ms
                // pra evitar jank visual com tokens muito rápidos
                const now = Date.now();
                if (!lastRenderRef.current || now - lastRenderRef.current > 50) {
                  lastRenderRef.current = now;
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== currentConvId) return c;
                      return {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantMessageId
                            ? {
                                ...m,
                                content: currentCombinedText,
                                reasoning: currentCombinedReasoning || undefined,
                                editedFiles: allEditedFiles.length > 0 ? allEditedFiles : undefined,
                                toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
                                tokenUsage: iterationTokenUsage,
                                fallbackWarning,
                              }
                            : m
                        ),
                      };
                    })
                  );
                }
              }
            } catch {}
          }
        }

        // Process tool calls if any were returned
        const detectedCalls = Object.values(toolCallsAccumulator).filter((c) => c && c.name);

        // Se o streaming não enviou usage nos chunks, calcular estimativa precisa baseada em caracteres/tokens
        if (!iterationTokenUsage) {
          const promptLength = currentMessagesForApi.reduce((acc, m) => {
            const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
            return acc + contentStr.length;
          }, 0);
          const promptTokens = Math.max(1, Math.round(promptLength / 3.8));
          const totalGeneratedLength =
            (accumulatedAssistantText?.length || iterationText.length) +
            (accumulatedReasoningText?.length || iterationReasoning.length);
          const completionTokens = Math.max(1, Math.round(totalGeneratedLength / 3.5));
          iterationTokenUsage = {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          };
        }

        // Garante que a mensagem do assistente receba o tokenUsage finalizado
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentConvId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      tokenUsage: iterationTokenUsage,
                    }
                  : m
              ),
            };
          })
        );

        // Se a iteração chamou generate_image, remove qualquer markdown de imagem acidental que o modelo tenha colocado antes da chamada da ferramenta
        if (detectedCalls.some((c) => c.name === 'generate_image')) {
          iterationText = iterationText.replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
        }

        // Store accumulated content across iterations
        if (iterationText) {
          accumulatedAssistantText = accumulatedAssistantText
            ? `${accumulatedAssistantText}\n\n${iterationText}`
            : iterationText;
        }
        if (iterationReasoning) {
          accumulatedReasoningText = accumulatedReasoningText
            ? `${accumulatedReasoningText}\n\n${iterationReasoning}`
            : iterationReasoning;
        }

        if (detectedCalls.length > 0) {
          hasToolCallsToProcess = true;

          // Register tool calls in running state
          for (const tc of detectedCalls) {
            allToolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              status: 'running',
            });
          }

          // Show running tool indicator immediately in chat
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== currentConvId) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        toolCalls: [...allToolCalls],
                      }
                    : m
                ),
              };
            })
          );

          const toolResultMessages: any[] = [];
          const assistantToolCallsPayload = detectedCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: {
              name: c.name,
              arguments: c.arguments,
            },
          }));

          for (const tc of detectedCalls) {
            let parsedArgs: any = {};
            try {
              parsedArgs = JSON.parse(tc.arguments || '{}');
            } catch {
              parsedArgs = {};
            }

            let result = '';
            let editedFile: MessageEditedFile | undefined = undefined;
            let execution: any = null;

            try {
              if (tc.name.startsWith('mcp__')) {
                const targetServer = mcpServers.find((s) => tc.name.startsWith(`mcp__${s.id}__`));
                if (targetServer) {
                  result = await executeMcpToolCall(targetServer, tc.name, parsedArgs);
                } else {
                  result = JSON.stringify({ error: `Servidor MCP correspondente não encontrado para ${tc.name}` });
                }
              } else {
                execution = await executeGitHubTool(tc.name, parsedArgs, chatActiveRepo);
                result = execution.result;
                editedFile = execution.editedFile;
              }

              const callEntry = allToolCalls.find((x) => x.id === tc.id);
              if (callEntry) {
                callEntry.status = 'completed';
                callEntry.result = result;
              }
            } catch (toolErr: any) {
              result = JSON.stringify({ error: toolErr?.message || 'Falha ao executar ferramenta.' });
              const callEntry = allToolCalls.find((x) => x.id === tc.id);
              if (callEntry) {
                callEntry.status = 'error';
                callEntry.result = result;
              }
            }

            if (editedFile) {
              allEditedFiles.push(editedFile);
            }
            if (execution?.editedFiles && execution.editedFiles.length > 0) {
              allEditedFiles.push(...execution.editedFiles);
            }
            if (execution?.batchRefactor) {
              currentBatchRefactor = execution.batchRefactor;
            }

            toolResultMessages.push({
              role: 'tool',
              content: result,
              tool_call_id: tc.id,
            });
          }

          // Update assistant message with completed tool calls & edited files
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== currentConvId) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        editedFiles: allEditedFiles.length > 0 ? allEditedFiles : undefined,
                        batchRefactor: currentBatchRefactor,
                        toolCalls: [...allToolCalls],
                      }
                    : m
                ),
              };
            })
          );

          // Prepare payload for next continuation request
          currentMessagesForApi = [
            ...currentMessagesForApi,
            {
              role: 'assistant',
              content: iterationText || '',
              tool_calls: assistantToolCallsPayload,
            },
            ...toolResultMessages,
          ];
        }
      }

      // Aviso se atingiu o limite de segurança de iterações (45 rodadas automáticas)
      if (loopCount >= MAX_TOOL_ITERATIONS && hasToolCallsToProcess) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentConvId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content:
                        (m.content || '') +
                        '\n\n---\n⚠️ **Aviso de Segurança do Synap**: Atingi o limite máximo de 45 rodadas automáticas de ferramentas nesta resposta. Se ainda houver passos adicionais, envie uma mensagem para continuar.',
                    }
                  : m
              ),
            };
          })
        );
      }

      // Disparo assíncrono e não-bloqueante de Context Compaction (estilo Claude Code)
      setConversations((prev) => {
        const targetConv = prev.find((c) => c.id === currentConvId);
        if (targetConv && shouldCompact(targetConv)) {
          compactConversation(targetConv, import.meta.env.VITE_API_SECRET || '')
            .then((compaction) => {
              if (compaction) {
                setConversations((inner) =>
                  inner.map((c) =>
                    c.id === currentConvId
                      ? { ...c, contextCompaction: compaction }
                      : c
                  )
                );
              }
            })
            .catch((compactionErr) => {
              console.warn('[ContextCompaction] Falha silenciosa em background:', compactionErr);
            });
        }
        return prev;
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Geração interrompida pelo usuário.');
      } else {
        console.error('Chat generation error:', err);
        // Tratar erros de stream cortado / rede de forma mais amigável
        const errMsg = err?.message || '';
        const isNetworkError =
          errMsg.includes('network') ||
          errMsg.includes('fetch') ||
          errMsg.includes('stream') ||
          errMsg.includes('aborted') ||
          errMsg.includes('connection') ||
          err?.name === 'TypeError';

        if (isNetworkError) {
          setErrorMessage(
            'Conexão interrompida durante a geração. A IA pode ter sido cortada por timeout ou oscilação de rede. ' +
            'Tente novamente — se persistir, reduza o reasoning_effort pra "low" ou simplifique sua mensagem.'
          );
        } else if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
          setErrorMessage('Limite de requisições atingido. Aguarde 30 segundos e tente novamente.');
        } else if (errMsg.includes('401') || errMsg.includes('Unauthorized')) {
          setErrorMessage('Chave NVIDIA_API_KEY inválida ou expirada. Verifique nas Environment Variables da Vercel.');
        } else {
          setErrorMessage(errMsg || 'Falha ao processar resposta da IA.');
        }
        reportAppError('Erro na Geração de IA', errMsg || 'Falha ao processar resposta da IA', {
          endpoint: '/api/chat',
          stack: err?.stack,
          rawResponse: err?.toString(),
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [isPlanMode, selectedModel, activeId, activeConversation, reasoningEffort, activeRepo, conversations, changes, skills, mcpServers]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="flex h-screen h-[100dvh] max-h-[100dvh] w-full bg-dark-bg text-[#f3efe6] overflow-hidden font-sans">
      {/* Offline Alert Bar */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#8c4a2f] text-white text-xs py-1.5 px-4 flex items-center justify-center gap-2 shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Modo Offline — Você pode visualizar conversas salvas no histórico.</span>
        </div>
      )}

      {/* Toast notification for AI edits */}
      {toastNotification && (
        <div className="fixed bottom-24 right-4 z-50 max-w-sm p-3 rounded-xl bg-[#23211d] border border-[#d97757]/50 shadow-2xl flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom-2 fade-in">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#d97757] shrink-0" />
            <span className="text-[#f3efe6] font-medium leading-tight">
              {toastNotification.message}
            </span>
          </div>
          {toastNotification.onAction && toastNotification.actionLabel && (
            <button
              type="button"
              onClick={toastNotification.onAction}
              className="px-2.5 py-1 rounded-lg bg-[#d97757] hover:bg-[#c26647] text-white text-[11px] font-medium transition cursor-pointer shrink-0"
            >
              {toastNotification.actionLabel}
            </button>
          )}
        </div>
      )}

      {/* Sidebar with Chats, Repos, Source Control and Skills tabs */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeRepo={activeRepo}
        sidebarTab={sidebarTab}
        onChangeTab={setSidebarTab}
        onSelectRepo={handleSelectRepo}
        onCloseRepo={handleCloseRepo}
        onChangeBranch={handleChangeBranch}
        pendingChangesCount={pendingChangesCount}
        skills={skills}
        onToggleSkill={handleToggleSkill}
        onAddSkill={handleAddSkill}
        onDeleteSkill={handleDeleteSkill}
        mcpServers={mcpServers}
        onAddMcpServer={handleAddMcpServer}
        onToggleMcpServer={handleToggleMcpServer}
        onDeleteMcpServer={handleDeleteMcpServer}
        onTestMcpServer={handleTestMcpServer}
        testingServerId={testingServerId}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-dark-bg">
        {/* Header */}
        <ChatHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNewChat={handleNewChat}
          hasApiKey={hasApiKey}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeRepo={activeRepo}
          pendingChangesCount={pendingChangesCount}
          onOpenSourceControl={() => {
            setSidebarTab('source-control');
            setIsSidebarOpen(true);
          }}
          onOpenRepoList={() => {
            setSidebarTab('repos');
            setIsSidebarOpen(true);
          }}
          onCloseRepo={handleCloseRepo}
          onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
          isTerminalOpen={isTerminalOpen}
          isStudioMode={isStudioMode}
          onToggleStudioMode={setIsStudioMode}
          errorCount={errorHistory.length}
          onOpenErrors={() => setIsErrorModalOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mx-3 sm:mx-6 mt-3 p-3 rounded-xl bg-[#2e1d1a] border border-[#7a3429] text-[#f4ada3] text-xs flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#d97757] flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-white text-[#f4ada3] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isStudioMode ? (
          <StudioPanel
            activeRepo={activeRepo}
            onOpenRepoSelector={() => {
              setSidebarTab('repos');
              setIsSidebarOpen(true);
            }}
            onOpenSourceControl={() => {
              setSidebarTab('source-control');
              setIsSidebarOpen(true);
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onBackToChat={() => setIsStudioMode(false)}
          />
        ) : (
          <>
            {/* Messages or Empty State */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [overflow-anchor:none]"
        >
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6 max-w-2xl mx-auto text-center py-4 sm:py-8 relative">
              <div className="mb-3 sm:mb-4 flex items-center justify-center">
                <ClaudeLogo className="w-10 h-10 sm:w-12 sm:h-12 text-[#d97757]" />
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-normal text-[#f3efe6] tracking-tight mb-2">
                {getGreeting()}, como posso ajudar?
              </h2>
              <p className="text-xs sm:text-sm text-[#a39d93] max-w-md px-2 leading-relaxed">
                Synap com modelos <span className="text-[#f3efe6] font-medium">GLM-5.3</span> e{' '}
                <span className="text-[#f3efe6] font-medium">Flash</span>. Source Control Git e Modo Plano integrados.
              </p>
            </div>
          ) : (
            <div className="py-4 divide-y divide-[#2d2a24]/60">
              {activeConversation.messages.map((msg, index) => {
                const prevMsg = index > 0 ? activeConversation.messages[index - 1] : null;
                const showCompactionMarker =
                  activeConversation.contextCompaction &&
                  prevMsg &&
                  prevMsg.id === activeConversation.contextCompaction.compactedUpToMessageId;

                return (
                  <React.Fragment key={msg.id}>
                    {showCompactionMarker && (
                      <CompactionMarker compaction={activeConversation.contextCompaction!} />
                    )}
                    <ChatMessage
                      message={msg}
                      isStreaming={isStreaming && index === activeConversation.messages.length - 1}
                      onViewDiff={handleViewDiffForPath}
                      onOpenTerminal={handleOpenTerminal}
                      onOpenSourceControl={() => {
                        setSidebarTab('source-control');
                        setIsSidebarOpen(true);
                      }}
                    />
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <ChatInput
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isLoading={isStreaming}
          isFlashModel={selectedModel === 'z-ai/glm-5.3-flash' || selectedModel === 'moonshotai/kimi-k3'}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          reasoningEffort={reasoningEffort}
          onSelectReasoningEffort={handleSelectReasoningEffort}
          isPlanMode={isPlanMode}
          onTogglePlanMode={handleTogglePlanMode}
          conversationTokens={conversationTokens}
          onOpenTerminal={handleOpenTerminal}
        />
          </>
        )}

        {/* Terminal Drawer Panel (Hardware-accelerated smooth slide drawer) */}
        <TerminalPanel
          isOpen={isTerminalOpen}
          onClose={() => setIsTerminalOpen(false)}
          entries={terminalEntries}
          onExecuteCommand={handleExecuteTerminalCommand}
          onClear={handleClearTerminal}
          isRunning={isTerminalRunning}
        />
      </div>

      {/* Diff Viewer Modal triggered from chat or direct action */}
      {diffViewingChange && (
        <DiffViewer
          change={diffViewingChange}
          isOpen={true}
          onClose={() => setDiffViewingChange(null)}
          onStage={stageChange}
          onUnstage={unstageChange}
          onDiscard={discardChange}
          onUpdateContent={updateChangeContent}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        conversations={conversations}
        onClearHistory={handleClearHistory}
        hasApiKey={hasApiKey}
        hasGeminiKey={hasGeminiKey}
        hasGitHubToken={hasGitHubToken}
      />

      {/* Error Inspector Modal */}
      <ErrorModal
        error={activeError}
        errorHistory={errorHistory}
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        onClearHistory={() => setErrorHistory([])}
      />
    </div>
  );
}
