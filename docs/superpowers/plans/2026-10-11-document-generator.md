# Implementação do Gerador Universal de Documentos (PDF, Excel, Word, PPT)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos utilizam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Implementar geração client-side de arquivos reais nos formatos PDF, Excel (.xlsx), Word (.docx) e PowerPoint (.pptx) com custo zero, sem servidores externos, com cards de download instantâneo no chat e skill nativa dedicada.

**Architecture:** Motor client-side em `src/lib/document-generator.ts` que converte estruturas de dados da IA em binários reais (`Blob`) usando `jspdf`, `exceljs`, `docx` e `pptxgenjs`. Integração no `src/App.tsx` via tool `generate_document` e exibição de cards interativos de download no `chat-message.tsx`.

**Tech Stack:** TypeScript, React 19, jspdf, jspdf-autotable, exceljs, docx, pptxgenjs, Lucide Icons, Vite.

## Global Constraints
- Geração 100% no navegador (Client-Side) com custo R$ 0,00 e privacidade total.
- Sem requisições para APIs pagas de conversão.
- Download imediato via `URL.createObjectURL()`.
- Zero erros de tipos no TypeScript (`npm run lint` / `tsc --noEmit`).
- Ao final, realizar commit e push automático para a nuvem (`git push origin main`), respeitando a preferência configurada do usuário.

---

### Task 1: Instalação de Bibliotecas e Motor Compilador com Testes Unitários

**Files:**
- Modify: `package.json`
- Create: `src/lib/document-generator.ts`
- Create: `src/lib/document-generator.test.ts`

**Interfaces:**
- Consumes: `jspdf`, `jspdf-autotable`, `exceljs`, `docx`, `pptxgenjs`
- Produces: `generateDocumentBlob(spec: DocumentSpec): Promise<GeneratedDocumentResult>`

- [ ] **Step 1: Instalar dependências dos compiladores**
```bash
npm install jspdf jspdf-autotable exceljs docx pptxgenjs
```

- [ ] **Step 2: Escrever teste unitário para validação de especificações e nomes de arquivo**

Criar `src/lib/document-generator.test.ts`:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeFilename, normalizeDocumentSpec, DocumentSpec } from './document-generator';

describe('Document Generator Helpers', () => {
  it('deve sanitizar nomes de arquivos inválidos e garantir extensão correta', () => {
    assert.strictEqual(sanitizeFilename('meu*relatorio?.pdf', 'pdf'), 'meu_relatorio_.pdf');
    assert.strictEqual(sanitizeFilename('planilha_vendas', 'excel'), 'planilha_vendas.xlsx');
    assert.strictEqual(sanitizeFilename('contrato', 'docx'), 'contrato.docx');
    assert.strictEqual(sanitizeFilename('apresentacao', 'pptx'), 'apresentacao.pptx');
  });

  it('deve normalizar especificação de documento garantindo valores padrão', () => {
    const raw: DocumentSpec = {
      type: 'excel',
      filename: 'vendas',
      title: 'Vendas 2026',
      content: {
        sheets: [{ name: 'Resumo', headers: ['Mês', 'Valor'], rows: [['Jan', 1000]] }]
      }
    };
    const normalized = normalizeDocumentSpec(raw);
    assert.strictEqual(normalized.filename, 'vendas.xlsx');
    assert.strictEqual(normalized.title, 'Vendas 2026');
    assert.strictEqual(normalized.type, 'excel');
  });
});
```

- [ ] **Step 3: Implementar `src/lib/document-generator.ts`**

Implementar os geradores de Blob para PDF, Excel, Word e PowerPoint com fallback seguro e tratamento de erros.

- [ ] **Step 4: Executar testes unitários**
```bash
npx tsx --test src/lib/document-generator.test.ts
```

---

### Task 2: Registro da Tool `generate_document` em `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `generateDocumentBlob` de `src/lib/document-generator.ts`
- Produces: `DOCUMENT_GEN_TOOL` adicionada a `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`, handler em `executeTool`

- [ ] **Step 1: Declarar o schema `DOCUMENT_GEN_TOOL` e registrar nos arrays**
- [ ] **Step 2: Implementar despacho em `executeTool`**
Gera o Blob, cria a URL de download (`URL.createObjectURL`), e retorna JSON com `{ url, filename, type, sizeBytes, title }`.
- [ ] **Step 3: Atualizar o System Prompt com a nova diretriz**

---

### Task 3: Inclusão da Skill Nativa "Office & PDF Architect"

**Files:**
- Modify: `src/lib/storage.ts`

**Interfaces:**
- Consumes: Lista padrão de skills
- Produces: Nova skill padrão `doc-creator` no catálogo inicial

- [ ] **Step 1: Adicionar a skill "Office & PDF Architect" às `DEFAULT_SKILLS`**
Instruções para estruturação de tabelas limpas, escolha do formato correto e formatação profissional.

---

### Task 4: Card de Download Interativo no Chat (`src/components/chat-message.tsx`)

**Files:**
- Modify: `src/components/chat-message.tsx`

**Interfaces:**
- Consumes: Chamadas de ferramentas com nome `generate_document`
- Produces: Card visual com cores do tipo de arquivo, metadados de tamanho e botão de download nativo

- [ ] **Step 1: Adicionar tratamento de `generate_document` no estado running**
- [ ] **Step 2: Renderizar card de download estilizado no estado completed**
Botão de download com link para a Blob URL e ícone de download.

---

### Task 5: Validação Completa, Testes e Publicação Automática na Nuvem

**Files:**
- Test: `npx tsx --test src/lib/*.test.ts`
- Lint: `npm run lint`
- Build: `npm run build`
- Git: Commit e `git push origin main`

- [ ] **Step 1: Executar toda a suíte de testes unitários**
- [ ] **Step 2: Executar verificação de tipos (`tsc --noEmit`)**
- [ ] **Step 3: Executar build de produção do Vite**
- [ ] **Step 4: Commitar e fazer push automático para o GitHub na nuvem**
