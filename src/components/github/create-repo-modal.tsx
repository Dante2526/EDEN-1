import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  FolderPlus,
  Loader2,
  Lock,
  Globe,
  AlertCircle,
  CheckCircle2,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { createRepo } from '../../lib/github';
import { usePendingChanges } from '../../lib/pending-changes';
import { ActiveRepoState, GitHubRepo } from '../../lib/types';

interface CreateRepoModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Repo atualmente ativo no chat (se houver).
   * Se houver pending changes "órfãs" (sem repo), elas serão migradas para o novo repo.
   */
  currentActiveRepo: ActiveRepoState | null;
  onRepoCreated: (repo: ActiveRepoState) => void;
}

export const CreateRepoModal: React.FC<CreateRepoModalProps> = ({
  open,
  onClose,
  currentActiveRepo,
  onRepoCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [autoInit, setAutoInit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    repo: ActiveRepoState;
    migrated: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { changes, migrateChangesToRepo } = usePendingChanges();

  // Foca no input quando abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setError(null);
      setSuccess(null);
    } else {
      // Reset ao fechar
      setName('');
      setDescription('');
      setIsPrivate(true);
      setAutoInit(true);
    }
  }, [open]);

  // Quantas changes órfãs serão migradas
  const orphanChangesCount = React.useMemo(() => {
    if (currentActiveRepo) {
      // Migra apenas as do repo ativo atual
      return changes.filter(
        (c) => c.repo === currentActiveRepo.fullName && c.branch === currentActiveRepo.branch
      ).length;
    }
    // Sem repo ativo: pega todas as changes "órfãs" (com repo vazio ou null)
    return changes.filter((c) => !c.repo || c.repo === '').length;
  }, [changes, currentActiveRepo]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      if (!/^[a-zA-Z0-9._-]+$/.test(name.trim())) {
        setError('Nome inválido. Use apenas letras, números, ponto (.), underline (_) e hífen (-).');
        return;
      }
      if (name.length > 100) {
        setError('Nome muito longo (máx 100 caracteres).');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const created: GitHubRepo = await createRepo({
          name: name.trim(),
          description: description.trim(),
          private: isPrivate,
          autoInit,
        });

        const newActiveRepo: ActiveRepoState = {
          owner: created.owner.login,
          repo: created.name,
          fullName: created.full_name,
          branch: created.default_branch || 'main',
          defaultBranch: created.default_branch || 'main',
        };

        // Migra pending changes do repo ativo (ou órfãs) para o novo repo
        let migrated = 0;
        if (orphanChangesCount > 0) {
          const fromRepo = currentActiveRepo?.fullName ?? null;
          const fromBranch = currentActiveRepo?.branch ?? null;
          migrated = await migrateChangesToRepo(
            fromRepo,
            fromBranch,
            newActiveRepo.fullName,
            newActiveRepo.branch
          );
        }

        setSuccess({ repo: newActiveRepo, migrated });
      } catch (err: any) {
        console.error('Create repo error:', err);
        // Mensagens de erro comuns do GitHub
        const msg = err?.message || '';
        if (msg.includes('already exists') || msg.includes('422')) {
          setError(`Já existe um repositório com o nome "${name.trim()}" na sua conta. Escolha outro nome.`);
        } else if (msg.includes('rate limit') || msg.includes('403')) {
          setError('Limite de criação de repositórios atingido. Aguarde alguns minutos e tente novamente.');
        } else {
          setError(msg || 'Erro ao criar repositório. Verifique seu token do GitHub.');
        }
      } finally {
        setLoading(false);
      }
    },
    [name, description, isPrivate, autoInit, orphanChangesCount, currentActiveRepo, migrateChangesToRepo]
  );

  const handleConfirmSuccess = useCallback(() => {
    if (success) {
      onRepoCreated(success.repo);
      onClose();
    }
  }, [success, onRepoCreated, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#181714] border border-[#2d2a25] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-[#2d2a25] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 flex items-center justify-center">
              <FolderPlus className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-[#f3efe6] font-serif">Novo repositório</h2>
              <p className="text-[10px] text-[#736e65] font-mono">
                Crie do zero · vincule a este chat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {success ? (
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-[#f3efe6]">
                  Repositório criado!
                </h3>
                <p className="text-xs text-[#8c867a] mt-1 font-mono">
                  {success.repo.fullName}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#22201d] border border-[#3b3831] p-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[#8c867a]">Visibilidade</span>
                <span className="flex items-center gap-1 text-[#f3efe6]">
                  {isPrivate ? (
                    <>
                      <Lock className="w-3 h-3 text-amber-400" /> Privado
                    </>
                  ) : (
                    <>
                      <Globe className="w-3 h-3 text-emerald-400" /> Público
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8c867a]">Branch padrão</span>
                <span className="text-[#f3efe6] font-mono">{success.repo.branch}</span>
              </div>
              {success.migrated > 0 && (
                <div className="flex items-center justify-between border-t border-[#3b3831] pt-2">
                  <span className="text-[#8c867a]">Alterações migradas</span>
                  <span className="flex items-center gap-1 text-[#d97757] font-medium">
                    <ArrowRight className="w-3 h-3" />
                    {success.migrated} arquivo(s)
                  </span>
                </div>
              )}
            </div>

            <div className="text-[10px] text-[#8c867a] leading-relaxed text-center">
              {success.migrated > 0
                ? `${success.migrated} alteração(ões) pendente(s) movida(s) para este repositório. Vá em "Git" na aba lateral pra commitar.`
                : 'Repositório vinculado a este chat. Agora você pode criar arquivos e commitar.'}
            </div>

            <button
              type="button"
              onClick={handleConfirmSuccess}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-[#d97757] to-[#c4663f] hover:from-[#e08368] hover:to-[#d97757] text-white text-xs font-medium transition-all shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Entendi, continuar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Nome */}
            <div className="space-y-1.5">
              <label htmlFor="repo-name" className="text-[11px] font-medium text-[#b8b3a8] uppercase tracking-wider font-mono">
                Nome do repositório *
              </label>
              <input
                ref={inputRef}
                id="repo-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: meu-projeto-incrivel"
                maxLength={100}
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
                className="w-full bg-[#22201d] border border-[#3b3831] focus:border-[#d97757]/60 rounded-xl px-3 py-2.5 text-xs text-[#f3efe6] placeholder:text-[#5e5a52] focus:outline-none focus:ring-1 focus:ring-[#d97757]/40 transition-colors disabled:opacity-60 font-mono"
              />
              <p className="text-[10px] text-[#736e65]">
                Apenas letras, números, <code className="text-[#d97757]">.</code>,{' '}
                <code className="text-[#d97757]">_</code> e{' '}
                <code className="text-[#d97757]">-</code>. Será criado na sua conta.
              </p>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label htmlFor="repo-desc" className="text-[11px] font-medium text-[#b8b3a8] uppercase tracking-wider font-mono">
                Descrição <span className="text-[#5e5a52] normal-case">(opcional)</span>
              </label>
              <textarea
                id="repo-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Uma breve descrição do projeto..."
                rows={2}
                maxLength={350}
                disabled={loading}
                className="w-full bg-[#22201d] border border-[#3b3831] focus:border-[#d97757]/60 rounded-xl px-3 py-2.5 text-xs text-[#f3efe6] placeholder:text-[#5e5a52] focus:outline-none focus:ring-1 focus:ring-[#d97757]/40 transition-colors disabled:opacity-60 resize-none"
              />
            </div>

            {/* Visibilidade */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-[#b8b3a8] uppercase tracking-wider font-mono">
                Visibilidade
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsPrivate(false)}
                  disabled={loading}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition cursor-pointer disabled:opacity-50 ${
                    !isPrivate
                      ? 'bg-emerald-500/10 border-emerald-500/50 shadow-xs'
                      : 'bg-[#22201d] border-[#3b3831] hover:border-[#423e35]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Globe className={`w-3.5 h-3.5 ${!isPrivate ? 'text-emerald-400' : 'text-[#8c867a]'}`} />
                    <span className="text-xs font-medium text-[#f3efe6]">Público</span>
                  </div>
                  <span className="text-[9px] text-[#8c867a] leading-tight">
                    Qualquer um pode ver
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrivate(true)}
                  disabled={loading}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition cursor-pointer disabled:opacity-50 ${
                    isPrivate
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-xs'
                      : 'bg-[#22201d] border-[#3b3831] hover:border-[#423e35]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Lock className={`w-3.5 h-3.5 ${isPrivate ? 'text-amber-400' : 'text-[#8c867a]'}`} />
                    <span className="text-xs font-medium text-[#f3efe6]">Privado</span>
                  </div>
                  <span className="text-[9px] text-[#8c867a] leading-tight">
                    Só você e convidados
                  </span>
                </button>
              </div>
            </div>

            {/* Auto-init */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <button
                type="button"
                role="switch"
                aria-checked={autoInit}
                onClick={() => setAutoInit(!autoInit)}
                disabled={loading}
                className={`relative rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                  autoInit ? 'bg-[#d97757]' : 'bg-[#3b3831]'
                }`}
                style={{ height: '18px', width: '32px' }}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    autoInit ? 'translate-x-3.5' : ''
                  }`}
                />
              </button>
              <span className="text-[11px] text-[#b8b3a8] group-hover:text-[#f3efe6] flex items-center gap-1">
                <FileText className="w-3 h-3 text-[#d97757]" />
                Inicializar com README.md
              </span>
            </label>

            {/* Aviso de migração */}
            {orphanChangesCount > 0 && (
              <div className="rounded-xl bg-[#d97757]/10 border border-[#d97757]/30 p-3 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#d97757] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[#f09a7d] leading-relaxed">
                  <strong className="text-[#f3efe6]">{orphanChangesCount} alteração(ões) pendente(s)</strong>{' '}
                  {currentActiveRepo
                    ? `do repositório atual serão migradas para o novo repo.`
                    : `serão migradas para o novo repositório automaticamente.`}{' '}
                  Depois é só commitar na aba Git.
                </div>
              </div>
            )}

            {/* Erro */}
            {error && (
              <div className="rounded-xl bg-rose-950/40 border border-rose-800/40 p-3 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-rose-300 leading-relaxed">{error}</div>
              </div>
            )}

            {/* Ações */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-3 py-2.5 rounded-xl bg-[#22201d] border border-[#3b3831] hover:bg-[#2b2924] text-[#b8b3a8] hover:text-[#f3efe6] text-xs font-medium transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-[#d97757] to-[#c4663f] hover:from-[#e08368] hover:to-[#d97757] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4" />
                    Criar repositório
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
