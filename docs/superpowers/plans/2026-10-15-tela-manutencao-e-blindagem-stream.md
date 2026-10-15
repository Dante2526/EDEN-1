# Plano de Implementação: Blindagem de Execução Autônoma e Tela de Manutenção Cinematográfica

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blindar o motor de streaming e auto-continuação do Synap para nunca interromper a execução de ferramentas da IA sem concluir as alterações solicitadas, e implementar uma tela de manutenção cinematográfica, moderna e surpreendente na tela principal com controle de acesso integrado.

**Architecture:** 
1. **Backend & Streaming Resilience:** Elevar timeouts de inatividade (`idleTimer`) de 45s para 90s em `api/chat.ts`, padronizar mensagens de erro SSE e adicionar captura de cancelamentos transitórios.
2. **Frontend Autonomous Loop:** No `src/App.tsx`, ampliar a detecção de auto-recuperação (`isWatchdogTimeout` / `isStreamCancelled`) para incluir `Stream was cancelled` e promessas de execução não concluídas, reengajando o modelo imediatamente com instrução imperativa para executar as ferramentas (`edit_file`, `write_file`) até o fim.
3. **Tela de Manutenção Cinematográfica (`src/components/maintenance-screen.tsx`):** Componente visual de altíssimo nível com canvas animado de poeira estelar/ondas gravitacionais, engrenagens orbitais holográficas com estética terracota/âmbar, barra de progresso dinâmica em tempo real com porcentagem e status de micro-etapas, terminal de logs cyberpunk com digitação contínua, e botão/atalho discreto de acesso admin (`Ctrl+Shift+A` ou botão sutil "Acesso Painel") e suporte a query param `?admin=true`.
4. **Integração no App:** Toggle nas Configurações e suporte a detecção de rota/modo no `src/App.tsx` para alternar entre a Tela de Manutenção e a Área de Trabalho do Synap.

**Tech Stack:** React 19, TypeScript, Lucide Icons, Canvas 2D / CSS Animations, Tailwind CSS.

## Global Constraints
- Sem bibliotecas externas pesadas; usar Canvas 2D nativo e Tailwind existente para garantir performance máxima (60fps).
- Não quebrar o fluxo normal do chat e da persistência em IndexedDB.
- Tipagem TypeScript estrita sem erros (`tsc --noEmit`).

---

### Task 1: Blindagem de Streaming e Auto-Continuação no Synap

**Files:**
- Modify: `api/chat.ts:490-505,660-670`
- Modify: `src/App.tsx:2625-2665,3000-3020`

- [ ] **Step 1: Atualizar o backend (`api/chat.ts`)**
  - Elevar `idleTimer` de 45000 para 90000 ms.
  - Enviar sinal claro de stream interrompido que permita auto-continuação em vez de fechar como 'stop' definitivo.

- [ ] **Step 2: Atualizar o loop autônomo no frontend (`src/App.tsx`)**
  - Incluir `Stream was cancelled`, `stream cancelled`, `stream interrupted` na lista de auto-continuação de ferramentas.
  - Se a IA emitiu intenção de alterar arquivo sem disparar a tool call e tomou interrupção, injetar mensagem de reengajamento: *"Sua resposta anterior foi interrompida antes de concluir as edições nos arquivos. Execute IMEDIATAMENTE as ferramentas agora para concluir o que foi solicitado."*

- [ ] **Step 3: Verificar compilação com `tsc --noEmit`**

---

### Task 2: Componente da Tela de Manutenção Cinematográfica

**Files:**
- Create: `src/components/maintenance-screen.tsx`

- [ ] **Step 1: Criar o componente visual cinematográfico**
  - Canvas interativo de partículas com parallax e efeito de estrelas/fundo dinâmico.
  - Orbes/anéis cibernéticos girando em sincronia (estética Synap: terracota `#d97757` + dark glassmorphism).
  - Barra de progresso com porcentagem em tempo real e status cíclico ("Otimizando pesos neurais...", "Sincronizando modelos...", "Blindando rotas de inferência...").
  - Terminal de telemetria com efeito de digitação ao vivo estilo sci-fi.
  - Botão de acesso direto para o desenvolvedor entrar no painel e atalho de teclado `Ctrl + Shift + A`.

- [ ] **Step 2: Verificar renderização e tipagem com `tsc --noEmit`**

---

### Task 3: Integração no `App.tsx` e Controle de Modo

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/settings-modal.tsx` (ou toggle no header)

- [ ] **Step 1: Adicionar estado `isMaintenanceMode` no `App.tsx`**
  - Verificar se a URL possui `?admin=true` ou `?maintenance=false` ou se o usuário ativou o modo.
  - Renderizar a `MaintenanceScreen` na tela principal se ativo, com opção de entrar no modo admin com 1 clique ou atalho.
  - Permitir alternar o modo diretamente pelo modal de Configurações ou botão do desenvolvedor.

- [ ] **Step 2: Executar testes de regressão e build de produção**
  - Executar `npm test`
  - Executar `npm run build`
