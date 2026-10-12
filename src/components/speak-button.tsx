import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Loader2, Info } from 'lucide-react';
import { cleanTextForSpeech, getBestPortugueseVoice } from '../lib/speech';
import { loadSettings } from '../lib/storage';

interface SpeakButtonProps {
  text: string;
}

// Cache em memória para não fazer requisições redundantes se a rota estiver indisponível
let isTtsServiceAvailable = true;

export const SpeakButton: React.FC<SpeakButtonProps> = ({ text }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup audio on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsLoading(false);
  };

  const handleToggleSpeak = async () => {
    if (isPlaying || isLoading) {
      stopAudio();
      return;
    }

    const clean = cleanTextForSpeech(text);
    if (!clean) return;

    // Se já sabemos que o serviço backend está offline, usa fala nativa direto
    if (!isTtsServiceAvailable) {
      fallbackToWebSpeech(clean);
      return;
    }

    // Check if we already have the audio blob cached for this message
    if (audioUrlRef.current) {
      try {
        const audio = new Audio(audioUrlRef.current);
        audioRef.current = audio;
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => setIsPlaying(false);
        setIsPlaying(true);
        await audio.play();
        return;
      } catch (err) {
        console.warn('Cached audio playback failed, regenerating:', err);
      }
    }

    setIsLoading(true);
    setNotice(null);

    // Get preferred voice from settings (default Francisca - Microsoft Edge Neural pt-BR)
    const settings = loadSettings();
    const preferredVoice = settings.speechVoice || 'pt-BR-FranciscaNeural';

    try {
      // 1. Try high-fidelity Neural Edge TTS / Gemini from backend (/api/tts)
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg, audio/wav, application/json',
          'x-api-key': import.meta.env.VITE_API_SECRET || '',
        },
        body: JSON.stringify({
          text: clean,
          voice: preferredVoice,
        }),
      });

      if (res.ok) {
        isTtsServiceAvailable = true;
        const contentType = res.headers.get('content-type') || '';
        let playableUrl = '';

        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (data.audio) {
            playableUrl = `data:${data.mimeType || 'audio/mpeg'};base64,${data.audio}`;
          }
        } else {
          const blob = await res.blob();
          playableUrl = URL.createObjectURL(blob);
          audioUrlRef.current = playableUrl;
        }

        if (playableUrl) {
          const audio = new Audio(playableUrl);
          audioRef.current = audio;
          audio.onended = () => setIsPlaying(false);
          audio.onerror = (e) => {
            console.warn('Audio playback error, falling back to browser speech:', e);
            fallbackToWebSpeech(clean);
          };

          setIsLoading(false);
          setIsPlaying(true);
          await audio.play();
          return;
        }
      } else {
        const errJson = await res.json().catch(() => null);
        console.warn('Neural TTS returned error:', errJson?.error || res.statusText);
      }
    } catch (err) {
      console.warn('Neural TTS endpoint unavailable, falling back to browser speech:', err);
    }

    // 2. Fallback to Web Speech API if endpoint is offline or fails
    fallbackToWebSpeech(clean);
  };

  const fallbackToWebSpeech = (clean: string) => {
    setIsLoading(false);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      const best = getBestPortugueseVoice();
      if (best) utterance.voice = best;
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={handleToggleSpeak}
        disabled={isLoading && !isPlaying}
        aria-label={isPlaying ? 'Parar leitura em voz alta' : 'Ouvir resposta com voz neural humana'}
        title={
          isPlaying
            ? 'Parar leitura em voz alta'
            : 'Ouvir com voz neural natural de estúdio (Gemini pt-BR)'
        }
        className={`px-2 py-1 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
          isPlaying
            ? 'bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40'
            : isLoading
            ? 'bg-[color:var(--c-bg-282622)] text-[color:var(--c-fg-d97757)] border border-[color:var(--c-bg-3d3a33)]'
            : 'text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)]'
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[color:var(--c-fg-d97757)]" />
            <span className="text-[11px] font-medium text-[color:var(--c-fg-f09a7d)]">Gerando voz neural...</span>
          </>
        ) : isPlaying ? (
          <>
            <span className="flex items-center gap-0.5 h-3">
              <span className="w-0.5 h-2 bg-[#d97757] animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-0.5 h-3 bg-[#f09a7d] animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-0.5 h-1.5 bg-[#d97757] animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
            <VolumeX className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
            <span className="text-[11px] font-medium text-[color:var(--c-fg-f09a7d)]">Parar</span>
          </>
        ) : (
          <>
            <Volume2 className="w-3.5 h-3.5" />
            <span className="text-[11px]">Ouvir</span>
          </>
        )}
      </button>

      {/* Warning / status tooltip when fallback is active */}
      {notice && (
        <div className="absolute bottom-full left-0 mb-1.5 z-20 w-64 p-2 rounded-lg bg-[color:var(--c-bg-1f1d19)] border border-[color:var(--c-bg-443e33)] text-[11px] text-[color:var(--c-fg-e0a96d)] shadow-xl flex items-start gap-1.5 animate-in fade-in slide-in-from-bottom-1">
          <Info className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0 mt-0.5" />
          <span className="leading-tight">{notice}</span>
        </div>
      )}
    </div>
  );
};
