import assert from 'node:assert';
import {
  convertMcpToolsToOpenAi,
  parseMcpToolResponse,
  buildMcpRpcRequest,
} from './mcp-client';
import { McpTool } from './types';

function runTests() {
  console.log('--- Iniciando testes de mcp-client ---');

  // Teste 1: buildMcpRpcRequest gera payload JSON-RPC 2.0 padrão
  const req = buildMcpRpcRequest('tools/list', { cursor: '123' }, 42);
  assert.strictEqual(req.jsonrpc, '2.0', 'Deve ter versão jsonrpc 2.0');
  assert.strictEqual(req.id, 42, 'ID deve ser 42');
  assert.strictEqual(req.method, 'tools/list', 'Método deve ser tools/list');
  assert.deepStrictEqual(req.params, { cursor: '123' });
  console.log('✅ Teste 1 passou: buildMcpRpcRequest gera JSON-RPC 2.0 válido');

  // Teste 2: convertMcpToolsToOpenAi converte esquema para OpenAI Function Calling
  const mcpTools: McpTool[] = [
    {
      name: 'query_db',
      description: 'Executa query SQL no banco',
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'Query SQL' },
        },
        required: ['sql'],
      },
    },
    {
      name: 'fetch_user',
      description: 'Busca usuário por ID',
    },
  ];

  const openAiTools = convertMcpToolsToOpenAi(mcpTools, 'postgres-srv');
  assert.strictEqual(openAiTools.length, 2, 'Deve converter 2 ferramentas');
  assert.strictEqual(openAiTools[0].type, 'function');
  assert.strictEqual(openAiTools[0].function.name, 'mcp__postgres-srv__query_db');
  assert.strictEqual(openAiTools[0].function.description, 'Executa query SQL no banco');
  assert.deepStrictEqual(openAiTools[0].function.parameters, mcpTools[0].inputSchema);

  // Ferramenta sem schema deve gerar schema default de objeto vazio
  assert.strictEqual(openAiTools[1].function.name, 'mcp__postgres-srv__fetch_user');
  assert.strictEqual(openAiTools[1].function.parameters.type, 'object');
  console.log('✅ Teste 2 passou: convertMcpToolsToOpenAi gera formato correto com namespace');

  // Teste 3: parseMcpToolResponse extrai conteúdo de respostas RPC
  const rpcSuccessResponse = {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [
        { type: 'text', text: 'Resultado: 42 linhas encontradas' },
      ],
    },
  };
  const parsedSuccess = parseMcpToolResponse(rpcSuccessResponse);
  assert.strictEqual(parsedSuccess, 'Resultado: 42 linhas encontradas');

  // Resposta com erro RPC
  const rpcErrorResponse = {
    jsonrpc: '2.0',
    id: 1,
    error: {
      code: -32602,
      message: 'Tabela não encontrada',
    },
  };
  const parsedError = parseMcpToolResponse(rpcErrorResponse);
  assert.ok(parsedError.includes('Tabela não encontrada'));
  console.log('✅ Teste 3 passou: parseMcpToolResponse processa textos e erros RPC');

  console.log('🎉 Todos os testes de mcp-client passaram com sucesso!');
}

runTests();
