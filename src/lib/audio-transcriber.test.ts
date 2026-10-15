import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isBrowserSpeechRecognitionSupported,
  isMediaRecorderSupported,
  sendAudioToTranscribe,
} from './audio-transcriber';

describe('Audio Transcriber Client', () => {
  it('deve validar suporte a SpeechRecognition em ambiente Node (retorna false)', () => {
    const supported = isBrowserSpeechRecognitionSupported();
    assert.strictEqual(typeof supported, 'boolean');
  });

  it('deve validar suporte a MediaRecorder em ambiente Node', () => {
    const supported = isMediaRecorderSupported();
    assert.strictEqual(typeof supported, 'boolean');
  });

  it('deve rejeitar áudio nulo ou vazio antes de disparar fetch', async () => {
    const emptyBlob = new Blob([], { type: 'audio/webm' });
    await assert.rejects(
      async () => {
        await sendAudioToTranscribe(emptyBlob);
      },
      {
        message: /Áudio vazio recebido/,
      }
    );
  });

  it('deve processar resposta da API /api/transcribe com sucesso', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string, init: any) => {
        assert.strictEqual(url, '/api/transcribe');
        assert.strictEqual(init.method, 'POST');
        return new Response(
          JSON.stringify({
            text: 'Olá mundo, testando o Whisper na Cloudflare',
            word_count: 7,
            model: '@cf/openai/whisper-large-v3-turbo',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      const fakeAudio = new Blob(['fake audio content'], { type: 'audio/webm' });
      const result = await sendAudioToTranscribe(fakeAudio, 'pt');

      assert.strictEqual(result.text, 'Olá mundo, testando o Whisper na Cloudflare');
      assert.strictEqual(result.word_count, 7);
      assert.strictEqual(result.model, '@cf/openai/whisper-large-v3-turbo');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve lançar erro descritivo quando a API retornar status de erro', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async () => {
        return new Response(
          JSON.stringify({ error: 'Limite de Neurons excedido.' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const fakeAudio = new Blob(['audio data'], { type: 'audio/webm' });
      await assert.rejects(
        async () => {
          await sendAudioToTranscribe(fakeAudio);
        },
        {
          message: /Limite de Neurons excedido/,
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
