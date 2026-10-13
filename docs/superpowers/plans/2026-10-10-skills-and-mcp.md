# Sistema de Habilidades (Skills) e MCP (Model Context Protocol) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o ecossistema de Habilidades Modulares (Skills) e Conector MCP (Model Context Protocol) no Synap, com aba dedicada na barra lateral, catálogo de skills de engenharia, conexões externas via JSON-RPC/SSE e execução dinâmica de ferramentas durante o chat.

**Architecture:** Módulo de cliente MCP (`src/lib/mcp-client.ts`), armazenamento no IndexedDB (`src/lib/storage.ts`), painel visual unificado (`src/components/extensions/extensions-panel.tsx`), extensão da `ChatSidebar` e orquestração de prompts/ferramentas no ciclo de chat de `src/App.tsx`.

**Tech Stack:** React 19, TypeScript 5.7, Lucide React, IndexedDB (`idb-keyval`), Vite 8, `tsx`.

## Global Constraints
- Nenhuma chamada MCP pode travar a renderização do chat (timeout rígido de 15s em chamadas externas).
- As 4 skills nativas (TDD, Debugging, Segurança, Performance) já devem vir configuradas e prontas.
- Compatibilidade com o formato OpenAI/NVIDIA function calling para ferramentas dinâmicas.

---

### Task 1: Definição de Tipos e Persistência de Dados

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces: `Skill`, `McpTool`, `McpServer` em `types.ts`; `loadSkills`, `saveSkills`, `loadMcpServers`, `saveMcpServers`, `BUILTIN_SKILLS` em `storage.ts`.

- [ ] **Step 1: Adicionar tipos de Skill e MCP em `src/lib/types.ts`**
```typescript
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: 'flask' | 'bug' | 'shield' | 'zap' | 'sparkles';
  systemPrompt: string;
  enabled: boolean;
  isBuiltin?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: 'sse' | 'http';
  apiKey?: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  errorMessage?: string;
  tools: McpTool[];
  lastConnectedAt?: number;
}
```

- [ ] **Step 2: Implementar armazenamento e catálogo builtin em `src/lib/storage.ts`**
Adicionar persistência via `idb-keyval` para as chaves `synap_skills_v1` e `synap_mcp_servers_v1` com as 4 skills nativas inclusas.

- [ ] **Step 3: Validar tipos com `npx tsc --noEmit`**
Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**
```bash
git add src/lib/types.ts src/lib/storage.ts
git commit -m "feat(storage): add skills and mcp server types and storage helpers"
```

---

### Task 2: Motor MCP Client (`src/lib/mcp-client.ts`) com Testes Unitários

**Files:**
- Create: `src/lib/mcp-client.ts`
- Create: `src/lib/mcp-client.test.ts`

**Interfaces:**
- Consumes: `McpServer`, `McpTool` de `src/lib/types.ts`
- Produces: `convertMcpToolsToOpenAi`, `parseMcpToolResponse`, `testMcpConnection`, `executeMcpToolCall`.

- [ ] **Step 1: Escrever teste unitário automatizado em `src/lib/mcp-client.test.ts`**
Testar conversão de schema MCP para formato OpenAI function call e tratamento de respostas JSON-RPC.

- [ ] **Step 2: Rodar teste e confirmar que falha (RED)**
Run: `npx tsx src/lib/mcp-client.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/mcp-client.ts`**
Implementar funções de conversão, descoberta (`tools/list`) e chamada (`tools/call`) com timeouts de segurança de 15s.

- [ ] **Step 4: Rodar teste unitário e confirmar aprovação (GREEN)**
Run: `npx tsx src/lib/mcp-client.test.ts`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**
```bash
git add src/lib/mcp-client.ts src/lib/mcp-client.test.ts
git commit -m "feat(mcp): implement mcp client engine with tests"
```

---

### Task 3: Painel de Extensões na UI (`src/components/extensions/extensions-panel.tsx`)

**Files:**
- Create: `src/components/extensions/extensions-panel.tsx`

**Interfaces:**
- Consumes: `Skill`, `McpServer` de `src/lib/types.ts`
- Produces: `<ExtensionsPanel />`

- [ ] **Step 1: Criar `src/components/extensions/extensions-panel.tsx`**
Implementar o painel visual com:
- Abas superiores: "Habilidades" e "Servidores MCP".
- Habilidades: cards com switches de ligar/desligar, ícones temáticos e modal "+ Nova Habilidade".
- Servidores MCP: cards com status visual (indicador verde de conectado), lista de ferramentas encontradas, botão "Testar Conexão", excluir e modal "+ Conectar Servidor".

- [ ] **Step 2: Validar compilação TypeScript**
Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**
```bash
git add src/components/extensions/extensions-panel.tsx
git commit -m "feat(ui): add ExtensionsPanel component for skills and mcp"
```

---

### Task 4: Integração na `ChatSidebar` e no Chat (`src/App.tsx`)

**Files:**
- Modify: `src/components/chat-sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ExtensionsPanel`, `loadSkills`, `saveSkills`, `loadMcpServers`, `saveMcpServers`, `executeMcpToolCall`.

- [ ] **Step 1: Adicionar aba 'skills' na `ChatSidebar`**
Estender o tipo `sidebarTab` para `'chats' | 'repos' | 'source-control' | 'skills'` e renderizar `<ExtensionsPanel />`.

- [ ] **Step 2: Injetar Skills e Tools MCP no ciclo do Chat em `src/App.tsx`**
- Carregar skills e servidores MCP do storage no boot.
- Injetar os prompts das skills ativadas em `prepareMessagesForApi`.
- Incluir as ferramentas dos servidores MCP conectados em `ALL_CHAT_TOOLS`.
- No dispatcher de tools de `App.tsx`, despachar chamadas MCP para o servidor correspondente.

- [ ] **Step 3: Validar compilação e build de produção**
Run: `npm run lint && npm run build`
Expected: 0 erros.

- [ ] **Step 4: Commit**
```bash
git add src/components/chat-sidebar.tsx src/App.tsx
git commit -m "feat(chat): integrate skills and mcp servers into sidebar and chat loop"
```

---

### Task 5: Verificação E2E, Code Review e Walkthrough

**Files:**
- Modify: `walkthrough.md`
- Modify: `task.md`

- [ ] **Step 1: Executar suite completa de verificação**
Run: `npm run lint; npx tsx src/lib/mcp-client.test.ts; npm run build`
Expected: Todos verdes com saída confirmada.

- [ ] **Step 2: Atualizar `walkthrough.md` com a Seção 11**
- [ ] **Step 3: Merge na branch `main` e push para GitHub**
