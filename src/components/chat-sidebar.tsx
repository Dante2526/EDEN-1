import React, { useState } from 'react';
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
} from 'lucide-react';
import { Conversation, ActiveRepoState, Skill, McpServer, KnowledgeFact, KnowledgeCategory } from '../lib/types';
import { formatDate } from '../lib/utils';
import { PWAInstallButton } from './pwa-install-button';
import { ClaudeLogo } from './claude-logo';
import { RepoList } from './github/repo-list';
import { FileExplorer } from './github/file-explorer';
import { SourceControlPanel } from './source-control/source-control-panel';
import { ExtensionsPanel } from './extensions/extensions-panel';

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  isOpen: boolean;
  onClose: () => void;
  // GitHub & Source Control props
  activeRepo: ActiveRepoState | null;
  sidebarTab: 'chats' | 'repos' | 'source-control' | 'skills';
  onChangeTab: (tab: 'chats' | 'repos' | 'source-control' | 'skills') => void;
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
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 sm:w-80 bg-[#181714] border-r border-[#2d2a25] flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header / App branding */}
        <div className="p-4 border-b border-[#2d2a25] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ClaudeLogo className="w-6 h-6 text-[#d97757]" />
            <div>
              <h1 className="font-serif text-base font-medium text-[#f3efe6] tracking-tight">Synap</h1>
              <p className="text-[10px] text-[#8c867a] font-mono">Claude Design System</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="p-1 rounded-lg text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622] md:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs (Chats / Repos / Source Control) */}
        <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5 border-b border-[#2d2a25] bg-[#161512]">
          <button
            type="button"
            onClick={() => onChangeTab('chats')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              sidebarTab === 'chats'
                ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
                : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
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
                ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
                : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
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
                ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
                : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Git</span>
            {pendingChangesCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#d97757] text-white text-[9px] font-bold flex items-center justify-center">
                {pendingChangesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('skills')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer relative ${
              sidebarTab === 'skills'
                ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
                : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
            }`}
          >
            <Blocks className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Skills</span>
          </button>
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
        ) : (
          <>
        {/* New Chat Button (Claude style) */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[#3b3831] bg-[#22201d] hover:bg-[#2b2924] active:scale-[0.99] text-[#f3efe6] font-medium text-xs sm:text-sm transition-colors cursor-pointer group shadow-xs"
          >
            <span className="font-medium">Iniciar novo chat</span>
            <Plus className="w-4 h-4 text-[#d97757] group-hover:rotate-90 transition-transform duration-200" />
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          <div className="text-[10px] font-semibold text-[#736e65] px-3 py-1.5 uppercase tracking-wider font-mono">
            Recentes ({conversations.length})
          </div>

          {conversations.length === 0 ? (
            <div className="text-center py-12 px-4 text-[#736e65] text-xs">
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
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-xs sm:text-sm cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#282622] text-[#f3efe6] font-medium border border-[#3b3831]'
                      : 'text-[#b8b3a8] hover:bg-[#22201d] hover:text-[#f3efe6]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#d97757]' : 'text-[#736e65]'}`} />

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
                          className="w-full bg-dark-bg border border-[#d97757] rounded-md px-2 py-0.5 text-xs text-white focus:outline-none"
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
                              className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded bg-[#2a261f] text-[#d97757] border border-[#d97757]/30 font-mono font-medium truncate max-w-[80px]"
                              title={`Repositório exclusivo deste chat: ${conv.activeRepo.fullName} (${conv.activeRepo.branch})`}
                            >
                              {conv.activeRepo.repo}
                            </span>
                          )}
                          {(conv.isPlanMode || conv.messages?.some((m) => m.isPlanMode)) && (
                            <span className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded bg-[#d97757]/20 text-[#f09a7d] border border-[#d97757]/35 font-mono font-medium">
                              Plano
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#736e65] font-normal">
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
                          className="flex items-center gap-1 bg-[#3a1d1d] border border-rose-800 rounded-md px-1.5 py-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] text-rose-300">Apagar?</span>
                          <button
                            onClick={(e) => executeDelete(conv.id, e)}
                            aria-label="Confirmar exclusão"
                            className="p-0.5 text-rose-400 hover:text-white"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(null);
                            }}
                            aria-label="Cancelar exclusão"
                            className="p-0.5 text-zinc-400 hover:text-white"
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
                            className="p-1 text-[#736e65] hover:text-[#f3efe6] hover:bg-[#302d28] rounded-md transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => confirmDelete(conv.id, e)}
                            aria-label="Deletar conversa"
                            className="p-1 text-[#736e65] hover:text-rose-400 hover:bg-[#302d28] rounded-md transition"
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

        {/* Bottom actions (Claude style) */}
        <div className="p-3 border-t border-[#2d2a25] space-y-2">
          <PWAInstallButton />

          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#b8b3a8] hover:text-[#f3efe6] hover:bg-[#25231f] text-xs font-medium transition cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#d97757]" />
            <span>Configurações</span>
          </button>
        </div>
      </aside>
    </>
  );
});
