/**
 * Sistema de Síntese de Voz (TTS) Neural de Alta Fidelidade
 * Utiliza Microsoft Edge TTS (sem necessidade de chave de API) com vozes em português do Brasil,
 * com suporte opcional a Google Gemini TTS e fallback automático para Web Speech API.
 */

let currentAudio: HTMLAudioElement | null = null;
let currentOnEndCallback: (() => void) | null = null;

export interface NeuralVoice {
  id: string;
  name: string;
  gender: 'feminino' | 'masculino';
  description: string;
  tag: string;
  engine?: 'edge-tts' | 'gemini';
}

export const NEURAL_VOICES: readonly NeuralVoice[] = [
  {
    id: 'pt-BR-FranciscaNeural',
    name: 'Francisca (Feminina Expressiva & Fluente)',
    gender: 'feminino',
    description: 'Microsoft Edge Neural — Voz brasileira calorosa e autêntica, 100% gratuita sem chave de API',
    tag: 'Recomendada (Edge TTS)',
    engine: 'edge-tts',
  },
  {
    id: 'pt-BR-AntonioNeural',
    name: 'Antonio (Masculina Clara & Dinâmica)',
    gender: 'masculino',
    description: 'Microsoft Edge Neural — Tom amigável e dicção brasileira impecável, sem chave de API',
    tag: 'Edge TTS',
    engine: 'edge-tts',
  },
  {
    id: 'pt-BR-ThalitaMultilingualNeural',
    name: 'Thalita (Feminina Serena & Moderna)',
    gender: 'feminino',
    description: 'Microsoft Edge Neural — Tom suave e equilibrado em português do Brasil',
    tag: 'Edge TTS',
    engine: 'edge-tts',
  },
  {
    id: 'Aoede',
    name: 'Aoede (Feminina Estúdio Gemini)',
    gender: 'feminino',
    description: 'Google Gemini 3.8 — Voz neural opcional (requer GEMINI_API_KEY)',
    tag: 'Google Gemini',
    engine: 'gemini',
  },
  {
    id: 'Puck',
    name: 'Puck (Masculina Jovem Gemini)',
    gender: 'masculino',
    description: 'Google Gemini 3.8 — Tom jovem (requer GEMINI_API_KEY)',
    tag: 'Google Gemini',
    engine: 'gemini',
  },
] as const;

export function cleanTextForSpeech(rawText: string): string {
  return rawText
    // Remove tags de raciocínio / thinking
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    // Remove blocos de código
    .replace(/```[\s\S]*?```/g, ' Trecho de código omitido. ')
    // Código inline
    .replace(/`([^`]+)`/g, '$1')
    // Remove links markdown e preserva texto do link
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove cabeçalhos markdown
    .replace(/^#{1,6}\s+/gm, '')
    // Remove tabelas markdown
    .replace(/\|[^\n]+\|/g, '')
    // Remove listas com marcadores (*, -, 1.)
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove símbolos de negrito e itálico
    .replace(/[*_~]{1,3}/g, '')
    // Substitui quebras repetidas por ponto para pausas naturais
    .replace(/\n+/g, '. ')
    // Remove pontuações estranhas
    .replace(/[-=]{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stopCurrentSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (currentOnEndCallback) {
    currentOnEndCallback();
    currentOnEndCallback = null;
  }
}

/**
 * Toca áudio com voz neural de estúdio
 */
export async function playNeuralSpeech(
  text: string,
  voice: string = 'pt-BR-FranciscaNeural',
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void
): Promise<boolean> {
  stopCurrentSpeech();

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return false;

  currentOnEndCallback = onEnd || null;

  try {
    // 1. Tenta usar o serviço neural (Edge TTS ou Gemini) do servidor
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg, audio/wav, application/json',
        'x-api-key': import.meta.env.VITE_API_SECRET || '',
      },
      body: JSON.stringify({
        text: cleaned,
        voice: voice || 'pt-BR-FranciscaNeural',
      }),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      let audioUrl = '';

      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.audio) {
          audioUrl = `data:${data.mimeType || 'audio/mpeg'};base64,${data.audio}`;
        }
      } else {
        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);
      }

      if (audioUrl) {
        const audio = new Audio(audioUrl);
        currentAudio = audio;

        audio.onplay = () => {
          if (onStart) onStart();
        };

        audio.onended = () => {
          currentAudio = null;
          if (onEnd) onEnd();
        };

        audio.onerror = (e) => {
          console.warn('Audio element error:', e);
          currentAudio = null;
          // Fallback para fala do navegador se o player falhar
          fallbackToBrowserSpeech(cleaned, onStart, onEnd, onError);
        };

        await audio.play();
        return true;
      }
    }

    // Se o endpoint não estiver disponível, faz fallback
    fallbackToBrowserSpeech(cleaned, onStart, onEnd, onError);
    return false;
  } catch (error) {
    console.warn('Neural TTS indisponível, usando fallback local:', error);
    fallbackToBrowserSpeech(cleaned, onStart, onEnd, onError);
    return false;
  }
}

// Cache de vozes locais do navegador
let cachedVoices: SpeechSynthesisVoice[] = [];

if (typeof window !== 'undefined' && window.speechSynthesis) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

export function getBestPortugueseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 1. Vozes neurais / online brasileiras de alta qualidade (Edge, Chrome, Windows)
  const highQualityPtBr = voices.find(
    (v) =>
      (v.lang === 'pt-BR' || v.lang === 'pt_BR') &&
      (v.name.includes('Natural') ||
        v.name.includes('Neural') ||
        v.name.includes('Online') ||
        v.name.includes('Google') ||
        v.name.includes('Francisca') ||
        v.name.includes('Antonio'))
  );
  if (highQualityPtBr) return highQualityPtBr;

  // 2. Qualquer voz especificamente pt-BR (Chrome, Android, iOS Luciana, macOS)
  const anyPtBr = voices.find(
    (v) =>
      v.lang === 'pt-BR' ||
      v.lang === 'pt_BR' ||
      v.name.toLowerCase().includes('brazil') ||
      v.name.toLowerCase().includes('brasil')
  );
  if (anyPtBr) return anyPtBr;

  // 3. Qualquer voz que comece com pt (pt-PT etc.)
  const anyPt = voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
  return anyPt || null;
}

function fallbackToBrowserSpeech(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void
) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.05;
  utterance.pitch = 1.0;

  const ptVoice = getBestPortugueseVoice();
  if (ptVoice) utterance.voice = ptVoice;

  utterance.onstart = () => {
    if (onStart) onStart();
  };

  utterance.onend = () => {
    if (onEnd) onEnd();
  };

  utterance.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      if (onError) onError(e);
    }
    if (onEnd) onEnd();
  };

  window.speechSynthesis.speak(utterance);
}
