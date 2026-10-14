import React, { useState } from 'react';
import { Cpu, Brain, Sparkles, X, ChevronDown, ListTodo, Check, Zap, Terminal } from 'lucide-react';
import { ModelId, ReasoningEffort } from '../lib/types';

interface ModelControlsProps {
  selectedModel: ModelId;
  onSelectModel: (model: ModelId) => void;
  reasoningEffort: ReasoningEffort;
  onSelectReasoningEffort: (effort: ReasoningEffort) => void;
  isPlanMode: boolean;
  onTogglePlanMode: () => void;
  conversationTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  onOpenTerminal?: () => void;
}

export const ModelControls: React.FC<ModelControlsProps> = ({
  selectedModel,
  onSelectModel,
  reasoningEffort,
  onSelectReasoningEffort,
  isPlanMode,
  onTogglePlanMode,
  conversationTokens,
  onOpenTerminal,
}) => {
  const [openSheet, setOpenSheet] = useState<'model' | 'reasoning' | 'tokens' | null>(null);

  const models: Array<{
    id: ModelId;
    title: string;
    subtitle: string;
    badge: string;
  }> = [
    {
      id: 'z-ai/glm-5.3',
      title: 'GLM-5.3',
      subtitle: 'Raciocínio analítico avançado e raciocínio profundo',
      badge: 'Pensar',
    },
    {
      id: 'z-ai/glm-5.3-flash',
      title: 'GLM-5.3 Flash',
      subtitle: 'Mais rápido + Suporte multimodal a visão e fotos',
      badge: 'Visão',
    },
    {
      id: 'moonshotai/kimi-k3',
      title: 'Kimi K3',
      subtitle: 'Contexto longo e raciocínio avançado',
      badge: 'Contexto',
    },
    {
      id: 'claude-sonnet-4-5',
      title: 'Claude Sonnet 4.5',
      subtitle: 'Anthropic via Abhibots — rápido e inteligente',
      badge: 'Claude',
    },
    {
      id: 'claude-opus-4-1',
      title: 'Claude Opus 4.1',
      subtitle: 'Anthropic via Abhibots — mais poderoso',
      badge: 'Claude',
    },
  ];

  const reasoningLevels: Array<{
    id: ReasoningEffort;
    title: string;
    subtitle: string;
    level: string;
  }> = [
    {
      id: 'low',
      title: 'Thinking: low',
      subtitle: 'Menor latência para respostas rápidas e concisas',
      level: '1x',
    },
    {
      id: 'high',
      title: 'Thinking: high',
      subtitle: 'Análise detalhada e reflexão passo a passo',
      level: '2x',
    },
    {
      id: 'max',
      title: 'Thinking: max',
      subtitle: 'Raciocínio estendido exaustivo para problemas complexos',
      level: '3x',
    },
  ];

  return (
    <>
      {/* ================= CLAUDE.AI BOTTOM PILL TOOLBAR ================= */}
      <div className="flex items-center justify-between gap-1.5 mt-2 px-1 text-xs select-none">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Model Selector Pill (Claude style) */}
          <button
            type="button"
            onClick={() => setOpenSheet('model')}
            aria-label="Selecionar modelo"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              openSheet === 'model'
                ? 'bg-[color:var(--c-bg-33302a)] text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-4a463d)]'
                : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-[color:var(--c-bg-36332d)] text-[color:var(--c-fg-b8b3a8)]'
            }`}
          >
            <span className="font-medium text-[color:var(--c-fg-f3efe6)]">
              {selectedModel === 'z-ai/glm-5.3'
                ? 'GLM-5.3'
                : selectedModel === 'moonshotai/kimi-k3'
                ? 'Kimi K3'
                : selectedModel === 'claude-sonnet-4-5'
                ? 'Claude Sonnet'
                : selectedModel === 'claude-opus-4-1'
                ? 'Claude Opus'
                : 'GLM Flash'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[color:var(--c-fg-8c867a)]" />
          </button>

          {/* Reasoning / Extended Thinking Pill */}
          <button
            type="button"
            onClick={() => setOpenSheet('reasoning')}
            aria-label="Ajustar pensamento estendido"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              openSheet === 'reasoning'
                ? 'bg-[color:var(--c-bg-33302a)] text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-4a463d)]'
                : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-[color:var(--c-bg-36332d)] text-[color:var(--c-fg-b8b3a8)]'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
            <span className="text-[color:var(--c-fg-8c867a)] text-[11px]">pensar:</span>
            <span className="text-[color:var(--c-fg-f3efe6)] font-medium">{reasoningEffort}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[color:var(--c-fg-8c867a)]" />
          </button>

          {/* Plan Mode Pill */}
          <button
            type="button"
            onClick={onTogglePlanMode}
            aria-label="Alternar Modo Plano"
            title="Ativar/Desativar modo de planejamento estruturado"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              isPlanMode
                ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40'
                : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-[color:var(--c-bg-36332d)] text-[color:var(--c-fg-8c867a)]'
            }`}
          >
            <ListTodo className={`w-3.5 h-3.5 ${isPlanMode ? 'text-[color:var(--c-fg-d97757)]' : 'text-[color:var(--c-fg-8c867a)]'}`} />
            <span className={isPlanMode ? 'text-[color:var(--c-fg-f3efe6)]' : ''}>Plano</span>
            <span
              className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold ${
                isPlanMode ? 'bg-[#d97757] text-white' : 'bg-[color:var(--c-bg-2f2d28)] text-[color:var(--c-fg-8c867a)]'
              }`}
            >
              {isPlanMode ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Token Usage Tool Pill */}
          <button
            type="button"
            onClick={() => setOpenSheet('tokens')}
            aria-label="Ferramenta de Monitoramento de Tokens"
            title="Clique para abrir a Ferramenta de Monitoramento de Tokens & Contexto"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              openSheet === 'tokens'
                ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40 shadow-xs'
                : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-[color:var(--c-bg-36332d)] text-[color:var(--c-fg-b8b3a8)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
            <span className="text-[color:var(--c-fg-8c867a)] text-[11px]">tokens:</span>
            <span className="font-mono font-medium text-[color:var(--c-fg-f3efe6)]">
              {conversationTokens?.totalTokens ? conversationTokens.totalTokens.toLocaleString() : '0'}
            </span>
          </button>
        </div>

      </div>

      {/* ================= CLAUDE.AI BOTTOM SHEET / MODAL ================= */}
      {openSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-150">
          {/* Dimmed warm backdrop */}
          <div
            onClick={() => setOpenSheet(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
          />

          {/* Claude Warm Card */}
          <div className="relative w-full max-w-md mx-auto bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-3b3831)] rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl z-10 animate-in slide-in-from-bottom duration-150 pb-6 sm:pb-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[color:var(--c-bg-312f2a)]">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--c-fg-f3efe6)] tracking-tight">
                  {openSheet === 'model'
                    ? 'Modelo'
                    : openSheet === 'reasoning'
                    ? 'Pensamento Estendido (Reasoning)'
                    : '⚡ Monitor de Tokens & Contexto'}
                </h3>
                <p className="text-xs text-[color:var(--c-fg-9c9588)] mt-0.5">
                  {openSheet === 'model'
                    ? 'Selecione o modelo do Synap'
                    : openSheet === 'reasoning'
                    ? 'Nível de raciocínio da IA antes de responder'
                    : 'Estatísticas de consumo de tokens desta conversa'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenSheet(null)}
                aria-label="Fechar"
                className="p-1 rounded-lg text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List or Content */}
            {openSheet === 'tokens' ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-[color:var(--c-bg-1e1c19)] border border-[color:var(--c-bg-312f2a)] space-y-2.5">
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[color:var(--c-bg-2c2924)]">
                    <span className="text-[color:var(--c-fg-a8a296)]">Tokens de Prompt (Entrada):</span>
                    <span className="font-mono text-[color:var(--c-fg-f3efe6)] font-semibold">
                      {conversationTokens?.promptTokens ? conversationTokens.promptTokens.toLocaleString() : '0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[color:var(--c-bg-2c2924)]">
                    <span className="text-[color:var(--c-fg-a8a296)]">Tokens de Resposta (Saída / Raciocínio):</span>
                    <span className="font-mono text-[color:var(--c-fg-f3efe6)] font-semibold">
                      {conversationTokens?.completionTokens ? conversationTokens.completionTokens.toLocaleString() : '0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-[color:var(--c-fg-d97757)] font-semibold flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Total Consumido no Chat:</span>
                    </span>
                    <span className="font-mono text-[color:var(--c-fg-d97757)] font-bold text-sm">
                      {conversationTokens?.totalTokens ? conversationTokens.totalTokens.toLocaleString() : '0'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[color:var(--c-bg-191714)] border border-[color:var(--c-bg-2d2b25)] text-xs space-y-2 text-[color:var(--c-fg-8c867a)]">
                  <div className="flex justify-between items-center">
                    <span>Janela de Contexto Total:</span>
                    <span className="text-[color:var(--c-fg-c4bcaa)] font-mono font-medium">128.000 tokens</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Limite por Resposta (max_tokens):</span>
                    <span className="text-[color:var(--c-fg-c4bcaa)] font-mono font-medium">8.192 tokens</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Streaming Usage (NVIDIA):</span>
                    <span className="text-emerald-400 font-mono font-medium">Ativo (include_usage)</span>
                  </div>
                </div>

                <div className="text-[11px] text-[color:var(--c-fg-8c867a)] bg-[color:var(--c-bg-1a1815)] p-2.5 rounded-lg border border-[color:var(--c-bg-272520)] leading-relaxed">
                  💡 <strong className="text-[color:var(--c-fg-c4bfb6)]">Dica:</strong> Cada resposta da IA também exibe o selo <span className="text-[color:var(--c-fg-d97757)]">⚡ [número] tokens</span> no rodapé. Clique nele para ver o consumo individual da mensagem.
                </div>

                {onOpenTerminal && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSheet(null);
                      onOpenTerminal();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-[color:var(--c-bg-282520)] hover:bg-[color:var(--c-bg-332f29)] border border-[color:var(--c-bg-3a362f)] text-xs font-mono text-[color:var(--c-fg-f3efe6)] flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                    <span>Abrir Monitor no Terminal (`tokens`)</span>
                  </button>
                )}
              </div>
            ) : openSheet === 'model' ? (
              <div className="space-y-1.5">
                {models.map((item) => {
                  const isSelected = selectedModel === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectModel(item.id);
                        setOpenSheet(null);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[color:var(--c-bg-2e2b26)] text-[color:var(--c-fg-f3efe6)] border border-[#d97757]/40 shadow-xs'
                          : 'bg-[color:var(--c-bg-1e1c19)] hover:bg-[color:var(--c-bg-282622)] border border-[color:var(--c-bg-312f2a)] text-[color:var(--c-fg-b8b3a8)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[color:var(--c-fg-f3efe6)]">{item.title}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              isSelected
                                ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)]'
                                : 'bg-[color:var(--c-bg-2b2925)] text-[color:var(--c-fg-8c867a)]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-xs text-[color:var(--c-fg-9c9588)] mt-0.5 leading-snug">
                          {item.subtitle}
                        </p>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-[color:var(--c-fg-d97757)] flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                {reasoningLevels.map((item) => {
                  const isSelected = reasoningEffort === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectReasoningEffort(item.id);
                        setOpenSheet(null);
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[color:var(--c-bg-2e2b26)] text-[color:var(--c-fg-f3efe6)] border border-[#d97757]/40 shadow-xs'
                          : 'bg-[color:var(--c-bg-1e1c19)] hover:bg-[color:var(--c-bg-282622)] border border-[color:var(--c-bg-312f2a)] text-[color:var(--c-fg-b8b3a8)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[color:var(--c-fg-f3efe6)]">{item.title}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                              isSelected
                                ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)]'
                                : 'bg-[color:var(--c-bg-2b2925)] text-[color:var(--c-fg-8c867a)]'
                            }`}
                          >
                            {item.level}
                          </span>
                        </div>
                        <p className="text-xs text-[color:var(--c-fg-9c9588)] mt-0.5 leading-snug">
                          {item.subtitle}
                        </p>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-[color:var(--c-fg-d97757)] flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
