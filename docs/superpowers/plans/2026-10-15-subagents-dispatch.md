# Motor de Subagentes Nativos e Orquestração Paralela Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o modelo de IA ativo selecionado pelo usuário dispare subagentes autônomos em segundo plano para resolver subtarefas especializadas em paralelo, com cards visuais no chat e relatório consolidado.

**Architecture:** 
1. Criar o motor `src/lib/subagent-runner.ts` que executa chamadas isoladas via `/api/chat` usando o mesmo modelo selecionado, com controle de timeout e parsing estruturado.
2. Registrar a ferramenta nativa `dispatch_subagent` nos schemas de tools do Synap (`DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`) e no despachante de ferramentas de `src/App.tsx`.
3. Adicionar a skill nativa `Subagentes` (`id: 'subagents'`) em `src/lib/storage.ts` com instruções de particionamento e delegação.
4. Renderizar mini-cartões de subagentes em `src/components/chat-message.tsx` com `ThinkingOrb` em execução e relatório auditável ao concluir.

**Tech Stack:** TypeScript, React, Web APIs, OpenAI Function Calling, Lucide React, ThinkingOrbs.

## Global Constraints
- NUNCA introduzir custos de API adicionais: reaproveitar a infraestrutura de `/api/chat` existente.
- O subagente DEVE utilizar o modelo atualmente selecionado pelo usuário no app.
- Manter o teto seguro de até 3 iterações internas por subagente para blindar contra loops.
- 100% de compatibilidade com os 25 testes preexistentes.

---

### Task 1: Motor de Execução `src/lib/subagent-runner.ts` e Testes Unitários

**Files:**
- Create: `src/lib/subagent-runner.ts`
- Test: `src/lib/subagent-runner.test.ts`

**Interfaces:**
- Consumes: `/api/chat` endpoint, `ModelId`
- Produces: `runSubagent(config: SubagentConfig): Promise<SubagentResult>`

- [ ] **Step 1: Escrever teste unitário falhando para o runner**
Criar `src/lib/subagent-runner.test.ts` testando validação de parâmetros obrigatórios, formatação do prompt de sistema com papel/contexto e parsing da resposta.

- [ ] **Step 2: Rodar teste para verificar falha (RED)**
Run: `npx tsx --test src/lib/subagent-runner.test.ts`
Expected: FAIL (módulo ainda não existe).

- [ ] **Step 3: Implementar `src/lib/subagent-runner.ts`**
Criar interfaces `SubagentConfig` e `SubagentResult`, montar o payload com system prompt restrito e consumir `/api/chat` com timeout de 35s.

- [ ] **Step 4: Rodar teste para verificar aprovação (GREEN)**
Run: `npx tsx --test src/lib/subagent-runner.test.ts`
Expected: PASS.

---

### Task 2: Skill Nativa `Subagentes` no Catálogo Padrão

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] **Step 1: Declarar a Skill `Subagentes` em `DEFAULT_SKILLS`**
Adicionar skill com `id: 'subagents'`, `name: 'Subagentes'`, `icon: 'bot'`, `enabled: true` e system prompt orientando a IA principal sobre o uso de `dispatch_subagent`.

- [ ] **Step 2: Garantir auto-merge em `loadSkills`**
Garantir que usuários com skills salvas no IndexedDB recebam a skill `Subagentes` automaticamente sem sobrescrever preferências prévias.

- [ ] **Step 3: Verificar integridade de tipos**
Run: `npm run lint`

---

### Task 3: Tool Nativa `dispatch_subagent` no `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Declarar schema `dispatch_subagent` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`**
Definir parâmetros `role`, `task` e `context`.

- [ ] **Step 2: Integrar execução no `executeToolCall` de `src/App.tsx`**
Posicionar antes de `if (!currentRepo)`, invocando `runSubagent` com o `effectiveModel` ativo e repassando o resultado para a conversa.

- [ ] **Step 3: Adicionar diretriz de execução imediata no prompt base**
Explicar à IA coordenadora como relatar o trabalho dos subagentes.

---

### Task 4: Feedback Visual e Cartões de Subagente no Chat

**Files:**
- Modify: `src/components/chat-message.tsx`

- [ ] **Step 1: Atualizar `getToolActionLabel`**
Retornar `"Subagente em ação…"` para `dispatch_subagent`.

- [ ] **Step 2: Renderizar card dedicado para `dispatch_subagent`**
Exibir papel (`role`), tarefa (`task`), tempo de execução, badge de status e botão colapsável para inspecionar o relatório completo do subagente.

---

### Task 5: Verificação Técnica Completa & Documentação

- [ ] **Step 1: Rodar linter e suíte de testes completa**
Run: `npm run lint && npm test`
Expected: 26+ testes passando, 0 erros no TypeScript.

- [ ] **Step 2: Rodar build de produção**
Run: `npm run build`
Expected: Vite build verde e artefatos Cloudflare gerados.

- [ ] **Step 3: Atualizar `task.md` e `walkthrough.md`**
Registrar a Seção 47 documentando o motor de subagentes.
