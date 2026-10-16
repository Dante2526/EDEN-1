import React, { useState, useEffect } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import {
  X,
  Moon,
  Sun,
  Volume2,
  Database,
  Trash2,
  Download,
  KeyRound,
  AlertTriangle,
  Check,
  Sparkles,
  ExternalLink,
  Eye,
  EyeOff,
  FolderGit2,
  Loader2,
  LogOut,
  Zap,
} from 'lucide-react';
import { AppSettings, Conversation, ModelId, ReasoningEffort } from '../lib/types';
import { exportConversationsToJSON } from '../lib/storage';
import { loadStudioConfig, saveStudioConfig } from '../lib/studio-config';
import { StudioAgent } from '../studio/studio-types';
import { NEURAL_VOICES } from '../lib/speech';
import { ClaudeLogo } from './claude-logo';
import {
  getGitHubPat,
  setGitHubPat,
  removeGitHubPat,
  verifyGitHubPat,
  GitHubUser,
} from '../lib/github';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  conversations: Conversation[];
  onClearHistory: () => Promise<void>;
  hasApiKey: boolean | null;
  hasGeminiKey?: boolean | null;
  hasGitHubToken?: boolean | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  conversations,
  onClearHistory,
  hasApiKey,
  hasGeminiKey,
  hasGitHubToken,
}) => {
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [isClearing, setIsClearing] = useState(false);

  // GitHub PAT state
  const [githubPat, setGithubPatInput] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [isValidatingGithub, setIsValidatingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubSuccess, setGithubSuccess] = useState(false);

  // Studio config state
  const [studioConfig, setStudioConfig] = useState<{ planner: StudioAgent; reviewer: StudioAgent; implementer: StudioAgent } | null>(null);

  // Load existing PAT on mount/open or check server environment variable
  useEffect(() => {
    if (isOpen) {
      loadStudioConfig().then(setStudioConfig);
      const savedPat = getGitHubPat();
      if (savedPat) {
        setGithubPatInput(savedPat);
        verifyGitHubPat(savedPat)
          .then((user) => setGithubUser(user))
          .catch(() => {
            // Fallback to server env if local token failed
            verifyGitHubPat()
              .then((user) => setGithubUser(user))
              .catch(() => setGithubUser(null));
          });
      } else {
        setGithubPatInput('');
        verifyGitHubPat()
          .then((user) => setGithubUser(user))
          .catch(() => {
            setGithubUser(null);
          });
      }
    }
  }, [isOpen]);

  const handleConnectGithub = async () => {
    if (!githubPat.trim()) return;
    setIsValidatingGithub(true);
    setGithubError(null);
    setGithubSuccess(false);

    try {
      const user = await verifyGitHubPat(githubPat.trim());
      setGitHubPat(githubPat.trim());
      setGithubUser(user);
      setGithubSuccess(true);
      setTimeout(() => setGithubSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to authenticate GitHub token:', err);
      setGithubError(
        err?.message ||
          'Token inválido ou sem permissões necessárias. Verifique se possui os escopos necessários.'
      );
    } finally {
      setIsValidatingGithub(false);
    }
  };

  const handleUpdateStudioAgent = (role: 'planner' | 'reviewer' | 'implementer', updates: Partial<StudioAgent>) => {
    if (!studioConfig) return;
    const newConfig = {
      ...studioConfig,
      [role]: { ...studioConfig[role], ...updates }
    };
    setStudioConfig(newConfig);
    saveStudioConfig(newConfig);
  };

  const handleDisconnectGithub = () => {
    removeGitHubPat();
    setGithubPatInput('');
    setGithubUser(null);
    setGithubError(null);
  };

  if (!isOpen) return null;

  const handleClear = async () => {
    setIsClearing(true);
    await onClearHistory();
    setIsClearing(false);
    setConfirmStep(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      {/* Claude Warm Card Sheet */}
      <div className="w-full max-w-md rounded-2xl bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-3b3831)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--c-bg-312f2a)]">
          <div className="flex items-center gap-2.5">
            <ClaudeLogo className="w-5 h-5 text-[color:var(--c-fg-d97757)]" />
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--c-fg-f3efe6)] tracking-tight">Configurações</h2>
              <p className="text-[11px] text-[color:var(--c-fg-8c867a)]">Éden • Claude Design System</p>
            </div>
          </div>
          <button
            onClick={() => {
              setConfirmStep(0);
              onClose();
            }}
            aria-label="Fechar configurações"
            className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2e2b26)] hover:bg-[color:var(--c-bg-38352f)] text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] transition-all flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* API Keys Status Notices */}
          <div className="space-y-2">
            {/* NVIDIA NIM Key Status */}
            <div className="p-3 rounded-xl border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1d1b18)] text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-medium text-[color:var(--c-fg-f3efe6)]">
                  <KeyRound className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                  <span>NVIDIA NIM (Chat & Modelos GLM)</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                    hasApiKey
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {hasApiKey ? 'Conectado' : 'Não configurada'}
                </span>
              </div>
              <p className="text-[color:var(--c-fg-a39d93)] leading-relaxed text-[11px]">
                {hasApiKey
                  ? 'NVIDIA_API_KEY ativa para os modelos GLM-5.3 e GLM-5.3-Flash.'
                  : 'Adicione NVIDIA_API_KEY no arquivo .env.local para conversar com os modelos.'}
              </p>
            </div>

            {/* Edge TTS Status */}
            <div className="p-3 rounded-xl border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1d1b18)] text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 font-medium text-[color:var(--c-fg-f3efe6)]">
                  <Sparkles className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                  <span>Microsoft Edge TTS (Vozes Neurais pt-BR)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Ativo (Sem Chave / Grátis)
                </span>
              </div>
              <p className="text-[color:var(--c-fg-a39d93)] leading-relaxed text-[11px]">
                As vozes neurais da Microsoft em português do Brasil (Francisca, Antonio e Thalita) estão ativadas no servidor sem precisar de nenhuma chave de API.
                {hasGeminiKey && ' GEMINI_API_KEY também detectada caso queira alternar para as vozes Aoede ou Puck.'}
              </p>
            </div>
          </div>

          {/* GitHub Connection Section (Source Control) */}
          <div className="p-4 rounded-xl border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1d1b18)] text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-[color:var(--c-fg-f3efe6)]">
                <FolderGit2 className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />
                <span className="text-xs sm:text-sm">GitHub (Source Control)</span>
              </div>
              {githubUser ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {githubUser.source === 'env' || hasGitHubToken ? 'Vercel / .env Ativo' : 'Conectado'}
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">
                  Desconectado
                </span>
              )}
            </div>

            <p className="text-[color:var(--c-fg-a39d93)] text-[11px] leading-relaxed">
              Permite que a IA leia repositórios e crie alterações no Source Control. Recomendado: adicione{' '}
              <code className="text-[color:var(--c-fg-d97757)] font-mono px-1 py-0.2 rounded bg-[color:var(--c-bg-24221d)] border border-[color:var(--c-bg-3b3831)]">
                GITHUB_TOKEN
              </code>{' '}
              nas variáveis de ambiente da Vercel para máxima segurança no servidor, ou insira um token pessoal abaixo.
            </p>

            {/* Authenticated user profile view */}
            {githubUser ? (
              <div className="p-3 rounded-lg bg-[color:var(--c-bg-25231f)] border border-[color:var(--c-bg-38352e)] flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={githubUser.avatar_url}
                    alt={githubUser.login}
                    className="w-8 h-8 rounded-full border border-[color:var(--c-bg-4d483e)]"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-xs text-[color:var(--c-fg-f3efe6)] truncate">
                      {githubUser.name || githubUser.login}
                    </div>
                    <div className="text-[11px] font-mono text-[color:var(--c-fg-8c867a)] truncate">
                      @{githubUser.login}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnectGithub}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="relative">
                  <input
                    type={showPat ? 'text' : 'password'}
                    value={githubPat}
                    onChange={(e) => setGithubPatInput(e.target.value)}
                    placeholder="ghp_... ou github_pat_..."
                    className="w-full pr-10 pl-3 py-2 rounded-lg bg-[color:var(--c-bg-141310)] border border-[color:var(--c-bg-3b3831)] text-xs text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-6b665c)] focus:outline-hidden focus:border-[#d97757] font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPat(!showPat)}
                    aria-label={showPat ? 'Ocultar token' : 'Exibir token'}
                    className="absolute right-2.5 top-2.5 text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] transition cursor-pointer"
                  >
                    {showPat ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <a
                    href="https://github.com/settings/tokens?type=beta"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[color:var(--c-fg-d97757)] hover:underline"
                  >
                    <span>Criar Fine-grained PAT</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="button"
                    onClick={handleConnectGithub}
                    disabled={isValidatingGithub || !githubPat.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#c26647] text-white text-xs font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    {isValidatingGithub ? (
                      <>
                        <ThinkingOrb
                          state="connecting"
                          size={20}
                          theme="dark"
                          speed={1.5}
                          aria-label="Conectando…"
                        />
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Conectar</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-[color:var(--c-bg-151412)] border border-[color:var(--c-bg-2e2b25)] text-[10px] text-[color:var(--c-fg-8c867a)] space-y-1">
                  <p className="font-semibold text-[color:var(--c-fg-a8a398)]">Escopos recomendados no GitHub:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[color:var(--c-fg-7a7469)]">
                    <li><strong className="text-[color:var(--c-fg-c4bfb6)]">Contents:</strong> Read and Write (leitura de arquivos e commits)</li>
                    <li><strong className="text-[color:var(--c-fg-c4bfb6)]">Metadata:</strong> Read (leitura de repositórios)</li>
                  </ul>
                </div>

                {githubError && (
                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-300">
                    {githubError}
                  </div>
                )}
                {githubSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-300">
                    GitHub conectado com sucesso!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grouped Settings Card - Claude Style */}
          <div className="rounded-xl bg-[color:var(--c-bg-1d1b18)] border border-[color:var(--c-bg-312f2a)] p-4 space-y-4">
            {/* Save history */}
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2b2722)] flex items-center justify-center text-[color:var(--c-fg-d97757)]">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-[color:var(--c-fg-f3efe6)]">Salvar histórico localmente</div>
                  <div className="text-[10px] text-[color:var(--c-fg-8c867a)]">Persistir conversas no IndexedDB do navegador</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.saveHistoryLocally}
                onChange={(e) => onUpdateSettings({ saveHistoryLocally: e.target.checked })}
                className="w-4 h-4 accent-[color:var(--c-fg-d97757)] rounded cursor-pointer"
              />
            </label>

            {/* Voice enabled */}
            <label className="flex items-center justify-between cursor-pointer border-t border-[color:var(--c-bg-2d2a25)] pt-3.5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2b2722)] flex items-center justify-center text-[color:var(--c-fg-d97757)]">
                  <Volume2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-[color:var(--c-fg-f3efe6)]">Voz neural humana</div>
                  <div className="text-[10px] text-[color:var(--c-fg-8c867a)]">Leitura em voz alta com sintetizador neural</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.voiceEnabled}
                onChange={(e) => onUpdateSettings({ voiceEnabled: e.target.checked })}
                className="w-4 h-4 accent-[color:var(--c-fg-d97757)] rounded cursor-pointer"
              />
            </label>

            {/* Voice Persona Selector */}
            {settings.voiceEnabled && (
              <div className="pl-10 pt-1 pb-1 space-y-2 border-t border-[color:var(--c-bg-2d2a25)]/60">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[color:var(--c-fg-a39d93)] font-medium">
                    Voz da Leitura (Português do Brasil):
                  </label>
                  <span className="text-[10px] text-[color:var(--c-fg-736e65)]">Dicção natural</span>
                </div>
                <div className="space-y-1.5">
                  {NEURAL_VOICES.map((voice) => {
                    const currentSelected = settings.speechVoice || 'pt-BR-FranciscaNeural';
                    const isSelected = currentSelected === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => onUpdateSettings({ speechVoice: voice.id })}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                          isSelected
                            ? 'bg-[color:var(--c-bg-2f2b25)] border border-[#d97757]/40 text-[color:var(--c-fg-f3efe6)] font-medium'
                            : 'bg-[color:var(--c-bg-181614)] border border-[color:var(--c-bg-2b2924)] text-[color:var(--c-fg-a39d93)] hover:bg-[color:var(--c-bg-25221d)]'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span>{voice.name}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                                isSelected
                                  ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)]'
                                  : 'bg-[color:var(--c-bg-22201c)] text-[color:var(--c-fg-736e65)]'
                              }`}
                            >
                              {voice.tag}
                            </span>
                          </div>
                          <span className="text-[10px] text-[color:var(--c-fg-736e65)] leading-tight">{voice.description}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dark mode */}
            <label className="flex items-center justify-between cursor-pointer border-t border-[color:var(--c-bg-2d2a25)] pt-3.5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2b2722)] flex items-center justify-center text-[color:var(--c-fg-d97757)]">
                  {settings.darkMode ? (
                    <Moon className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-[color:var(--c-fg-f3efe6)]">Tema Escuro Claude</div>
                  <div className="text-[10px] text-[color:var(--c-fg-8c867a)]">Paleta carvão & terracota acolhedora</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(e) => onUpdateSettings({ darkMode: e.target.checked })}
                className="w-4 h-4 accent-[color:var(--c-fg-d97757)] rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Studio Configuration Card */}
          {studioConfig && (
            <div className="rounded-xl bg-[color:var(--c-bg-1d1b18)] border border-[color:var(--c-bg-312f2a)] p-4 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2b2722)] flex items-center justify-center text-amber-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-medium text-[color:var(--c-fg-f3efe6)]">Éden Studio ✨</div>
                  <div className="text-[10px] text-[color:var(--c-fg-8c867a)]">Configure a inteligência de cada agente</div>
                </div>
              </div>

              {(['planner', 'reviewer', 'implementer'] as const).map(role => (
                <div key={role} className="border-t border-[color:var(--c-bg-2d2a25)] pt-3 flex flex-col gap-2">
                  <div className="text-xs font-semibold capitalize text-[color:var(--c-fg-c4bfb6)]">{role === 'planner' ? 'Planejador' : role === 'reviewer' ? 'Revisor' : 'Implementador'}</div>
                  <div className="flex gap-2">
                    <select
                      value={studioConfig[role].model}
                      onChange={(e) => handleUpdateStudioAgent(role, { model: e.target.value as ModelId })}
                      className="flex-1 bg-[color:var(--c-bg-181614)] border border-[color:var(--c-bg-2b2924)] rounded-lg px-2 py-1.5 text-xs text-[color:var(--c-fg-a39d93)] focus:border-[#d97757] focus:outline-none"
                    >
                      <option value="z-ai/glm-5.3">GLM-5.3 (Completo)</option>
                      <option value="z-ai/glm-5.3-flash">GLM-5.3-Flash (Rápido)</option>
                      <option value="moonshotai/kimi-k3">Kimi K3 (Longo Contexto)</option>
                    </select>
                    <select
                      value={studioConfig[role].reasoningEffort}
                      onChange={(e) => handleUpdateStudioAgent(role, { reasoningEffort: e.target.value as ReasoningEffort })}
                      className="w-24 bg-[color:var(--c-bg-181614)] border border-[color:var(--c-bg-2b2924)] rounded-lg px-2 py-1.5 text-xs text-[color:var(--c-fg-a39d93)] focus:border-[#d97757] focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="max">Max</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Token Usage & Infrastructure Card */}
          <div className="rounded-xl bg-[color:var(--c-bg-1d1b18)] border border-[color:var(--c-bg-312f2a)] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2b2722)] flex items-center justify-center text-[color:var(--c-fg-d97757)]">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-medium text-[color:var(--c-fg-f3efe6)]">Monitor de Tokens & Infraestrutura</div>
                <div className="text-[10px] text-[color:var(--c-fg-8c867a)]">Controle de fluxo de tokens e cotas NVIDIA NIM</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-[color:var(--c-bg-2d2a25)]">
              <div className="p-2.5 rounded-lg bg-[color:var(--c-bg-181613)] border border-[color:var(--c-bg-2a2822)]">
                <span className="text-[10px] text-[color:var(--c-fg-8c867a)] block">Limite por Resposta</span>
                <span className="font-mono text-[color:var(--c-fg-f3efe6)] font-semibold">8.192 tokens</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[color:var(--c-bg-181613)] border border-[color:var(--c-bg-2a2822)]">
                <span className="text-[10px] text-[color:var(--c-fg-8c867a)] block">Janela de Contexto</span>
                <span className="font-mono text-[color:var(--c-fg-f3efe6)] font-semibold">128.000 tokens</span>
              </div>
            </div>

            <div className="text-[11px] text-[color:var(--c-fg-8c867a)] leading-relaxed pt-1">
              Cada resposta da IA monitora os tokens de entrada (Prompt) e saída (Resposta). Você também pode acompanhar o consumo acumulado diretamente na barra de modelos (abaixo do chat) ou digitando <span className="text-[color:var(--c-fg-f09a7d)] font-mono">tokens</span> no Terminal.
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 space-y-2">
            {/* Export JSON */}
            <button
              type="button"
              onClick={() => exportConversationsToJSON(conversations)}
              disabled={conversations.length === 0}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1d1b18)] text-[color:var(--c-fg-c4bfb6)] hover:bg-[color:var(--c-bg-282621)] hover:text-[color:var(--c-fg-f3efe6)] active:scale-[0.99] text-xs sm:text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Download className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />
              <span>Exportar conversas (JSON)</span>
            </button>

            {/* Clear History with double confirmation */}
            {confirmStep === 0 && (
              <button
                type="button"
                onClick={() => setConfirmStep(1)}
                disabled={conversations.length === 0}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-900/30 bg-[color:var(--c-bg-2b1917)]/40 text-rose-300 hover:bg-[color:var(--c-bg-381c19)]/60 active:scale-[0.99] text-xs sm:text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Limpar todo o histórico</span>
              </button>
            )}

            {confirmStep === 1 && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs space-y-2">
                <div className="flex items-center gap-1.5 text-amber-300 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Confirmação 1 de 2</span>
                </div>
                <p className="text-[color:var(--c-fg-c4bfb6)]">Tem certeza que deseja apagar todas as conversas salvas?</p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setConfirmStep(2)}
                    className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition cursor-pointer"
                  >
                    Sim, continuar
                  </button>
                  <button
                    onClick={() => setConfirmStep(0)}
                    className="flex-1 py-2 px-3 rounded-lg bg-[color:var(--c-bg-282621)] text-[color:var(--c-fg-c4bfb6)] hover:bg-[color:var(--c-bg-312f2a)] text-xs transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {confirmStep === 2 && (
              <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs space-y-2">
                <div className="flex items-center gap-1.5 text-rose-300 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Confirmação final (Ação irreversível)</span>
                </div>
                <p className="text-[color:var(--c-fg-c4bfb6)]">
                  Todas as {conversations.length} conversas serão deletadas permanentemente.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleClear}
                    disabled={isClearing}
                    className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isClearing ? 'Apagando...' : 'Apagar tudo definitivamente'}
                  </button>
                  <button
                    onClick={() => setConfirmStep(0)}
                    className="flex-1 py-2 px-3 rounded-lg bg-[color:var(--c-bg-282621)] text-[color:var(--c-fg-c4bfb6)] hover:bg-[color:var(--c-bg-312f2a)] text-xs transition cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[color:var(--c-bg-312f2a)] bg-dark-bg text-[10px] text-[color:var(--c-fg-736e65)] text-center">
          Éden • Claude Design System • NVIDIA NIM
        </div>
      </div>
    </div>
  );
};
