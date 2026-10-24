import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Paperclip, AudioLines, MousePointerClick, X, Globe } from 'lucide-react';
import { FileAttachmentPreviews } from './image-attachment';
import { VoiceButton } from './voice-button';
import { ModelControls } from './model-controls';
import { ConcreteModelId, ModelId, ReasoningEffort, AttachedDocument, SelectedPreviewElement } from '../lib/types';
import { ModelHealthMap } from '../lib/smart-model-router';
import { isVisionModel } from '../lib/models';
import { fileToBase64, readFileAsText, generateId } from '../lib/utils';
import { extractImagesFromClipboardData } from '../lib/clipboard-utils';

interface ChatInputProps {
  onSendMessage: (content: string, images: string[], documents: AttachedDocument[]) => void;
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
}) => {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<AttachedDocument[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

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

    onSendMessage(content.trim(), images, documents);
    setContent('');
    setImages([]);
    setDocuments([]);
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
                : isPlanMode
                ? 'Escreva uma mensagem para criar um Plano Estruturado...'
                : 'Escreva uma mensagem...'
            }
            className="w-full max-h-[160px] sm:max-h-[220px] py-1 px-1 text-sm sm:text-base text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-857f75)] bg-transparent resize-none border-0 focus:outline-none focus:ring-0 leading-relaxed font-sans"
          />

          {/* Claude Bottom Toolbar */}
          <div className="flex items-center justify-between gap-2 mt-2 pt-1">
            {/* Left Tools: Attachment & Live Web Search */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!isLoading) {
                    fileInputRef.current?.click();
                  }
                }}
                disabled={isLoading}
                aria-label="Anexar arquivos ou imagens"
                title="Anexar imagens, documentos, PDFs ou código (ou use Ctrl+V para colar um print)"
                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
                  isLoading
                    ? 'text-[color:var(--c-fg-5a554d)] cursor-not-allowed opacity-40'
                    : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
                }`}
              >
                <Paperclip className="w-4 h-4" />
              </button>

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
