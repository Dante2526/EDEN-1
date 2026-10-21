# Integração Direta do Context7 MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar diretamente o servidor Context7 MCP oficial (`https://mcp.context7.com/mcp`) ao chat do Synap, dando à IA acesso em tempo real à documentação oficial e exemplos de código de milhares de bibliotecas.

**Architecture:** 
1. Atualizar `src/lib/mcp-client.ts` para suportar nativamente respostas tanto em `application/json` quanto em `text/event-stream` (SSE com `data: {...}`), como enviado pelo endpoint oficial do Context7.
2. Injetar o Context7 MCP como servidor pré-configurado nativo no catálogo padrão em `src/lib/storage.ts` com URL `https://mcp.context7.com/mcp` e status inicial ativo.
3. Descoberta automática de ferramentas (`resolve-library-id` e `query-docs`) na inicialização do app para disponibilização imediata no modelo de chat.

**Tech Stack:** TypeScript, Fetch API, JSON-RPC 2.0, SSE, OpenAI Function Calling Schema.

## Global Constraints
- NUNCA quebrar servidores MCP JSON-RPC tradicionais que retornam JSON puro.
- Manter o isolamento por namespace `mcp__<id>__<toolName>` para evitar colisões com comandos do GitHub ou Terminal.
- Zero dependências npm adicionais (usar Web Standard APIs).

---

### Task 1: Suporte a SSE e Fallback Robusto em `src/lib/mcp-client.ts`

**Files:**
- Modify: `src/lib/mcp-client.ts`
- Test: `src/lib/mcp-client.test.ts`

- [ ] **Step 1: Criar helper `parseMcpResponsePayload`**
Criar helper que detecta se a resposta HTTP é JSON direto ou payload SSE (`event: message\ndata: {...}`) e faz o parsing seguro do JSON-RPC.

- [ ] **Step 2: Atualizar `testMcpConnection` e `executeMcpToolCall`**
Usar o helper para extrair o resultado sem falhar em `SyntaxError` de SSE.

- [ ] **Step 3: Adicionar teste unitário de parsing SSE em `src/lib/mcp-client.test.ts`**
Cobrir respostas em formato `data: {"result": ...}`.

- [ ] **Step 4: Rodar testes unitários**
Run: `npm test`

---

### Task 2: Adicionar Context7 como Servidor MCP Padrão em `src/lib/storage.ts`

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Declarar `DEFAULT_MCP_SERVERS` com Context7**
Configurar `id: 'context7'`, `name: 'Context7 Docs'`, `url: 'https://mcp.context7.com/mcp'`, `transport: 'sse'`, `enabled: true`.

- [ ] **Step 2: Fazer auto-merge com servidores já salvos no IndexedDB**
Garantir que usuários existentes recebam o Context7 automaticamente sem apagar servidores previamente configurados.

---

### Task 3: Verificação Técnica Completa

- [ ] **Step 1: Rodar linter e testes**
Run: `npm run lint && npm test`

- [ ] **Step 2: Rodar build do Vite**
Run: `npm run build`
