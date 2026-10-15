# Task List: Blindagem de Execução Autônoma da IA no Synap

- [x] **Task 1: Blindagem de Timeout e Resiliência no Backend (`api/chat.ts`)**
  - [x] Step 1: Elevar `idleTimer` de 45s para 90s em `api/chat.ts`
  - [x] Step 2: Ajustar `sendErrorAndClose` para não marcar `finish_reason: 'stop'` em falhas parciais
  - [x] Step 3: Verificar tipagem com `npm run lint` (`tsc --noEmit`)

- [x] **Task 2: Auto-Continuação e Resiliência de Ferramentas no Frontend (`src/App.tsx`)**
  - [x] Step 1: Expandir `INCOMPLETE_PATTERNS` para cobrir promessas de criação/edição de arquivos ("vou criar", "vou alterar", "vou modificar", etc.)
  - [x] Step 2: Implementar Auto-Recuperação no loop de ferramentas para `Stream was cancelled` e timeouts
  - [x] Step 3: Implementar trava anti-falsa-conclusão (se houver intenção de alteração com repo ativo mas nenhuma tool disparada, forçar chamada imediata de `edit_file`/`create_file`)
  - [x] Step 4: Executar suíte de testes (`npm test`) e build de produção (`npm run build`)
