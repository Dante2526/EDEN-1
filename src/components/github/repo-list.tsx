import React, { useState, useEffect } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import {
  FolderGit2,
  Search,
  Star,
  Lock,
  Globe,
  Loader2,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import { GitHubRepo, ActiveRepoState } from '../../lib/types';
import { fetchUserRepos } from '../../lib/github';
import { formatDate } from '../../lib/utils';

interface RepoListProps {
  onSelectRepo: (repo: ActiveRepoState) => void;
  onOpenSettings: () => void;
  activeRepo: ActiveRepoState | null;
}

export const RepoList: React.FC<RepoListProps> = ({
  onSelectRepo,
  onOpenSettings,
  activeRepo,
}) => {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasPat, setHasPat] = useState<boolean>(false);

  const loadRepos = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchUserRepos();
      setRepos(data);
      setHasPat(true);
    } catch (err: any) {
      console.warn('Failed to load user repos:', err);
      setHasPat(false);
      setError(
        err?.message ||
          'Token do GitHub não configurado ou sem permissão. Adicione GITHUB_TOKEN na Vercel ou configure em Configurações.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
  }, []);

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.language && r.language.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[color:var(--c-bg-181714)] text-[color:var(--c-fg-f3efe6)] select-none overflow-hidden">
      {/* Top Header */}
      <div className="p-3 border-b border-[color:var(--c-bg-2d2a25)] bg-[color:var(--c-bg-1d1b18)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--c-fg-c4bfb6)]">
              Repositórios GitHub
            </h2>
            <p className="text-[10px] text-[color:var(--c-fg-8c867a)]">Vinculados individualmente por chat</p>
          </div>
        </div>
        {hasPat && (
          <button
            type="button"
            onClick={loadRepos}
            disabled={loading}
            title="Atualizar repositórios"
            className="p-1 rounded text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)] transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[color:var(--c-fg-d97757)]' : ''}`} />
          </button>
        )}
      </div>

      {/* If no PAT configured */}
      {!hasPat ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[color:var(--c-bg-262420)] border border-[color:var(--c-bg-3b3831)] flex items-center justify-center text-[color:var(--c-fg-d97757)]">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-[color:var(--c-fg-f3efe6)]">GitHub Não Conectado</h3>
            <p className="text-xs text-[color:var(--c-fg-8c867a)] mt-1 max-w-xs">
              Conecte seu Personal Access Token do GitHub para que a IA possa ler e editar arquivos
              do seu repositório.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-4 py-2 rounded-xl bg-[#d97757] hover:bg-[#c26647] text-white text-xs font-medium transition cursor-pointer shadow-xs"
          >
            Conectar em Configurações
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search box */}
          <div className="p-3 border-b border-[color:var(--c-bg-2d2a25)] bg-dark-bg">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[color:var(--c-fg-736e65)] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar repositórios..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-3b3831)] text-xs text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-6b665c)] focus:outline-hidden focus:border-[#d97757]"
              />
            </div>
          </div>

          {/* Repo list content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3 text-[color:var(--c-fg-8c867a)]">
                <ThinkingOrb
                  state="connecting"
                  size={64}
                  theme="dark"
                  speed={1.5}
                  aria-label="Conectando…"
                />
                <div className="flex flex-col items-center text-center">
                  <span className="text-xs text-[color:var(--c-fg-c4bfb6)] font-medium">Conectando aos repositórios…</span>
                  <span className="text-[10px] text-[color:var(--c-fg-736e65)] mt-0.5">Consultando API do GitHub</span>
                </div>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 space-y-2">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-xs text-[color:var(--c-fg-d97757)] hover:underline"
                >
                  Verificar token em Configurações
                </button>
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="text-center py-10 text-xs text-[color:var(--c-fg-8c867a)]">
                Nenhum repositório encontrado com esse filtro.
              </div>
            ) : (
              filteredRepos.map((repo) => {
                const isActive = activeRepo?.fullName === repo.full_name;

                return (
                  <div
                    key={repo.id}
                    className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2.5 ${
                      isActive
                        ? 'bg-[color:var(--c-bg-2b2720)] border-[#d97757]/60 shadow-xs'
                        : 'bg-[color:var(--c-bg-1f1d19)] border-[color:var(--c-bg-312f2a)] hover:border-[color:var(--c-bg-423e35)]'
                    }`}
                  >
                    <div>
                      {/* Name & status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {repo.private ? (
                            <Lock className="w-3.5 h-3.5 text-[color:var(--c-fg-a39d93)] shrink-0" />
                          ) : (
                            <Globe className="w-3.5 h-3.5 text-[color:var(--c-fg-a39d93)] shrink-0" />
                          )}
                          <span className="font-medium text-xs text-[color:var(--c-fg-f3efe6)] truncate">
                            {repo.name}
                          </span>
                        </div>

                        {isActive && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40 shrink-0">
                            Vinculado a este chat
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {repo.description && (
                        <p className="text-[11px] text-[color:var(--c-fg-a39d93)] line-clamp-2 mt-1 leading-relaxed">
                          {repo.description}
                        </p>
                      )}
                    </div>

                    {/* Meta info & Open button */}
                    <div className="flex items-center justify-between pt-1 border-t border-[color:var(--c-bg-292722)] text-[11px] text-[color:var(--c-fg-8c867a)]">
                      <div className="flex items-center gap-3">
                        {repo.language && (
                          <span className="flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#d97757]" />
                            <span>{repo.language}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-400" />
                          <span>{repo.stargazers_count}</span>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onSelectRepo({
                            owner: repo.owner.login,
                            repo: repo.name,
                            fullName: repo.full_name,
                            branch: repo.default_branch,
                            defaultBranch: repo.default_branch,
                          })
                        }
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                          isActive
                            ? 'bg-[color:var(--c-bg-332e26)] hover:bg-[#d97757] text-[color:var(--c-fg-f3efe6)]'
                            : 'bg-[color:var(--c-bg-2a2620)] hover:bg-[#d97757] text-[color:var(--c-fg-e8e3d8)]'
                        }`}
                      >
                        <span>{isActive ? 'Explorar Arquivos' : 'Vincular a este Chat'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
