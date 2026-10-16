# Graphify Context Engine & Visual Graph Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o motor Graphify de GraphRAG no Synap para fornecer contexto arquitetural cirúrgico à IA (nós, dependências e impacto de código), com ferramenta OpenAI Function Calling (`query_code_graph`) e modal visual interativo sob demanda acessível pelo cabeçalho do chat e pelo card da resposta, sem ocupar espaço na barra lateral.

**Architecture:** 
1. `src/lib/graphify-engine.ts`: Motor de grafos puro TypeScript/Web que extrai nós (módulos, funções, componentes) e arestas (imports, chamadas, dependências) a partir do repositório ativo e/ou arquivo `graph.json` pré-existente. Implementa busca em largura (BFS), cálculo de "god nodes" (arquivos de alto acoplamento) e resumo textual otimizado para o prompt da LLM.
2. `src/lib/graphify-engine.test.ts`: Testes unitários cobrindo extração de dependências, busca de caminhos (shortest path), detecção de hubs/god nodes e serialização para contexto.
3. `src/App.tsx`: Registro da ferramenta de IA `query_code_graph` e integração do estado do modal de grafo.
4. `src/components/graph-modal.tsx`: Modal interativo e responsivo em tela cheia com visualização interativa do grafo (nós coloridos por comunidade/camada, busca de símbolos, inspeção de conexões e métricas de acoplamento).
5. `src/components/chat-header.tsx` & `src/components/chat-message.tsx`: Botão de acesso rápido no cabeçalho do chat (ícone `Network`) e card estilizado na mensagem do chat com botão *"Abrir Mapa do Grafo"*.

**Tech Stack:** TypeScript, React, Lucide Icons, SVG/Canvas interativo, Vitest.

## Global Constraints
- **Zero Poluição na Barra Lateral:** Proibido adicionar abas ou ícones na sidebar esquerda (`[Chat] | [Repos] | [Git] | [MPC]`). O acesso visual deve ser via botão no `ChatHeader` e card do chat.
- **100% Gratuito & Offline:** Motor roda localmente no navegador sem depender de serviços externos pagos nem chaves adicionais.
- **TDD Rigoroso:** Testes unitários para o motor de grafos antes do código de produção.
- **Integridade da Aplicação:** `npm run lint`, `npm test` e `npm run build` devem permanecer 100% verdes.

---

### Task 1: Motor Graphify GraphRAG (`src/lib/graphify-engine.ts`) com TDD

- [ ] **Step 1.1: Criar teste unitário falhando (`src/lib/graphify-engine.test.ts`)**
  - Teste 1: `buildGraphFromFiles` extrai nós e arestas de imports ESM/TSX.
  - Teste 2: `findShortestPath` encontra caminho entre dois nós (ex.: `App.tsx` -> `chat-message.tsx`).
  - Teste 3: `findGodNodes` identifica módulos mais conectados.
  - Teste 4: `queryGraphContext` formata resumo cirúrgico para a LLM com nós relevantes e conexões diretas.
- [ ] **Step 1.2: Implementar `src/lib/graphify-engine.ts`**
  - Tipos `GraphNode`, `GraphEdge`, `ProjectGraph`, `GraphQueryResult`.
  - Parser leve de imports (`import ... from '...'`) e detecção de nós.
  - Algoritmo BFS para caminhos e cálculo de grau de conectividade.
  - Formatador de contexto GraphRAG para IA.
- [ ] **Step 1.3: Rodar testes unitários e validar**
  - Executar `npm test` e verificar se a nova suíte passa.

---

### Task 2: Componente Modal de Visualização do Grafo (`src/components/graph-modal.tsx`)

- [ ] **Step 2.1: Criar `src/components/graph-modal.tsx`**
  - Modal com fundo escuro elegante, backdrop blur e layout responsivo.
  - Busca e filtro por nós (arquivos, componentes, hooks).
  - Canvas/SVG interativo com nós móveis/conectados, zoom, pan e destaque de nós adjacentes.
  - Painel lateral do nó selecionado mostrando: dependências de entrada (quem importa), dependências de saída (o que ele importa) e atalho para abrir o arquivo.
  - Botão de fechar e métricas (Total de nós, arestas e nós centrais).

---

### Task 3: Integração no ChatHeader e Tool da IA no `src/App.tsx`

- [ ] **Step 3.1: Integrar ferramenta OpenAI `query_code_graph` em `src/App.tsx`**
  - Declarar tool no schema de ferramentas com descrição e parâmetros (`query`, `focus_file`, `max_depth`).
  - Implementar despacho em `executeGitHubTool` consumindo os arquivos do repositório ativo e retornando o contexto arquitetural.
- [ ] **Step 3.2: Adicionar botão discreto no `ChatHeader` (`src/components/chat-header.tsx`)**
  - Botão com ícone `Network` e tooltip "Mapa do Projeto (Graphify)".
  - Abre o `GraphModal` sob demanda sem tocar na barra lateral.
- [ ] **Step 3.3: Adicionar card de ferramenta em `src/components/chat-message.tsx`**
  - Exibir badge elegante `Graphify` quando a IA consultar a arquitetura.
  - Botão *"Explorar Grafo"* direto no card da resposta para abrir o modal focado nos nós consultados.

---

### Task 4: Verificação e Documentação

- [ ] **Step 4.1: Executar `npm run lint` (`tsc --noEmit`)**
- [ ] **Step 4.2: Executar `npm test` (garantir todas as suítes verdes)**
- [ ] **Step 4.3: Executar `npm run build` (garantir bundle de produção compilado)**
- [ ] **Step 4.4: Atualizar `walkthrough.md` com a Seção 50 documentando a integração do Graphify**
