# Checklist de Execução: Mini-Editor Visual de Imagem Mobile-First (Pincel & Retoque)

- [x] Task 1: Helper de Processamento Visual (`src/lib/image-mask-helper.ts`) com TDD
  - [x] Step 1.1: Criar teste unitário (`src/lib/image-mask-helper.test.ts`) (RED)
  - [x] Step 1.2: Implementar `src/lib/image-mask-helper.ts` (GREEN)
  - [x] Step 1.3: Rodar testes e validar aprovação
- [x] Task 2: Componente Modal Mobile-First (`src/components/image-editor-modal.tsx`)
  - [x] Step 2.1: Implementar canvas touch-friendly com Pointer Events e `touch-action: none`
  - [x] Step 2.2: Toolbar inferior ergonômica para polegar (slider de pincel, desfazer, limpar e input de prompt)
- [x] Task 3: Integração no Chat e Acesso Rápido
  - [x] Step 3.1: Adicionar botão "Retocar" sobre imagens no `chat-message.tsx`
  - [x] Step 3.2: Conectar modal com o envio de mensagem e ferramenta de imagem
- [x] Task 4: Verificação e Documentação
  - [x] Step 4.1: Rodar `npm test` (43/43 testes passando em 10 suítes)
  - [x] Step 4.2: Rodar `npm run lint` (`tsc --noEmit` - 0 erros)
  - [x] Step 4.3: Rodar `npm run build` (bundle compilado com sucesso)
  - [x] Step 4.4: Atualizar `walkthrough.md` com a Seção 55

