import assert from 'node:assert';
import {
  COMPACTION_TRIGGER_THRESHOLD,
  RECENT_MESSAGES_WINDOW,
  shouldCompact,
  buildCompactionPrompt,
  prepareMessagesForApi,
} from './context-compactor';
import { Conversation, Message } from './types';

function createMockMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    createdAt: Date.now(),
  };
}

function runTests() {
  console.log('--- Iniciando testes de context-compactor ---');

  // Teste 1: Conversa com poucas mensagens não deve disparar compactação
  const shortConv: Conversation = {
    id: 'conv-1',
    title: 'Short',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: 'z-ai/glm-5.3',
    reasoningEffort: 'low',
    messages: Array.from({ length: 10 }, (_, i) => createMockMessage(`m-${i}`, 'user', `Msg ${i}`)),
  };
  assert.strictEqual(shouldCompact(shortConv), false, 'shouldCompact deve ser false para <= 16 mensagens');
  console.log('✅ Teste 1 passou: Conversa curta não dispara compactação');

  // Teste 2: Conversa com mais de COMPACTION_TRIGGER_THRESHOLD mensagens deve disparar
  const longConv: Conversation = {
    ...shortConv,
    messages: Array.from({ length: 20 }, (_, i) => createMockMessage(`m-${i}`, 'user', `Msg ${i}`)),
  };
  assert.strictEqual(shouldCompact(longConv), true, 'shouldCompact deve ser true para > 16 mensagens');
  console.log('✅ Teste 2 passou: Conversa longa sem compactação dispara');

  // Teste 3: Conversa já compactada recentemente não deve disparar de novo se poucos itens novos
  const alreadyCompactedConv: Conversation = {
    ...longConv,
    contextCompaction: {
      summary: 'Resumo anterior',
      compactedUpToMessageId: 'm-13',
      timestamp: Date.now(),
      originalMessageCount: 14,
    },
  };
  // Com m-13 compactado em 20 msgs, restam 6 msgs não compactadas -> não precisa compactar ainda
  assert.strictEqual(shouldCompact(alreadyCompactedConv), false, 'Não deve recompactar se a janela recente não excedeu o teto');
  console.log('✅ Teste 3 passou: Respeita corte anterior e janela recente');

  // Teste 4: Prompt builder contém seções estruturadas obrigatórias
  const prompt = buildCompactionPrompt(longConv.messages.slice(0, 5), 'Resumo Prévio');
  assert.ok(prompt.includes('🎯 Objetivo Principal'), 'Prompt deve conter seção de Objetivo');
  assert.ok(prompt.includes('🛠️ Decisões Técnicas'), 'Prompt deve conter seção de Decisões Técnicas');
  assert.ok(prompt.includes('📂 Arquivos Lidos'), 'Prompt deve conter seção de Arquivos');
  assert.ok(prompt.includes('⏳ Pendências'), 'Prompt deve conter seção de Pendências');
  console.log('✅ Teste 4 passou: Prompt de compactação é estruturado');

  // Teste 5: prepareMessagesForApi injeta resumo e fatia histórico
  const prepared = prepareMessagesForApi(alreadyCompactedConv, { base: 'Base prompt' });
  // Deve ter: 1) Base prompt, 2) System com resumo compactado, 3) apenas msgs após m-13 (m-14 até m-19 = 6 msgs)
  assert.strictEqual(prepared[0].role, 'system', 'Primeiro deve ser prompt do sistema');
  assert.ok(prepared[1].content.includes('CONTEXT COMPACTION SUMMARY'), 'Segundo deve ser o resumo compactado');
  assert.strictEqual(prepared.length, 2 + 6, 'Deve conter prompts do sistema + 6 mensagens recentes');
  console.log('✅ Teste 5 passou: prepareMessagesForApi prepara histórico otimizado');

  // Teste 6: prepareMessagesForApi injeta bloco de memórias persistentes
  const preparedWithMemories = prepareMessagesForApi(alreadyCompactedConv, {
    base: 'Base prompt',
    memories: '--- BASE DE CONHECIMENTO PERSISTENTE ---',
  });
  assert.strictEqual(preparedWithMemories[1].content, '--- BASE DE CONHECIMENTO PERSISTENTE ---');
  console.log('✅ Teste 6 passou: prepareMessagesForApi injeta bloco de memórias');

  console.log('🎉 Todos os testes de context-compactor passaram com sucesso!');
}

runTests();
