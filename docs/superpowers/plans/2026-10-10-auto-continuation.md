# Auto-Continuação de Ferramentas (Bypass de Limites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar Auto-Continuação transparente no loop de execução de ferramentas do Synap (`App.tsx`), permitindo que refatorações e tarefas complexas continuem rodando automaticamente em batches contínuos (até 45 rodadas) sem parar no meio e sem estourar o timeout da Vercel.

**Architecture:** Aumentar o teto do loop com batches de auto-continuação (`MAX_TOTAL_LOOPS = 45`), fornecendo feedback de progresso na UI e mantendo a parada manual (`AbortController`) sempre ativa.

**Tech Stack:** React 19, TypeScript, Vite.

## Global Constraints
- Nenhuma chamada individual para `/api/chat` deve demorar mais de 60s (já garantido pela divisão em tool calls).
- O usuário pode interromper a qualquer momento via botão "Parar Geração".
- Se atingir o teto de 45 rodadas, pausa graciosamente alertando o usuário.

---

### Task 1: Implementar Auto-Continuação com Teto Expandido em `src/App.tsx`

**Files:**
- Modify: `src/App.tsx:1175-1200, 1525-1555`

- [ ] **Step 1: Definir constantes de controle e expandir loop**
Substituir o limite rígido de 15 por `MAX_TOTAL_LOOPS = 45`, mantendo o fluxo transparente.

- [ ] **Step 2: Atualizar mensagem de limite para 45 rodadas**
Garantir que o aviso só apareça se atingir o teto de 45.

- [ ] **Step 3: Validar tipos e build**
Run: `npm run lint && npm run build`
Expected: 0 erros.

- [ ] **Step 4: Commit e merge na main**
Commit das alterações e atualização do `walkthrough.md`.
