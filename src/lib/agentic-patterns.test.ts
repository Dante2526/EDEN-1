import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeIncompleteWork,
  looksLikeFileModificationPromise,
  isRecoverableStreamErrorMessage,
} from './agentic-patterns';

describe('agentic-patterns (Detecção de Trabalho Incompleto e Resiliência)', () => {
  it('detecta intenção de listar arquivos com pontuação ("Primeiro, vou listar os arquivos...")', () => {
    const text =
      'Para remover esse ícone (que faz parte do componente Maintenance), eu preciso editar o arquivo onde ele está definido. Vou localizar o arquivo Maintenance.tsx e remover a parte do código que renderiza esse SVG/imagem.\n\nPrimeiro, vou listar os arquivos para confirmar o caminho exato.';

    assert.equal(looksLikeIncompleteWork(text), true);
    assert.equal(looksLikeFileModificationPromise(text), true);
  });

  it('detecta promessa de remoção e deleção de elementos de código', () => {
    const text1 = 'Tô fazendo agora! Vou listar os arquivos para achar o Maintenance.tsx e deletar esse símbolo.';
    const text2 = 'Para remover esse componente, preciso localizar o arquivo.';
    const text3 = 'Vou agora remover o ícone indesejado.';

    assert.equal(looksLikeIncompleteWork(text1), true);
    assert.equal(looksLikeFileModificationPromise(text1), true);

    assert.equal(looksLikeIncompleteWork(text2), true);
    assert.equal(looksLikeIncompleteWork(text3), true);
    assert.equal(looksLikeFileModificationPromise(text3), true);
  });

  it('não dispara falsos positivos em respostas completas', () => {
    const completeText =
      'Removi o ícone SVG do componente `Maintenance.tsx` com sucesso conforme solicitado. O código agora está limpo e testado.';
    assert.equal(looksLikeIncompleteWork(completeText), false);
    assert.equal(looksLikeFileModificationPromise(completeText), false);
  });

  it('identifica corretamente erros de stream recuperáveis incluindo "The operation was aborted"', () => {
    assert.equal(isRecoverableStreamErrorMessage('The operation was aborted'), true);
    assert.equal(isRecoverableStreamErrorMessage('DOMException: The operation was aborted.'), true);
    assert.equal(isRecoverableStreamErrorMessage('AbortError: Request was aborted'), true);
    assert.equal(isRecoverableStreamErrorMessage('Stream was cancelled by upstream server'), true);
    assert.equal(isRecoverableStreamErrorMessage('Stream interrupted: A IA demorou mais de 90s'), true);
    assert.equal(isRecoverableStreamErrorMessage('connection reset by peer'), true);
    assert.equal(isRecoverableStreamErrorMessage('fetch failed'), true);

    // Erros não recuperáveis (ex: erro de validação ou auth)
    assert.equal(isRecoverableStreamErrorMessage('Chave API inválida'), false);
    assert.equal(isRecoverableStreamErrorMessage('Modelo não autorizado'), false);
  });
});
