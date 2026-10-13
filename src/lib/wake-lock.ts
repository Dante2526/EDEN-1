/**
 * Gerenciador de Processamento em Segundo Plano e Economia de Bateria.
 * Permite que a tela do celular apague livremente para economizar bateria,
 * mantendo a IA codando, chamando ferramentas e processando em segundo plano.
 */

let activeLockCount = 0;
let sentinel: any = null;
let keepAliveAudio: HTMLAudioElement | null = null;
let audioBlobUrl: string | null = null;
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let oscillator: OscillatorNode | null = null;

/**
 * Cria um arquivo WAV válido de 2 segundos de silêncio absoluto em memória (Blob).
 * 8000Hz, mono, 8-bit PCM (nível 128 = silêncio).
 * Essa duração é ideal para os decodificadores de áudio do Android e iOS,
 * evitando que o sistema considere o áudio encerrado ou pausado.
 */
function getSilentWavBlobUrl(): string {
  if (audioBlobUrl) return audioBlobUrl;

  const sampleRate = 8000;
  const durationSeconds = 2;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new Uint8Array(44 + numSamples);
  const view = new DataView(buffer.buffer);

  // Cabeçalho RIFF
  view.setUint8(0, 82); // R
  view.setUint8(1, 73); // I
  view.setUint8(2, 70); // F
  view.setUint8(3, 70); // F
  view.setUint32(4, 36 + numSamples, true);
  view.setUint8(8, 87); // W
  view.setUint8(9, 65); // A
  view.setUint8(10, 86); // V
  view.setUint8(11, 69); // E

  // Chunk 'fmt '
  view.setUint8(12, 102); // f
  view.setUint8(13, 109); // m
  view.setUint8(14, 116); // t
  view.setUint8(15, 32);  // ' '
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8-bit

  // Chunk 'data'
  view.setUint8(36, 100); // d
  view.setUint8(37, 97);  // a
  view.setUint8(38, 116); // t
  view.setUint8(39, 97);  // a
  view.setUint32(40, numSamples, true);

  // Nível 128 é o centro (silêncio total) no PCM de 8 bits
  buffer.fill(128, 44);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  audioBlobUrl = URL.createObjectURL(blob);
  return audioBlobUrl;
}

function setupMediaSession() {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Synap — Codando em segundo plano...',
        artist: 'Processando com a tela apagada para economizar bateria',
        album: 'Synap Agent',
        artwork: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = 'playing';

      navigator.mediaSession.setActionHandler('play', () => {
        if (keepAliveAudio && keepAliveAudio.paused) {
          keepAliveAudio.play().catch(() => {});
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        // Ignora pausa acidental do lock screen para manter a IA executando
      });
    } catch {}
  }
}

function clearMediaSession() {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
    } catch {}
  }
}

function startBackgroundKeepAlive() {
  if (typeof window === 'undefined') return;

  // 1. Inicia áudio silencioso HTML5 com MediaSession
  // Notifica o SO móvel (Android/iOS) que a aba é um reprodutor de mídia em foreground
  try {
    if (!keepAliveAudio) {
      keepAliveAudio = new Audio(getSilentWavBlobUrl());
      keepAliveAudio.loop = true;
      keepAliveAudio.volume = 0.05; // Sinal sonoro inaudível (silêncio digital de 0dB), mas reconhecido pelo SO

      // Se o SO tentar pausar ao bloquear a tela, reativa instantaneamente
      keepAliveAudio.addEventListener('pause', () => {
        if (activeLockCount > 0 && keepAliveAudio) {
          keepAliveAudio.play().catch(() => {});
        }
      });
    }

    const playPromise = keepAliveAudio.play();
    if (playPromise) {
      playPromise.catch(() => {});
    }

    setupMediaSession();
  } catch (err) {
    console.debug('[KeepAlive] Falha ao iniciar audio element:', err);
  }

  // 2. Web Audio API Oscillator em paralelo para reforçar o audio thread
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      if (!oscillator && audioCtx.state === 'running') {
        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.00001; // Inaudível
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
      }
    }
  } catch (err) {
    console.debug('[KeepAlive] Falha ao iniciar WebAudio context:', err);
  }
}

function stopBackgroundKeepAlive() {
  if (typeof window === 'undefined') return;

  clearMediaSession();

  try {
    if (keepAliveAudio) {
      keepAliveAudio.pause();
      keepAliveAudio.currentTime = 0;
    }
  } catch {}

  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(() => {});
    }
  } catch {}
}

async function requestLock() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    if (!sentinel || sentinel.released) {
      sentinel = await (navigator as any).wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    }
  } catch (err) {
    console.debug('[WakeLock] Não foi possível ativar wakeLock:', err);
  }
}

// Ao trocar a visibilidade (ex: tela liga novamente ou usuário volta à aba)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (activeLockCount > 0) {
      if (keepAliveAudio && keepAliveAudio.paused) {
        keepAliveAudio.play().catch(() => {});
      }
    }
  });
}

/**
 * Solicita permissão para notificações em segundo plano (quando a IA terminar de responder).
 */
export function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    try {
      Notification.requestPermission().catch(() => {});
    } catch {}
  }
}

/**
 * Dispara notificação nativa se o usuário estiver com a aba oculta ou tela apagada.
 */
export function notifyCompletionIfHidden(title: string, body: string) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          body,
          icon: '/icons/icon-192.png',
          tag: 'synap-ai-response',
        });
        notif.onclick = () => {
          if (typeof window !== 'undefined') {
            window.focus();
          }
          notif.close();
        };
      } catch (err) {
        console.debug('[KeepAlive] Falha ao emitir notificação:', err);
      }
    }
  }
}

export interface KeepAliveOptions {
  keepScreenAwake?: boolean;
}

/**
 * Mantém o processamento de código e requisições HTTP ativo em segundo plano.
 * Permite que a tela apague para economizar bateria, sem congelar o agente.
 * Retorna uma função de limpeza para liberar os recursos.
 */
export async function keepScreenAlive(options?: KeepAliveOptions): Promise<() => void> {
  activeLockCount++;
  if (activeLockCount === 1) {
    startBackgroundKeepAlive();
  }

  // Só bloqueia desligamento da tela se o usuário ativou explicitamente.
  // Por padrão, deixamos a tela apagar para economizar bateria enquanto a IA segue codando!
  if (options?.keepScreenAwake) {
    await requestLock();
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    activeLockCount = Math.max(0, activeLockCount - 1);
    if (activeLockCount === 0) {
      stopBackgroundKeepAlive();
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {}
        sentinel = null;
      }
    }
  };
}
