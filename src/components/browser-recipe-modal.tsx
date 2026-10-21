import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Play,
  Trash2,
  Check,
  AlertCircle,
  Workflow,
  Loader2,
  Send,
  Eye,
  Layers,
  ArrowRight,
  ArrowLeft,
  Clock,
  MousePointer,
  Type,
  FileSpreadsheet,
  Edit3,
} from 'lucide-react';
import {
  BrowserRecipe,
  BrowserRecipeAction,
  BrowserRecipeActionType,
  createBrowserRecipe,
  createRecipeAction,
  validateRecipe,
  loadSavedRecipes,
  saveRecipe,
  deleteRecipe,
  compileRecipeToPuppeteerScript,
} from '../lib/browser-recipe-engine';

interface BrowserRecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToChat?: (text: string) => void;
  browserEndpoint?: string;
  browserlessApiKey?: string;
}

export const BrowserRecipeModal: React.FC<BrowserRecipeModalProps> = ({
  isOpen,
  onClose,
  onSendToChat,
  browserEndpoint,
  browserlessApiKey,
}) => {
  const [recipes, setRecipes] = useState<BrowserRecipe[]>([]);
  const [activeRecipe, setActiveRecipe] = useState<BrowserRecipe | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formActions, setFormActions] = useState<BrowserRecipeAction[]>([]);

  // New action sub-form
  const [actionType, setActionType] = useState<BrowserRecipeActionType>('click');
  const [actionTarget, setActionTarget] = useState('');
  const [actionValue, setActionValue] = useState('');

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSavedRecipes().then((loaded) => {
        setRecipes(loaded);
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
        if (loaded.length > 0 && !activeRecipe && !isCreatingNew && !isMobile) {
          setActiveRecipe(loaded[0]);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartNewRecipe = () => {
    setFormName('');
    setFormUrl('');
    setFormDesc('');
    setFormActions([
      createRecipeAction('wait', { value: '2000', description: 'Aguardar carregamento da página (2s)' }),
    ]);
    setEditingRecipeId(null);
    setIsCreatingNew(true);
    setActiveRecipe(null);
    setRunResult(null);
    setRunError(null);
  };

  const handleStartEditRecipe = (recipe: BrowserRecipe) => {
    setFormName(recipe.name);
    setFormUrl(recipe.startUrl);
    setFormDesc(recipe.description || '');
    setFormActions([...recipe.actions]);
    setEditingRecipeId(recipe.id);
    setIsCreatingNew(true);
    setRunResult(null);
    setRunError(null);
  };

  const handleAddAction = () => {
    if (actionType !== 'wait' && actionType !== 'scroll' && !actionTarget.trim()) return;
    const newAction = createRecipeAction(actionType, {
      target: actionTarget.trim(),
      value: actionValue.trim(),
    });
    setFormActions((prev) => [...prev, newAction]);
    setActionTarget('');
    setActionValue('');
  };

  const handleRemoveAction = (index: number) => {
    setFormActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveRecipe = async () => {
    let recipeToSave: BrowserRecipe;
    if (editingRecipeId) {
      recipeToSave = {
        id: editingRecipeId,
        name: formName.trim(),
        startUrl: formUrl.trim(),
        actions: formActions,
        description: formDesc.trim(),
        createdAt: activeRecipe?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      recipeToSave = createBrowserRecipe(formName, formUrl, formActions, formDesc);
    }

    const val = validateRecipe(recipeToSave);
    if (!val.valid) {
      alert(`Erros ao salvar:\n- ${val.errors.join('\n- ')}`);
      return;
    }
    await saveRecipe(recipeToSave);
    const updated = await loadSavedRecipes();
    setRecipes(updated);
    setActiveRecipe(recipeToSave);
    setIsCreatingNew(false);
    setEditingRecipeId(null);
  };

  const handleDeleteRecipe = async (id: string) => {
    if (!window.confirm('Excluir este robô de navegação?')) return;
    await deleteRecipe(id);
    const updated = await loadSavedRecipes();
    setRecipes(updated);
    if (activeRecipe?.id === id) {
      setActiveRecipe(updated[0] || null);
    }
  };

  const handleRunRecipe = async (recipe: BrowserRecipe) => {
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);

    try {
      const code = compileRecipeToPuppeteerScript(recipe);
      const res = await fetch('/api/browser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_API_SECRET || '',
        },
        body: JSON.stringify({
          action: 'navigate',
          url: recipe.startUrl,
          apiKey: browserlessApiKey,
          browserEndpoint,
          code,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Falha ao executar o robô no navegador.');
      }
      setRunResult(data);

      const updatedRecipe: BrowserRecipe = {
        ...recipe,
        lastRunAt: Date.now(),
        lastStatus: 'success',
        lastExtractedData: data.extractedData || data.interactiveElements,
      };
      await saveRecipe(updatedRecipe);
      setActiveRecipe(updatedRecipe);
      setRecipes((prev) => prev.map((r) => (r.id === updatedRecipe.id ? updatedRecipe : r)));
    } catch (err: any) {
      setRunError(err?.message || 'Erro inesperado na execução do robô.');
      if (recipe) {
        const failedRecipe: BrowserRecipe = {
          ...recipe,
          lastRunAt: Date.now(),
          lastStatus: 'error',
        };
        await saveRecipe(failedRecipe).catch(() => {});
        setActiveRecipe(failedRecipe);
        setRecipes((prev) => prev.map((r) => (r.id === failedRecipe.id ? failedRecipe : r)));
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleSendResultsToChat = () => {
    if (!activeRecipe || !runResult || !onSendToChat) return;
    const extractedDataStr = JSON.stringify(runResult.extractedData || runResult.interactiveElements || {}, null, 2);
    const prompt = `Analise os dados coletados pelo robô de navegação "${activeRecipe.name}" (URL: ${activeRecipe.startUrl}):\n\n\`\`\`json\n${extractedDataStr}\n\`\`\``;
    onSendToChat(prompt);
    onClose();
  };

  const isDetailViewActive = isCreatingNew || Boolean(activeRecipe);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-4xl h-full sm:h-[85vh] flex flex-col rounded-none sm:rounded-2xl bg-[color:var(--c-bg-181714)] border-0 sm:border border-[color:var(--c-bg-3b3831)] shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 bg-[color:var(--c-bg-201e1a)] border-b border-[color:var(--c-bg-3b3831)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="font-semibold text-xs sm:text-sm text-[color:var(--c-fg-f3efe6)] truncate">
              <span className="hidden sm:inline">Gravador de Scraping & Automações Web (Estilo Maxun)</span>
              <span className="sm:hidden">Robôs de Scraping (Maxun)</span>
            </h2>
            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shrink-0">
              No-Code
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Split View (List + Editor/Viewer) */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Sidebar: Lista de Robôs */}
          <div
            className={`w-full sm:w-64 shrink-0 sm:border-r border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1c1b17)] flex flex-col p-3 space-y-2 ${
              isDetailViewActive ? 'hidden sm:flex' : 'flex'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-[color:var(--c-fg-a39d93)] uppercase tracking-wider">
                Robôs Salvos ({recipes.length})
              </span>
              <button
                type="button"
                onClick={handleStartNewRecipe}
                className="p-1 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 transition cursor-pointer"
                title="Novo Robô"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {recipes.length === 0 ? (
                <div className="p-3 text-center text-[color:var(--c-fg-8c867a)] space-y-1.5">
                  <p>Nenhum robô gravado ainda.</p>
                  <button
                    type="button"
                    onClick={handleStartNewRecipe}
                    className="text-cyan-400 hover:underline"
                  >
                    + Criar o primeiro
                  </button>
                </div>
              ) : (
                recipes.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      setActiveRecipe(r);
                      setIsCreatingNew(false);
                      setRunResult(null);
                      setRunError(null);
                    }}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 ${
                      activeRecipe?.id === r.id && !isCreatingNew
                        ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
                        : 'bg-[color:var(--c-bg-23211d)] border-[color:var(--c-bg-3b3831)] text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold truncate max-w-[150px]">{r.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecipe(r.id);
                        }}
                        className="text-zinc-500 hover:text-rose-400 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="text-[10px] text-[color:var(--c-fg-8c867a)] truncate font-mono">
                      {r.startUrl}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {r.actions.length} passo(s) gravado(s)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main Area: Editor or Runner */}
          <div
            className={`flex-1 min-h-0 flex flex-col overflow-y-auto p-3 sm:p-4 space-y-4 bg-[color:var(--c-bg-181714)] ${
              !isDetailViewActive ? 'hidden sm:flex' : 'flex'
            }`}
          >
            {/* Mobile Header / Voltar para lista */}
            <div className="sm:hidden flex items-center justify-between pb-2 border-b border-[color:var(--c-bg-3b3831)] shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveRecipe(null);
                  setIsCreatingNew(false);
                  setEditingRecipeId(null);
                }}
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para lista</span>
              </button>
              <span className="text-[10px] text-zinc-500 font-mono">
                {isCreatingNew ? (editingRecipeId ? 'Editando' : 'Novo') : 'Detalhes'}
              </span>
            </div>
            {isCreatingNew ? (
              /* Formulário de Criação */
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[color:var(--c-bg-3b3831)]">
                  <h3 className="font-semibold text-sm text-[color:var(--c-fg-f3efe6)] flex items-center gap-1.5">
                    {editingRecipeId ? <Edit3 className="w-4 h-4 text-cyan-400" /> : <Plus className="w-4 h-4 text-cyan-400" />}
                    {editingRecipeId ? 'Editar Robô de Scraping' : 'Criar Novo Robô de Scraping'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="text-zinc-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[color:var(--c-fg-a39d93)] mb-1">Nome do Robô</label>
                    <input
                      type="text"
                      placeholder="Ex: Extrator de Preços ou Links"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3b3831)] text-[color:var(--c-fg-f3efe6)] focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[color:var(--c-fg-a39d93)] mb-1">URL Inicial da Página</label>
                    <input
                      type="url"
                      placeholder="https://exemplo.com/pagina"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3b3831)] text-[color:var(--c-fg-f3efe6)] focus:border-cyan-400 font-mono text-[11px]"
                    />
                  </div>
                </div>

                {/* Lista de Ações Gravadas */}
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-semibold text-[color:var(--c-fg-a39d93)] uppercase tracking-wider block">
                    Sequência de Ações do Robô ({formActions.length})
                  </span>

                  <div className="space-y-1.5">
                    {formActions.map((act, index) => (
                      <div
                        key={act.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3b3831)]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-300 font-bold flex items-center justify-center text-[10px]">
                            {index + 1}
                          </span>
                          <span className="font-mono text-cyan-300 uppercase text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/40 border border-cyan-500/20">
                            {act.type}
                          </span>
                          <span className="text-[color:var(--c-fg-f3efe6)]">{act.description}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAction(index)}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Formulário para Adicionar Ação */}
                  <div className="p-3 rounded-xl bg-[color:var(--c-bg-23211d)] border border-dashed border-[color:var(--c-bg-3b3831)] space-y-2.5 mt-2">
                    <span className="font-semibold text-[11px] text-cyan-300">Adicionar Passo ao Fluxo:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={actionType}
                        onChange={(e) => setActionType(e.target.value as BrowserRecipeActionType)}
                        className="px-2 py-1.5 rounded-lg bg-[color:var(--c-bg-181714)] border border-[color:var(--c-bg-3b3831)] text-[color:var(--c-fg-f3efe6)] text-xs"
                      >
                        <option value="click">Clicar em Elemento (click)</option>
                        <option value="type">Digitar Texto (type)</option>
                        <option value="wait">Aguardar Tempo (wait)</option>
                        <option value="scroll">Rolar a Tela (scroll)</option>
                        <option value="extract_text">Extrair Texto/Src (extract_text)</option>
                        <option value="extract_table">Extrair Tabela (extract_table)</option>
                      </select>

                      <input
                        type="text"
                        placeholder={
                          actionType === 'wait'
                            ? 'Milissegundos (ex: 2000)'
                            : actionType === 'scroll'
                            ? 'Pixels (ex: 500)'
                            : 'Seletor CSS ou ID (ex: .btn-play, iframe)'
                        }
                        value={actionTarget}
                        onChange={(e) => setActionTarget(e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-[color:var(--c-bg-181714)] border border-[color:var(--c-bg-3b3831)] text-[color:var(--c-fg-f3efe6)] font-mono text-[11px]"
                      />

                      {(actionType === 'type' || actionType === 'wait' || actionType === 'scroll') && (
                        <input
                          type="text"
                          placeholder={actionType === 'type' ? 'Texto a digitar' : 'Valor opcional'}
                          value={actionValue}
                          onChange={(e) => setActionValue(e.target.value)}
                          className="px-2 py-1.5 rounded-lg bg-[color:var(--c-bg-181714)] border border-[color:var(--c-bg-3b3831)] text-[color:var(--c-fg-f3efe6)] text-[11px]"
                        />
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddAction}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition cursor-pointer flex items-center gap-1.5 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Inserir Passo</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[color:var(--c-bg-3b3831)]">
                  <button
                    type="button"
                    onClick={handleSaveRecipe}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Robô</span>
                  </button>
                </div>
              </div>
            ) : activeRecipe ? (
              /* Visualizador e Executor do Robô Selecionado */
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[color:var(--c-bg-3b3831)]">
                  <div>
                    <h3 className="font-semibold text-base text-[color:var(--c-fg-f3efe6)]">{activeRecipe.name}</h3>
                    <p className="text-[11px] text-[color:var(--c-fg-8c867a)] font-mono">{activeRecipe.startUrl}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleStartEditRecipe(activeRecipe)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition cursor-pointer flex items-center gap-1.5"
                      title="Editar passos e configurações deste robô"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => handleRunRecipe(activeRecipe)}
                      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium transition cursor-pointer flex items-center gap-1.5 shadow-md"
                    >
                      {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      <span>{isRunning ? 'Executando...' : 'Executar Robô'}</span>
                    </button>
                  </div>
                </div>

                {/* Passos da Receita */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[color:var(--c-fg-a39d93)] uppercase tracking-wider block">
                    Passos do Robô ({activeRecipe.actions.length})
                  </span>
                  {activeRecipe.actions.map((act, idx) => (
                    <div
                      key={act.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-[color:var(--c-bg-201e1a)] border border-[color:var(--c-bg-3b3831)] text-[11px]"
                    >
                      <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-mono text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-mono text-cyan-300 uppercase text-[9px] px-1 py-0.2 rounded bg-cyan-950/40 border border-cyan-500/20">
                        {act.type}
                      </span>
                      <span className="text-[color:var(--c-fg-f3efe6)]">{act.description}</span>
                    </div>
                  ))}
                </div>

                {/* Área de Resultados da Execução */}
                {isRunning && (
                  <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex items-center gap-3 text-cyan-300">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                    <span>Navegando e executando passos do robô com Playwright...</span>
                  </div>
                )}

                {runError && (
                  <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{runError}</span>
                  </div>
                )}

                {runResult && (
                  <div className="p-3 rounded-xl bg-[color:var(--c-bg-201e1a)] border border-cyan-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Check className="w-4 h-4" />
                        Execução Concluída com Sucesso!
                      </span>
                      {onSendToChat && (
                        <button
                          type="button"
                          onClick={handleSendResultsToChat}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Send className="w-3 h-3" />
                          <span>Enviar Dados para o Chat com IA</span>
                        </button>
                      )}
                    </div>

                    {/* Dados Extraídos */}
                    {runResult.extractedData && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-[color:var(--c-fg-8c867a)]">
                          Dados Extraídos:
                        </span>
                        <pre className="p-2.5 rounded-lg bg-black/60 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(runResult.extractedData, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Screenshot final */}
                    {runResult.screenshotBase64 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-[color:var(--c-fg-8c867a)]">
                          Screenshot da Página:
                        </span>
                        <div className="rounded-xl overflow-hidden border border-cyan-500/20 max-h-48 flex justify-center bg-black/50">
                          <img
                            src={runResult.screenshotBase64}
                            alt="Screenshot"
                            className="object-cover object-top w-full cursor-zoom-in"
                            onClick={() => window.open(runResult.screenshotBase64, '_blank')}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-[color:var(--c-fg-8c867a)] space-y-2">
                <Workflow className="w-8 h-8 mx-auto opacity-40 text-cyan-400" />
                <p>Selecione um robô na lista ou crie um novo para começar.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
