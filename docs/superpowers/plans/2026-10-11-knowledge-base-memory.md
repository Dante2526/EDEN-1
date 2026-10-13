# Knowledge Base (Memória Persistente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar memória persistente entre conversas no Synap, permitindo que a IA salve fatos importantes autonomamente (via `save_memory` e `forget_memory`), armazene no IndexedDB do navegador e injete-os automaticamente no System Prompt de qualquer chat futuro, com gestão visual completa no painel de extensões.

**Architecture:** Módulo dedicado `src/lib/knowledge-base.ts` para compilação do prompt de memória com TDD; persistência no IndexedDB via `src/lib/storage.ts`; declaração de tools OpenAI (`save_memory`, `forget_memory`) em `src/App.tsx`; injeção em `prepareMessagesForApi`; interface visual de gerenciamento em `src/components/extensions/extensions-panel.tsx` e cards de feedback no `src/components/chat-message.tsx`.

**Tech Stack:** TypeScript, React, `idb-keyval`, Lucide React, Node.js Test Runner (`tsx --test`).

## Global Constraints
- Custo R$ 0,00 vitalício (100% no navegador via IndexedDB).
- Tipagem TypeScript estrita sem erros de lint (`tsc --noEmit`).
- Lazy, reativo e seguro contra inchaço do prompt (formatação limpa e concisa).
- Comunicação concisa e escaneável (estilo ADHD).

---

### Task 1: Tipagem e Motor da Base de Conhecimento com TDD

**Files:**
- Create: `src/lib/knowledge-base.ts`
- Create: `src/lib/knowledge-base.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Produces:
  - `KnowledgeFact` interface: `{ id: string; fact: string; category?: 'stack' | 'preference' | 'rule' | 'general'; createdAt: number; updatedAt?: number; }`
  - `formatKnowledgePrompt(facts: KnowledgeFact[]): string | undefined`
  - `filterKnowledgeFacts(facts: KnowledgeFact[], query: string): KnowledgeFact[]`
  - `loadKnowledgeFacts(): Promise<KnowledgeFact[]>`
  - `saveKnowledgeFacts(facts: KnowledgeFact[]): Promise<void>`

- [ ] **Step 1: Adicionar interface KnowledgeFact em types.ts**
- [ ] **Step 2: Escrever testes unitários em src/lib/knowledge-base.test.ts (RED)**
- [ ] **Step 3: Implementar src/lib/knowledge-base.ts (GREEN)**
- [ ] **Step 4: Implementar métodos de persistência IndexedDB em src/lib/storage.ts**
- [ ] **Step 5: Executar testes automatizados e validar 100% verde**
- [ ] **Step 6: Commitar mudanças da Task 1**

---

### Task 2: Injeção no System Prompt e Context Compactor

**Files:**
- Modify: `src/lib/context-compactor.ts`
- Modify: `src/lib/context-compactor.test.ts`

**Interfaces:**
- Consumes: `systemPrompts.memories?: string`
- Produces: Inclusão do bloco de memórias permanente em `prepareMessagesForApi`

- [ ] **Step 1: Atualizar teste de context-compactor.test.ts para validar injeção de memories**
- [ ] **Step 2: Atualizar prepareMessagesForApi em src/lib/context-compactor.ts**
- [ ] **Step 3: Executar suíte de testes de context compactor**
- [ ] **Step 4: Commitar mudanças da Task 2**

---

### Task 3: Registro das Tools e Integração no Chat em App.tsx

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `loadKnowledgeFacts`, `saveKnowledgeFacts`, `formatKnowledgePrompt`
- Produces: Tools `save_memory` e `forget_memory` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`, despacho assíncrono em `executeTool`, injeção em `prepareMessagesForApi`

- [ ] **Step 1: Declarar schemas MEMORY_SAVE_TOOL e MEMORY_FORGET_TOOL**
- [ ] **Step 2: Adicionar estado knowledgeFacts e carregar no useEffect inicial**
- [ ] **Step 3: Adicionar manipulação em executeTool para salvar/remover fatos**
- [ ] **Step 4: Injetar formatKnowledgePrompt(knowledgeFacts) em prepareMessagesForApi**
- [ ] **Step 5: Atualizar System Prompt geral instruindo o uso das ferramentas de memória**
- [ ] **Step 6: Validar compilação de tipos com tsc --noEmit**
- [ ] **Step 7: Commitar mudanças da Task 3**

---

### Task 4: Interface de Gestão no Painel de Extensões

**Files:**
- Modify: `src/components/extensions/extensions-panel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: Nova aba de navegação interna `[Habilidades] | [Servidores MCP] | [Memória (N)]`, visualizador de fatos com badges, input para adicionar fato manualmente e botão de exclusão rápida

- [ ] **Step 1: Adicionar aba 'memories' no ExtensionsPanel**
- [ ] **Step 2: Renderizar lista de fatos com badge de categoria, data e botão de lixeira**
- [ ] **Step 3: Adicionar formulário simples para adicionar anotações/fatos manuais**
- [ ] **Step 4: Adicionar botão de exclusão em massa com confirmação**
- [ ] **Step 5: Integrar callbacks no App.tsx**
- [ ] **Step 6: Commitar mudanças da Task 4**

---

### Task 5: Feedback Visual no Chat e Validação Final

**Files:**
- Modify: `src/components/chat-message.tsx`
- Modify: `walkthrough.md`

**Interfaces:**
- Produces: Card visual para execução de `save_memory` e `forget_memory` com ícone `Brain` e badge de confirmação no histórico do chat

- [ ] **Step 1: Adicionar tratamento de `save_memory` e `forget_memory` no chat-message.tsx**
- [ ] **Step 2: Executar toda a suíte de testes unitários**
- [ ] **Step 3: Executar tsc --noEmit e npm run build**
- [ ] **Step 4: Atualizar walkthrough.md com a Seção 15**
- [ ] **Step 5: Commitar e enviar para a nuvem (git push origin main)**
