import React, { useState, useEffect, useMemo } from 'react';
import {
  FileCode,
  Plus,
  Trash2,
  ArrowRight,
  Loader2,
  FolderGit2,
  Clock,
  Sparkles,
  X,
  Check,
  Edit2,
  AlertCircle,
} from 'lucide-react';
import { useProjects } from '../../lib/project-context';
import { ProjectTemplate } from '../../lib/types';

const TEMPLATES: Array<{ id: ProjectTemplate; label: string; desc: string; icon?: string }> = [
  { id: 'react-ts', label: 'React + TS', desc: 'React 19 com TypeScript' },
  { id: 'react', label: 'React + JS', desc: 'React 19 com JavaScript' },
  { id: 'vite-react-ts', label: 'Vite + React', desc: 'Vite bundler + React + TS' },
  { id: 'vanilla-ts', label: 'Vanilla TS', desc: 'TypeScript puro' },
  { id: 'vanilla', label: 'Vanilla JS', desc: 'JavaScript puro' },
  { id: 'vue', label: 'Vue 3', desc: 'Vue 3 com Composition API' },
  { id: 'static', label: 'HTML/CSS/JS', desc: 'Site estático sem bundler' },
  { id: 'node', label: 'Node.js', desc: 'Backend Node.js' },
];

export const ProjectsPanel: React.FC = () => {
  const {
    projectsIndex,
    loading,
    openProject,
    createProject,
    removeProject,
    renameProject,
  } = useProjects();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTemplate, setNewTemplate] = useState<ProjectTemplate>('react-ts');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createProject({ name: newName.trim(), template: newTemplate });
      setNewName('');
      setNewTemplate('react-ts');
      setShowCreate(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar projeto');
    } finally {
      setCreating(false);
    }
  };

  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      renameProject(id, renameValue.trim());
    }
    setRenameId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[color:var(--c-bg-181714)] text-[color:var(--c-fg-f3efe6)] select-none overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[color:var(--c-bg-2d2a25)] bg-[color:var(--c-bg-1d1b18)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-[#d97757] shrink-0" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--c-fg-c4bfb6)]">
              Projetos
            </h2>
            <p className="text-[10px] text-[color:var(--c-fg-8c867a)]">
              Preview ao vivo com Sandpack
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          title="Criar novo projeto"
          className="p-1.5 rounded text-[#d97757] hover:text-white hover:bg-[#d97757] transition cursor-pointer border border-[#d97757]/30 hover:border-[#d97757]"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lista de projetos */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2 text-[#8c867a]">
            <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
            <span className="text-xs">Carregando projetos...</span>
          </div>
        ) : projectsIndex.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#262420] border border-[#3b3831] flex items-center justify-center">
              <FileCode className="w-6 h-6 text-[#d97757]" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#f3efe6]">Nenhum projeto ainda</h3>
              <p className="text-xs text-[#8c867a] mt-1 max-w-xs">
                Crie um projeto do zero ou peça pra IA criar algo no chat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d97757]/15 hover:bg-[#d97757]/25 border border-[#d97757]/30 text-[#d97757] text-xs font-medium transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Criar projeto
            </button>
          </div>
        ) : (
          projectsIndex.map((p) => {
            const isRenaming = renameId === p.id;
            const isDeleting = deleteConfirmId === p.id;

            return (
              <div
                key={p.id}
                className="group p-3 rounded-xl border border-[#312f2a] hover:border-[#423e35] bg-[#1f1d19] transition flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-[#d97757]/15 border border-[#d97757]/30 flex items-center justify-center shrink-0">
                      <FileCode className="w-3.5 h-3.5 text-[#d97757]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit(p.id);
                              if (e.key === 'Escape') setRenameId(null);
                            }}
                            autoFocus
                            className="bg-[#22201d] border border-[#d97757]/60 rounded-md px-2 py-0.5 text-xs text-[#f3efe6] focus:outline-none w-full"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameSubmit(p.id)}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRenameId(p.id);
                            setRenameValue(p.name);
                          }}
                          className="group/name flex items-center gap-1 cursor-text min-w-0"
                        >
                          <span className="text-xs font-medium text-[#f3efe6] truncate">{p.name}</span>
                          <Edit2 className="w-2.5 h-2.5 text-[#5e5a52] opacity-0 group-hover/name:opacity-100 transition shrink-0" />
                        </button>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] text-[#736e65] font-mono mt-0.5">
                        <span className="capitalize">{p.template.replace(/-/g, ' ')}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <FolderGit2 className="w-2.5 h-2.5" />
                          {p.fileCount} arq
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(p.updatedAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isDeleting ? (
                      <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-800/40 rounded px-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            removeProject(p.id);
                            setDeleteConfirmId(null);
                          }}
                          className="p-0.5 text-rose-400 hover:text-white"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="p-0.5 text-zinc-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(p.id)}
                          className="p-1 text-[#5e5a52] hover:text-rose-400 hover:bg-rose-500/10 rounded opacity-0 group-hover:opacity-100 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openProject(p.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2a2620] hover:bg-[#d97757] text-[#e8e3d8] hover:text-white text-xs font-medium transition cursor-pointer"
                        >
                          Abrir
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-[#2d2a25] bg-[#1d1b18]">
        <p className="text-[10px] text-[#5e5a52] text-center leading-relaxed flex items-center justify-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-[#d97757]" />
          Powered by Sandpack · Preview ao vivo no navegador
        </p>
      </div>

      {/* Modal de criação */}
      {showCreate && (
        <div
          onClick={() => !creating && setShowCreate(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#181714] border border-[#2d2a25] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
          >
            <div className="px-5 pt-4 pb-3 border-b border-[#2d2a25] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#d97757]/20 to-[#d97757]/5 border border-[#d97757]/30 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-[#d97757]" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-[#f3efe6] font-serif">Novo projeto</h2>
                  <p className="text-[10px] text-[#736e65] font-mono">Preview ao vivo com Sandpack</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !creating && setShowCreate(false)}
                className="p-1.5 rounded-lg text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#b8b3a8] uppercase tracking-wider font-mono">
                  Nome do projeto *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim() && !creating) {
                      handleCreate();
                    }
                  }}
                  placeholder="ex: app-de-tarefas"
                  autoFocus
                  disabled={creating}
                  className="w-full bg-[#22201d] border border-[#3b3831] focus:border-[#d97757]/60 rounded-xl px-3 py-2.5 text-xs text-[#f3efe6] placeholder:text-[#5e5a52] focus:outline-none focus:ring-1 focus:ring-[#d97757]/40 transition-colors disabled:opacity-60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#b8b3a8] uppercase tracking-wider font-mono">
                  Template
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewTemplate(t.id)}
                      disabled={creating}
                      className={`flex flex-col items-start gap-0.5 p-2.5 rounded-lg border text-left transition cursor-pointer disabled:opacity-50 ${
                        newTemplate === t.id
                          ? 'bg-[#d97757]/10 border-[#d97757]/50 shadow-xs'
                          : 'bg-[#22201d] border-[#3b3831] hover:border-[#423e35]'
                      }`}
                    >
                      <span className="text-[11px] font-medium text-[#f3efe6]">{t.label}</span>
                      <span className="text-[9px] text-[#8c867a] leading-tight">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-rose-950/40 border border-rose-800/40 p-2.5 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-rose-300">{error}</div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-[#22201d] border border-[#3b3831] hover:bg-[#2b2924] text-[#b8b3a8] hover:text-[#f3efe6] text-xs font-medium transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-[#d97757] to-[#c4663f] hover:from-[#e08368] hover:to-[#d97757] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Criar projeto
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
