# Especificação de Design: Base de Conhecimento e Memória Persistente (Knowledge Base)

- **Data:** 2026-10-11
- **Status:** Proposto / Em Validação
- **Objetivo:** Permitir que o Synap retenha informações cruciais sobre o usuário, stack técnica e preferências entre diferentes conversas a custo R$ 0,00, operando 100% no cliente com persistência IndexedDB.

---

## 1. Visão Geral da Arquitetura

O Synap opera hoje com conversas isoladas. Ao iniciar um novo chat, a IA perde contexto sobre regras do projeto (ex.: "uso Vercel Hobby", "Tailwind v4", "prefiro respostas em pt-BR").

A solução implementa o padrão **Autonomous Long-Term Memory**:
1. **Armazenamento:** Fatos estruturados armazenados no IndexedDB do navegador (`synap_knowledge_base_v1`).
2. **Aprendizado Ativo (Tools):** A IA possui as ferramentas `save_memory` e `forget_memory` para salvar ou remover fatos autonomamente durante as conversas.
3. **Injeção Transparente:** Em qualquer conversa (atual ou futura), os fatos são compilados e injetados no cabeçalho do System Prompt.
4. **Governança & Controle:** O usuário possui uma interface dedicada no painel lateral de Extensões para auditar, adicionar manualmente ou apagar memórias com um único clique.

---

## 2. Modelo de Dados (`src/lib/types.ts`)

```typescript
export interface KnowledgeFact {
  id: string;
  fact: string;
  category?: 'stack' | 'preference' | 'rule' | 'general';
  createdAt: number;
  updatedAt?: number;
}
```

---

## 3. Persistência Local (`src/lib/storage.ts`)

- Chave IndexedDB: `synap_knowledge_base_v1` (usando `idb-keyval`).
- Métodos exportados:
  - `loadKnowledgeFacts(): Promise<KnowledgeFact[]>`: Carrega todos os fatos gravados.
  - `saveKnowledgeFacts(facts: KnowledgeFact[]): Promise<void>`: Persiste a lista completa.
  - `addKnowledgeFact(fact: string, category?: KnowledgeFact['category']): Promise<KnowledgeFact>`: Cria um novo fato com ID único.
  - `deleteKnowledgeFact(id: string): Promise<void>`: Remove um fato pelo identificador.

---

## 4. Ferramentas da IA (OpenAI Function Calling)

Registradas em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS` em `src/App.tsx`:

### `save_memory`
- **Descrição:** Salva um fato duradouro, preferência pessoal ou detalhe técnico do projeto na Base de Conhecimento permanente para lembrar em conversas futuras.
- **Parâmetros:**
  - `fact` (string, obrigatório): A afirmação clara e atemporal a ser lembrada.
  - `category` (string, enum: `'stack' | 'preference' | 'rule' | 'general'`, opcional): Classificação do fato.

### `forget_memory`
- **Descrição:** Remove um fato desatualizado ou revogado da memória permanente.
- **Parâmetros:**
  - `factId` (string, opcional): ID da memória a ser removida.
  - `query` (string, opcional): Termo de busca para encontrar o fato a ser removido.

---

## 5. Injeção no System Prompt (`src/lib/context-compactor.ts` & `src/App.tsx`)

Na função `prepareMessagesForApi`:
```typescript
if (systemPrompts.memories) {
  finalMessages.push({
    role: 'system',
    content: systemPrompts.memories
  });
}
```

Formato do bloco injetado:
```markdown
--- BASE DE CONHECIMENTO PERSISTENTE (MEMÓRIA DE LONGO PRAZO) ---
Estes são fatos permanentes que você aprendeu em conversas com o usuário. Respeite-os em todas as respostas:
- [ID: mem_1] O usuário hospeda o projeto na Vercel no plano Hobby.
- [ID: mem_2] O projeto utiliza Tailwind CSS v4.
- [ID: mem_3] O usuário prefere comunicação direta no estilo ADHD (sem enrolação, máx 5 itens).
Quando o usuário informar novas preferências duradouras ou regras de projeto, use a ferramenta `save_memory`.
Quando uma informação for explicitamente revogada, use a ferramenta `forget_memory`.
```

---

## 6. Interface do Usuário (UI)

### Painel de Gestão (`src/components/extensions/extensions-panel.tsx`):
- Adicionada uma aba de navegação interna: `[Habilidades] | [Servidores MCP] | [Memória (N)]`.
- Na aba **Memória**:
  - Lista visual dos fatos com badges de categoria (`Stack`, `Regra`, `Preferência`).
  - Campo de adição rápida manual para o usuário digitar um fato diretamente.
  - Botão de lixeira individual para apagar uma memória.
  - Botão de "Limpar Memória" para zerar o banco de fatos se desejado.

### Feedback no Chat (`src/components/chat-message.tsx`):
- Quando a IA invoca `save_memory`, exibe um card compacto e elegante com ícone de cérebro (`Brain`):
  *"🧠 Memória aprendida: [fato]"*

---

## 7. Estratégia de Testes Automatizados (TDD)

- Criar `src/lib/knowledge-base.test.ts`:
  1. Formatação do bloco de system prompt com memórias ativas.
  2. Adição e remoção de fatos com sanitização e IDs únicos.
  3. Comportamento quando a memória está vazia (não polui o prompt).
