# Checklist de Execução: Integração Direta do Context7 MCP

- [x] Task 1: Suporte a SSE e Fallback Robusto em `src/lib/mcp-client.ts`
  - [x] Criar helper `parseMcpResponsePayload` para parsing de JSON ou SSE (`data: {...}`)
  - [x] Atualizar `testMcpConnection` e `executeMcpToolCall`
  - [x] Adicionar teste unitário de parsing SSE em `src/lib/mcp-client.test.ts`
  - [x] Rodar testes unitários com `npm test` (25/25 passando)
- [x] Task 2: Adicionar Context7 como Servidor MCP Padrão em `src/lib/storage.ts`
  - [x] Configurar `DEFAULT_MCP_SERVERS` com Context7 (`https://mcp.context7.com/mcp`)
  - [x] Fazer auto-merge inteligente no `loadMcpServers`
  - [x] Tratar execução independente de repositório em `src/App.tsx`
  - [x] Adicionar feedback visual e badge de documentação em `src/components/chat-message.tsx`
- [x] Task 3: Verificação Técnica Completa
  - [x] Rodar `npm run lint && npm test` (0 erros tsc, 25/25 testes)
  - [x] Rodar `npm run build` (bundle de produção + dist/_worker.js compilados com sucesso)
