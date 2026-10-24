import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHarnessNeed,
  proposeHarnessCandidate,
  probeHarnessCandidate,
  composeHarness,
  formatComposedHarnessForPrompt,
  HarnessFailureContext,
  HarnessCandidate,
} from './harness2-engine';

describe('Harness² Engine (Recursive Agent Harnessing - Propose-Probe-Compose)', () => {
  it('detecta necessidade de auto-evolução quando há falhas consecutivas ou erros de sintaxe/ferramenta', () => {
    const normalContext: HarnessFailureContext = {
      toolName: 'read_file',
      consecutiveFailures: 0,
    };
    assert.equal(detectHarnessNeed(normalContext), false);

    const syntaxFailureContext: HarnessFailureContext = {
      toolName: 'patch_file',
      errorMessage: '[Validador de Integridade]: O patch gerou erro de sintaxe',
      consecutiveFailures: 1,
    };
    assert.equal(detectHarnessNeed(syntaxFailureContext), true);

    const retryFailureContext: HarnessFailureContext = {
      toolName: 'search_code',
      consecutiveFailures: 2,
    };
    assert.equal(detectHarnessNeed(retryFailureContext), true);
  });

  it('propõe candidato de Harness adequado com base no tipo de falha (Etapa Propose)', () => {
    const context: HarnessFailureContext = {
      taskDescription: 'Mover botão de vídeo para a esquerda',
      toolName: 'patch_file',
      errorMessage: "Delimitador '}' inesperado na linha 165",
      consecutiveFailures: 2,
    };

    const candidate = proposeHarnessCandidate(context);
    assert.ok(candidate.id);
    assert.equal(candidate.type, 'prompt_rule');
    assert.ok(candidate.title.includes('patch_file') || candidate.title.includes('Sintaxe'));
    assert.ok(candidate.content.includes('delimitadores') || candidate.content.includes('fechamento'));
  });

  it('valida candidato em sandbox sem efeitos colaterais (Etapa Probe)', () => {
    const validCandidate: HarnessCandidate = {
      id: 'h2-rule-1',
      type: 'prompt_rule',
      title: 'Regra de Validação de Chaves',
      content: 'Antes de aplicar patch_file, leia 5 linhas antes e depois para conferir fechamento.',
      triggerCondition: 'tool_error:patch_file',
    };

    const probeRes = probeHarnessCandidate(validCandidate, { toolName: 'patch_file' });
    assert.equal(probeRes.passed, true);
    assert.ok(probeRes.reason.includes('válido') || probeRes.reason.includes('Aprovado'));

    const invalidCandidate: HarnessCandidate = {
      id: 'h2-rule-empty',
      type: 'prompt_rule',
      title: '',
      content: '   ',
      triggerCondition: 'none',
    };
    const failedProbe = probeHarnessCandidate(invalidCandidate, { toolName: 'patch_file' });
    assert.equal(failedProbe.passed, false);
  });

  it('compõe e persiste aprendizado na biblioteca ativa (Etapa Compose)', () => {
    const candidate: HarnessCandidate = {
      id: 'h2-skill-search',
      type: 'skill',
      title: 'Busca Cirúrgica por Botões',
      content: 'Quando procurar botões de ação, busque pela prop onClick ou pelo texto visível.',
      triggerCondition: 'search_no_results',
    };

    const composed = composeHarness(candidate);
    assert.equal(composed.persisted, true);
    assert.equal(composed.candidate.id, 'h2-skill-search');
    assert.ok(composed.composedAt > 0);
  });

  it('injeta aprendizados do Harness² de forma compacta e estruturada no prompt do agente', () => {
    const candidate1: HarnessCandidate = {
      id: 'h2-1',
      type: 'prompt_rule',
      title: 'Prevenção de Falso Positivo',
      content: 'Sempre confira números de linha no search_code antes de fatiar com read_file.',
      triggerCondition: 'tool_error',
    };
    const composedList = [composeHarness(candidate1)];

    const promptBlock = formatComposedHarnessForPrompt(composedList);
    assert.ok(promptBlock.includes('[Harness² Auto-Evolução: Aprendizados Ativos]'));
    assert.ok(promptBlock.includes('Prevenção de Falso Positivo'));
    assert.ok(promptBlock.includes('Sempre confira números de linha'));
  });
});