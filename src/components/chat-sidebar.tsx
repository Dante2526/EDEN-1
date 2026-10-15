import React, { useState, Suspense } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Settings,
  GitBranch,
  FolderGit2,
  Blocks,
  Sun,
  Moon,
  Download,
  FileCode,
} from 'lucide-react';
import { Conversation, ActiveRepoState, Skill, McpServer, KnowledgeFact, KnowledgeCategory } from '../lib/types';
import { formatDate } from '../lib/utils';
import { PWAInstallButton } from './pwa-install-button';
import { ClaudeLogo } from './claude-logo';
import { RepoList } from './github/repo-list';
import { FileExplorer } from './github/file-explorer';
import { SourceControlPanel } from './source-control/source-control-panel';
import { ExtensionsPanel } from './extensions/extensions-panel';
import { DownloaderPanel } from './downloader/downloader-panel';
// Lazy load ProjectsPanel (Sandpack é pesado, só carrega quando usuário abre a aba)
const ProjectsPanel = React.lazy(() =>
  import('./project-workspace/projects-panel').then((m) => ({ default: m.ProjectsPanel }))
);

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: (e: React.MouseEvent) => void;
  isOpen: boolean;
  onClose: () => void;
  // GitHub & Source Control props
  activeRepo: ActiveRepoState | null;
  sidebarTab: 'chats' | 'repos' | 'source-control' | 'skills' | 'projects';
  onChangeTab: (tab: 'chats' | 'repos' | 'source-control' | 'skills' | 'projects') => void;
  onSelectRepo: (repo: ActiveRepoState) => void;
  onCloseRepo: () => void;
  onChangeBranch: (branch: string) => void;
  pendingChangesCount: number;
  // Skills & MCP props
  skills: Skill[];
  onToggleSkill: (id: string) => void;
  onAddSkill: (skill: Omit<Skill, 'id' | 'isBuiltin'>) => void;
  onDeleteSkill: (id: string) => void;
  mcpServers: McpServer[];
  onAddMcpServer: (server: { name: string; url: string; transport: 'sse' | 'http'; apiKey?: string }) => void;
  onToggleMcpServer: (id: string) => void;
  onDeleteMcpServer: (id: string) => void;
  onTestMcpServer: (id: string) => Promise<void>;
  testingServerId?: string | null;
  knowledgeFacts: KnowledgeFact[];
  onAddKnowledgeFact: (fact: string, category?: KnowledgeCategory) => void;
  onDeleteKnowledgeFact: (id: string) => void;
  onClearKnowledgeFacts: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = React.memo(({
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onOpenSettings,
  theme = 'dark',
  onToggleTheme,
  isOpen,
  onClose,
  activeRepo,
  sidebarTab,
  onChangeTab,
  onSelectRepo,
  onCloseRepo,
  onChangeBranch,
  pendingChangesCount,
  skills,
  onToggleSkill,
  onAddSkill,
  onDeleteSkill,
  mcpServers,
  onAddMcpServer,
  onToggleMcpServer,
  onDeleteMcpServer,
  onTestMcpServer,
  testingServerId,
  knowledgeFacts,
  onAddKnowledgeFact,
  onDeleteKnowledgeFact,
  onClearKnowledgeFacts,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDownloaderOpen, setIsDownloaderOpen] = useState(false);

  // If in repos tab and repo is active, show File Explorer, otherwise Repo List
  const [viewingExplorer, setViewingExplorer] = useState(false);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setDeleteConfirmId(null);
  };

  const saveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
    setEditingId(null);
  };

  const executeDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteConversation(id);
    setDeleteConfirmId(null);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      {/* Claude.ai Sidebar container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] bg-dark-bg my-2 ml-2 rounded-2xl max-h-[calc(100dvh-1rem)] border border-gray-800/40 dark:border-white/5 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)] md:translate-x-0'
        }`}
      >
        {/* Top Header / App branding */}
        <div className="px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#d97757]/15 flex items-center justify-center">
              <ClaudeLogo className="w-4 h-4 text-[#d97757]" />
            </div>
            <div>
              <h1 className="font-sans text-sm font-semibold text-[color:var(--c-fg-f3efe6)] tracking-tight">Synap</h1>
              <p className="text-[10px] text-[color:var(--c-fg-8c867a)] font-mono tracking-tight">IA Workspace</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="p-1.5 rounded-lg text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-dark-hover md:hidden transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs (Chats / Repos / Source Control / Skills) - Pilled Segmented Control */}
        <div className="px-3 pb-2">
          <div className="p-1 rounded-xl bg-dark-bg-secondary border border-gray-800/50 dark:border-white/5 flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => onChangeTab('chats')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                sidebarTab === 'chats'
                  ? 'bg-dark-hover text-[color:var(--c-fg-f3efe6)] shadow-xs'
                  : 'text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('repos')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                sidebarTab === 'repos'
                  ? 'bg-dark-hover text-[color:var(--c-fg-f3efe6)] shadow-xs'
                  : 'text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)]'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Repos</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('source-control')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer relative ${
                sidebarTab === 'source-control'
                  ? 'bg-dark-hover text-[color:var(--c-fg-f3efe6)] shadow-xs'
                  : 'text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)]'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Git</span>
              {pendingChangesCount > 0 && (
                <span className="w-3.5 h-3.5 rounded-full bg-[#d97757] text-white text-[8px] font-bold flex items-center justify-center">
                  {pendingChangesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onChangeTab('skills')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                sidebarTab === 'skills'
                  ? 'bg-dark-hover text-[color:var(--c-fg-f3efe6)] shadow-xs'
                  : 'text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)]'
              }`}
            >
              <Blocks className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Skills</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {sidebarTab === 'repos' ? (
          activeRepo && viewingExplorer ? (
            <FileExplorer
              activeRepo={activeRepo}
              onCloseRepo={onCloseRepo}
              onChangeBranch={onChangeBranch}
              onBackToRepoList={() => setViewingExplorer(false)}
            />
          ) : (
            <RepoList
              activeRepo={activeRepo}
              onSelectRepo={(r) => {
                onSelectRepo(r);
                setViewingExplorer(true);
              }}
              onOpenSettings={onOpenSettings}
            />
          )
        ) : sidebarTab === 'source-control' ? (
          <SourceControlPanel
            activeRepo={activeRepo}
            onOpenRepoList={() => {
              onChangeTab('repos');
              setViewingExplorer(false);
            }}
            onOpenSettings={onOpenSettings}
            onChangeBranch={onChangeBranch}
          />
        ) : sidebarTab === 'skills' ? (
          <ExtensionsPanel
            skills={skills}
            onToggleSkill={onToggleSkill}
            onAddSkill={onAddSkill}
            onDeleteSkill={onDeleteSkill}
            mcpServers={mcpServers}
            onAddMcpServer={onAddMcpServer}
            onToggleMcpServer={onToggleMcpServer}
            onDeleteMcpServer={onDeleteMcpServer}
            onTestMcpServer={onTestMcpServer}
            testingServerId={testingServerId}
            knowledgeFacts={knowledgeFacts}
            onAddKnowledgeFact={onAddKnowledgeFact}
            onDeleteKnowledgeFact={onDeleteKnowledgeFact}
            onClearKnowledgeFacts={onClearKnowledgeFacts}
          />
        ) : sidebarTab === 'projects' ? (
          <Suspense
            fallback={
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#8c867a]">
                <div className="w-6 h-6 border-2 border-[#d97757]/30 border-t-[#d97757] rounded-full animate-spin" />
                <span className="text-xs">Carregando projetos...</span>
              </div>
            }
          >
            <ProjectsPanel />
          </Suspense>
        ) : (
          <>
        {/* Projects Button (above Downloader) */}
        <div className="px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => onChangeTab('projects')}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#d97757]/15 to-[#d97757]/5 hover:from-[#d97757]/25 hover:to-[#d97757]/10 border border-[#d97757]/30 hover:border-[#d97757]/50 active:scale-[0.99] text-[#f3efe6] font-medium text-xs sm:text-sm transition-all duration-200 cursor-pointer group shadow-sm"
          >
            <span className="font-medium tracking-tight flex items-center gap-2">
              <FileCode className="w-4 h-4 text-[#d97757] group-hover:scale-110 transition-transform" />
              Projetos
            </span>
            <span className="text-[10px] text-[#d97757]/70 font-mono group-hover:text-[#d97757]">
              live preview
            </span>
          </button>
        </div>

        {/* Downloader Button (above New Chat) */}
        <div className="px-3 pb-1">
          <button
            type="button"
            onClick={() => setIsDownloaderOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#d97757]/15 to-[#d97757]/5 hover:from-[#d97757]/25 hover:to-[#d97757]/10 border border-[#d97757]/30 hover:border-[#d97757]/50 active:scale-[0.99] text-[#f3efe6] font-medium text-xs sm:text-sm transition-all duration-200 cursor-pointer group shadow-sm"
          >
            <span className="font-medium tracking-tight flex items-center gap-2">
              <Download className="w-4 h-4 text-[#d97757] group-hover:translate-y-0.5 transition-transform" />
              Baixar vídeo
            </span>
            <span className="text-[10px] text-[#d97757]/70 font-mono group-hover:text-[#d97757] transition-colors">
              link → MP4
            </span>
          </button>
        </div>

        {/* New Chat Button (Modern DSS Pill) */}
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-dark-bg-secondary to-dark-hover hover:from-dark-hover hover:to-dark-card border border-gray-800/60 dark:border-white/5 active:scale-[0.99] text-[color:var(--c-fg-f3efe6)] font-medium text-xs sm:text-sm transition-all duration-200 cursor-pointer group shadow-sm hover:border-[#d97757]/30"
          >
            <span className="font-medium tracking-tight">Iniciar novo chat</span>
            <div className="w-6 h-6 rounded-lg bg-[#d97757]/15 flex items-center justify-center group-hover:bg-[#d97757]/25 transition-colors">
              <Plus className="w-3.5 h-3.5 text-[#d97757] group-hover:rotate-90 transition-transform duration-200" />
            </div>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-1">
          <div className="text-[10px] font-bold text-[color:var(--c-fg-8c867a)] px-2.5 py-1 uppercase tracking-wider font-mono">
            Recentes ({conversations.length})
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-12 px-4 text-[color:var(--c-fg-8c867a)] text-xs">
              Nenhuma conversa ainda.<br />
              Comece uma nova conversa acima!
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isEditing = editingId === conv.id;
              const isDeleting = deleteConfirmId === conv.id;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    if (window.innerWidth < 768) onClose();
                  }}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm cursor-pointer transition-all duration-150 active:scale-[0.99] ${
                    isActive
                      ? 'synap-card text-[color:var(--c-fg-f3efe6)] font-medium border-l-2 border-l-[#d97757]'
                      : 'text-[color:var(--c-fg-a0aec0)] hover:synap-card hover:text-[color:var(--c-fg-f3efe6)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#d97757]' : 'text-[color:var(--c-fg-8c867a)] group-hover:text-[color:var(--c-fg-f3efe6)]'}`} />

                    {isEditing ? (
                      <form
                        onSubmit={(e) => saveRename(conv.id, e)}
                        className="flex items-center gap-1 flex-1 mr-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-dark-bg border border-[#d97757] rounded-md px-2 py-0.5 text-xs text-[color:var(--c-on-strong)] focus:outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Confirmar alteração"
                          className="p-1 hover:text-emerald-400 text-zinc-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancelar renomeação"
                          className="p-1 hover:text-rose-400 text-zinc-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <div className="truncate flex-1">
                        <div className="truncate flex items-center gap-1.5">
                          <span className="truncate">{conv.title}</span>
                          {conv.activeRepo && (
                            <span
                              className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded bg-[color:var(--c-bg-2a261f)] text-[color:var(--c-fg-d97757)] border border-[#d97757]/30 font-mono font-medium truncate max-w-[80px]"
                              title={`Repositório exclusivo deste chat: ${conv.activeRepo.fullName} (${conv.activeRepo.branch})`}
                            >
                              {conv.activeRepo.repo}
                            </span>
                          )}
                          {(conv.isPlanMode || conv.messages?.some((m) => m.isPlanMode)) && (
                            <span className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/35 font-mono font-medium">
                              Plano
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[color:var(--c-fg-736e65)] font-normal">
                          {formatDate(conv.updatedAt)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions (Rename / Delete) */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                      {isDeleting ? (
                        <div
                          className="flex items-center gap-1 bg-[color:var(--c-bg-3a1d1d)] border border-rose-800 rounded-md px-1.5 py-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-rose-300">Apagar?</span>
                          <button
                            onClick={(e) => executeDelete(conv.id, e)}
                            aria-label="Confirmar exclusão"
                            className="p-0.5 text-rose-400 hover:text-[color:var(--c-on-strong)]"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(null);
                            }}
                            aria-label="Cancelar exclusão"
                            className="p-0.5 text-zinc-400 hover:text-[color:var(--c-on-strong)]"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => startRename(conv, e)}
                            aria-label="Renomear conversa"
                            className="p-1 text-[color:var(--c-fg-736e65)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d28)] rounded-md transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => confirmDelete(conv.id, e)}
                            aria-label="Deletar conversa"
                            className="p-1 text-[color:var(--c-fg-736e65)] hover:text-rose-400 hover:bg-[color:var(--c-bg-302d28)] rounded-md transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
          </>
        )}

        {/* Bottom actions (Modern DSS style) */}
        <div className="p-3 border-t border-gray-800/40 dark:border-white/5 space-y-2 bg-dark-bg/60">
          <PWAInstallButton />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[color:var(--c-fg-a0aec0)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-dark-hover text-xs font-medium transition-all duration-150 cursor-pointer"
            >
              <div className="w-5 h-5 rounded-md bg-[#d97757]/15 flex items-center justify-center shrink-0">
                <Settings className="w-3.5 h-3.5 text-[#d97757]" />
              </div>
              <span className="truncate">Configurações</span>
            </button>
            {onToggleTheme && (
              <button
                type="button"
                onClick={(e) => onToggleTheme(e)}
                aria-label={theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
                title={theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-[color:var(--c-fg-a0aec0)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-dark-hover transition-all duration-150 cursor-pointer group"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-400 group-hover:-rotate-12 transition-transform duration-300" />
                )}
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Downloader Modal */}
      {isDownloaderOpen && (
        <div
          onClick={() => setIsDownloaderOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm max-h-[90vh] bg-[#181714] border border-[#2d2a25] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
          >
            <DownloaderPanel onClose={() => setIsDownloaderOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
});
