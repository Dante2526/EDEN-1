import { describe, it } from 'node:test';
import assert from 'node:assert';
import transcribeHandler from '../../api/transcribe';
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
            text: 'Olá mundo, testando o Whisper na NVIDIA NIM',
            word_count: 8,
            model: 'openai/whisper-large-v3',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      const fakeAudio = new Blob(['fake audio content'], { type: 'audio/webm' });
      const result = await sendAudioToTranscribe(fakeAudio, 'pt');

      assert.strictEqual(result.text, 'Olá mundo, testando o Whisper na NVIDIA NIM');
      assert.strictEqual(result.word_count, 8);
      assert.strictEqual(result.model, 'openai/whisper-large-v3');
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

describe('api/transcribe Handler (NVIDIA NIM)', () => {

  it('deve rejeitar métodos HTTP diferentes de POST com 405', async () => {
    const req = new Request('http://localhost/api/transcribe', { method: 'GET' });
    const res = await transcribeHandler(req, { NVIDIA_API_KEY: 'nvapi-test' });
    assert.strictEqual(res.status, 405);
    const body = await res.json();
    assert.match(body.error, /Método não permitido/);
  });

  it('deve rejeitar requisição sem NVIDIA_API_KEY com 401', async () => {
    const req = new Request('http://localhost/api/transcribe', {
      method: 'POST',
      body: new Blob(['audio data']),
    });
    const res = await transcribeHandler(req, {});
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /NVIDIA API Key não configurada/);
  });

  it('deve processar áudio binário e encaminhar para NVIDIA NIM com sucesso', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = '';
    let interceptedAuth = '';

    try {
      (globalThis as any).fetch = async (url: string, init: any) => {
        interceptedUrl = url;
        interceptedAuth = init.headers.Authorization;
        return new Response(
          JSON.stringify({ text: 'Transcrição bem-sucedida via NVIDIA NIM Whisper' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const req = new Request('http://localhost/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/webm',
          'X-Language': 'pt',
        },
        body: new Blob(['raw audio bytes'], { type: 'audio/webm' }),
      });

      const res = await transcribeHandler(req, { NVIDIA_API_KEY: 'nvapi-valid-key' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(interceptedUrl, 'https://integrate.api.nvidia.com/v1/audio/transcriptions');
      assert.strictEqual(interceptedAuth, 'Bearer nvapi-valid-key');

      const data = await res.json();
      assert.strictEqual(data.text, 'Transcrição bem-sucedida via NVIDIA NIM Whisper');
      assert.strictEqual(data.word_count, 6);
      assert.strictEqual(data.model, 'openai/whisper-large-v3');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve processar payload JSON base64 e despachar para NVIDIA NIM', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string) => {
        assert.strictEqual(url, 'https://integrate.api.nvidia.com/v1/audio/transcriptions');
        return new Response(
          JSON.stringify({ text: 'Texto via Base64' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const base64Audio = btoa('test audio content');
      const req = new Request('http://localhost/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: `data:audio/webm;base64,${base64Audio}`,
          language: 'pt',
        }),
      });

      const res = await transcribeHandler(req, { NVIDIA_API_KEY: 'nvapi-valid-key' });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.text, 'Texto via Base64');
      assert.strictEqual(data.model, 'openai/whisper-large-v3');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

