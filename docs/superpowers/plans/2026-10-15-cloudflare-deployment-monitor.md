# Monitor de Deploy da Cloudflare e Correção Assistida por IA — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar monitoramento em tempo real dos deploys da Cloudflare Pages com visualizador de logs de terminal, badge de status moderno no cabeçalho e card de alerta no chat com botão explícito de "Corrigir Erro com IA".

**Architecture:**
- Backend: Endpoint serverless `api/deployments.ts` que consulta a API da Cloudflare Pages (`/pages/projects/{project}/deployments` e `/history/logs`) com suporte a fallback de checks do GitHub.
- Frontend Service: `src/lib/deployment-service.ts` gerencia requisições, normalização de status (`building`, `success`, `failure`), extração inteligente de blocos de erro e hook de polling com backoff.
- UI: Badge de cabeçalho (`DeploymentStatusBadge`) com ícones semânticos Lucide (`CloudUpload`, `CheckCircle2`, `AlertTriangle`), modal de console de terminal (`DeploymentLogModal`) e card de ação no chat (`DeploymentErrorCard`).
- IA Integration: O usuário aciona manualmente o botão "Corrigir Erro com IA", que injeta o log recortado no chat para o modelo analisar e consertar sem disparos não autorizados.

**Tech Stack:** TypeScript, React, Lucide Icons, Cloudflare Pages API, Tailwind CSS / Synap Design System.

## Global Constraints
- Sem círculos/bolinhas genéricas coloridas: usar ícones Lucide modernos com micro-animações.
- Sem auto-trigger: a IA nunca modifica código sem o clique explícito do usuário no botão "Corrigir Erro".
- Custo zero e máxima segurança: tokens da Cloudflare permanecem no servidor (`env.CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`).
- Compatibilidade Vercel Edge & Cloudflare Pages Advanced Worker (`_worker.ts`).

---

### Task 1: Endpoint de Backend (`api/deployments.ts`) e Roteamento

**Files:**
- Create: `api/deployments.ts`
- Modify: `server.ts`
- Modify: `_worker.ts`

- [ ] **Step 1: Criar o endpoint `api/deployments.ts`**
  - Implementar handlers para `action=status` (retorna último deploy, status, sha, url, timestamp) e `action=logs` (retorna linhas formatadas e resumo do erro).
  - Tratar timeouts e autenticação defensiva com headers de segurança.
- [ ] **Step 2: Adicionar rota `/api/deployments` no `server.ts` (Express)**
- [ ] **Step 3: Mapear rota `/api/deployments` no `_worker.ts` (Cloudflare Pages)**
- [ ] **Step 4: Validar build e tipos com `npm run lint`**

---

### Task 2: Cliente Frontend TDD e Módulo de Extração de Erros (`src/lib/deployment-service.ts`)

**Files:**
- Create: `src/lib/deployment-service.ts`
- Create: `src/lib/deployment-service.test.ts`

- [ ] **Step 1: Escrever teste unitário para normalização de deploys e extração de erro (RED)**
  - Testar parsing de estados da Cloudflare (`queued` -> `building`, `active` -> `building`, `success`, `failure`).
  - Testar extração de linhas de erro (`TS2304`, `Error:`, `Failed to compile`).
- [ ] **Step 2: Implementar `src/lib/deployment-service.ts` (GREEN)**
  - Tipos `DeploymentStatus`, `DeploymentInfo`, `DeploymentLogEntry`.
  - Funções `fetchLatestDeployment()` e `fetchDeploymentLogs()`.
  - Função utilitária `extractRelevantErrorSnippet(rawLogs: string): string`.
- [ ] **Step 3: Rodar testes com `npm test` e verificar sucesso (100% GREEN)**

---

### Task 3: Modal de Logs de Terminal do Deploy (`src/components/deployments/deployment-log-modal.tsx`)

**Files:**
- Create: `src/components/deployments/deployment-log-modal.tsx`

- [ ] **Step 1: Construir modal no estilo console escuro (`.synap-card`)**
  - Cabeçalho com ícone `Terminal`, título, status do build e botão de fechar.
  - Botão de copiar logs para a área de transferência (`Copy` / `Check`).
  - Corpo rolável com fonte monoespaçada, numeração de linhas e destaque em vermelho para linhas de erro.
- [ ] **Step 2: Testar acessibilidade e responsividade mobile**

---

### Task 4: Card de Alerta no Chat com Ação Sob Demanda (`src/components/deployments/deployment-error-card.tsx`)

**Files:**
- Create: `src/components/deployments/deployment-error-card.tsx`

- [ ] **Step 1: Criar componente de card de falha no design system `.synap-card`**
  - Ícone `<AlertTriangle className="w-5 h-5 text-rose-400" />` com glow e badge tridimensional.
  - Informações do commit (SHA, branch, horário).
  - Trecho recortado do erro em bloco de código monoespaçado.
  - Botão secundário "Ver Logs Completos" (abre o modal da Task 3).
  - Botão primário com acento terracota: **"⚡ Corrigir Erro com IA"** que chama callback `onFixWithAi(errorSnippet)`.

---

### Task 5: Badge de Status Refinado no Cabeçalho (`src/components/deployments/deployment-status-badge.tsx`)

**Files:**
- Create: `src/components/deployments/deployment-status-badge.tsx`
- Modify: `src/components/chat-header.tsx`

- [ ] **Step 1: Criar o componente `DeploymentStatusBadge`**
  - Estado `building`: ícone `<CloudUpload className="w-3.5 h-3.5 text-amber-400 animate-pulse" />` com label "Compilando...".
  - Estado `success`: ícone `<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />` com label "No ar" e link para o site.
  - Estado `failure`: ícone `<AlertTriangle className="w-3.5 h-3.5 text-rose-400" />` com label "Falha no build" e clique para ver logs.
- [ ] **Step 2: Integrar o badge no `chat-header.tsx` ao lado das informações do repositório/branch**

---

### Task 6: Integração no Chat (`src/App.tsx`), Verificação e Documentação

**Files:**
- Modify: `src/App.tsx`
- Create/Modify: `task.md`
- Modify: `walkthrough.md`

- [ ] **Step 1: Integrar o monitor de deploy no `src/App.tsx`**
  - Disparar verificação de deploy após commits realizados no Git ou via IA.
  - Renderizar o `DeploymentErrorCard` no chat caso o último commit resulte em erro de build.
  - Implementar o handler `handleFixBuildError`: injeta o prompt com os logs no chat e engatilha a IA para corrigir.
- [ ] **Step 2: Executar testes automatizados (`npm test`)**
- [ ] **Step 3: Executar checagem de tipos estritos (`npm run lint`)**
- [ ] **Step 4: Executar build de produção (`npm run build`)**
- [ ] **Step 5: Documentar a entrega na Seção 35 de `walkthrough.md`**
