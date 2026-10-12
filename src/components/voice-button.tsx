import React, { useState, useEffect, useRef } from 'react';
import { Mic, AlertCircle } from 'lucide-react';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  // Texto final acumulado de TODAS as sessões de reconhecimento
  const finalTextRef = useRef<string>('');
  // Texto salvo antes de cada restart (onend → start)
  const savedTextRef = useRef<string>('');
  const isManuallyStoppedRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);

  useEffect(() => {
    isListeningRef.current = isListening;
    onStateChange?.(isListening);
  }, [isListening, onStateChange]);

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

  const startListening = () => {
    setErrorMessage(null);
    finalTextRef.current = '';
    savedTextRef.current = '';
    isManuallyStoppedRef.current = false;

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
        // event.resultIndex = índice do primeiro resultado que MUDOU desde o último evento
        // Resultados antes desse índice não mudaram (já foram processados)
        
        // Pega apenas resultados NOVOS que são finais
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTextRef.current += result[0].transcript + ' ';
          }
        }

        // Pega o último resultado interim (não-final) se houver
        let interim = '';
        const lastResult = event.results[event.results.length - 1];
        if (lastResult && !lastResult.isFinal) {
          interim = lastResult[0].transcript;
        }

        // Texto completo = texto salvo de sessões anteriores + texto final atual + interim
        const fullText = (savedTextRef.current + finalTextRef.current + interim).trim();

        if (fullText) {
          onTranscript(fullText, Boolean(interim));
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setErrorMessage('Permissão de microfone negada no navegador.');
          stopListening();
        } else if (event.error === 'no-speech') {
          // Silêncio temporário é normal, mantém escuta ativa
        } else if (event.error === 'network') {
          setErrorMessage('Erro de conexão no reconhecimento de voz.');
          stopListening();
        }
      };

      recognition.onend = () => {
        // Se a escuta foi interrompida automaticamente pelo navegador (comum no mobile)
        if (!isManuallyStoppedRef.current && isListeningRef.current) {
          // Salva o texto final acumulado ANTES de reiniciar
          // (porque event.results vai zerar no novo start)
          savedTextRef.current += finalTextRef.current;
          finalTextRef.current = '';
          
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
      console.error('Falha ao iniciar reconhecimento de voz:', err);
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
        disabled={disabled}
        aria-label={isListening ? 'Parar transcrição de voz' : 'Falar por microfone'}
        title={isListening ? 'Gravando em tempo real... Clique para parar' : 'Falar por voz (transcrição direta)'}
        className={`relative p-1.5 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
          isListening
            ? 'bg-[#d97757]/20 text-[#d97757] ring-1 ring-[#d97757]/60 shadow-sm'
            : 'text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-302d27)]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
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
