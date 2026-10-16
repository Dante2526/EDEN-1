import React from 'react';
import {
  PanelLeft,
  Plus,
  AlertCircle,
  Settings,
  FolderGit2,
  GitBranch,
  X,
  RefreshCw,
  Terminal as TerminalIcon,
  ChevronDown,
  MessageSquare,
  Bot,
  Sun,
  Moon,
  Eye,
  Network,
} from 'lucide-react';
import { ClaudeLogo } from './claude-logo';
import { ActiveRepoState } from '../lib/types';
import { DeploymentStatusBadge } from './deployments/deployment-status-badge';
import { DeploymentInfo } from '../lib/deployment-service';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void;
  hasApiKey: boolean | null;
  onOpenSettings?: () => void;
  activeRepo?: ActiveRepoState | null;
  pendingChangesCount?: number;
  onOpenSourceControl?: () => void;
  onOpenRepoList?: () => void;
  onCloseRepo?: () => void;
  onToggleTerminal?: () => void;
  isTerminalOpen?: boolean;
  isStudioMode?: boolean;
  onToggleStudioMode?: (isStudio: boolean) => void;
  /** Aba ativa no main view: 'chat' | 'preview' | 'agentes' (Agentes == Studio Mode) */
  mainViewTab?: 'chat' | 'preview' | 'agentes';
  onChangeMainViewTab?: (tab: 'chat' | 'preview' | 'agentes') => void;
  /** Nome do projeto ativo (mostrado no botão Preview). Se null, Preview fica desabilitado. */
  activeProjectName?: string | null;
  errorCount?: number;
  onOpenErrors?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: (e: React.MouseEvent) => void;
  deployment?: DeploymentInfo | null;
  isLoadingDeployment?: boolean;
  onOpenDeploymentLogs?: () => void;
  onOpenGraph?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = React.memo(({
  onToggleSidebar,
  onNewChat,
  hasApiKey,
  onOpenSettings,
  activeRepo,
  pendingChangesCount = 0,
  onOpenSourceControl,
  onOpenRepoList,
  onCloseRepo,
  onToggleTerminal,
  isTerminalOpen = false,
  isStudioMode = false,
  onToggleStudioMode,
  mainViewTab = 'chat',
  onChangeMainViewTab,
  activeProjectName = null,
  errorCount = 0,
  onOpenErrors,
  theme = 'dark',
  onToggleTheme,
  deployment,
  isLoadingDeployment,
  onOpenDeploymentLogs,
  onOpenGraph,
}) => {
  return (
    <header className="h-14 sm:h-15 bg-transparent px-3 sm:px-5 flex items-center justify-between relative sticky top-0 z-30 select-none max-w-full">
      {/* Left side: Claude sidebar toggle & New chat (New chat hidden on mobile to avoid clutter) */}
      <div className="flex items-center gap-1.5 sm:gap-2 z-10 shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Alternar barra lateral"
          className="p-1.5 rounded-lg text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)] transition-colors md:hidden cursor-pointer"
        >
          <PanelLeft className="w-5 h-5" />
        </button>

        {activeRepo && (
          <div className="hidden xl:flex items-center gap-1.5 p-1 px-2.5 rounded-xl bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-3e3b33)] text-xs font-mono min-w-0 shadow-xs ml-1">
            <button
              type="button"
              onClick={onOpenSourceControl}
              title={`Repositório exclusivo deste chat: ${activeRepo.fullName} (${activeRepo.branch}). Clique para abrir Source Control.`}
              className="flex items-center gap-1.5 text-[color:var(--c-fg-f3efe6)] hover:text-[color:var(--c-fg-d97757)] transition truncate cursor-pointer"
            >
              <FolderGit2 className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
              <span className="truncate max-w-[120px] sm:max-w-[170px] font-medium">
                {activeRepo.fullName}
              </span>
              <span className="text-[color:var(--c-fg-8c867a)]">·</span>
              <span className="text-[color:var(--c-fg-c4bfb6)] truncate max-w-[70px]">{activeRepo.branch}</span>
            </button>

            {pendingChangesCount > 0 && (
              <button
                type="button"
                onClick={onOpenSourceControl}
                title={`${pendingChangesCount} alteração(ões) pendente(s) no Source Control`}
                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40 hover:bg-[#d97757]/30 transition cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#d97757] animate-pulse" />
                <span>●{pendingChangesCount}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center: Chat / Preview / Studio Switcher */}
      {onToggleStudioMode && onChangeMainViewTab && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-auto z-20">
          <div className="flex items-center bg-[color:var(--c-bg-181714)]/95 backdrop-blur-md border border-[color:var(--c-bg-2d2b26)]/90 rounded-xl p-0.5 sm:p-1 shadow-xs">
            {/* Chat */}
            <button
              type="button"
              onClick={() => {
                onChangeMainViewTab('chat');
                onToggleStudioMode(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                mainViewTab === 'chat'
                  ? 'bg-[#d97757] text-white shadow-xs font-semibold'
                  : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-25231e)]'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Chat</span>
            </button>

            {/* Preview */}
            <button
              type="button"
              onClick={() => {
                if (!activeProjectName) return;
                onChangeMainViewTab('preview');
                onToggleStudioMode(false);
              }}
              disabled={!activeProjectName}
              title={activeProjectName ? `Preview de ${activeProjectName}` : 'Nenhum projeto aberto'}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-150 active:scale-[0.97] ${
                mainViewTab === 'preview'
                  ? 'bg-[#d97757] text-white shadow-xs font-semibold cursor-pointer'
                  : activeProjectName
                  ? 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-25231e)] cursor-pointer'
                  : 'text-[color:var(--c-fg-5e5a52)] opacity-50 cursor-not-allowed'
              }`}
            >
              <Eye className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Preview</span>
            </button>

            {/* Studio (Agentes) */}
            <button
              type="button"
              onClick={() => {
                onChangeMainViewTab('agentes');
                onToggleStudioMode(true);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                mainViewTab === 'agentes'
                  ? 'bg-[#d97757] text-white shadow-xs font-semibold'
                  : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-25231e)]'
              }`}
            >
              <Bot className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Studio</span>
            </button>
          </div>
        </div>
      )}

      {/* Right side: Terminal button & Settings */}
      <div className="flex items-center gap-2 z-10">
        {hasApiKey === false && (
          <div
            title="Chave de API não configurada no servidor (.env.local)"
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 flex-shrink-0"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Sem Chave</span>
          </div>
        )}

        {errorCount > 0 && onOpenErrors && (
          <button
            type="button"
            onClick={onOpenErrors}
            title={`${errorCount} erro(s) registrado(s). Clique para inspecionar.`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/70 border border-red-500/50 text-red-300 text-xs font-medium hover:bg-red-900/70 transition-all cursor-pointer animate-pulse"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="hidden sm:inline">Erros</span>
            <span className="px-1.5 py-0.2 bg-red-900 text-red-200 rounded text-[10px] font-bold">
              {errorCount}
            </span>
          </button>
        )}

        {/* Cloudflare Pages Deployment Status Badge */}
        {deployment && (
          <DeploymentStatusBadge
            deployment={deployment}
            isLoading={isLoadingDeployment}
            onClick={onOpenDeploymentLogs}
          />
        )}

        {onOpenGraph && (
          <button
            type="button"
            onClick={onOpenGraph}
            aria-label="Abrir Mapa de Arquitetura (Graphify)"
            title="Abrir Mapa de Arquitetura Graphify (Grafo de Conexões do Projeto)"
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer select-none bg-[color:var(--c-bg-25231f)] hover:bg-[color:var(--c-bg-2e2a24)] text-zinc-800 dark:text-[color:var(--c-fg-c4bfb6)] hover:text-zinc-950 dark:hover:text-[color:var(--c-fg-f3efe6)] border-zinc-300/80 dark:border-[color:var(--c-bg-36332d)]"
          >
            <Network className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-sky-400 shrink-0" />
            <span className="hidden sm:inline font-medium">Grafo</span>
          </button>
        )}

        {onToggleTerminal && (
          <button
            type="button"
            onClick={onToggleTerminal}
            aria-label="Alternar Terminal"
            title="Abrir/Fechar Terminal (Ctrl+`)"
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer select-none ${
              isTerminalOpen
                ? 'bg-[#d97757]/20 text-[#a34423] dark:text-[color:var(--c-fg-f09a7d)] border-[#d97757]/40 shadow-xs'
                : 'bg-[color:var(--c-bg-25231f)] hover:bg-[color:var(--c-bg-2e2a24)] text-zinc-800 dark:text-[color:var(--c-fg-c4bfb6)] hover:text-zinc-950 dark:hover:text-[color:var(--c-fg-f3efe6)] border-zinc-300/80 dark:border-[color:var(--c-bg-36332d)]'
            }`}
          >
            <TerminalIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#d97757] shrink-0" />
            <span className="hidden sm:inline font-medium">Terminal</span>
            <ChevronDown
              className={`hidden sm:inline w-3.5 h-3.5 text-zinc-500 dark:text-[color:var(--c-fg-8c867a)] transition-transform duration-200 ${
                isTerminalOpen ? 'rotate-180 text-[#d97757]' : ''
              }`}
            />
          </button>
        )}
      </div>
    </header>
  );
});
