import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDevToolsErrorForAi,
  formatDevToolsSummaryForAi,
  parseDevToolsMessage,
  createConsoleLogItem,
  createNetworkRequestItem,
  type PreviewConsoleLog,
  type PreviewNetworkRequest,
} from './preview-devtools';

test('createConsoleLogItem - Criação e sanitização de log do console', () => {
  const item = createConsoleLogItem('error', ['TypeError: Cannot read properties of undefined (reading "map")'], {
    source: 'src/App.tsx',
    line: 42,
    column: 10,
    stack: 'TypeError: Cannot read properties of undefined\n    at App (src/App.tsx:42:10)',
  });

  assert.equal(item.level, 'error');
  assert.equal(item.source, 'src/App.tsx');
  assert.equal(item.line, 42);
  assert.ok(item.messages[0].includes('Cannot read properties of undefined'));
  assert.ok(item.stack?.includes('at App'));
});

test('createNetworkRequestItem - Criação e status de requisição de rede', () => {
  const req = createNetworkRequestItem('GET', 'https://api.example.com/items', 404, 'Not Found', 120, 'fetch');

  assert.equal(req.method, 'GET');
  assert.equal(req.url, 'https://api.example.com/items');
  assert.equal(req.status, 404);
  assert.equal(req.statusText, 'Not Found');
  assert.equal(req.durationMs, 120);
});

test('formatDevToolsErrorForAi - Montagem do prompt para o botão Corrigir com IA', () => {
  const errLog: PreviewConsoleLog = {
    id: 'log-1',
    timestamp: Date.now(),
    level: 'error',
    messages: ['ReferenceError: userList is not defined'],
    source: 'src/components/UserList.tsx',
    line: 15,
    column: 8,
    stack: 'ReferenceError: userList is not defined\n    at UserList (src/components/UserList.tsx:15:8)',
  };

  const prompt = formatDevToolsErrorForAi(errLog);
  assert.ok(prompt.includes('ReferenceError: userList is not defined'));
  assert.ok(prompt.includes('src/components/UserList.tsx:15'));
  assert.ok(prompt.includes('Stack Trace:'));
  assert.ok(prompt.includes('Corrija o código'));
});

test('formatDevToolsSummaryForAi - Resumo de logs e falhas de rede para ferramenta da IA', () => {
  const logs: PreviewConsoleLog[] = [
    {
      id: 'log-1',
      timestamp: Date.now(),
      level: 'error',
      messages: ['SyntaxError: Unexpected token'],
      source: 'src/index.tsx',
      line: 3,
    },
    {
      id: 'log-2',
      timestamp: Date.now(),
      level: 'warn',
      messages: ['Warning: Each child in a list should have a unique key'],
    },
  ];

  const reqs: PreviewNetworkRequest[] = [
    {
      id: 'req-1',
      timestamp: Date.now(),
      method: 'POST',
      url: '/api/items',
      status: 500,
      statusText: 'Internal Server Error',
      durationMs: 85,
      type: 'fetch',
    },
  ];

  const summary = formatDevToolsSummaryForAi(logs, reqs);
  assert.ok(summary.includes('SyntaxError: Unexpected token'));
  assert.ok(summary.includes('POST /api/items [500 Internal Server Error]'));
});

test('parseDevToolsMessage - Parseia mensagem vinda do iframe postMessage', () => {
  const validEvent = {
    data: {
      type: '__SYNAP_DEVTOOLS_LOG__',
      payload: {
        level: 'warn',
        messages: ['Deprecation warning: component will unmount'],
      },
    },
  };

  const parsed = parseDevToolsMessage(validEvent);
  assert.ok(parsed);
  assert.equal(parsed?.type, '__SYNAP_DEVTOOLS_LOG__');
  assert.equal(parsed?.payload.level, 'warn');

  const invalidEvent = { data: { type: 'SOME_OTHER_EVENT' } };
  assert.equal(parseDevToolsMessage(invalidEvent), null);
});
