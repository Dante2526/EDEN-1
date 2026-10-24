import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Paperclip, AudioLines, MousePointerClick, X, Globe, Plus, Layout, Palette, Video, ListTodo } from 'lucide-react';
import { FileAttachmentPreviews } from './image-attachment';
import { VoiceButton } from './voice-button';
import { ModelControls } from './model-controls';
import { ConcreteModelId, ModelId, ReasoningEffort, AttachedDocument, SelectedPreviewElement, ActivePromptMode } from '../lib/types';
import { ModelHealthMap } from '../lib/smart-model-router';
import { isVisionModel } from '../lib/models';
import { fileToBase64, readFileAsText, generateId } from '../lib/utils';
import { extractImagesFromClipboardData } from '../lib/clipboard-utils';

interface ChatInputProps {
  onSendMessage: (content: string, images: string[], documents: AttachedDocument[], promptMode?: ActivePromptMode) => void;
  onStopGeneration: () => void;
  isLoading: boolean;
  isFlashModel: boolean;
  selectedModel: ModelId;
  onSelectModel: (model: ModelId) => void;
  reasoningEffort: ReasoningEffort;
  onSelectReasoningEffort: (effort: ReasoningEffort) => void;
  isPlanMode: boolean;
  onTogglePlanMode: () => void;
  isWebSearchActive?: boolean;
  onToggleWebSearch?: () => void;
  conversationTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  onOpenTerminal?: () => void;
  isContinuousVoiceActive?: boolean;
  onToggleContinuousVoice?: () => void;
  /** Handler específico pra transcrição do modo contínuo (interrompe TTS antes de enviar) */
  onContinuousVoiceTranscript?: (text: string) => void;
  onContinuousVoiceInterim?: (text: string) => void;
  selectedElements?: SelectedPreviewElement[];
  onRemoveSelectedElement?: (id: string) => void;
  onClearSelectedElements?: () => void;
  modelHealthMap?: ModelHealthMap;
  isCheckingHealth?: boolean;
  onRefreshHealth?: (force?: boolean) => void;
  lastAutoRoutedModel?: ConcreteModelId | null;
  activePromptMode?: ActivePromptMode;
  onSelectPromptMode?: (mode: ActivePromptMode) => void;
}

export const ChatInput: React.FC<ChatInputProps> = React.memo(({
  onSendMessage,
  onStopGeneration,
  isLoading,
  isFlashModel,
  selectedModel,
  onSelectModel,
  reasoningEffort,
  onSelectReasoningEffort,
  isPlanMode,
  onTogglePlanMode,
  isWebSearchActive = false,
  onToggleWebSearch,
  conversationTokens,
  onOpenTerminal,
  isContinuousVoiceActive = false,
  onToggleContinuousVoice,
  onContinuousVoiceTranscript,
  onContinuousVoiceInterim,
  selectedElements = [],
  onRemoveSelectedElement,
  onClearSelectedElements,
  modelHealthMap,
  isCheckingHealth,
  onRefreshHealth,
  lastAutoRoutedModel,
  activePromptMode,
  onSelectPromptMode,
}) => {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);

  const plusMenuRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const baseContentRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);

  // Auto-resize textarea up to 200px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = window.innerWidth < 640 ? 150 : 200;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [content]);

  // Fechar menu de acoes (+) ao clicar fora ou apertar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPlusMenuOpen(false);
      }
    };
    if (isPlusMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlusMenuOpen]);

  // Temporary auto-dismiss notification toast
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLoading) return;

    if (!content.trim() && images.length === 0 && documents.length === 0 && selectedElements.length === 0) return;

    const modeToSend = activePromptMode;
    onSendMessage(content.trim(), images, documents, modeToSend);
    setContent('');
    setImages([]);
    setDocuments([]);
    onSelectPromptMode?.(null);
    baseContentRef.current = '';

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      if (window.innerWidth >= 768) {
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const newImages: string[] = [];
    const newDocs: AttachedDocument[] = [];
    let switchedToFlash = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check if image
      if (file.type.startsWith('image/')) {
        try {
          const base64 = await fileToBase64(file);
          newImages.push(base64);

          // Preserva 'auto' ou qualquer modelo que já suporte visão
          const isVision = selectedModel === 'auto' || isVisionModel(selectedModel);
          if (!isVision) {
            onSelectModel('nvidia/nemotron-3.5-super-vl-120b-a12b');
            switchedToFlash = true;
          }
        } catch (err: any) {
          alert(err.message || 'Erro ao carregar imagem');
        }
      } else {
        // Text, code, document, or data file
        try {
          const text = await readFileAsText(file);
          newDocs.push({
            id: generateId(),
            name: file.name,
            size: file.size,
            type: file.type || 'text/plain',
            content: text,
          });
        } catch (err: any) {
          alert(err.message || `Erro ao ler arquivo ${file.name}`);
        }
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
    }
    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs]);
    }

    if (switchedToFlash) {
      setNotification('Modelo alternado para GLM-5.3 Flash para análise de imagens.');
    } else if (newDocs.length > 0) {
      setNotification(`${newDocs.length} arquivo(s) anexado(s) com sucesso.`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (isLoading) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handler para colar prints diretamente via Ctrl+V no input
  const lastPasteTimeRef = useRef<number>(0);

  // Handler para colar prints diretamente via Ctrl+V no input com debounce anti-duplicata
  const handlePaste = async (e: React.ClipboardEvent) => {
    const now = Date.now();
    if (now - lastPasteTimeRef.current < 500) return;
    const pastedImages = extractImagesFromClipboardData(e.clipboardData);
    if (pastedImages.length > 0) {
      e.preventDefault();
      lastPasteTimeRef.current = now;
      await processFiles(pastedImages);
    }
  };

  // Listener global de paste para capturar prints mesmo se o foco não estiver no textarea
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Se o usuário estiver digitando em outro input/textarea específico (ex: renomear chat), ignora
      const activeEl = document.activeElement;
      if (
        activeEl &&
        activeEl !== textareaRef.current &&
        (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastPasteTimeRef.current < 500) return;
      const pastedImages = extractImagesFromClipboardData(e.clipboardData);
      if (pastedImages.length > 0) {
        e.preventDefault();
        await processFiles(pastedImages);
        lastPasteTimeRef.current = now;
        textareaRef.current?.focus();
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [selectedModel, isLoading]);

  // Real-time live voice transcription handler
  const handleVoiceTranscript = (text: string, isInterim?: boolean) => {
    if (!isListeningRef.current) {
      baseContentRef.current = content;
      isListeningRef.current = true;
    }
    const prefix = baseContentRef.current ? `${baseContentRef.current.trim()} ` : '';
    setContent(`${prefix}${text}`);
  };

  const handleVoiceStateChange = (listening: boolean) => {
    if (!listening) {
      isListeningRef.current = false;
      baseContentRef.current = '';
    }
  };

  const canSend = content.trim().length > 0 || images.length > 0 || documents.length > 0 || selectedElements.length > 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-3 sm:pb-5">
      {/* Hidden file input supporting images, code and documents */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.txt,.md,.json,.csv,.js,.ts,.tsx,.jsx,.py,.html,.css,.log,.sql,.sh,.xml,.yaml,.yml,.c,.cpp,.java,.doc,.docx"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isLoading}
      />

      {/* Floating Notification */}
      {notification && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-[color:var(--c-bg-2e2318)] border border-[#d97757]/40 text-[color:var(--c-fg-f09a7d)] text-xs flex items-center justify-between shadow-md animate-in fade-in duration-200">
          <span>{notification}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-[color:var(--c-fg-d97757)] hover:text-[color:var(--c-on-strong)] ml-2 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Box with Drag & Drop and Direct Paste (DSS Dark Card Style) */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onPaste={handlePaste}
        className="relative rounded-2xl border border-gray-800/60 dark:border-white/10 bg-dark-card shadow-xl transition-all duration-200 focus-within:border-[#d97757]/60 focus-within:ring-2 focus-within:ring-[#d97757]/20 focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.25),0_0_20px_rgba(217,119,87,0.12)]"
      >
        {/* Chips de Elementos do Preview Selecionados para Edição */}
        {selectedElements && selectedElements.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 pb-2 border-b border-gray-800/60 dark:border-white/10">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d97757] mr-1 shrink-0">
              <MousePointerClick className="w-3.5 h-3.5 animate-pulse" />
              <span>Preview:</span>
            </div>
            {selectedElements.map((el) => (
              <div
                key={el.id}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#d97757]/15 border border-[#d97757]/40 text-[#f3efe6] text-xs max-w-[260px] shadow-sm animate-in fade-in zoom-in-95"
              >
                <span className="font-mono text-[#d97757] font-semibold text-[11px]">
                  &lt;{el.tagName}&gt;
                </span>
                {el.textContent && (
                  <span className="truncate text-xs text-[color:var(--c-fg-a39d93,#a39d93)]" title={el.textContent}>
                    "{el.textContent}"
                  </span>
                )}
                {onRemoveSelectedElement && (
                  <button
                    type="button"
                    onClick={() => onRemoveSelectedElement(el.id)}
                    className="p-0.5 rounded hover:bg-[#d97757]/30 text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-white transition-colors cursor-pointer ml-0.5"
                    title="Remover este componente"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {onClearSelectedElements && selectedElements.length > 1 && (
              <button
                type="button"
                onClick={onClearSelectedElements}
                className="text-[11px] text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-rose-400 underline decoration-dotted ml-auto transition-colors cursor-pointer"
              >
                Limpar todos
              </button>
            )}
          </div>
        )}

        {/* Previews for attached images and documents */}
        <FileAttachmentPreviews
          images={images}
          documents={documents}
          onRemoveImage={(idx) => setImages(images.filter((_, i) => i !== idx))}
          onRemoveDocument={(id) => setDocuments(documents.filter((d) => d.id !== id))}
        />

        <div className="p-3 sm:p-3.5">
          {/* Active Prompt Mode Chip (Canvas, Image, Video) */}
          {activePromptMode && (
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {activePromptMode === 'canvas' && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 shadow-xs animate-in fade-in duration-150">
                  <Layout className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Prototipar (Canvas)</span>
                  <button
                    type="button"
                    onClick={() => onSelectPromptMode?.(null)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-cyan-500/20 text-cyan-300 hover:text-white transition cursor-pointer"
                    title="Desativar modo Canvas"
                    aria-label="Desativar modo Canvas"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {activePromptMode === 'image' && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/40 border border-amber-500/40 text-amber-300 shadow-xs animate-in fade-in duration-150">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  <span>Criar Imagem</span>
                  <button
                    type="button"
                    onClick={() => onSelectPromptMode?.(null)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-amber-500/20 text-amber-300 hover:text-white transition cursor-pointer"
                    title="Desativar modo Imagem"
                    aria-label="Desativar modo Imagem"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {activePromptMode === 'video' && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-950/40 border border-rose-500/40 text-rose-300 shadow-xs animate-in fade-in duration-150">
                  <Video className="w-3.5 h-3.5 text-rose-400" />
                  <span>Vídeo & Animação</span>
                  <button
                    type="button"
                    onClick={() => onSelectPromptMode?.(null)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-rose-500/20 text-rose-300 hover:text-white transition cursor-pointer"
                    title="Desativar modo Vídeo"
                    aria-label="Desativar modo Vídeo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Main Textarea with Direct Screenshot Paste */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              selectedElements.length > 0
                ? `Instrua a IA sobre o que alterar no(s) ${selectedElements.length} componente(s) selecionado(s)...`
                : isWebSearchActive
                ? 'Pesquisar na web ao vivo ou fazer uma pergunta...'
                : activePromptMode === 'canvas'
                ? 'Descreva a tela nova ou interface que deseja prototipar no Canvas...'
                : activePromptMode === 'image'
                ? 'Descreva a imagem que deseja gerar com IA...'
                : activePromptMode === 'video'
                ? 'Descreva o roteiro ou animação de vídeo...'
                : isPlanMode
                ? 'Escreva uma mensagem para criar um Plano Estruturado...'
                : 'Escreva uma mensagem...'
            }
            className="w-full max-h-[160px] sm:max-h-[220px] py-1 px-1 text-sm sm:text-base text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-857f75)] bg-transparent resize-none border-0 focus:outline-none focus:ring-0 leading-relaxed font-sans"
          />

          {/* Claude Bottom Toolbar */}
          <div className="flex items-center justify-between gap-2 mt-2 pt-1">
            {/* Left Tools: Gemini-style Plus Menu & Live Web Search */}
            <div className="flex items-center gap-1 relative" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => !isLoading && setIsPlusMenuOpen((prev) => !prev)}
                disabled={isLoading}
                aria-expanded={isPlusMenuOpen}
                aria-haspopup="menu"
                aria-label="Ações e Modos de Criação"
                title="Ações e Ferramentas (Anexar, Canvas, Imagem, Vídeo, Plano)"
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 ${
                  isLoading
                    ? 'text-[color:var(--c-fg-5a554d)] cursor-not-allowed opacity-40'
                    : isPlusMenuOpen
                    ? 'bg-[#d97757]/20 text-[#d97757] rotate-45'
                    : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
                }`}
              >
                <Plus className="w-4 h-4 transition-transform duration-200" />
              </button>

              {/* Menu Popover Estilo Gemini */}
              {isPlusMenuOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 w-60 sm:w-64 p-1.5 rounded-2xl bg-[color:var(--c-bg-201e1a)]/95 backdrop-blur-xl border border-[color:var(--c-bg-322e27)]/90 shadow-[0_12px_36px_rgba(0,0,0,0.45),0_0_1px_rgba(255,255,255,0.1)] z-50 animate-in fade-in zoom-in-95 duration-150"
                  role="menu"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[color:var(--c-fg-8c867a)] uppercase">
                    Ações & Criação
                  </div>

                  {/* 1. Anexar Arquivo ou Foto */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs font-medium text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2f2c26)] transition cursor-pointer min-h-[44px] sm:min-h-0"
                  >
                    <div className="w-6 h-6 rounded-lg bg-[color:var(--c-bg-2f2c26)] border border-[color:var(--c-bg-3e3a33)] flex items-center justify-center text-[color:var(--c-fg-c4bfb6)] shrink-0">
                      <Paperclip className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span>Anexar Arquivo ou Foto</span>
                      <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-normal">Fotos, PDFs ou código</span>
                    </div>
                  </button>

                  {/* 2. Prototipar (Canvas) */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      onSelectPromptMode?.(activePromptMode === 'canvas' ? null : 'canvas');
                      textareaRef.current?.focus();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs font-medium transition cursor-pointer min-h-[44px] sm:min-h-0 ${
                      activePromptMode === 'canvas'
                        ? 'bg-cyan-950/50 text-cyan-300 border border-cyan-500/30'
                        : 'text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2f2c26)]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                      <Layout className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span>Prototipar (Canvas)</span>
                        {activePromptMode === 'canvas' && <span className="text-[9px] px-1 bg-cyan-500/20 text-cyan-300 rounded font-mono">ON</span>}
                      </div>
                      <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-normal">Desenhar nova tela antes do código</span>
                    </div>
                  </button>

                  {/* 3. Criar Imagem */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      onSelectPromptMode?.(activePromptMode === 'image' ? null : 'image');
                      textareaRef.current?.focus();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs font-medium transition cursor-pointer min-h-[44px] sm:min-h-0 ${
                      activePromptMode === 'image'
                        ? 'bg-amber-950/50 text-amber-300 border border-amber-500/30'
                        : 'text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2f2c26)]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <Palette className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span>Criar Imagem</span>
                        {activePromptMode === 'image' && <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded font-mono">ON</span>}
                      </div>
                      <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-normal">Gerar foto ou arte com FLUX</span>
                    </div>
                  </button>

                  {/* 4. Vídeo */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      onSelectPromptMode?.(activePromptMode === 'video' ? null : 'video');
                      textareaRef.current?.focus();
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs font-medium transition cursor-pointer min-h-[44px] sm:min-h-0 ${
                      activePromptMode === 'video'
                        ? 'bg-rose-950/50 text-rose-300 border border-rose-500/30'
                        : 'text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2f2c26)]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                      <Video className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span>Vídeo & Animação</span>
                        {activePromptMode === 'video' && <span className="text-[9px] px-1 bg-rose-500/20 text-rose-300 rounded font-mono">ON</span>}
                      </div>
                      <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-normal">HyperFrames (GSAP) ou OpenCut</span>
                    </div>
                  </button>

                  {/* 5. Modo Plano */}
                  {onTogglePlanMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlusMenuOpen(false);
                        onTogglePlanMode();
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs font-medium transition cursor-pointer min-h-[44px] sm:min-h-0 ${
                        isPlanMode
                          ? 'bg-[#d97757]/20 text-[#a34423] dark:text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40'
                          : 'text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2f2c26)]'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-lg bg-[color:var(--c-bg-2f2c26)] border border-[color:var(--c-bg-3e3a33)] flex items-center justify-center text-[#d97757] shrink-0">
                        <ListTodo className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span>Modo Plano</span>
                          <span className={`text-[9px] px-1 rounded font-mono ${isPlanMode ? 'bg-[#d97757] text-white' : 'bg-zinc-700/40 text-zinc-400'}`}>
                            {isPlanMode ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <span className="text-[10px] text-[color:var(--c-fg-8c867a)] font-normal">Planejar antes de codificar</span>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Botão Web ao Vivo (Perplexity Style) */}
              {onToggleWebSearch && (
                <button
                  type="button"
                  onClick={onToggleWebSearch}
                  disabled={isLoading}
                  aria-label={isWebSearchActive ? 'Desativar pesquisa na Web' : 'Ativar pesquisa na Web'}
                  title={isWebSearchActive ? 'Pesquisa Web ao Vivo ATIVA (fontes em tempo real)' : 'Pesquisar na Web ao vivo (estilo Perplexity)'}
                  className={`p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer text-xs ${
                    isWebSearchActive
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-semibold shadow-xs'
                      : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)] border border-transparent'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </button>
              )}

              {(images.length > 0 || documents.length > 0) && (
                <span className="text-[11px] font-mono text-[color:var(--c-fg-8c867a)] ml-0.5">
                  {images.length + documents.length} anexo(s)
                </span>
              )}
            </div>

            {/* Right Tools: Continuous Voice + Mic + Send */}
            <div className="flex items-center gap-1.5">
              {/* Modo Voz Contínua — botão de telefone */}
              {onToggleContinuousVoice && (
                <button
                  type="button"
                  onClick={onToggleContinuousVoice}
                  disabled={isLoading && !isContinuousVoiceActive}
                  aria-label={isContinuousVoiceActive ? 'Desativar modo de voz contínua' : 'Ativar modo de voz contínua'}
                  title={isContinuousVoiceActive ? 'Modo voz contínua ATIVO — clique para desligar' : 'Ativar modo voz contínua (conversa por voz sem clicar)'}
                  className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                    isContinuousVoiceActive
                      ? 'bg-emerald-600/30 text-emerald-400 ring-1 ring-emerald-500/60 shadow-sm'
                      : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
                  } ${isLoading && !isContinuousVoiceActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {isContinuousVoiceActive ? (
                    <>
                      <span className="absolute inset-0 rounded-lg bg-emerald-500/20 animate-ping opacity-75" />
                      <AudioLines className="w-4 h-4 relative z-10" />
                    </>
                  ) : (
                    <AudioLines className="w-4 h-4" />
                  )}
                </button>
              )}

              <VoiceButton
                onTranscript={isContinuousVoiceActive ? undefined : handleVoiceTranscript}
                onStateChange={handleVoiceStateChange}
                disabled={isLoading && !isContinuousVoiceActive}
                continuousMode={isContinuousVoiceActive}
                onContinuousInterim={isContinuousVoiceActive ? onContinuousVoiceInterim : undefined}
                onContinuousTranscript={isContinuousVoiceActive ? (text) => {
                  // Usa handler específico que interrompe TTS antes de enviar
                  if (onContinuousVoiceTranscript) {
                    onContinuousVoiceTranscript(text);
                  } else {
                    // Fallback: envia direto
                    onSendMessage(text, [], []);
                  }
                } : undefined}
              />

              {isLoading ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  aria-label="Parar resposta"
                  title="Parar resposta"
                  className="w-8 h-8 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ea580c] hover:from-[#ff7a47] hover:to-[#f97316] text-white transition-all duration-150 flex items-center justify-center shadow-[0_2px_12px_rgba(255,107,53,0.35)] border border-[#ff8c42]/40 hover:scale-[1.04] active:scale-[0.96] cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!canSend}
                  aria-label="Enviar mensagem"
                  title="Enviar mensagem (Enter)"
                  className={`w-8 h-8 rounded-xl transition-all duration-150 flex items-center justify-center ${
                    canSend
                      ? 'bg-gradient-to-r from-[#ff6b35] to-[#ea580c] hover:from-[#ff7a47] hover:to-[#f97316] text-white shadow-[0_2px_12px_rgba(255,107,53,0.35)] border border-[#ff8c42]/40 hover:scale-[1.04] active:scale-[0.96] cursor-pointer'
                      : 'bg-[color:var(--c-bg-312f2a)] text-[color:var(--c-fg-6b675e)] cursor-not-allowed opacity-50'
                  }`}
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Model & Reasoning & Plan Mode Controls (Claude.ai Style Pill Toolbar) */}
      <ModelControls
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        reasoningEffort={reasoningEffort}
        onSelectReasoningEffort={onSelectReasoningEffort}
        isPlanMode={isPlanMode}
        onTogglePlanMode={onTogglePlanMode}
        activePromptMode={activePromptMode}
        onSelectPromptMode={onSelectPromptMode}
        conversationTokens={conversationTokens}
        onOpenTerminal={onOpenTerminal}
        modelHealthMap={modelHealthMap}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={onRefreshHealth}
        lastAutoRoutedModel={lastAutoRoutedModel}
      />
    </div>
  );
});
