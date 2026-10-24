import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, X, ChevronDown, ListTodo, Check, Zap, Terminal, RefreshCw } from 'lucide-react';
import { ConcreteModelId, ModelId, ReasoningEffort } from '../lib/types';
import { ModelHealthMap, getShortModelName } from '../lib/smart-model-router';

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
    activeContextTokens?: number;
  };
  onOpenTerminal?: () => void;
  modelHealthMap?: ModelHealthMap;
  isCheckingHealth?: boolean;
  onRefreshHealth?: (force?: boolean) => void;
  lastAutoRoutedModel?: ConcreteModelId | null;
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
  modelHealthMap,
  isCheckingHealth = false,
  onRefreshHealth,
  lastAutoRoutedModel,
}) => {
  const [openSheet, setOpenSheet] = useState<'model' | 'reasoning' | 'tokens' | null>(null);

  useEffect(() => {
    if (openSheet === 'model' && onRefreshHealth && (!modelHealthMap || Object.keys(modelHealthMap).length === 0)) {
      onRefreshHealth(false);
    }
  }, [openSheet, onRefreshHealth, modelHealthMap]);

  const models: Array<{
    id: ModelId;
    title: string;
    subtitle: string;
    badge: string;
    isAuto?: boolean;
  }> = [
    {
      id: 'auto',
      title: 'Automático (Smart Router)',
      subtitle: 'Decide sozinho e envia para o modelo online mais rápido e ideal para a tarefa',
      badge: 'Auto ⚡',
      isAuto: true,
    },
    {
      id: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      title: 'Nemotron-3.5 Super VL',
      subtitle: 'NVIDIA 120B Super VL — Visão multimodal e execução turbo (~1s)',
      badge: 'NVIDIA × VL',
    },
    {
      id: 'nvidia/nemotron-3-ultra-550b-a55b',
      title: 'Nemotron 3 Ultra',
      subtitle: 'NVIDIA 550B MoE híbrido — Máxima inteligência e ferramentas (~2s)',
      badge: 'NVIDIA ⚡ 550B',
    },
    {
      id: 'z-ai/glm-5.3-flash',
      title: 'GLM-5.3 Flash',
      subtitle: 'Rápido + Suporte multimodal a visão e fotos',
      badge: 'Visão',
    },
    {
      id: 'z-ai/glm-5.3',
      title: 'GLM-5.3',
      subtitle: 'Raciocínio analítico avançado e raciocínio profundo de fundo',
      badge: 'Pensar',
    },
    {
      id: 'google/gemma-4-31b-it',
      title: 'Gemma 4 31B',
      subtitle: 'Google DeepMind multimodal (256k contexto, visão e lógica)',
      badge: 'Google × 31B',
    },
    {
      id: 'deepseek-ai/deepseek-v4.1-flash',
      title: 'DeepSeek V4.1 Flash',
      subtitle: 'Rápido e eficiente — tempo custo-benefício',
      badge: 'Flash',
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
      subtitle: 'Menor latência para respostas rápidas e concisas (Modo Turbo)',
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

  const currentModelHealth =
    selectedModel !== 'auto' && modelHealthMap
      ? modelHealthMap[selectedModel as ConcreteModelId]
      : undefined;

  const is256kContext =
    selectedModel === 'auto' ||
    selectedModel === 'google/gemma-4-31b-it' ||
    selectedModel === 'nvidia/nemotron-3.5-super-vl-120b-a12b' ||
    selectedModel === 'nvidia/nemotron-3-ultra-550b-a55b';

  return (
    <>
      {/* ===================== CLAUDE.AI BUTTON PILLS TOOLBAR ===================== */}
      <div className="flex items-center justify-center gap-1.5 mt-2 px-1 text-xs select-none">
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Model Selector Pill (Claude style) */}
          <button
            type="button"
            onClick={() => setOpenSheet('model')}
            aria-label="Selecionar modelo"
            title={
              selectedModel === 'auto'
                ? `Modo Automático Ativo${lastAutoRoutedModel ? ` (Último usado: ${getShortModelName(lastAutoRoutedModel)})` : ''}`
                : `Modelo Manual: ${getShortModelName(selectedModel)}`
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              openSheet === 'model'
                ? 'bg-[color:var(--c-bg-33302a)] text-zinc-950 dark:text-[color:var(--c-fg-f3efe6)] border border-[#d97757]/50'
                : selectedModel === 'auto'
                  ? 'bg-[#d97757]/15 hover:bg-[#d97757]/25 border border-[#d97757]/40 text-zinc-900 dark:text-[color:var(--c-fg-f3efe6)]'
                  : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-zinc-300/80 dark:border-[color:var(--c-bg-36332d)] text-zinc-800 dark:text-[color:var(--c-fg-b8b3a8)]'
            }`}
          >
            {selectedModel === 'auto' ? (
              <Sparkles className="w-3.5 h-3.5 text-[#d97757] shrink-0" />
            ) : currentModelHealth ? (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  currentModelHealth.status === 'online'
                    ? 'bg-emerald-400 animate-pulse'
                    : currentModelHealth.status === 'slow'
                      ? 'bg-amber-400'
                      : 'bg-red-500'
                }`}
                title={
                  currentModelHealth.status === 'online'
                    ? `Online (${currentModelHealth.latencyMs}ms)`
                    : currentModelHealth.status === 'slow'
                      ? `Lento (${currentModelHealth.latencyMs}ms)`
                      : 'Fora do ar na NVIDIA'
                }
              />
            ) : null}
            <span className="font-semibold text-zinc-900 dark:text-[color:var(--c-fg-f3efe6)] truncate max-w-[150px] sm:max-w-none">
              {selectedModel === 'auto'
                ? lastAutoRoutedModel
                  ? `Auto · ${getShortModelName(lastAutoRoutedModel)}`
                  : 'Automático ⚡'
                : selectedModel === 'z-ai/glm-5.3'
                  ? 'GLM-5.3'
                  : selectedModel === 'z-ai/glm-5.3-flash'
                    ? 'GLM Flash'
                    : selectedModel === 'google/gemma-4-31b-it'
                      ? 'Gemma 4 31B'
                      : selectedModel === 'deepseek-ai/deepseek-v4.1-flash'
                        ? 'DeepSeek V4.1'
                        : selectedModel === 'nvidia/nemotron-3.5-super-vl-120b-a12b'
                          ? 'Nemotron VL'
                          : selectedModel === 'nvidia/nemotron-3-ultra-550b-a55b'
                            ? 'Nemotron 3 Ultra'
                            : 'Automático ⚡'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-[color:var(--c-fg-8c867a)] shrink-0" />
          </button>

          {/* Reasoning / Extended Thinking Pill */}
          <button
            type="button"
            onClick={() => setOpenSheet('reasoning')}
            aria-label="Ajustar pensamento estendido"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              openSheet === 'reasoning'
                ? 'bg-[color:var(--c-bg-33302a)] text-zinc-950 dark:text-[color:var(--c-fg-f3efe6)] border border-[#d97757]/50'
                : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-zinc-300/80 dark:border-[color:var(--c-bg-36332d)] text-zinc-800 dark:text-[color:var(--c-fg-b8b3a8)]'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-[#d97757]" />
            <span className="text-zinc-600 dark:text-[color:var(--c-fg-8c867a)] text-[11px] font-medium">pensar:</span>
            <span className="text-zinc-900 dark:text-[color:var(--c-fg-f3efe6)] font-semibold">{reasoningEffort}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-[color:var(--c-fg-8c867a)]" />
          </button>

          {/* Plan Mode Pill */}
          <button
            type="button"
            onClick={onTogglePlanMode}
            aria-label="Alternar Modo Plano"
            title="Ativar/Desativar modo de planejamento estruturado"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer ${
              isPlanMode
                ? 'bg-[#d97757]/20 text-[#a34423] dark:text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40'
                : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-zinc-300/80 dark:border-[color:var(--c-bg-36332d)] text-zinc-700 dark:text-[color:var(--c-fg-8c867a)]'
            }`}
          >
            <ListTodo className={`w-3.5 h-3.5 ${isPlanMode ? 'text-[#d97757]' : 'text-zinc-500 dark:text-[color:var(--c-fg-8c867a)]'}`} />
            <span className={isPlanMode ? 'text-[#a34423] dark:text-[color:var(--c-fg-f3efe6)] font-semibold' : 'text-zinc-800 dark:text-[color:var(--c-fg-f3efe6)] font-medium'}>Plano</span>
            <span
              className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold ${
                isPlanMode
                  ? 'bg-[#d97757] text-white'
                  : 'bg-zinc-200/90 dark:bg-[color:var(--c-bg-2f2d28)] text-zinc-700 dark:text-[color:var(--c-fg-8c867a)] border border-zinc-300/70 dark:border-transparent'
              }`}
            >
              {isPlanMode ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Token Usage Tool Pill with embedded progress bar */}
          {(() => {
            const activeTokens = conversationTokens?.activeContextTokens || conversationTokens?.totalTokens || 0;
            const totalAccumulated = conversationTokens?.totalTokens || 0;
            const CONTEXT_LIMIT = is256kContext ? 256000 : 128000;
            const percent = Math.min(100, (activeTokens / CONTEXT_LIMIT) * 100);
            const barColor =
              percent >= 90 ? 'bg-red-500' :
              percent >= 75 ? 'bg-orange-500' :
              percent >= 50 ? 'bg-yellow-500' :
              'bg-emerald-500';
            const textColor =
              percent >= 90 ? 'text-red-600 dark:text-red-400 font-semibold' :
              percent >= 75 ? 'text-orange-600 dark:text-orange-400 font-semibold' :
              percent >= 50 ? 'text-amber-600 dark:text-amber-400 font-semibold' :
              'text-zinc-900 dark:text-[color:var(--c-fg-f3efe6)] font-semibold';
            const pulseClass = percent >= 90 ? 'animate-pulse' : '';
            return (
              <button
                type="button"
                onClick={() => setOpenSheet('tokens')}
                aria-label="Ferramenta de Monitoramento de Tokens"
                title={`Contexto Ativo: ${activeTokens.toLocaleString()} / ${CONTEXT_LIMIT.toLocaleString()} (${percent.toFixed(1)}%) | Total acumulado na sessão: ${totalAccumulated.toLocaleString()} tokens`}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-colors text-xs font-medium cursor-pointer whitespace-nowrap ${
                  openSheet === 'tokens'
                    ? 'bg-[#d97757]/20 text-[#a34423] dark:text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40 shadow-xs'
                    : 'bg-[color:var(--c-bg-22201d)] hover:bg-[color:var(--c-bg-2c2925)] border border-zinc-300/80 dark:border-[color:var(--c-bg-36332d)] text-zinc-800 dark:text-[color:var(--c-fg-b8b3a8)]'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 text-[#d97757] ${pulseClass} shrink-0`} />
                <span className="text-zinc-600 dark:text-[color:var(--c-fg-8c867a)] text-[11px] font-medium">tokens:</span>
                <span className={`font-mono font-medium ${textColor} ${pulseClass}`}>
                  {activeTokens.toLocaleString()}
                </span>
                {activeTokens > 0 && (
                  <div className="flex items-center gap-1 ml-0.5 shrink-0">
                    <div className="w-8 sm:w-12 h-1.5 bg-zinc-200 dark:bg-[color:var(--c-bg-2f2d28)] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-all duration-300 ${pulseClass}`}
                        style={{ width: `${Math.max(2, percent)}%` }}
                      />
                    </div>
                    <span className={`text-[9px] font-mono font-medium ${textColor}`}>
                      {percent.toFixed(0)}%
                    </span>
                  </div>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* ===================== CLAUDE.AI BOTTOM SHEET / MODAL ===================== */}
      {openSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-150">
          {/* Dimmed warm backdrop */}
          <div
            onClick={() => setOpenSheet(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
          />

          {/* Claude Warm Card */}
          <div className="relative w-full max-w-md mx-auto bg-[color:var(--c-bg-23211d)] border border-[color:var(--c-bg-3b3831)] rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl z-10 animate-in slide-in-from-bottom duration-150 pb-6 sm:pb-5 max-h-[88dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[color:var(--c-bg-312f2a)] shrink-0">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-semibold text-[color:var(--c-fg-f3efe6)] tracking-tight">
                  {openSheet === 'model'
                    ? 'Modelo de Inteligência'
                    : openSheet === 'reasoning'
                      ? 'Pensamento Estendido (Reasoning)'
                      : '🏆 Monitor de Tokens & Contexto'}
                </h3>
                <p className="text-xs text-[color:var(--c-fg-9c9588)] mt-0.5 truncate">
                  {openSheet === 'model'
                    ? 'Automático ou seleção manual c/ status NVIDIA ao vivo'
                    : openSheet === 'reasoning'
                      ? 'Nível de raciocínio da IA antes de responder'
                      : 'Estatísticas de consumo de tokens desta conversa'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {openSheet === 'model' && onRefreshHealth && (
                  <button
                    type="button"
                    onClick={() => onRefreshHealth(true)}
                    disabled={isCheckingHealth}
                    title="Testar agora quais modelos da NVIDIA estão online"
                    className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-[color:var(--c-bg-2c2924)] hover:bg-[color:var(--c-bg-35322c)] border border-[color:var(--c-bg-3b3831)] text-[11px] font-medium text-[color:var(--c-fg-f3efe6)] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 text-[#d97757] ${isCheckingHealth ? 'animate-spin' : ''}`} />
                    <span>{isCheckingHealth ? 'Testando...' : 'Testar NVIDIA'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpenSheet(null)}
                  aria-label="Fechar"
                  className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List or Content */}
            {openSheet === 'tokens' ? (
              <div className="space-y-3 overflow-y-auto">
                <div className="p-3.5 rounded-xl bg-[color:var(--c-bg-1e1c19)] border border-[color:var(--c-bg-312f2a)] space-y-2.5">
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[color:var(--c-bg-2c2924)]">
                    <span className="text-[color:var(--c-fg-a8a296)]">
                      Contexto Ativo Total {'('}Janela de {is256kContext ? '256k' : '128k'}{')'}:
                    </span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {(conversationTokens?.activeContextTokens || 0).toLocaleString()} tokens
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[color:var(--c-bg-2c2924)]">
                    <span className="text-[color:var(--c-fg-a8a296)]">Tokens de Entrada (Prompt acumulado):</span>
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
                      <span>Total Consumido na Conversa:</span>
                    </span>
                    <span className="font-mono text-[color:var(--c-fg-d97757)] font-bold text-sm">
                      {conversationTokens?.totalTokens ? conversationTokens.totalTokens.toLocaleString() : '0'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[color:var(--c-bg-191714)] border border-[color:var(--c-bg-272520)] text-xs space-y-2 text-[color:var(--c-fg-8c867a)]">
                  <div className="flex justify-between items-center">
                    <span>Janela de Contexto Total:</span>
                    <span className="text-[color:var(--c-fg-c4bcaa)] font-mono font-medium">
                      {is256kContext ? '256.000 tokens' : '128.000 tokens'}
                    </span>
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
                  ⚠️ <strong className="text-[color:var(--c-fg-c4bfb6)]">Dica:</strong> Cada resposta da IA também exibe o <span className="text-[color:var(--c-fg-d97757)]">≈ [número] tokens</span> no rodapé. Clique nela para ver o consumo individual de cada mensagem.
                </div>

                {onOpenTerminal && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenSheet(null);
                      onOpenTerminal();
                    }}
                    className="w-full py-2.5 px-3 min-h-[44px] rounded-xl bg-[color:var(--c-bg-282520)] hover:bg-[color:var(--c-bg-332f29)] border border-[color:var(--c-bg-3a362f)] text-xs font-mono text-[color:var(--c-fg-f3efe6)] flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                    <span>Abrir Monitor no Terminal (`tokens`)</span>
                  </button>
                )}
              </div>
            ) : openSheet === 'model' ? (
              <div className="space-y-1.5 overflow-y-auto pr-0.5">
                {models.map((item) => {
                  const isSelected = selectedModel === item.id;
                  const health = !item.isAuto && modelHealthMap ? modelHealthMap[item.id as ConcreteModelId] : undefined;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectModel(item.id);
                        setOpenSheet(null);
                      }}
                      className={`flex items-center justify-between p-3 min-h-[56px] rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[color:var(--c-bg-2e2b26)] text-[color:var(--c-fg-f3efe6)] border border-[#d97757]/50 shadow-xs'
                          : item.isAuto
                            ? 'bg-[#d97757]/10 hover:bg-[#d97757]/15 border border-[#d97757]/30 text-[color:var(--c-fg-f3efe6)]'
                            : 'bg-[color:var(--c-bg-1e1c19)] hover:bg-[color:var(--c-bg-282622)] border border-[color:var(--c-bg-312f2a)] text-[color:var(--c-fg-b8b3a8)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.isAuto && <Sparkles className="w-3.5 h-3.5 text-[#d97757] shrink-0" />}
                          <span className="font-semibold text-sm text-[color:var(--c-fg-f3efe6)] truncate">
                            {item.title}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                              isSelected || item.isAuto
                                ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)]'
                                : 'bg-[color:var(--c-bg-2b2925)] text-[color:var(--c-fg-8c867a)]'
                            }`}
                          >
                            {item.badge}
                          </span>

                          {/* Status Badge da NVIDIA ao vivo */}
                          {!item.isAuto && (
                            <>
                              {health?.status === 'online' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Online {health.latencyMs ? `· ${(health.latencyMs / 1000).toFixed(1)}s` : ''}
                                </span>
                              ) : health?.status === 'slow' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  Lento {health.latencyMs ? `· ${(health.latencyMs / 1000).toFixed(1)}s` : ''}
                                </span>
                              ) : health?.status === 'offline' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 font-mono shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                  Offline
                                </span>
                              ) : isCheckingHealth ? (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400 font-mono shrink-0">
                                  Checando...
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>
                        <p className="text-xs text-[color:var(--c-fg-9c9588)] mt-0.5 leading-snug break-words">
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
              <div className="space-y-1.5 overflow-y-auto">
                {reasoningLevels.map((item) => {
                  const isSelected = reasoningEffort === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelectReasoningEffort(item.id);
                        setOpenSheet(null);
                      }}
                      className={`flex items-center justify-between p-3 min-h-[52px] rounded-xl cursor-pointer transition-colors ${
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
