# Plano de Implementação: Blindagem de Execução Autônoma da IA no Synap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que a IA do Synap execute o trabalho até o fim até alterar o que o usuário pediu, eliminando interrupções prematuras por "Stream was cancelled" e implementando auto-continuação resiliente no loop de ferramentas.

**Architecture:**
1. **Backend (`api/chat.ts`):** 
   - Expandir o `idleTimer` de 45s para 90s, concedendo tempo adequado para raciocínio e montagem de tool calls de grande porte (com 20k-50k tokens de contexto).
   - Corrigir o emissor de erro no stream SSE (`sendErrorAndClose`) para não emitir falsos `finish_reason: 'stop'` em casos de interrupção ou cancelamento, marcando o erro de forma que o cliente saiba que a geração não foi concluída.
2. **Frontend Agentic Loop (`src/App.tsx`):**
   - Expandir a detecção de erros recuperáveis (`isRecoverableStreamError`) para incluir explicitamente `Stream was cancelled`, `stream cancelled`, `stream interrupted`, `TypeError: Stream was cancelled`, `network error`.
   - Auto-recuperação inteligente: quando o stream for cortado antes das tool calls serem emitidas ou concluídas, o Synap preserva o que foi gerado e auto-injeta uma requisição de continuação imperativa: *"A geração foi interrompida antes da execução das ferramentas. Execute IMEDIATAMENTE a ferramenta de arquivo (edit_file / create_file / etc.) agora para aplicar as alterações solicitadas."*
   - Expandir `INCOMPLETE_PATTERNS` para cobrir intenções de criação e modificação ("vou criar", "vou alterar", "vou implementar", "vou adicionar", "vou modificar"), forçando a IA a chamar as tools se apenas enviar texto explicativo sem ferramentas.

**Tech Stack:** TypeScript, React 19, Fetch API / ReadableStream SSE.

---

### Task 1: Blindagem de Timeout e Resiliência no Backend (`api/chat.ts`)

**Files:**
- Modify: `api/chat.ts`

- [ ] **Step 1: Elevar `idleTimer` para 90s**
  - Ajustar o tempo de timeout de inatividade para 90.000ms.
- [ ] **Step 2: Ajustar `sendErrorAndClose`**
  - Não marcar `finish_reason: 'stop'` em chunks de erro; emitir evento de erro transparente.
- [ ] **Step 3: Testar compilação com `npm run lint` (`tsc --noEmit`)**

---

### Task 2: Auto-Continuação e Resiliência de Ferramentas no Frontend (`src/App.tsx`)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Expandir `INCOMPLETE_PATTERNS`**
  - Adicionar padrões para criação e edição de arquivos ("vou criar", "vou implementar", "vou alterar", "vou modificar", "vou gerar").
- [ ] **Step 2: Implementar Auto-Recuperação para `Stream was cancelled` e Timeouts**
  - No bloco `if (streamErrorMsg)`, se for erro de cancelamento/timeout e houver ferramentas a executar ou contexto incompleto, auto-injetar prompt de continuação e manter o loop ativo.
  - No bloco `catch (err)` de `isStreamCancelled`, garantir que a tentativa de auto-continuação reengaje a IA imediatamente para executar a tool call.
- [ ] **Step 3: Testar compilação e suíte de testes com `npm test` e `npm run build`**
