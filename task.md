# Checklist de Execução: Motor Graphify (GraphRAG) e Modal Visual de Contexto

- [x] Task 1: Motor Graphify GraphRAG (`src/lib/graphify-engine.ts`) com TDD
  - [x] Step 1.1: Criar teste unitário falhando (`src/lib/graphify-engine.test.ts`) (RED)
  - [x] Step 1.2: Implementar `src/lib/graphify-engine.ts` com parser de imports, BFS e formatador GraphRAG (GREEN)
  - [x] Step 1.3: Rodar testes unitários e validar aprovação
- [x] Task 2: Componente Modal de Visualização do Grafo (`src/components/graph-modal.tsx`)
  - [x] Step 2.1: Criar `src/components/graph-modal.tsx` com visualizador interativo SVG, busca, zoom e dependências
- [x] Task 3: Integração no ChatHeader e Tool da IA no `src/App.tsx`
  - [x] Step 3.1: Integrar ferramenta OpenAI `query_code_graph` em `src/App.tsx`
  - [x] Step 3.2: Adicionar botão discreto no `ChatHeader` (`src/components/chat-header.tsx`)
  - [x] Step 3.3: Adicionar card e botão no `src/components/chat-message.tsx`
- [x] Task 4: Verificação e Documentação
  - [x] Step 4.1: Executar `npm run lint` (`tsc --noEmit`)
  - [x] Step 4.2: Executar `npm test` (garantir todas as suítes verdes)
  - [x] Step 4.3: Executar `npm run build` (garantir bundle compilado)
  - [x] Step 4.4: Atualizar `walkthrough.md` com a Seção 50
