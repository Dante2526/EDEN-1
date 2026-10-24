import React, { useState, useEffect, useRef } from 'react';
import { Mic, AlertCircle, Loader2 } from 'lucide-react';
import {
  isMediaRecorderSupported,
  startAudioRecording,
  sendAudioToTranscribe,
  ActiveRecording,
} from '../lib/audio-transcriber';

interface VoiceButtonProps {
  onTranscript?: (text: string, isInterim?: boolean) => void;
  onStateChange?: (isListening: boolean) => void;
  disabled?: boolean;
  continuousMode?: boolean;
  onContinuousTranscript?: (text: string) => void;
  /** Texto parcial (ainda sendo falado) no modo contínuo — usado pra interromper a IA na hora */
  onContinuousInterim?: (text: string) => void;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  onTranscript,
  onStateChange,
  disabled = false,
  continuousMode = false,
  onContinuousTranscript,
  onContinuousInterim,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const finalTextRef = useRef<string>('');
  const isManuallyStoppedRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);

  // Sempre a versão MAIS RECENTE das props. O objeto de reconhecimento de voz é longevo
  // (reinicia sozinho no modo contínuo) e capturava props antigas (isStreaming/conversas
  // desatualizados), o que quebrava interrupção e envio de mensagens.
  const continuousModeRef = useRef(continuousMode);
  const onContinuousTranscriptRef = useRef(onContinuousTranscript);
  const onContinuousInterimRef = useRef(onContinuousInterim);
  continuousModeRef.current = continuousMode;
  onContinuousTranscriptRef.current = onContinuousTranscript;
  onContinuousInterimRef.current = onContinuousInterim;

  // Descarta a sessão de reconhecimento atual sem disparar reinício automático
  const disposeRecognition = () => {
    const old = recognitionRef.current;
    if (!old) return;
    old.onend = null;
    old.onresult = null;
    old.onerror = null;
    try { old.abort(); } catch {}
    recognitionRef.current = null;
  };

  useEffect(() => {
    isListeningRef.current = isListening;
    onStateChange?.(isListening);
  }, [isListening, onStateChange]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      if (activeRecordingRef.current) {
        try { activeRecordingRef.current.cancel(); } catch {}
        activeRecordingRef.current = null;
      }
    };
  }, []);

  // No modo contínuo, inicia escuta automaticamente quando ativado
  useEffect(() => {
    if (continuousMode && !isListening && !isManuallyStoppedRef.current) {
      startListening();
    }
    if (!continuousMode && isListening) {
      stopListening();
    }
  }, [continuousMode]);

  // Eventos do modo contínuo: garante que o microfone esteja ligado (sem criar sessão duplicada).
  // 'force-start' = IA começou a falar (mic precisa ficar aberto pra poder interromper)
  // 'resume' = IA terminou de falar
  useEffect(() => {
    if (!continuousMode) return;

    const ensureListening = () => {
      if (isManuallyStoppedRef.current) return; // usuário/erro desligou o mic de propósito
      if (recognitionRef.current && isListeningRef.current) return; // já está ouvindo
      startListening();
    };

    window.addEventListener('synap:resume-listening', ensureListening);
    window.addEventListener('synap:force-start-listening', ensureListening);
    return () => {
      window.removeEventListener('synap:resume-listening', ensureListening);
      window.removeEventListener('synap:force-start-listening', ensureListening);
    };
  }, [continuousMode]);

  // No modo contínuo, não desabilita o botão durante streaming
  // (precisa poder interromper a IA falando). Bloqueia enquanto transcreve no backend.
  const effectiveDisabled = (continuousMode ? false : disabled) || isTranscribing;

  const createRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    // No modo walkie-talkie/ditado, continuous=true permite falar parágrafos longos com pausas naturais sem cortar.
    // No modo de diálogo contínuo (duplex), continuous=false envia frase a frase para resposta rápida.
    recognition.continuous = !continuousModeRef.current;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      // Se temos final, acumula
      if (final) {
        finalTextRef.current += final;
      }

      const fullText = (finalTextRef.current + interim).trim();

      // Modo contínuo: final -> envia mensagem; parcial -> avisa pra interromper a IA na hora
      if (continuousModeRef.current) {
        if (final && onContinuousTranscriptRef.current) {
          onContinuousTranscriptRef.current(fullText);
          finalTextRef.current = ''; // Limpa pra próxima frase
          return;
        }
        if (interim && onContinuousInterimRef.current) {
          onContinuousInterimRef.current(fullText);
        }
        return;
      }

      // Modo normal (walkie-talkie)
      if (fullText) {
        onTranscript?.(fullText, Boolean(interim));
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setErrorMessage('Permissão de microfone negada no navegador.');
        stopListening();
      } else if (event.error === 'no-speech') {
        // Sem fala detectada, reinicia se ainda ativo
      } else if (event.error === 'network') {
        setErrorMessage('Erro de conexão no reconhecimento de voz.');
        stopListening();
      }
    };

    recognition.onend = () => {
      // Com continuous=false, onend dispara após cada frase
      // No modo contínuo, SEMPRE reinicia (mesmo durante TTS)
      // pra permitir interromper a IA falando
      // Sessão substituída/descartada: não reinicia (evita 2 reconhecimentos ao mesmo tempo)
      if (recognitionRef.current !== recognition) return;
      if (continuousModeRef.current && !isManuallyStoppedRef.current) {
        setTimeout(() => {
          if (!isManuallyStoppedRef.current) {
            startListening();
          }
        }, 20);
        return;
      }
      // Modo normal: se o reconhecimento parou por pausa mas o usuário não clicou para desligar, reinicia preservando o texto já falado!
      if (!isManuallyStoppedRef.current && isListeningRef.current) {
        setTimeout(() => {
          if (!isManuallyStoppedRef.current && isListeningRef.current) {
            startListening(true);
          }
        }, 20);
        return;
      }
      setIsListening(false);
    };

    return recognition;
  };

  const startMediaRecordingMode = async () => {
    try {
      setIsListening(true);
      const rec = await startAudioRecording();
      activeRecordingRef.current = rec;
    } catch (err: any) {
      console.error('Falha ao iniciar gravação MediaRecorder:', err);
      setIsListening(false);
      setErrorMessage('Permissão de microfone negada ou indisponível.');
    }
  };

  const startListening = (preserveText = false) => {
    setErrorMessage(null);
    if (!preserveText) {
      finalTextRef.current = '';
    }
    isManuallyStoppedRef.current = false;
    disposeRecognition();

    const recognition = createRecognition();
    if (!recognition) {
      if (isMediaRecorderSupported()) {
        startMediaRecordingMode();
        return;
      }
      setErrorMessage('Reconhecimento de voz não suportado neste navegador.');
      return;
    }

    try {
      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Falha ao iniciar reconhecimento de voz:', err);
      if (isMediaRecorderSupported()) {
        startMediaRecordingMode();
        return;
      }
      setErrorMessage('Não foi possível iniciar o microfone.');
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (activeRecordingRef.current) {
      const rec = activeRecordingRef.current;
      activeRecordingRef.current = null;
      setIsTranscribing(true);
      try {
        const audioBlob = await rec.stop();
        const res = await sendAudioToTranscribe(audioBlob, 'pt');
        if (res.text) {
          if (continuousModeRef.current && onContinuousTranscriptRef.current) {
            onContinuousTranscriptRef.current(res.text);
          } else {
            onTranscript?.(res.text, false);
          }
        }
      } catch (err: any) {
        console.error('Falha na transcrição Whisper:', err);
        setErrorMessage(err?.message || 'Erro ao transcrever com Whisper.');
      } finally {
        setIsTranscribing(false);
      }
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (effectiveDisabled) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <>
      {errorMessage && (
        <div className="fixed bottom-24 sm:bottom-28 left-4 right-4 sm:left-auto sm:right-1/2 sm:translate-x-1/2 max-w-md mx-auto z-40 animate-in fade-in duration-200">
          <div className="bg-[color:var(--c-bg-2d1c1a)] border border-[color:var(--c-bg-7a3429)] text-[color:var(--c-fg-f4ada3)] rounded-xl p-3 text-xs shadow-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#d97757] flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-[color:var(--c-on-strong)] text-[color:var(--c-fg-f4ada3)] cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleListening}
        disabled={effectiveDisabled}
        aria-label={
          isTranscribing
            ? 'Transcrevendo áudio com Whisper'
            : isListening
            ? 'Parar transcrição de voz'
            : 'Falar por microfone'
        }
        title={
          isTranscribing
            ? 'Transcrevendo áudio com Whisper na Cloudflare...'
            : isListening
            ? 'Gravando... Clique para concluir e transcrever'
            : 'Falar por voz'
        }
        className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
          isListening && !continuousMode
            ? 'bg-[#d97757]/20 text-[#d97757] ring-1 ring-[#d97757]/60 shadow-sm'
            : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
        } ${effectiveDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {isTranscribing ? (
          <Loader2 className="w-4 h-4 text-[#d97757] animate-spin" />
        ) : isListening && !continuousMode ? (
          <>
            <span className="absolute inset-0 rounded-lg bg-[#d97757]/30 animate-ping opacity-75" />
            <Mic className="w-4 h-4 text-[#d97757] relative z-10 animate-pulse" />
          </>
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>
    </>
  );
};
