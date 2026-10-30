import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTaskIntent,
  resolveSmartModelRoute,
  type ModelHealthMap,
} from './smart-model-router';

describe('Smart Model Router (Modo Automático + Health Check Aware)', () => {
  const mockHealthOnlineAll: ModelHealthMap = {
    'z-ai/glm-5.3': { id: 'z-ai/glm-5.3', status: 'online', latencyMs: 1200, checkedAt: Date.now() },
    'z-ai/glm-5.3-flash': { id: 'z-ai/glm-5.3-flash', status: 'online', latencyMs: 450, checkedAt: Date.now() },
    'google/gemma-4-31b-it': { id: 'google/gemma-4-31b-it', status: 'online', latencyMs: 900, checkedAt: Date.now() },
    'deepseek-ai/deepseek-v4.1-flash': { id: 'deepseek-ai/deepseek-v4.1-flash', status: 'online', latencyMs: 500, checkedAt: Date.now() },
    'nvidia/nemotron-3.5-super-vl-120b-a12b': { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', status: 'online', latencyMs: 850, checkedAt: Date.now() },
    'nvidia/nemotron-3-ultra-550b-a55b': { id: 'nvidia/nemotron-3-ultra-550b-a55b', status: 'online', latencyMs: 1800, checkedAt: Date.now() },
  };

  // Cenário real diagnosticado na NVIDIA onde GLM, Gemma e DeepSeek estão com timeout e só os Nemotrons estão online
  const mockHealthOnlyNemotronOnline: ModelHealthMap = {
    'z-ai/glm-5.3': { id: 'z-ai/glm-5.3', status: 'offline', latencyMs: null, checkedAt: Date.now() },
    'z-ai/glm-5.3-flash': { id: 'z-ai/glm-5.3-flash', status: 'offline', latencyMs: null, checkedAt: Date.now() },
    'google/gemma-4-31b-it': { id: 'google/gemma-4-31b-it', status: 'offline', latencyMs: null, checkedAt: Date.now() },
    'deepseek-ai/deepseek-v4.1-flash': { id: 'deepseek-ai/deepseek-v4.1-flash', status: 'offline', latencyMs: null, checkedAt: Date.now() },
    'nvidia/nemotron-3.5-super-vl-120b-a12b': { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', status: 'online', latencyMs: 840, checkedAt: Date.now() },
    'nvidia/nemotron-3-ultra-550b-a55b': { id: 'nvidia/nemotron-3-ultra-550b-a55b', status: 'online', latencyMs: 1750, checkedAt: Date.now() },
  };

  it('deve respeitar estritamente o modelo manual quando selectedModel !== "auto"', () => {
    const decision = resolveSmartModelRoute({
      selectedModel: 'nvidia/nemotron-3-ultra-550b-a55b',
      selectedEffort: 'high',
      prompt: 'Muda a cor desse botão para azul',
      hasImages: false,
      isPlanMode: false,
      healthMap: mockHealthOnlineAll,
    });

    assert.equal(decision.isAutoRouted, false);
    assert.equal(decision.targetModel, 'nvidia/nemotron-3-ultra-550b-a55b');
    assert.equal(decision.targetEffort, 'high');
  });

  it('deve classificar corretamente operações práticas/rápidas vs arquiteturais complexas vs visão', () => {
    assert.equal(
      classifyTaskIntent({ prompt: 'Mova o botão de vídeo para a esquerda no header', hasImages: false, isPlanMode: false }),
      'fast_practical'
    );
    assert.equal(
      classifyTaskIntent({ prompt: 'Olhe este print da tela e diga o que está desalinhado', hasImages: true, isPlanMode: false }),
      'vision'
    );
    assert.equal(
      classifyTaskIntent({
        prompt: 'Projete e implemente uma arquitetura completa de autenticação OAuth2 com refresh token, migração SQL no banco e testes',
        hasImages: false,
        isPlanMode: false,
      }),
      'deep_architectural'
    );
    assert.equal(
      classifyTaskIntent({ prompt: 'Crie o plano', hasImages: false, isPlanMode: true }),
      'deep_architectural'
    );
  });

  it('no modo "auto", deve escolher o modelo rápido online para alteração de botão com effort "low"', () => {
    const decision = resolveSmartModelRoute({
      selectedModel: 'auto',
      selectedEffort: 'high',
      prompt: 'Muda o botão de lugar e troca o texto para Salvar',
      hasImages: false,
      isPlanMode: false,
      healthMap: mockHealthOnlineAll,
    });

    assert.equal(decision.isAutoRouted, true);
    assert.equal(decision.intent, 'fast_practical');
    assert.equal(decision.targetModel, 'z-ai/glm-5.3-flash');
    assert.equal(decision.targetEffort, 'low');
  });

  it('no modo "auto", NUNCA deve enviar para modelos offline: se GLM/Gemma/DeepSeek caírem, roteia para o Nemotron online mais rápido', () => {
    const decision = resolveSmartModelRoute({
      selectedModel: 'auto',
      selectedEffort: 'low',
      prompt: 'Mude a cor do botão no header',
      hasImages: false,
      isPlanMode: false,
      healthMap: mockHealthOnlyNemotronOnline,
    });

    assert.equal(decision.isAutoRouted, true);
    assert.equal(decision.targetModel, 'nvidia/nemotron-3.5-super-vl-120b-a12b');
    assert.equal(decision.targetEffort, 'low');
  });

  it('no modo "auto", para tarefas complexas/arquiteturais, deve escolher o modelo parrudo online (ex: Nemotron 3 Ultra 550B)', () => {
    const decision = resolveSmartModelRoute({
      selectedModel: 'auto',
      selectedEffort: 'low',
      prompt: 'Refatore toda a arquitetura do compilador e implemente um novo motor de banco de dados distribuído com cache multi-nível',
      hasImages: false,
      isPlanMode: true,
      healthMap: mockHealthOnlyNemotronOnline,
    });

    assert.equal(decision.isAutoRouted, true);
    assert.equal(decision.intent, 'deep_architectural');
    assert.equal(decision.targetModel, 'nvidia/nemotron-3-ultra-550b-a55b');
  });

  it('no modo "auto", quando houver imagem anexada, deve escolher apenas entre modelos Vision que estejam online', () => {
    const decision = resolveSmartModelRoute({
      selectedModel: 'auto',
      selectedEffort: 'low',
      prompt: 'Analise essa imagem',
      hasImages: true,
      isPlanMode: false,
      healthMap: mockHealthOnlyNemotronOnline,
    });

    assert.equal(decision.isAutoRouted, true);
    assert.equal(decision.intent, 'vision');
    assert.equal(decision.targetModel, 'nvidia/nemotron-3.5-super-vl-120b-a12b');
  });
});
