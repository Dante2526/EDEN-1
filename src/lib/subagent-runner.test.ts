import assert from 'node:assert';
import {
  buildSubagentSystemPrompt,
  parseSubagentResult,
  runSubagent,
  SubagentConfig,
} from './subagent-runner';

async function runTests() {
  console.log('--- Iniciando testes de subagent-runner ---');

  // Teste 1: buildSubagentSystemPrompt gera instruções específicas com papel e contexto
  const prompt = buildSubagentSystemPrompt('Pesquisador de Docs', 'Pesquisar API do TanStack Query v5', 'Versão 5.12');
  assert.ok(prompt.includes('Pesquisador de Docs'), 'Deve conter o papel');
  assert.ok(prompt.includes('Pesquisar API do TanStack Query v5'), 'Deve conter a tarefa');
  assert.ok(prompt.includes('Versão 5.12'), 'Deve conter o contexto');
  assert.ok(prompt.includes('DIRETRIZES DO SUBAGENTE'), 'Deve conter as diretrizes estritas');
  console.log('✅ Teste 1 passou: buildSubagentSystemPrompt monta prompt isolado e focado');

  // Teste 2: parseSubagentResult limpa tags e normaliza o retorno
  const rawText = '<think>Pensando na arquitetura...</think>\n\n### Relatório\nA API utiliza useQuery.';
  const cleaned = parseSubagentResult(rawText);
  assert.strictEqual(cleaned.report, '### Relatório\nA API utiliza useQuery.', 'Deve extrair o relatório sem think');
  assert.strictEqual(cleaned.reasoning, 'Pensando na arquitetura...', 'Deve capturar o raciocínio separadamente');
  console.log('✅ Teste 2 passou: parseSubagentResult isola raciocínio e relatório');

  // Teste 3: runSubagent rejeita parâmetros ausentes
  const invalidConfig = { role: '', task: '', model: 'google/gemma-4-31b-it' } as SubagentConfig;
  const result = await runSubagent(invalidConfig);
  assert.strictEqual(result.success, false, 'Deve falhar com parâmetros vazios');
  assert.ok(result.error?.includes('obrigatórios'), 'Deve apontar campos obrigatórios');
  console.log('✅ Teste 3 passou: runSubagent valida parâmetros obrigatórios');

  // Teste 4: runSubagent com mock de fetch executa com sucesso
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Resultado da auditoria: Nenhum vazamento de memória encontrado.',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const successResult = await runSubagent({
      role: 'Auditor',
      task: 'Analisar vazamento de memória',
      model: 'google/gemma-4-31b-it',
      apiKeySecret: 'mock_secret',
    });

    assert.strictEqual(successResult.success, true, 'Deve retornar sucesso');
    assert.ok(successResult.report.includes('Nenhum vazamento'), 'Deve conter o texto retornado');
    assert.strictEqual(successResult.role, 'Auditor');
    console.log('✅ Teste 4 passou: runSubagent executa e retorna SubagentResult estruturado');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('🎉 Todos os testes de subagent-runner passaram com sucesso!');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de subagent-runner:', err);
  process.exit(1);
});
