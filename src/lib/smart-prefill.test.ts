import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectContextualTools, selectContextualSkills } from './smart-prefill.js';
import type { Skill } from './types.js';

const MOCK_TOOLS = [
  { type: 'function', function: { name: 'read_file' } },
  { type: 'function', function: { name: 'list_files' } },
  { type: 'function', function: { name: 'search_code' } },
  { type: 'function', function: { name: 'patch_file' } },
  { type: 'function', function: { name: 'edit_file' } },
  { type: 'function', function: { name: 'batch_edit_files' } },
  { type: 'function', function: { name: 'query_code_graph' } },
  { type: 'function', function: { name: 'query_architecture_graph' } },
  { type: 'function', function: { name: 'read_github_file' } },
  { type: 'function', function: { name: 'search_github_repos' } },
  { type: 'function', function: { name: 'create_project' } },
  { type: 'function', function: { name: 'update_project_files' } },
  { type: 'function', function: { name: 'open_project' } },
  { type: 'function', function: { name: 'generate_document' } },
  { type: 'function', function: { name: 'run_python' } },
  { type: 'function', function: { name: 'web_search' } },
  { type: 'function', function: { name: 'fetch_url' } },
  { type: 'function', function: { name: 'save_memory' } },
  { type: 'function', function: { name: 'forget_memory' } },
  { type: 'function', function: { name: 'run_terminal_command' } },
  { type: 'function', function: { name: 'dispatch_subagent' } },
  { type: 'function', function: { name: 'generate_image' } },
  { type: 'function', function: { name: 'generate_image_with_layers' } },
  { type: 'function', function: { name: 'inpaint_image' } },
  { type: 'function', function: { name: 'open_video_editor' } },
  { type: 'function', function: { name: 'control_browser' } },
  { type: 'function', function: { name: 'list_browser_recipes' } },
  { type: 'function', function: { name: 'run_browser_recipe' } },
];

const MOCK_SKILLS: Skill[] = [
  { id: 'tdd', name: 'TDD', description: '', icon: 'flask', enabled: true, systemPrompt: 'TDD' },
  { id: 'debugging', name: 'Debugging', description: '', icon: 'bug', enabled: true, systemPrompt: 'Debug' },
  { id: 'security', name: 'Security', description: '', icon: 'shield', enabled: true, systemPrompt: 'Sec' },
  { id: 'perf', name: 'Perf', description: '', icon: 'zap', enabled: true, systemPrompt: 'Perf' },
  { id: 'doc-creator', name: 'Doc Creator', description: '', icon: 'file-text', enabled: true, systemPrompt: 'Docs' },
  { id: 'conventional-commits', name: 'Commits', description: '', icon: 'git-commit', enabled: true, systemPrompt: 'Git' },
  { id: 'mobile-first', name: 'Mobile', description: '', icon: 'smartphone', enabled: true, systemPrompt: 'Mobile' },
  { id: 'cloudflare-pages', name: 'CF Pages', description: '', icon: 'cloud', enabled: true, systemPrompt: 'CF' },
  { id: 'subagents', name: 'Subagentes', description: '', icon: 'bot', enabled: true, systemPrompt: 'Sub' },
];

describe('smart-prefill (Poda Inteligente de Tools e Skills para Redução de TTFT)', () => {
  it('remove tools duplicadas e pesadas desnecessárias quando em repositório GitHub ativo', () => {
    const selected = selectContextualTools(MOCK_TOOLS, {
      userText: 'Mude o botão de deploy da direita para a superior esquerda no Header',
      hasActiveRepo: true,
      hasActiveProject: false,
    });
    const names = selected.map((t) => t.function.name);

    // Mantém ferramentas essenciais de código no repo
    assert.equal(names.includes('read_file'), true);
    assert.equal(names.includes('patch_file'), true);
    assert.equal(names.includes('edit_file'), true);
    assert.equal(names.includes('query_code_graph'), true);

    // Remove duplicatas e ferramentas irrelevantes ao prompt (mídia, browser recipes, office, python)
    assert.equal(names.includes('query_architecture_graph'), false);
    assert.equal(names.includes('read_github_file'), false);
    assert.equal(names.includes('search_github_repos'), false);
    assert.equal(names.includes('create_project'), false);
    assert.equal(names.includes('update_project_files'), false);
    assert.equal(names.includes('open_project'), false);
    assert.equal(names.includes('generate_document'), false);
    assert.equal(names.includes('run_python'), false);
    assert.equal(names.includes('generate_image'), false);
    assert.equal(names.includes('generate_image_with_layers'), false);
    assert.equal(names.includes('inpaint_image'), false);
    assert.equal(names.includes('open_video_editor'), false);
    assert.equal(names.includes('list_browser_recipes'), false);
    assert.equal(names.includes('run_browser_recipe'), false);
  });

  it('preserva generate_document e run_python quando o usuário solicita explicitamente', () => {
    const docTools = selectContextualTools(MOCK_TOOLS, {
      userText: 'Gere uma planilha Excel com o relatório financeiro em PDF',
      hasActiveRepo: false,
      hasActiveProject: false,
    });
    const docNames = docTools.map((t) => t.function.name);
    assert.equal(docNames.includes('generate_document'), true);

    const pyTools = selectContextualTools(MOCK_TOOLS, {
      userText: 'Rode um script Python para calcular a regressão linear',
      hasActiveRepo: false,
      hasActiveProject: false,
    });
    const pyNames = pyTools.map((t) => t.function.name);
    assert.equal(pyNames.includes('run_python'), true);
  });

  it('filtra skills específicas (doc-creator, conventional-commits, cloudflare-pages) quando fora de contexto', () => {
    const filtered = selectContextualSkills(MOCK_SKILLS, {
      userText: 'Corrija a cor do botão no Header.tsx',
      hasActiveRepo: true,
    });
    const ids = filtered.map((s) => s.id);

    assert.equal(ids.includes('debugging'), true);
    assert.equal(ids.includes('security'), true);
    assert.equal(ids.includes('mobile-first'), true);
    assert.equal(ids.includes('doc-creator'), false);
    assert.equal(ids.includes('conventional-commits'), false);
    assert.equal(ids.includes('cloudflare-pages'), false);
  });

  it('inclui doc-creator e conventional-commits quando mencionados no prompt', () => {
    const filtered = selectContextualSkills(MOCK_SKILLS, {
      userText: 'Faça um git commit e gere um relatório em PDF das mudanças',
      hasActiveRepo: true,
    });
    const ids = filtered.map((s) => s.id);

    assert.equal(ids.includes('doc-creator'), true);
    assert.equal(ids.includes('conventional-commits'), true);
  });
});
