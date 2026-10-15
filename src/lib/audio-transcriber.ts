/**
 * Utilitário de captura de áudio do microfone e transcrição via Cloudflare Workers AI
 * Modelo: @cf/openai/whisper-large-v3-turbo
 */

export interface TranscriptionResult {
  text: string;
  word_count: number;
  vtt?: string | null;
  model?: string;
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

export function isMediaRecorderSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return Boolean(
    navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
  );
}

export function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/wav',
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return '';
}

export interface ActiveRecording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

/**
 * Inicia a gravação de áudio do microfone usando MediaRecorder.
 */
export async function startAudioRecording(): Promise<ActiveRecording> {
  if (!isMediaRecorderSupported()) {
    throw new Error('Gravação de microfone não suportada neste dispositivo.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = getSupportedAudioMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.start(250); // Coleta a cada 250ms

  const stopTracks = () => {
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
  };

  return {
    stop: () => {
      return new Promise<Blob>((resolve, reject) => {
        recorder.onerror = (err) => {
          stopTracks();
          reject(err);
        };
        recorder.onstop = () => {
          stopTracks();
          const finalType = recorder.mimeType || mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: finalType });
          resolve(blob);
        };
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          } else {
            stopTracks();
            resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
          }
        } catch (err) {
          stopTracks();
          reject(err);
        }
      });
    },
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {}
      stopTracks();
    },
  };
}

/**
 * Envia o blob de áudio gravado para o endpoint /api/transcribe da Cloudflare.
 */
export async function sendAudioToTranscribe(
  audioBlob: Blob,
  language: string = 'pt'
): Promise<TranscriptionResult> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('Áudio vazio recebido para transcrição.');
  }

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': audioBlob.type || 'application/octet-stream',
      'X-Language': language,
    },
    body: audioBlob,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Falha ao transcrever áudio (${response.status})`);
  }

  return {
    text: (data.text || '').trim(),
    word_count: data.word_count || 0,
    vtt: data.vtt || null,
    model: data.model || '@cf/openai/whisper-large-v3-turbo',
  };
}
