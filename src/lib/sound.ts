/**
 * Utilitário de Notificação Sonora da IA (Web Audio API)
 * Gera um sinal sonoro agradável (chime suave de dois tons harmônicos)
 * quando a IA termina de responder, sem depender de arquivos externos ou internet.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Toca um aviso sonoro harmonioso e agradável ao concluir a geração.
 * @param volume Volume relativo (padrão: 0.18)
 */
export function playCompletionSound(volume = 0.18): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Nota 1: Tom base suave e acolhedor (D5 -> E5, 587Hz -> 659Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(volume, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.36);

    // Nota 2: Harmônico superior cristalino e positivo (A5, 880Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.08);

    gain2.gain.setValueAtTime(0.0001, now + 0.08);
    gain2.gain.linearRampToValueAtTime(volume * 0.9, now + 0.10);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.08);
    osc2.stop(now + 0.56);
  } catch (err) {
    console.debug('[Sound] Falha ao emitir som de conclusão:', err);
  }
}
