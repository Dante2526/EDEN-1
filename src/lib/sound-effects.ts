// Hook de efeitos sonoros usando Web Audio API (sem precisar de arquivos .mp3)
// Gera bipes curtos pra feedback de voz

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume se suspenso (políticas de autoplay do browser)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Toca um bipe com frequência e duração específicas
function playBeep(frequency: number, duration: number, volume: number = 0.1) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine'; // Som suave
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

  // Envelope: sobe rápido, desce suave (evita clique)
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

// Efeito: IA parou de ouvir e começou a pensar
// Som: bipe grave curto (tipo "entendi")
export function playThinkingSound() {
  playBeep(440, 0.12, 0.08); // Lá (440Hz) - 120ms - volume baixo
}

// Efeito: IA terminou de pensar e vai falar
// Som: bipe agudo curto (tipo "tô pronto")
export function playSpeakingStartSound() {
  playBeep(660, 0.10, 0.08); // Mi (660Hz) - 100ms - volume baixo
}

// Efeito: Modo contínuo ativado
// Som: dois bipes ascendentes (tipo "ligou")
export function playVoiceModeOnSound() {
  playBeep(523, 0.08, 0.08); // Dó
  setTimeout(() => playBeep(659, 0.08, 0.08), 90); // Mi
  setTimeout(() => playBeep(784, 0.12, 0.08), 180); // Sol
}

// Efeito: Modo contínuo desativado
// Som: dois bipes descendentes (tipo "desligou")
export function playVoiceModeOffSound() {
  playBeep(659, 0.08, 0.08); // Mi
  setTimeout(() => playBeep(523, 0.12, 0.08), 90); // Dó
}
