import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWriteToolName,
  filterToolsForPlanMode,
  checkPlanModeWriteGate,
  buildMandatoryPlanPrompt,
  isPlanApprovalReply,
} from './plan-mode-gate';

describe('plan-mode-gate (Mandatory Plan Mode Hard-Gate)', () => {
  it('identifica corretamente ferramentas de escrita/mutação de arquivos', () => {
    assert.equal(isWriteToolName('patch_file'), true);
    assert.equal(isWriteToolName('edit_file'), true);
    assert.equal(isWriteToolName('batch_edit_files'), true);
    assert.equal(isWriteToolName('update_project_files'), true);
    assert.equal(isWriteToolName('create_project'), true);

    // Ferramentas de leitura e diagnóstico NÃO devem ser bloqueadas
    assert.equal(isWriteToolName('read_file'), false);
    assert.equal(isWriteToolName('list_files'), false);
    assert.equal(isWriteToolName('search_code'), false);
    assert.equal(isWriteToolName('query_code_graph'), false);
    assert.equal(isWriteToolName('query_architecture_graph'), false);
    assert.equal(isWriteToolName('dispatch_subagent'), false);
    assert.equal(isWriteToolName('web_search'), false);
  });

  it('filterToolsForPlanMode remove ferramentas de escrita quando isPlanMode=true e preserva todas quando false', () => {
    const mockTools = [
      { type: 'function', function: { name: 'read_file' } },
      { type: 'function', function: { name: 'query_code_graph' } },
      { type: 'function', function: { name: 'patch_file' } },
      { type: 'function', function: { name: 'edit_file' } },
      { type: 'function', function: { name: 'batch_edit_files' } },
      { type: 'function', function: { name: 'update_project_files' } },
    ];

    const filteredOn = filterToolsForPlanMode(mockTools, true);
    assert.deepEqual(
      filteredOn.map((t) => t.function.name),
      ['read_file', 'query_code_graph']
    );

    const filteredOff = filterToolsForPlanMode(mockTools, false);
    assert.equal(filteredOff.length, 6);
  });

  it('checkPlanModeWriteGate bloqueia execução de escrita quando isPlanMode=true (inclusive fallback textual)', () => {
    const blockedPatch = checkPlanModeWriteGate('patch_file', true);
    assert.equal(blockedPatch.allowed, false);
    assert.ok(blockedPatch.blockedResultJson?.includes('MODO PLANO ATIVO'));

    const blockedEdit = checkPlanModeWriteGate('edit_file', true);
    assert.equal(blockedEdit.allowed, false);

    const allowedRead = checkPlanModeWriteGate('read_file', true);
    assert.equal(allowedRead.allowed, true);

    const allowedPatchWhenOff = checkPlanModeWriteGate('patch_file', false);
    assert.equal(allowedPatchWhenOff.allowed, true);
  });

  it('buildMandatoryPlanPrompt gera instruções claras de investigação e proibição de escrita antes da aprovação', () => {
    const repoPlanPrompt = buildMandatoryPlanPrompt(true);
    assert.ok(repoPlanPrompt.includes('HARD-GATE'));
    assert.ok(repoPlanPrompt.includes('query_code_graph'));
    assert.ok(repoPlanPrompt.includes('Aprovar e Executar Plano'));

    const generalPlanPrompt = buildMandatoryPlanPrompt(false);
    assert.ok(generalPlanPrompt.includes('MODO PLANO'));
  });

  it('isPlanApprovalReply detecta confirmação de aprovação após um plano ser apresentado', () => {
    assert.equal(isPlanApprovalReply('sim', true), true);
    assert.equal(isPlanApprovalReply('Sim, pode fazer!', true), true);
    assert.equal(isPlanApprovalReply('aprovado', true), true);
    assert.equal(isPlanApprovalReply('pode executar o plano', true), true);
    assert.equal(isPlanApprovalReply('sim', false), false);
    assert.equal(isPlanApprovalReply('mude a cor do botão para azul e adicione mais um campo', true), false);
  });
});
