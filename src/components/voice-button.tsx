import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertCircle, Check } from 'lucide-react';

interface VoiceButtonProps {
  onTranscript: (text: string, isInterim?: boolean) => void;
  onStateChange?: (isListening: boolean) => void;
  disabled?: boolean;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  onTranscript,
  onStateChange,
  disabled = false,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef<string>('');
  const isManuallyStoppedRef = useRef<boolean>(false);

  useEffect(() => {
    onStateChange?.(isListening);
  }, [isListening, onStateChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = async () => {
    setErrorMessage(null);
    accumulatedRef.current = '';
    setLiveTranscript('');
    isManuallyStoppedRef.current = false;

    // 1. Explicitly request microphone access if supported by navigator.mediaDevices
    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release tracks so SpeechRecognition has exclusive audio input on Android
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        console.warn('Microphone permission request error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMessage('Permissão de microfone negada. Permita o microfone no navegador.');
          return;
        }
      }
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Reconhecimento de voz não suportado neste navegador. Use o Chrome ou Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';

          if (result.isFinal) {
            finalChunk += text + ' ';
          } else {
            interim += text;
          }
        }

        if (finalChunk) {
          accumulatedRef.current += finalChunk;
        }

        const currentFull = (accumulatedRef.current + (interim ? interim : '')).trim();
        if (currentFull) {
          setLiveTranscript(currentFull);
          onTranscript(currentFull, Boolean(interim && !finalChunk));
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('Microfone bloqueado. Habilite o microfone nas permissões do site.');
          stopListening();
        } else if (event.error === 'no-speech') {
          // Keep listening; silence is normal
        } else if (event.error === 'network') {
          setErrorMessage('Erro de conexão ao transcrever áudio.');
          stopListening();
        }
      };

      recognition.onend = () => {
        // If not manually stopped and continuous was interrupted, keep active if user still expects it
        if (!isManuallyStoppedRef.current && isListening) {
          try {
            recognition.start();
            return;
          } catch {}
        }
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setErrorMessage('Não foi possível iniciar o microfone.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript('');
  };

  const toggleListening = () => {
    if (disabled) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <>
      {/* Real-time floating transcription bar when active */}
      {isListening && (
        <div className="fixed bottom-24 sm:bottom-28 left-4 right-4 sm:left-auto sm:right-1/2 sm:translate-x-1/2 max-w-lg mx-auto z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="bg-[color:var(--c-bg-24221e)] border border-[#d97757]/60 text-[color:var(--c-fg-f3efe6)] rounded-2xl p-3 sm:p-3.5 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Sound waves animation */}
              <div className="flex items-center gap-0.5 h-4 flex-shrink-0">
                <span className="w-1 bg-[#d97757] rounded-full animate-pulse h-2" style={{ animationDelay: '0ms' }} />
                <span className="w-1 bg-[#f09a7d] rounded-full animate-pulse h-4" style={{ animationDelay: '150ms' }} />
                <span className="w-1 bg-[#d97757] rounded-full animate-pulse h-3" style={{ animationDelay: '300ms' }} />
                <span className="w-1 bg-[#f09a7d] rounded-full animate-pulse h-2" style={{ animationDelay: '450ms' }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-[color:var(--c-fg-d97757)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#d97757] animate-ping" />
                  Ouvindo em tempo real (pt-BR)...
                </div>
                <div className="text-xs text-[color:var(--c-fg-f3efe6)] truncate mt-0.5 font-sans">
                  {liveTranscript || 'Fale algo para transcrever...'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={stopListening}
              className="px-3 py-1.5 rounded-xl bg-[#d97757] hover:bg-[#c96442] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all flex-shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Concluir</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed bottom-24 sm:bottom-28 left-4 right-4 sm:left-auto sm:right-1/2 sm:translate-x-1/2 max-w-md mx-auto z-40 animate-in fade-in duration-200">
          <div className="bg-[color:var(--c-bg-2d1c1a)] border border-[color:var(--c-bg-7a3429)] text-[color:var(--c-fg-f4ada3)] rounded-xl p-3 text-xs shadow-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[color:var(--c-fg-d97757)] flex-shrink-0" />
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

      {/* Main Microphone Button */}
      <button
        type="button"
        onClick={toggleListening}
        disabled={disabled}
        aria-label={isListening ? 'Parar transcrição de voz' : 'Falar por microfone'}
        title={isListening ? 'Ouvindo... Clique para concluir transcrição' : 'Falar por voz (transcrição pt-BR)'}
        className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
          isListening
            ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] ring-1 ring-[#d97757]/60 shadow-sm'
            : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {isListening ? (
          <>
            <span className="absolute inset-0 rounded-lg bg-[#d97757]/30 animate-ping opacity-75" />
            <Mic className="w-4 h-4 text-[color:var(--c-fg-d97757)] relative z-10 animate-pulse" />
          </>
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>
    </>
  );
};
