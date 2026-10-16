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

    // Teste 5: runSubagent executa ferramentas (tool_calls) via onExecuteTool e consolida relatório final
    let fetchTurn = 0;
    const executedTools: Array<{ name: string; args: any }> = [];

    globalThis.fetch = async (_url: any, init: any) => {
      fetchTurn++;
      const parsedBody = JSON.parse(init.body);
      assert.ok(Array.isArray(parsedBody.tools), 'Payload deve enviar lista de tools ao /api/chat');

      if (fetchTurn === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_sub_1',
                      type: 'function',
                      function: {
                        name: 'read_file',
                        arguments: JSON.stringify({ path: 'src/lib/models.ts' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Turno 2: verifica se o resultado da tool foi anexado às mensagens
      const hasToolResult = parsedBody.messages.some(
        (m: any) => m.role === 'tool' && m.tool_call_id === 'call_sub_1' && m.content.includes('ALLOWED_MODELS')
      );
      assert.ok(hasToolResult, 'Segundo turno deve incluir mensagem role=tool com o retorno da ferramenta');

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Relatório final: models.ts exporta ALLOWED_MODELS corretamente.',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const toolSubagentResult = await runSubagent({
      role: 'Inspetor de Código',
      task: 'Verificar exportações em src/lib/models.ts',
      model: 'z-ai/glm-5.3-flash',
      apiKeySecret: 'mock_secret',
      tools: [{ type: 'function', function: { name: 'read_file' } }],
      onExecuteTool: async (name, args) => {
        executedTools.push({ name, args });
        return 'export const ALLOWED_MODELS = ["z-ai/glm-5.3"];';
      },
    });

    assert.strictEqual(toolSubagentResult.success, true, 'Subagente com tools deve retornar sucesso');
    assert.strictEqual(executedTools.length, 1, 'Deve ter executado 1 ferramenta');
    assert.strictEqual(executedTools[0].name, 'read_file');
    assert.strictEqual(executedTools[0].args.path, 'src/lib/models.ts');
    assert.ok(toolSubagentResult.report.includes('ALLOWED_MODELS corretamente'), 'Deve retornar relatório consolidado pós-tool');
    console.log('✅ Teste 5 passou: runSubagent executa loop de ferramentas autônomo');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('🎉 Todos os testes de subagent-runner passaram com sucesso!');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de subagent-runner:', err);
  process.exit(1);
});
