import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, Paperclip, AudioLines } from 'lucide-react';
import { FileAttachmentPreviews } from './image-attachment';
import { VoiceButton } from './voice-button';
import { ModelControls } from './model-controls';
import { ModelId, ReasoningEffort, AttachedDocument } from '../lib/types';
import { fileToBase64, readFileAsText, generateId } from '../lib/utils';

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
  conversationTokens,
  onOpenTerminal,
  isContinuousVoiceActive = false,
  onToggleContinuousVoice,
  onContinuousVoiceTranscript,
  onContinuousVoiceInterim,
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

    if (!content.trim() && images.length === 0 && documents.length === 0) return;

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

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check if image
      if (file.type.startsWith('image/')) {
        try {
          const base64 = await fileToBase64(file);
          newImages.push(base64);

          // Nenhum modelo disponível suporta imagens — GLM-5.3 Flash e Kimi K3
          // foram removidos (Flash descontinuado pela NVIDIA, Kimi instável).
          // Não tentamos mais trocar de modelo automaticamente.
          // O handleSendMessage do App.tsx vai exibir mensagem explicando.
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
      setNotification(`${newDocs.length} arquivo(s) anexado(s) com sucesso.`);
    }
    if (newImages.length > 0) {
      setNotification('Aviso: nenhum modelo disponível suporta imagens. A foto será anexada mas não poderá ser analisada.');
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

  const canSend = content.trim().length > 0 || images.length > 0 || documents.length > 0;

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

      {/* Input Box with Drag & Drop (DSS Dark Card Style) */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="relative rounded-2xl border border-gray-800/60 dark:border-white/10 bg-dark-card shadow-2xl transition-all focus-within:border-[#d97757]/40 focus-within:ring-1 focus-within:ring-[#d97757]/20"
      >
        {/* Previews for attached images and documents */}
        <FileAttachmentPreviews
          images={images}
          documents={documents}
          onRemoveImage={(idx) => setImages(images.filter((_, i) => i !== idx))}
          onRemoveDocument={(id) => setDocuments(documents.filter((d) => d.id !== id))}
        />

        <div className="p-3 sm:p-3.5">
          {/* Main Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isPlanMode
                ? 'Escreva uma mensagem para criar um Plano Estruturado...'
                : 'Escreva uma mensagem...'
            }
            className="w-full max-h-[160px] sm:max-h-[220px] py-1 px-1 text-sm sm:text-base text-[color:var(--c-fg-f3efe6)] placeholder-[color:var(--c-fg-857f75)] bg-transparent resize-none border-0 focus:outline-none focus:ring-0 leading-relaxed font-sans"
          />

          {/* Claude Bottom Toolbar */}
          <div className="flex items-center justify-between gap-2 mt-2 pt-1">
            {/* Left Tools: Attachment (ALWAYS ENABLED) */}
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
                title="Anexar imagens, documentos, PDFs ou código"
                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
                  isLoading
                    ? 'text-[color:var(--c-fg-5a554d)] cursor-not-allowed opacity-40'
                    : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
                }`}
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {(images.length > 0 || documents.length > 0) && (
                <span className="text-[11px] font-mono text-[color:var(--c-fg-8c867a)]">
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
                  className="w-8 h-8 rounded-lg bg-[#d97757] hover:bg-[#c96442] text-white transition-all flex items-center justify-center shadow-sm cursor-pointer"
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
                  className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${
                    canSend
                      ? 'bg-[#d97757] hover:bg-[#c96442] text-white shadow-sm active:scale-95 cursor-pointer'
                      : 'bg-[color:var(--c-bg-312f2a)] text-[color:var(--c-fg-6b675e)] cursor-not-allowed opacity-60'
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
      />
    </div>
  );
});
