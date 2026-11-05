import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_MODELS,
  VISION_MODELS,
  TOOL_MODELS,
  isVisionModel,
  isToolCapableModel,
  isCloudflareModel,
} from './models';
import {
  TOOL_MODELS as SERVER_TOOL_MODELS,
  isToolCapableModel as serverIsToolCapableModel,
  isVisionModel as serverIsVisionModel,
} from '../../lib/server/_security';

describe('models capability matrix', () => {
  it('identifica corretamente os modelos com suporte a Visão (Gemma 4 31B e Nemotron-3.5 Super VL)', () => {
    assert.equal(isVisionModel('google/gemma-4-31b-it'), true);
    assert.equal(isVisionModel('nvidia/nemotron-3.5-super-vl-120b-a12b'), true);
    assert.equal(isVisionModel('nvidia/nemotron-3.5-lightning-30b-a3b'), false);
    assert.equal(isVisionModel('nvidia/nemotron-3-ultra-550b-a55b'), false);
    assert.deepEqual([...VISION_MODELS], ['google/gemma-4-31b-it', 'nvidia/nemotron-3.5-super-vl-120b-a12b']);
    assert.equal(serverIsVisionModel('nvidia/nemotron-3.5-super-vl-120b-a12b'), true);
  });

  it('identifica corretamente os modelos capazes de executar ferramentas (todos os 6 modelos online)', () => {
    assert.equal(isToolCapableModel('nvidia/nemotron-3.5-lightning-30b-a3b'), true);
    assert.equal(isToolCapableModel('google/gemma-4-31b-it'), true);
    assert.equal(isToolCapableModel('nvidia/nemotron-3.5-super-vl-120b-a12b'), true);
    assert.equal(isToolCapableModel('minimaxai/minimax-m3.1-flash'), true);
    assert.equal(isToolCapableModel('google/diffusiongemma-26b-a4b-it'), true);
    assert.equal(isToolCapableModel('nvidia/nemotron-3-ultra-550b-a55b'), true);
    // Modelos antigos desativados retornam false
    assert.equal(isToolCapableModel('z-ai/glm-5.3'), false);
    assert.equal(isToolCapableModel('deepseek-ai/deepseek-v4.1-flash'), false);
    assert.equal(isToolCapableModel('@cf/qwen/qwen2.5-coder-32b-instruct'), false);
  });

  it('mantém paridade entre matrizes de capacidades do cliente e do servidor', () => {
    assert.equal(ALLOWED_MODELS.length, 6);
    assert.deepEqual([...TOOL_MODELS], [...SERVER_TOOL_MODELS]);
    for (const model of ALLOWED_MODELS) {
      assert.equal(isToolCapableModel(model), serverIsToolCapableModel(model));
      assert.equal(isVisionModel(model), serverIsVisionModel(model));
    }
    assert.equal(isCloudflareModel('@cf/qwen/qwen2.5-coder-32b-instruct'), false);
  });
});
