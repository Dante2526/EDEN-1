import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractCleanSpeechText,
  splitSpeechSentences,
  StreamingSpeechQueue,
} from './streaming-speech-queue';

describe('Streaming Speech Queue (50/50 Flow)', () => {
  it('deve sanitizar tags de raciocínio, blocos de código e markdown', () => {
    const raw =
      '<think>O usuário quer saber sobre React.</think>\n' +
      '# Introdução\n' +
      'O [React](https://react.dev) é uma **ótima** biblioteca!\n' +
      '```javascript\nconsole.log("omitido");\n```\n' +
      'Ele permite criar interfaces dinâmicas.';

    const cleaned = extractCleanSpeechText(raw);
    assert.ok(!cleaned.includes('<think>'));
    assert.ok(!cleaned.includes('console.log'));
    assert.ok(!cleaned.includes('# Introdução'));
    assert.ok(cleaned.includes('O React é uma ótima biblioteca!'));
    assert.ok(cleaned.includes('Ele permite criar interfaces dinâmicas.'));
  });

  it('deve extrair sentenças completas e reter trecho parcial em progresso', () => {
    const text = 'Esta é a primeira frase completa do teste. E aqui está a segunda frase devidamente terminada. E aqui está a terceira frase que ainda';
    const { completed, remaining } = splitSpeechSentences(text, false);

    assert.strictEqual(completed.length, 2);
    assert.strictEqual(completed[0], 'Esta é a primeira frase completa do teste.');
    assert.strictEqual(completed[1], 'E aqui está a segunda frase devidamente terminada.');
    assert.strictEqual(remaining, 'E aqui está a terceira frase que ainda');
  });

  it('deve incluir o trecho restante quando finalize for verdadeiro', () => {
    const text = 'Esta é a primeira frase. E aqui está a conclusão sem ponto final';
    const { completed, remaining } = splitSpeechSentences(text, true);

    assert.strictEqual(completed.length, 2);
    assert.strictEqual(completed[0], 'Esta é a primeira frase.');
    assert.strictEqual(completed[1], 'E aqui está a conclusão sem ponto final');
    assert.strictEqual(remaining, '');
  });

  it('deve agrupar sentenças excessivamente curtas para evitar cortes abruptos', () => {
    const text = 'Sim. Com certeza. Podemos fazer isso agora.';
    const { completed } = splitSpeechSentences(text, true);

    // 'Sim.' é muito curto (< 10 chars), então deve ser agrupado com a próxima frase
    assert.ok(completed.length <= 2);
    assert.ok(completed[0].startsWith('Sim. Com certeza.'));
  });

  it('deve gerenciar estados de fila, cancelamento e limpeza', () => {
    let finishedCalled = false;
    const queue = new StreamingSpeechQueue({
      onFinishedAll: () => {
        finishedCalled = true;
      },
    });

    assert.strictEqual(queue.isSpeaking(), false);
    queue.feed('Primeira frase completa para teste.');
    queue.cancel();

    assert.strictEqual(queue.isSpeaking(), false);
    assert.strictEqual(queue.getQueueLength(), 0);
  });
});
