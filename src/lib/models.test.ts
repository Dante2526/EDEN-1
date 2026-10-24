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
  it('identifica corretamente os modelos com suporte a Visão (GLM Flash, Gemma 4 31B e Nemotron-3.5 Super VL)', () => {
    assert.equal(isVisionModel('z-ai/glm-5.3-flash'), true);
    assert.equal(isVisionModel('google/gemma-4-31b-it'), true);
    assert.equal(isVisionModel('nvidia/nemotron-3.5-super-vl-120b-a12b'), true);
    assert.equal(isVisionModel('z-ai/glm-5.3'), false);
    assert.equal(isVisionModel('deepseek-ai/deepseek-v4.1-flash'), false);
    assert.deepEqual([...VISION_MODELS], ['z-ai/glm-5.3-flash', 'google/gemma-4-31b-it', 'nvidia/nemotron-3.5-super-vl-120b-a12b']);
    assert.equal(serverIsVisionModel('nvidia/nemotron-3.5-super-vl-120b-a12b'), true);
  });

  it('identifica corretamente os modelos capazes de executar ferramentas (incluindo DeepSeek V4.1 Flash e Nemotron-3.5 Super VL)', () => {
    assert.equal(isToolCapableModel('z-ai/glm-5.3'), true);
    assert.equal(isToolCapableModel('z-ai/glm-5.3-flash'), true);
    assert.equal(isToolCapableModel('google/gemma-4-31b-it'), true);
    assert.equal(isToolCapableModel('deepseek-ai/deepseek-v4.1-flash'), true);
    assert.equal(isToolCapableModel('nvidia/nemotron-3.5-super-vl-120b-a12b'), true);
    // Modelos removidos da Cloudflare retornam false
    assert.equal(isToolCapableModel('@cf/qwen/qwen2.5-coder-32b-instruct'), false);
    assert.equal(isToolCapableModel('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'), false);
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
