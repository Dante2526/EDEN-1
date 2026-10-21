# Ajuste de Textos e Contraste no Tema Claro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os textos que sumiram ou ficaram com baixo contraste no tema claro (modo branco), garantindo alta legibilidade em todos os componentes sem alterar o tema escuro.

**Architecture:** Substituir cores hexadecimais estáticas (como `text-[#f3efe6]`) por classes responsivas ao tema (`text-zinc-900 dark:text-[#f3efe6]` ou `text-[color:var(--c-fg-f3efe6)]`) e calibrar badges, botões e accordions para alto contraste no tema claro usando pares `light / dark`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Lucide React.

## Global Constraints
- NUNCA quebrar nem alterar negativamente a aparência do tema escuro existente.
- Manter o padrão de design system terracota Anthropic (`#d97757`).
- Usar Tailwind v4 com variantes `dark:` explícitas onde variáveis genéricas não tiverem contraste satisfatório.

---

### Task 1: Corrigir botões "Projetos" e "Baixar vídeo" na Sidebar e listas de repositórios

**Files:**
- Modify: `src/components/chat-sidebar.tsx:575-607`
- Modify: `src/components/github/repo-list.tsx:140-150`

- [ ] **Step 1: Inspecionar e atualizar classes em `chat-sidebar.tsx`**
Substituir `text-[#f3efe6]` por `text-zinc-900 dark:text-[#f3efe6]` nos botões "Projetos" e "Baixar vídeo". Garantir contraste nos badges de atalho `live preview` e `link → MP4` (`text-[#d97757] dark:text-[#d97757]/80 font-semibold`).

- [ ] **Step 2: Atualizar botão de criar repositório em `repo-list.tsx`**
Substituir `text-[#f3efe6]` por `text-zinc-900 dark:text-[#f3efe6]`.

- [ ] **Step 3: Testar compilação**
Run: `npm run lint`

---

### Task 2: Corrigir contraste do Badge de Deploy na barra superior

**Files:**
- Modify: `src/components/deployments/deployment-status-badge.tsx:30-85`

- [ ] **Step 1: Ajustar variantes para status `building`, `failure`, `success` e `idle`**
Garantir que no tema claro o texto de `success` use `text-emerald-800 dark:text-emerald-300` com `bg-emerald-100/90 dark:bg-emerald-950/30` e borda `border-emerald-300 dark:border-emerald-600/30`.
Aplicar o mesmo padrão para `failure` (`rose`) e `building` (`amber`).

- [ ] **Step 2: Testar compilação**
Run: `npm run lint`

---

### Task 3: Corrigir contraste no Accordion de Raciocínio e Mensagens do Chat

**Files:**
- Modify: `src/components/chat-message.tsx:440-500`
- Modify: `src/components/chat-message.tsx:355-378`

- [ ] **Step 1: Ajustar badge de Modo (low, high, max) e textos de apoio no accordion**
Ajustar `Modo low`, `({N} caracteres)` e `Ver processo` para terem cores nítidas no tema claro (`text-zinc-700 dark:text-zinc-300`, `text-zinc-600 dark:text-zinc-400`).

- [ ] **Step 2: Ajustar botão Copiar na mensagem do usuário**
Garantir nitidez com `text-zinc-600 dark:text-[color:var(--c-fg-c4bfb6)] hover:text-zinc-900 dark:hover:text-[color:var(--c-fg-f3efe6)]`.

- [ ] **Step 3: Testar compilação**
Run: `npm run lint`

---

### Task 4: Corrigir legibilidade dos controles inferiores (`ModelControls`)

**Files:**
- Modify: `src/components/model-controls.tsx:135-230`

- [ ] **Step 1: Ajustar rótulos e badges nos pills inferiores**
Calibrar os rótulos `pensar:`, `Plano`, badge `OFF`, `tokens:` e `%` para contraste nítido em fundos claros (`text-zinc-700 dark:text-[color:var(--c-fg-8c867a)]`).

- [ ] **Step 2: Testar compilação**
Run: `npm run lint`

---

### Task 5: Validação completa da suíte de testes e build

- [ ] **Step 1: Rodar linter e testes unitários**
Run: `npm run lint && npm test`

- [ ] **Step 2: Rodar build do Vite**
Run: `npm run build`
