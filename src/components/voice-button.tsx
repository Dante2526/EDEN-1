import React, { useState, useEffect, useRef } from 'react';
import { Mic, AlertCircle } from 'lucide-react';

interface VoiceButtonProps {
  onTranscript?: (text: string, isInterim?: boolean) => void;
  onStateChange?: (isListening: boolean) => void;
  disabled?: boolean;
  continuousMode?: boolean;
  onContinuousTranscript?: (text: string) => void;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  onTranscript,
  onStateChange,
  disabled = false,
  continuousMode = false,
  onContinuousTranscript,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef<string>('');
  const isManuallyStoppedRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);

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

  // Listener pra modo contínuo: quando a IA termina de falar, reativa o microfone
  useEffect(() => {
    if (!continuousMode) return;

    const handleResume = () => {
      if (!isManuallyStoppedRef.current && isListeningRef.current) {
        try {
          if (recognitionRef.current) {
            recognitionRef.current.start();
          } else {
            startListening();
          }
        } catch {
          setTimeout(() => {
            try { startListening(); } catch {}
          }, 200);
        }
      }
    };

    window.addEventListener('synap:resume-listening', handleResume);
    return () => window.removeEventListener('synap:resume-listening', handleResume);
  }, [continuousMode]);

  // No modo contínuo, não desabilita o botão durante streaming
  // (precisa poder interromper a IA falando)
  const effectiveDisabled = continuousMode ? false : disabled;

  const createRecognition = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    // continuous = false: cada sessão captura UMA frase e para
    // Isso evita o bug do mobile de reenviar todos os resultados
    recognition.continuous = false;
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

      // No modo contínuo, envia texto final direto pro handler de contínuo
      if (continuousMode && onContinuousTranscript && final) {
        onContinuousTranscript(fullText);
        finalTextRef.current = ''; // Limpa pra próxima frase
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
      // Se o usuário não parou manualmente, reinicia pra capturar a próxima
      if (!isManuallyStoppedRef.current && isListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Se falhar ao reiniciar rapidamente, tenta novamente em 100ms
          setTimeout(() => {
            if (!isManuallyStoppedRef.current && isListeningRef.current) {
              try { recognition.start(); } catch {}
            }
          }, 100);
        }
      }
      setIsListening(false);
    };

    return recognition;
  };

  const startListening = () => {
    setErrorMessage(null);
    finalTextRef.current = '';
    isManuallyStoppedRef.current = false;

    const recognition = createRecognition();
    if (!recognition) {
      setErrorMessage('Reconhecimento de voz não suportado neste navegador. Use o Chrome ou Edge.');
      return;
    }

    try {
      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Falha ao iniciar reconhecimento de voz:', err);
      setErrorMessage('Não foi possível iniciar o microfone.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
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
        aria-label={isListening ? 'Parar transcrição de voz' : 'Falar por microfone'}
        title={isListening ? 'Gravando em tempo real... Clique para parar' : 'Falar por voz (transcrição direta)'}
        className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
          isListening
            ? 'bg-[#d97757]/20 text-[#d97757] ring-1 ring-[#d97757]/60 shadow-sm'
            : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
        } ${effectiveDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {isListening ? (
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
