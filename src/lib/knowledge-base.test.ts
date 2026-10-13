import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatKnowledgePrompt,
  filterKnowledgeFacts,
  createKnowledgeFact,
} from './knowledge-base';
import { KnowledgeFact } from './types';

describe('Knowledge Base System', () => {
  it('formatKnowledgePrompt deve retornar undefined para lista vazia ou nula', () => {
    assert.equal(formatKnowledgePrompt([]), undefined);
    assert.equal(formatKnowledgePrompt(undefined as any), undefined);
  });

  it('formatKnowledgePrompt deve compilar fatos com IDs e instruções no bloco de system prompt', () => {
    const facts: KnowledgeFact[] = [
      {
        id: 'mem_1',
        fact: 'O usuário hospeda a aplicação na Vercel no plano Hobby.',
        category: 'stack',
        createdAt: 1700000000000,
      },
      {
        id: 'mem_2',
        fact: 'O projeto utiliza Tailwind CSS v4.',
        category: 'stack',
        createdAt: 1700000001000,
      },
    ];

    const prompt = formatKnowledgePrompt(facts);
    assert.ok(prompt);
    assert.ok(prompt.includes('BASE DE CONHECIMENTO PERSISTENTE'));
    assert.ok(prompt.includes('[mem_1]'));
    assert.ok(prompt.includes('Vercel no plano Hobby'));
    assert.ok(prompt.includes('[mem_2]'));
    assert.ok(prompt.includes('save_memory'));
    assert.ok(prompt.includes('forget_memory'));
  });

  it('filterKnowledgeFacts deve filtrar por texto, ID ou categoria', () => {
    const facts: KnowledgeFact[] = [
      { id: 'mem_1', fact: 'Usa Vercel Hobby', category: 'stack', createdAt: 1 },
      { id: 'mem_2', fact: 'Prefere respostas em pt-BR', category: 'preference', createdAt: 2 },
      { id: 'mem_3', fact: 'Projeto usa SQLite', category: 'stack', createdAt: 3 },
    ];

    const searchStack = filterKnowledgeFacts(facts, 'stack');
    assert.equal(searchStack.length, 2);

    const searchPtBr = filterKnowledgeFacts(facts, 'pt-br');
    assert.equal(searchPtBr.length, 1);
    assert.equal(searchPtBr[0].id, 'mem_2');

    const searchId = filterKnowledgeFacts(facts, 'mem_3');
    assert.equal(searchId.length, 1);
    assert.equal(searchId[0].id, 'mem_3');
  });

  it('createKnowledgeFact deve criar fato com ID sanitizado, categoria padrão e timestamp', () => {
    const fact = createKnowledgeFact('  O usuário prefere testes com node:test  ', 'rule');
    assert.ok(fact.id.startsWith('mem_'));
    assert.equal(fact.fact, 'O usuário prefere testes com node:test');
    assert.equal(fact.category, 'rule');
    assert.ok(fact.createdAt > 0);
  });

  it('createKnowledgeFact deve atribuir categoria general se omitida e rejeitar texto vazio', () => {
    const fact = createKnowledgeFact('Fato genérico');
    assert.equal(fact.category, 'general');
    assert.throws(() => createKnowledgeFact('   '), /não pode ser vazio/);
  });
});
