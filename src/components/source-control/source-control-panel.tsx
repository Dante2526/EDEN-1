import React, { useState, useEffect, useCallback } from 'react';
import {
  GitCommit,
  GitBranch,
  FolderGit2,
  Plus,
  Minus,
  Undo2,
  Check,
  AlertCircle,
  ExternalLink,
  Loader2,
  Trash2,
  Eye,
  History,
  GitFork,
  RefreshCw,
  Copy,
  Clock,
  Sparkles,
  GitMerge,
  ArrowDownCircle,
  Download,
  CheckCircle2,
} from 'lucide-react';
import { PendingChange, ActiveRepoState, GitHubCommitItem } from '../../lib/types';
import { usePendingChanges } from '../../lib/pending-changes';
import { commitStagedChanges } from '../../lib/github-commit';
import { createRepoBranch, fetchRepoCommits } from '../../lib/github';
import { DiffViewer } from './diff-viewer';

interface SourceControlPanelProps {
  activeRepo: ActiveRepoState | null;
  onOpenRepoList: () => void;
  onOpenSettings: () => void;
  onSelectChangeToView?: (change: PendingChange) => void;
  onChangeBranch?: (branch: string) => void;
}

export const SourceControlPanel: React.FC<SourceControlPanelProps> = ({
  activeRepo,
  onOpenRepoList,
  onOpenSettings,
  onChangeBranch,
}) => {
  const {
    changes,
    stageChange,
    unstageChange,
    discardChange,
    discardAll,
    stageAll,
    unstageAll,
    clearCommitted,
    updateChangeContent,
  } = usePendingChanges();

  // Tab: 'changes' (alterações pendentes) or 'history' (histórico de commits)
  const [activeTab, setActiveTab] = useState<'changes' | 'history'>('changes');

  // Commit Form State
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGeneratingCommitMsg, setIsGeneratingCommitMsg] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<{ sha: string; url: string } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [selectedChange, setSelectedChange] = useState<PendingChange | null>(null);

  // New Branch Creation State
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isBranchLoading, setIsBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchSuccess, setBranchSuccess] = useState<string | null>(null);

  // Commit History State
  const [commits, setCommits] = useState<GitHubCommitItem[]>([]);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  // Remote Sync & Pull State (Google AI Studio / VS Code style)
  const [incomingCommits, setIncomingCommits] = useState<GitHubCommitItem[]>([]);
  const [isCheckingRemote, setIsCheckingRemote] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullSuccess, setPullSuccess] = useState<string | null>(null);
  const [showIncomingDetails, setShowIncomingDetails] = useState(false);

  const getSyncStorageKey = useCallback(() => {
    if (!activeRepo) return null;
    return `synap_synced_sha_${activeRepo.fullName}_${activeRepo.branch}`;
  }, [activeRepo]);

  // Check remote commits against local synced state
  const checkRemoteChanges = useCallback(
    async (isSilent = false) => {
      if (!activeRepo) return;
      const key = getSyncStorageKey();
      if (!key) return;

      if (!isSilent) setIsCheckingRemote(true);
      try {
        const remoteCommits = await fetchRepoCommits(
          undefined,
          activeRepo.owner,
          activeRepo.repo,
          activeRepo.branch,
          25
        );

        if (remoteCommits.length === 0) {
          setIncomingCommits([]);
          return;
        }

        const historyKey = `synap_recent_commits_${activeRepo.fullName}_${activeRepo.branch}`;
        const localCreatedShas: string[] = (() => {
          try {
            const raw = localStorage.getItem(historyKey);
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        })();

        const storedSha = localStorage.getItem(key);
        if (!storedSha) {
          // Âncora inicial: marca o commit mais recente como base
          localStorage.setItem(key, remoteCommits[0].sha);
          setIncomingCommits([]);
        } else {
          const foundIndex = remoteCommits.findIndex(
            (c) => c.sha === storedSha || c.short_sha === storedSha
          );
          if (foundIndex === -1) {
            // Houve novos commits que empurraram a lista
            const candidateCommits = remoteCommits.slice(0, 10);
            const isAllLocal = candidateCommits.length > 0 && candidateCommits.every((c) =>
              localCreatedShas.some((s) => s === c.sha || s.startsWith(c.short_sha) || c.sha.startsWith(s))
            );
            if (isAllLocal) {
              localStorage.setItem(key, remoteCommits[0].sha);
              setIncomingCommits([]);
            } else {
              setIncomingCommits(candidateCommits);
            }
          } else if (foundIndex > 0) {
            // Há commits remotos à frente
            const aheadCommits = remoteCommits.slice(0, foundIndex);
            // Se os commits à frente foram criados pelo próprio Synap, sincroniza sem alertar pull falso
            const isAllLocal = aheadCommits.length > 0 && aheadCommits.every((c) =>
              localCreatedShas.some((s) => s === c.sha || s.startsWith(c.short_sha) || c.sha.startsWith(s))
            );
            if (isAllLocal) {
              localStorage.setItem(key, remoteCommits[0].sha);
              setIncomingCommits([]);
            } else {
              setIncomingCommits(aheadCommits);
            }
          } else {
            // Perfeitamente atualizado com o GitHub
            setIncomingCommits([]);
          }
        }
      } catch (err) {
        console.warn('Erro ao verificar alterações remotas:', err);
      } finally {
        if (!isSilent) setIsCheckingRemote(false);
      }
    },
    [activeRepo, getSyncStorageKey]
  );

  // Pull changes handler
  const handlePullChanges = async () => {
    if (!activeRepo) return;
    setIsPulling(true);
    setPullSuccess(null);

    try {
      const remoteCommits = await fetchRepoCommits(
        undefined,
        activeRepo.owner,
        activeRepo.repo,
        activeRepo.branch,
        15
      );

      const key = getSyncStorageKey();
      if (remoteCommits.length > 0 && key) {
        localStorage.setItem(key, remoteCommits[0].sha);
      }

      const count = incomingCommits.length > 0 ? incomingCommits.length : 1;
      setIncomingCommits([]);
      setShowIncomingDetails(false);
      setPullSuccess(`Puxados com sucesso ${count} commit(s) do GitHub (${activeRepo.branch})!`);

      await loadCommits();

      setTimeout(() => {
        setPullSuccess(null);
      }, 5000);
    } catch (err: any) {
      alert('Erro ao puxar alterações: ' + (err?.message || 'Falha na comunicação com o GitHub'));
    } finally {
      setIsPulling(false);
    }
  };

  useEffect(() => {
    if (activeRepo) {
      checkRemoteChanges(true);
    }
  }, [activeRepo?.fullName, activeRepo?.branch, checkRemoteChanges]);

  // Filter changes for current active repo
  const repoChanges = activeRepo
    ? changes.filter(
        (c) => c.repo === activeRepo.fullName && c.branch === activeRepo.branch
      )
    : [];

  const unstagedChanges = repoChanges.filter((c) => !c.staged);
  const stagedChanges = repoChanges.filter((c) => c.staged);

  // Fetch commit history
  const loadCommits = useCallback(async () => {
    if (!activeRepo) return;
    setIsLoadingCommits(true);
    setCommitsError(null);
    try {
      const data = await fetchRepoCommits(
        undefined,
        activeRepo.owner,
        activeRepo.repo,
        activeRepo.branch,
        30
      );
      setCommits(data);
    } catch (err: any) {
      console.error('Erro ao carregar commits:', err);
      setCommitsError(err?.message || 'Falha ao buscar histórico de commits.');
    } finally {
      setIsLoadingCommits(false);
    }
  }, [activeRepo]);

  // Load commits when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && activeRepo) {
      loadCommits();
    }
  }, [activeTab, activeRepo?.fullName, activeRepo?.branch, loadCommits]);

  // Generate commit message using AI (Antigravity / Cursor style)
  const handleGenerateCommitMessage = async () => {
    const changesToAnalyze = stagedChanges.length > 0 ? stagedChanges : repoChanges;
    if (changesToAnalyze.length === 0) {
      setCommitError('Nenhuma alteração para analisar. Modifique ou adicione arquivos primeiro.');
      return;
    }

    setIsGeneratingCommitMsg(true);
    setCommitError(null);

    // Gerador de mensagem de fallback instantânea (Conventional Commits)
    const getFallbackCommitMsg = () => {
      const first = changesToAnalyze[0];
      const filename = first?.path ? first.path.split('/').pop() || first.path : 'arquivos';
      const prefix = first?.type === 'added' ? 'feat' : first?.type === 'deleted' ? 'chore' : 'fix';
      if (changesToAnalyze.length === 1) {
        return `${prefix}: atualizar ${filename}`;
      }
      return `${prefix}: atualizar ${filename} e mais ${changesToAnalyze.length - 1} arquivo(s)`;
    };

    // Preenche instantaneamente (0ms) para feedback imediato na UI
    const instantFallback = getFallbackCommitMsg();
    if (!commitMessage.trim()) {
      setCommitMessage(instantFallback);
    }

    // Timeout rápido de 12s para a IA refinar o texto
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      // Resumo ultra-enxuto: apenas caminhos e tipos (sem despejar bytes ou códigos pesados)
      const filesSummary = changesToAnalyze
        .slice(0, 10)
        .map((c) => `${c.type === 'added' ? '+' : c.type === 'deleted' ? '-' : '~'} ${c.path}`)
        .join('\n');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_API_SECRET || '',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'Você é um gerador de Conventional Commits ultra-rápido.\n' +
                'Gere EXCLUSIVAMENTE uma única linha de commit conciso (ex: feat: ..., fix: ..., chore: ...).\n' +
                'REGRAS:\n' +
                '1. Máximo 60 caracteres.\n' +
                '2. NÃO pense, NÃO use <think>, NÃO use crases ou aspas.\n' +
                '3. Responda DIRETAMENTE com o commit.',
            },
            {
              role: 'user',
              content: `Arquivos alterados:\n${filesSummary}\n\nGere o commit:`,
            },
          ],
          model: 'z-ai/glm-5.3-flash',
          reasoning_effort: 'none',
          max_tokens: 50,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Falha na API (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Nenhuma resposta retornada pelo servidor.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let generatedText = '';
      let buffer = '';

      let lastChunkTime = Date.now();
      const readTimeout = setInterval(() => {
        if (Date.now() - lastChunkTime > 8000) {
          controller.abort();
          clearInterval(readTimeout);
        }
      }, 1000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          lastChunkTime = Date.now();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.replace(/^data:\s*/, '');
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                generatedText += delta.content;
                const clean = generatedText
                  .replace(/^["'`]+|["'`]+$/g, '')
                  .replace(/[\r\n]+/g, ' ')
                  .trim();
                if (clean) {
                  setCommitMessage(clean);
                }
              }
            } catch {}
          }
        }
      } finally {
        clearInterval(readTimeout);
      }

      if (!generatedText.trim() && !commitMessage.trim()) {
        setCommitMessage(instantFallback);
      }
    } catch (err: any) {
      console.warn('IA demorou ou falhou, garantindo mensagem de commit rápida:', err);
      if (!commitMessage.trim()) {
        setCommitMessage(instantFallback);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsGeneratingCommitMsg(false);
    }
  };

  const handleCommit = async () => {
    if (!activeRepo) return;
    if (!commitMessage.trim()) {
      setCommitError('Digite uma mensagem para o commit.');
      return;
    }

    const changesToCommit = stagedChanges.length > 0 ? stagedChanges : repoChanges;
    if (changesToCommit.length === 0) {
      setCommitError('Nenhuma alteração para commitar.');
      return;
    }

    setIsCommitting(true);
    setCommitError(null);
    setCommitSuccess(null);

    try {
      const result = await commitStagedChanges(
        null,
        activeRepo.owner,
        activeRepo.repo,
        activeRepo.branch,
        commitMessage.trim(),
        changesToCommit
      );

      await clearCommitted(changesToCommit);
      setCommitMessage('');
      setCommitSuccess({
        sha: result.sha.substring(0, 7),
        url: result.html_url,
      });

      // Sincroniza imediatamente o SHA local para evitar falso alerta de Pull
      const syncKey = getSyncStorageKey();
      if (syncKey && result?.sha) {
        localStorage.setItem(syncKey, result.sha);
      }
      setIncomingCommits([]);

      // Reload commits if user is in history or will switch to it
      loadCommits();
    } catch (err: any) {
      console.error('Commit error:', err);
      let msg = err?.message || 'Falha ao realizar commit no GitHub.';
      if (msg.includes('Tempo limite excedido') || err?.name === 'AbortError') {
        msg = 'Timeout: o GitHub demorou demais pra responder. Pode ser rede lenta ou muitos arquivos. Tente novamente em alguns segundos.';
      } else if (msg.includes('403') || msg.includes('401')) {
        msg = 'Permissão negada (403/401). Verifique se o seu token tem permissão "Contents: Read and write" ou se a branch é protegida.';
      } else if (msg.includes('409')) {
        msg = 'Conflito: o arquivo foi modificado no GitHub depois que você abriu. Recarregue o arquivo e tente novamente.';
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = 'Erro de rede ao contactar o GitHub. Verifique sua conexão e tente novamente.';
      }
      setCommitError(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleDiscardAll = async () => {
    if (!activeRepo) return;
    await discardAll(activeRepo.fullName, activeRepo.branch);
    setConfirmDiscardAll(false);
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRepo) return;
    const clean = newBranchName.trim().replace(/^refs\/heads\//, '').replace(/\s+/g, '-');
    if (!clean) {
      setBranchError('Informe o nome da nova branch.');
      return;
    }

    setIsBranchLoading(true);
    setBranchError(null);
    try {
      const res = await createRepoBranch(
        undefined,
        activeRepo.owner,
        activeRepo.repo,
        clean,
        activeRepo.branch
      );
      setBranchSuccess(`Branch '${res.branch}' criada com sucesso!`);
      setNewBranchName('');
      setIsCreatingBranch(false);

      if (onChangeBranch) {
        onChangeBranch(res.branch);
      }

      setTimeout(() => setBranchSuccess(null), 4000);
    } catch (err: any) {
      console.error('Erro ao criar branch:', err);
      setBranchError(err?.message || 'Falha ao criar branch no GitHub.');
    } finally {
      setIsBranchLoading(false);
    }
  };

  const handleCopySha = (sha: string) => {
    navigator.clipboard?.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMin < 1) return 'agora há pouco';
      if (diffMin < 60) return `há ${diffMin}m`;
      if (diffHours < 24) return `há ${diffHours}h`;
      if (diffDays === 1) return 'ontem';
      if (diffDays < 30) return `há ${diffDays} dias`;
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[color:var(--c-bg-181714)] text-[color:var(--c-fg-f3efe6)] select-none overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[color:var(--c-bg-2d2a25)] bg-[color:var(--c-bg-1d1b18)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-emerald-400 shrink-0" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--c-fg-c4bfb6)]">
            Source Control
          </h2>
        </div>
        {activeRepo && repoChanges.length > 0 && (
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40">
            {repoChanges.length} pendente(s)
          </span>
        )}
      </div>

      {/* Active Repo Selector or Empty State */}
      {!activeRepo ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
          <FolderGit2 className="w-10 h-10 text-[color:var(--c-fg-544f45)]" />
          <div>
            <h3 className="text-sm font-medium text-[color:var(--c-fg-f3efe6)]">Nenhum repositório neste chat</h3>
            <p className="text-xs text-[color:var(--c-fg-8c867a)] mt-1 max-w-xs">
              Vincule um repositório GitHub a esta conversa para usar o Source Control, criar branches e commitar.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenRepoList}
            className="px-3.5 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#c26647] text-white text-xs font-medium transition cursor-pointer shadow-xs"
          >
            Vincular Repositório a este Chat
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Active Repo Info Card with New Branch button */}
          <div className="p-3 bg-[color:var(--c-bg-201e1a)] border-b border-[color:var(--c-bg-2d2a25)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--c-fg-f3efe6)] truncate">
                  <FolderGit2 className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
                  <span className="truncate">{activeRepo.fullName}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-[color:var(--c-fg-8c867a)] mt-0.5">
                  <GitBranch className="w-3 h-3 text-[color:var(--c-fg-d97757)]" />
                  <span className="text-[color:var(--c-fg-d8d3c9)] font-semibold">{activeRepo.branch}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreatingBranch((prev) => !prev)}
                  title="Criar nova branch a partir desta"
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-[color:var(--c-bg-2d2a23)] hover:bg-[color:var(--c-bg-3b362c)] text-[color:var(--c-fg-f09a7d)] hover:text-[color:var(--c-on-strong)] border border-[color:var(--c-bg-484133)] text-[11px] font-medium transition cursor-pointer shadow-2xs"
                >
                  <GitFork className="w-3 h-3" />
                  <span>+ Branch</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenRepoList}
                  className="text-[11px] text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-d97757)] hover:underline cursor-pointer"
                >
                  Trocar
                </button>
              </div>
            </div>

            {/* Inline Branch Creation Form */}
            {isCreatingBranch && (
              <form
                onSubmit={handleCreateBranch}
                className="mt-1 p-2.5 rounded-xl bg-[color:var(--c-bg-171613)] border border-[color:var(--c-bg-3e392f)] space-y-2"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[color:var(--c-fg-f3efe6)] flex items-center gap-1">
                    <GitFork className="w-3 h-3 text-[color:var(--c-fg-d97757)]" /> Nova Branch
                  </span>
                  <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-mono">
                    de: {activeRepo.branch}
                  </span>
                </div>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="ex: feature/melhorias-ui"
                  autoFocus
                  disabled={isBranchLoading}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3f3b33)] text-xs text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-6b665c)] font-mono focus:outline-hidden focus:border-[#d97757]"
                />
                {branchError && (
                  <p className="text-[10px] text-rose-400 leading-tight">{branchError}</p>
                )}
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingBranch(false);
                      setBranchError(null);
                    }}
                    disabled={isBranchLoading}
                    className="px-2.5 py-1 rounded text-[11px] text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isBranchLoading || !newBranchName.trim()}
                    className="flex items-center gap-1 px-3 py-1 rounded bg-[#d97757] hover:bg-[#c26647] text-white text-[11px] font-medium transition cursor-pointer disabled:opacity-40"
                  >
                    {isBranchLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Criar e Trocar</span>
                  </button>
                </div>
              </form>
            )}

            {branchSuccess && (
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-[11px] text-emerald-300 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{branchSuccess}</span>
              </div>
            )}

            {/* Remote Sync Bar (Fetch / Pull Status) */}
            <div className="flex items-center justify-between pt-1.5 border-t border-[color:var(--c-bg-2d2a25)] text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[color:var(--c-fg-8c867a)]">GitHub Remoto:</span>
                {incomingCommits.length > 0 ? (
                  <span className="text-amber-400 font-medium flex items-center gap-1">
                    <ArrowDownCircle className="w-3 h-3 text-amber-400" />
                    <span>{incomingCommits.length} para puxar</span>
                  </span>
                ) : (
                  <span className="text-emerald-400/90 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Em dia
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {incomingCommits.length > 0 && (
                  <button
                    type="button"
                    onClick={handlePullChanges}
                    disabled={isPulling}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 text-[10px] font-semibold transition cursor-pointer"
                  >
                    {isPulling ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Download className="w-2.5 h-2.5" />}
                    <span>Puxar (Pull)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => checkRemoteChanges(false)}
                  disabled={isCheckingRemote}
                  title="Verificar se há novos commits no GitHub"
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--c-bg-25231e)] hover:bg-[color:var(--c-bg-312e27)] text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-3a362e)] text-[10px] transition cursor-pointer"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isCheckingRemote ? 'animate-spin' : ''}`} />
                  <span>{isCheckingRemote ? 'Buscando...' : 'Fetch'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Prominent Pull Banner when Remote has Incoming Commits */}
          {incomingCommits.length > 0 && (
            <div className="mx-3 mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-950/60 via-orange-950/50 to-amber-950/40 border border-amber-500/40 text-amber-200 shadow-md flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ArrowDownCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
                    {incomingCommits.length === 1 ? '1 alteração no GitHub' : `${incomingCommits.length} alterações no GitHub`}
                  </span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-medium whitespace-nowrap shrink-0">
                  {incomingCommits.length} {incomingCommits.length === 1 ? 'commit' : 'commits'}
                </span>
              </div>

              <p className="text-[11px] text-[color:var(--c-fg-c4bcaa)] leading-relaxed">
                Sincronize as atualizações da branch <strong>{activeRepo.branch}</strong> com o seu ambiente local.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handlePullChanges}
                  disabled={isPulling}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isPulling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="whitespace-nowrap">{isPulling ? 'Puxando...' : 'Puxar Alterações'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowIncomingDetails(!showIncomingDetails)}
                  className="py-1.5 px-2.5 rounded-lg bg-[color:var(--c-bg-25231e)] hover:bg-[color:var(--c-bg-312e27)] border border-[color:var(--c-bg-3f3b33)] text-[11px] text-[color:var(--c-fg-c4bcaa)] hover:text-[color:var(--c-on-strong)] transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  {showIncomingDetails ? 'Ocultar' : 'Detalhes'}
                </button>
              </div>

              {showIncomingDetails && (
                <div className="mt-1 pt-2 border-t border-amber-500/20 space-y-1.5 max-h-40 overflow-y-auto">
                  {incomingCommits.map((c) => (
                    <div
                      key={c.sha}
                      className="text-[11px] p-2 rounded bg-[color:var(--c-bg-171612)] border border-[color:var(--c-bg-2e2a23)] flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-[color:var(--c-fg-f3efe6)] truncate">{c.message || '(sem mensagem)'}</div>
                        <div className="text-[10px] text-[color:var(--c-fg-8c867a)] font-mono mt-0.5">
                          {c.author?.name || 'Unknown'} • {c.short_sha || (c.sha || '').slice(0, 7)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {pullSuccess && (
            <div className="mx-3 mt-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{pullSuccess}</span>
            </div>
          )}

          {/* Subtab navigation: Alterações vs Histórico */}
          <div className="flex items-center border-b border-[color:var(--c-bg-2d2a25)] bg-[color:var(--c-bg-1a1815)] px-2">
            <button
              type="button"
              onClick={() => setActiveTab('changes')}
              className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'changes'
                  ? 'border-[#d97757] text-[color:var(--c-fg-f3efe6)] font-semibold'
                  : 'border-transparent text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-c4bfb6)]'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>Alterações</span>
              {repoChanges.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] font-mono">
                  {repoChanges.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 text-xs font-medium text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-[#d97757] text-[color:var(--c-fg-f3efe6)] font-semibold'
                  : 'border-transparent text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-c4bfb6)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Histórico de Commits</span>
            </button>
          </div>

          {/* TAB 1: PENDING CHANGES */}
          {activeTab === 'changes' && (
            <div className="flex-1 flex flex-col">
              {/* Commit Message Box */}
              <div className="p-3 border-b border-[color:var(--c-bg-2d2a25)] space-y-2 bg-dark-bg">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[color:var(--c-fg-c4bfb6)]">Mensagem de Commit</span>
                  <button
                    type="button"
                    onClick={handleGenerateCommitMessage}
                    disabled={isGeneratingCommitMsg || isCommitting || repoChanges.length === 0}
                    title="Analisar os arquivos alterados e gerar mensagem no padrão Conventional Commits com IA"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 border border-amber-500/35 text-amber-300 hover:text-amber-200 transition text-[11px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
                  >
                    {isGeneratingCommitMsg ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                        <span>Gerando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Gerar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Escreva a mensagem ou clique em 'Gerar'..."
                    rows={2}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleCommit();
                      }
                    }}
                    disabled={isCommitting || isGeneratingCommitMsg || repoChanges.length === 0}
                    className="w-full p-2.5 rounded-xl bg-[color:var(--c-bg-131210)] border border-[color:var(--c-bg-3b3831)] text-xs text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-6b665c)] focus:outline-hidden focus:border-[#d97757] resize-none disabled:opacity-50"
                  />
                </div>

                {/* Commit and Discard All buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={isCommitting || repoChanges.length === 0 || !commitMessage.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#d97757] hover:bg-[#c26647] text-white text-xs font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    {isCommitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Criando Commit…</span>
                      </>
                    ) : (
                      <>
                        <GitCommit className="w-3.5 h-3.5" />
                        <span>
                          {stagedChanges.length > 0
                            ? stagedChanges.length === 1
                              ? 'Commitar'
                              : `Commitar (${stagedChanges.length})`
                            : repoChanges.length === 1
                            ? 'Commitar'
                            : repoChanges.length > 1
                            ? `Commitar Tudo (${repoChanges.length})`
                            : 'Commitar'}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Discard all changes button */}
                  {repoChanges.length > 0 && (
                    <div className="relative">
                      {confirmDiscardAll ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleDiscardAll}
                            title="Confirmar descarte de todas as alterações"
                            className="px-2 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-medium transition cursor-pointer"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDiscardAll(false)}
                            className="px-2 py-1.5 rounded-lg bg-[color:var(--c-bg-2e2a22)] text-[color:var(--c-fg-c4bfb6)] text-[11px] hover:bg-[color:var(--c-bg-38332a)] cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDiscardAll(true)}
                          title="Descartar todas as alterações"
                          className="p-1.5 rounded-lg bg-[color:var(--c-bg-24211d)] hover:bg-rose-950/40 text-[color:var(--c-fg-8c867a)] hover:text-rose-400 border border-[color:var(--c-bg-3b3831)] hover:border-rose-900/40 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Staging helper buttons */}
                {repoChanges.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-[color:var(--c-fg-8c867a)] pt-1">
                    <span>
                      {stagedChanges.length} em stage, {unstagedChanges.length} pendente(s)
                    </span>
                    <div className="flex items-center gap-2">
                      {unstagedChanges.length > 0 && (
                        <button
                          type="button"
                          onClick={() => stageAll(activeRepo.fullName, activeRepo.branch)}
                          className="hover:text-[color:var(--c-fg-f3efe6)] cursor-pointer"
                        >
                          Stage tudo
                        </button>
                      )}
                      {stagedChanges.length > 0 && (
                        <button
                          type="button"
                          onClick={() => unstageAll(activeRepo.fullName, activeRepo.branch)}
                          className="hover:text-[color:var(--c-fg-f3efe6)] cursor-pointer"
                        >
                          Unstage tudo
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Success notification */}
                {commitSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/40 text-xs text-emerald-300 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        Commit <span className="font-mono">{commitSuccess.sha}</span> criado com sucesso!
                      </span>
                    </div>
                    <a
                      href={commitSuccess.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline shrink-0"
                    >
                      <span>Ver</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Error notice */}
                {commitError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-800/40 text-xs text-rose-300 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-tight">{commitError}</span>
                  </div>
                )}
              </div>

              {/* Staged Changes Section */}
              {stagedChanges.length > 0 && (
                <div className="border-b border-[color:var(--c-bg-2d2a25)]">
                  <div className="px-3 py-1.5 bg-[color:var(--c-bg-1f1d19)] flex items-center justify-between text-[11px] font-mono font-medium text-[color:var(--c-fg-b8b3a8)]">
                    <span>STAGED CHANGES ({stagedChanges.length})</span>
                    <button
                      type="button"
                      onClick={() => unstageAll(activeRepo.fullName, activeRepo.branch)}
                      title="Unstage all"
                      className="p-0.5 hover:text-[color:var(--c-on-strong)] text-[color:var(--c-fg-8c867a)] cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="divide-y divide-[color:var(--c-bg-262420)]">
                    {stagedChanges.map((change) => (
                      <ChangeRow
                        key={change.id}
                        change={change}
                        onViewDiff={() => setSelectedChange(change)}
                        onToggleStage={() => unstageChange(change.id)}
                        onDiscard={() => discardChange(change.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Unstaged Changes Section */}
              <div>
                <div className="px-3 py-1.5 bg-[color:var(--c-bg-1f1d19)] flex items-center justify-between text-[11px] font-mono font-medium text-[color:var(--c-fg-b8b3a8)]">
                  <span>CHANGES ({unstagedChanges.length})</span>
                  {unstagedChanges.length > 0 && (
                    <button
                      type="button"
                      onClick={() => stageAll(activeRepo.fullName, activeRepo.branch)}
                      title="Stage all"
                      className="p-0.5 hover:text-[color:var(--c-on-strong)] text-[color:var(--c-fg-8c867a)] cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {unstagedChanges.length === 0 && stagedChanges.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[color:var(--c-fg-8c867a)]">
                    <p>Nenhuma mudança pendente.</p>
                    <p className="mt-1 text-[11px] text-[color:var(--c-fg-6b665c)]">
                      Peça à IA para editar ou criar arquivos no chat — as alterações aparecerão aqui para revisão.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[color:var(--c-bg-262420)]">
                    {unstagedChanges.map((change) => (
                      <ChangeRow
                        key={change.id}
                        change={change}
                        onViewDiff={() => setSelectedChange(change)}
                        onToggleStage={() => stageChange(change.id)}
                        onDiscard={() => discardChange(change.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: HISTÓRICO DE COMMITS */}
          {activeTab === 'history' && (
            <div className="flex-1 flex flex-col">
              <div className="p-2.5 bg-[color:var(--c-bg-1f1d19)] border-b border-[color:var(--c-bg-2d2a25)] flex items-center justify-between text-xs">
                <span className="text-[color:var(--c-fg-8c867a)] flex items-center gap-1.5 font-medium">
                  <History className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                  <span>Commits recentes em </span>
                  <span className="font-mono text-[color:var(--c-fg-f3efe6)] font-semibold">{activeRepo.branch}</span>
                </span>
                <button
                  type="button"
                  onClick={loadCommits}
                  disabled={isLoadingCommits}
                  title="Atualizar commits"
                  className="p-1 rounded text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2b2823)] transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCommits ? 'animate-spin text-[color:var(--c-fg-d97757)]' : ''}`} />
                </button>
              </div>

              {isLoadingCommits ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-2 text-[color:var(--c-fg-8c867a)]">
                  <Loader2 className="w-6 h-6 animate-spin text-[color:var(--c-fg-d97757)]" />
                  <span className="text-xs">Buscando histórico no GitHub…</span>
                </div>
              ) : commitsError ? (
                <div className="p-4 m-3 rounded-xl bg-rose-950/40 border border-rose-900/40 text-xs text-rose-300 space-y-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Não foi possível carregar os commits</span>
                  </div>
                  <p className="text-[11px] text-rose-300/80 leading-relaxed">{commitsError}</p>
                  <button
                    type="button"
                    onClick={loadCommits}
                    className="px-2.5 py-1 rounded bg-[color:var(--c-bg-2e2a22)] hover:bg-[color:var(--c-bg-3d372c)] text-[color:var(--c-on-strong)] text-[11px] font-medium transition cursor-pointer"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : commits.length === 0 ? (
                <div className="p-6 text-center text-xs text-[color:var(--c-fg-8c867a)]">
                  <History className="w-8 h-8 text-[color:var(--c-fg-544f45)] mx-auto mb-2" />
                  <p>Nenhum commit encontrado para esta branch.</p>
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--c-bg-262420)] overflow-y-auto">
                  {commits.map((c) => {
                    // Defesa: garante que message é string (pode vir undefined em cache antigo)
                    const message = typeof c.message === 'string' ? c.message : '';
                    const firstLine = message.split('\n')[0] || '(sem mensagem)';
                    const hasMore = message.trim().split('\n').length > 1;

                    return (
                      <div
                        key={c.sha || Math.random()}
                        className="p-3 hover:bg-[color:var(--c-bg-211f1b)] transition space-y-1.5 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[color:var(--c-fg-f3efe6)] leading-snug break-words">
                              {firstLine}
                            </p>
                            {hasMore && (
                              <p className="text-[11px] text-[color:var(--c-fg-8c867a)] mt-0.5 line-clamp-2">
                                {message.trim().split('\n').slice(1).join(' ').trim()}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCopySha(c.sha)}
                              title="Copiar SHA completo"
                              className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[color:var(--c-bg-2a2721)] hover:bg-[color:var(--c-bg-38332a)] text-[color:var(--c-fg-f09a7d)] border border-[color:var(--c-bg-3e392f)] transition cursor-pointer flex items-center gap-1"
                            >
                              {copiedSha === c.sha ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                                  <span className="text-emerald-400">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <span>{c.short_sha}</span>
                                  <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                                </>
                              )}
                            </button>

                            <a
                              href={c.html_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver commit no GitHub"
                              className="p-1 rounded text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-d97757)] hover:bg-[color:var(--c-bg-2b2823)] transition"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>

                        {/* Author & Date metadata */}
                        <div className="flex items-center justify-between text-[11px] text-[color:var(--c-fg-736e65)]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {c.author.avatar_url ? (
                              <img
                                src={c.author.avatar_url}
                                alt={c.author.name}
                                className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-[color:var(--c-bg-353128)] text-[color:var(--c-fg-d97757)] text-[8px] flex items-center justify-center font-bold">
                                {c.author.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="truncate text-[color:var(--c-fg-a39d93)]">{c.author.name}</span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 text-[10px]">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatRelativeTime(c.author.date)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Diff Viewer Modal */}
      {selectedChange && (
        <DiffViewer
          change={selectedChange}
          isOpen={true}
          onClose={() => setSelectedChange(null)}
          onStage={stageChange}
          onUnstage={unstageChange}
          onDiscard={discardChange}
          onUpdateContent={updateChangeContent}
        />
      )}
    </div>
  );
};

interface ChangeRowProps {
  change: PendingChange;
  onViewDiff: () => void;
  onToggleStage: () => void;
  onDiscard: () => void;
}

const ChangeRow: React.FC<ChangeRowProps> = ({
  change,
  onViewDiff,
  onToggleStage,
  onDiscard,
}) => {
  return (
    <div
      onClick={onViewDiff}
      className="group px-3 py-2 flex items-center justify-between text-xs hover:bg-[color:var(--c-bg-25231f)] transition cursor-pointer"
    >
      <div className="flex items-center gap-2 min-w-0 pr-2">
        {/* Status letter M / A / D */}
        <span
          className={`font-mono font-bold text-[11px] shrink-0 w-3.5 text-center ${
            change.type === 'modified'
              ? 'text-amber-400'
              : change.type === 'added'
              ? 'text-emerald-400'
              : 'text-rose-400'
          }`}
        >
          {change.type === 'modified' ? 'M' : change.type === 'added' ? 'A' : 'D'}
        </span>

        {/* Path */}
        <span className="font-mono text-xs text-[color:var(--c-fg-f3efe6)] truncate group-hover:text-[color:var(--c-on-strong)]">
          {change.path}
        </span>
      </div>

      {/* Action buttons [+] / [-] */}
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onViewDiff}
          title="Ver Diff"
          className="p-1 rounded text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-322f28)] transition cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onDiscard}
          title="Descartar alteração"
          className="p-1 rounded text-[color:var(--c-fg-a39d93)] hover:text-rose-400 hover:bg-[color:var(--c-bg-322f28)] transition cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleStage}
          title={change.staged ? 'Unstage' : 'Stage'}
          className="p-1 rounded text-[color:var(--c-fg-a39d93)] hover:text-emerald-400 hover:bg-[color:var(--c-bg-322f28)] transition cursor-pointer"
        >
          {change.staged ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};
