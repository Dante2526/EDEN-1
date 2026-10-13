import { useState, useRef, useCallback, useEffect } from 'react';

interface UseContinuousVoiceProps {
  onSpeak: (text: string, onEnd: () => void) => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
}

export function useContinuousVoice({
  onSpeak,
  onStartListening,
  onStopListening,
  onSendMessage,
  isStreaming,
}: UseContinuousVoiceProps) {
  const [isActive, setIsActive] = useState(false);
  const lastSpokenTextRef = useRef<string>('');
  const isSpeakingRef = useRef<boolean>(false);
  const pendingTextRef = useRef<string>('');
  const isActiveRef = useRef<boolean>(false);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Quando o streaming termina e o modo contínuo tá ativo, fala a resposta
  useEffect(() => {
    if (!isActive || isStreaming) return;

    // Pega o texto da última resposta da IA
    // Esse texto vem de fora (passado via setPendingResponse)
    const textToSpeak = pendingTextRef.current;
    if (!textToSpeak || textToSpeak === lastSpokenTextRef.current) {
      // Se não tem texto novo, reativa o microfone
      if (isActiveRef.current && !isSpeakingRef.current) {
        onStartListening();
      }
      return;
    }

    lastSpokenTextRef.current = textToSpeak;
    isSpeakingRef.current = true;

    onSpeak(textToSpeak, () => {
      isSpeakingRef.current = false;
      // Depois de falar, reativa o microfone
      if (isActiveRef.current) {
        setTimeout(() => onStartListening(), 200);
      }
    });
  }, [isStreaming, isActive, onSpeak, onStartListening]);

  // Recebe o texto da transcrição e envia como mensagem
  const handleTranscript = useCallback((text: string, isInterim: boolean) => {
    if (!isActiveRef.current) return;
    if (isInterim) return; // Só envia quando for final

    if (text.trim()) {
      // Se a IA tá falando, interrompe
      if (isSpeakingRef.current) {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        isSpeakingRef.current = false;
      }
      onSendMessage(text);
    }
  }, [onSendMessage]);

  // Liga/desliga o modo contínuo
  const toggle = useCallback(() => {
    if (isActive) {
      // Desligando
      isActiveRef.current = false;
      setIsActive(false);
      onStopListening();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      isSpeakingRef.current = false;
    } else {
      // Ligando
      setIsActive(true);
      isActiveRef.current = true;
      lastSpokenTextRef.current = '';
      pendingTextRef.current = '';
      onStartListening();
    }
  }, [isActive, onStartListening, onStopListening]);

  // Define o texto da resposta da IA (chamado quando o streaming termina)
  const setPendingResponse = useCallback((text: string) => {
    pendingTextRef.current = text;
  }, []);

  return {
    isActive,
    toggle,
    handleTranscript,
    setPendingResponse,
  };
}
