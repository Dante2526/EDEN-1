# Modernização Visual dos Cartões (Design System & Sombras em Camadas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o padrão estético moderno de cartões (estilo Linear/Raycast) em todo o Synap, com sombras em camadas (ambient occlusion + depth shadow), bordas lapidadas de realce, gradientes de superfície e micro-elevações interativas suaves.

**Architecture:** Centralizar a definição do design system de cartões em classes utilitárias no CSS global (`src/index.css`), garantindo consistência automática entre tema escuro e claro. Em seguida, aplicar as classes e refinamentos estruturais nos cartões do Chat, Source Control, Barra Lateral e Studio.

**Tech Stack:** Tailwind CSS v4, CSS Variables, React 19, Lucide Icons, TypeScript.

## Global Constraints
- Preservar compatibilidade total entre tema Claro (`light`) e Escuro (`dark`).
- Não quebrar responsividade mobile nem a área de toque em celulares (tap targets >= 44px).
- Transições suaves com `cubic-bezier(0.16, 1, 0.3, 1)` para sensação nativa e sem travamentos.
- Manter zero erros no `tsc --noEmit` e suíte de testes 100% verde (`npm test`).

---

### Task 1: Design Tokens e Classes Utilitárias no CSS Global
**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Adicionar utilitários `.synap-card`, `.synap-card-interactive` e `.synap-card-subtle`**
  - Implementar sombras em camadas com oclusão ambiente: `0 1px 2px rgba(0,0,0,0.2), 0 4px 16px -2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`.
  - Definir bordas suaves com realce superior e gradiente de fundo sutil.
  - Adicionar suporte a hover suave (`translate-y-[-1.5px]` e expansão de sombra) para cartões clicáveis.
- [ ] **Step 2: Verificar compatibilidade com modo claro (`:root:not(.dark)`)**
- [ ] **Step 3: Compilar com `npm run build` para validar regras Tailwind v4**

---

### Task 2: Modernização dos Cartões do Chat
**Files:**
- Modify: `src/components/chat-message.tsx`
- Modify: `src/components/compaction-marker.tsx`

- [ ] **Step 1: Aplicar `.synap-card` no bloco de pensamento (Thinking / Raciocínio)**
  - Adicionar borda refinada, sombra de profundidade e contraste aprimorado.
- [ ] **Step 2: Aplicar `.synap-card` nos cartões de arquivos editados e diffs**
  - Elevar os itens de arquivos com `.synap-card-interactive` e botão "Ver Diff" destacado.
- [ ] **Step 3: Aplicar novo acabamento nos cartões de ferramentas (Tool Calls)**
  - Web search, URL fetcher, gerador de imagens e terminal.
- [ ] **Step 4: Refinar o divisor visual de compactação (`CompactionMarker`)**
  - Fundo com profundidade de vidro e sombra projetada.

---

### Task 3: Modernização dos Cartões do Source Control
**Files:**
- Modify: `src/components/source-control/source-control-panel.tsx`

- [ ] **Step 1: Cartão de aviso de Pull/commits remotos**
  - Adicionar borda âmbar refinada, gradiente quente sutil e sombra em camadas.
- [ ] **Step 2: Cartões de arquivos alterados / staged**
  - Aplicar `.synap-card-interactive` com leve translação no hover e sombra suave.
- [ ] **Step 3: Caixa de mensagem de commit e botões de ação**
  - Envolver em cartão com profundidade 3D e contorno nítido.

---

### Task 4: Modernização da Barra Lateral e Lista de Repositórios
**Files:**
- Modify: `src/components/chat-sidebar.tsx`
- Modify: `src/components/github/repo-list.tsx`
- Modify: `src/components/skills/extensions-panel.tsx`

- [ ] **Step 1: Itens de conversa no histórico do chat**
  - Efeito de profundidade no item ativo e elevação sutil no hover dos itens inativos.
- [ ] **Step 2: Cartões de repositórios GitHub (`repo-list.tsx`)**
  - Aplicar `.synap-card-interactive` com destaque estético nos badges e datas.
- [ ] **Step 3: Cartões de Habilidades (Skills) e Servidores MCP**
  - Aplicar acabamento moderno com switches alinhados e sombras refinadas.

---

### Task 5: Modernização dos Cartões do Studio (Agentes)
**Files:**
- Modify: `src/studio/studio-panel.tsx`

- [ ] **Step 1: Cartões da linha do tempo (`TimelineCard`)**
  - Aplicar profundidade em camadas e bordas de vidro nos blocos de cada agente (Kimi / GLM / Implementador).
- [ ] **Step 2: Sub-cards de passos de execução (`step`)**
  - Transição de estado com iluminação suave nas bordas.

---

### Task 6: Verificação, Testes e Build
- [ ] **Step 1: Executar checagem de tipos (`npm run lint` / `tsc --noEmit`)**
- [ ] **Step 2: Executar testes automatizados (`npm test`)**
- [ ] **Step 3: Executar build de produção (`npm run build`)**
- [ ] **Step 4: Atualizar walkthrough com resumo visual e evidências**
