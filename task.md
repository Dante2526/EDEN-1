# Checklist de Execução: Solução de Tela Branca no Preview (Google AI Studio & LinkHub)

- [x] Task 1: Motor Híbrido de Preview em `src/lib/preview-html.ts`
  - [x] Step 1.1: Suporte a projetos estáticos HTML/CSS puros sem sobrescrever `<body>`
  - [x] Step 1.2: Singleton React 19 (`react`, `react-dom/client` com `?external=react`)
  - [x] Step 1.3: Dynamic Imports na memória com interceptação Babel (`window.__synapImport`) para `React.lazy`
  - [x] Step 1.4: Montagem flexível via `main.tsx` ou fallback para `App.tsx` (default e named export)
  - [x] Step 1.5: Injeção de mocks para variáveis de ambiente (`process.env.API_KEY`)
- [x] Task 2: Suíte de Testes Automatizados TDD
  - [x] Step 2.1: Criar `src/lib/preview-html.test.ts` com 4 testes automatizados
  - [x] Step 2.2: Validar aprovação dos testes (`npm test`)
- [x] Task 3: Ajustes de Resiliência na UI
  - [x] Step 3.1: Fundo transparente no iframe em `local-preview.tsx` (sem flash branco)
  - [x] Step 3.2: Expansão de detecção web em `project-context.tsx`
- [x] Task 4: Verificação e Documentação
  - [x] Step 4.1: Executar `npm test` (38/38 testes passando em 9 suítes)
  - [x] Step 4.2: Executar `npm run lint` (`tsc --noEmit` - 0 erros)
  - [x] Step 4.3: Executar `npm run build` (bundle compilado em 2.02s)
  - [x] Step 4.4: Atualizar `walkthrough.md` com a Seção 54

