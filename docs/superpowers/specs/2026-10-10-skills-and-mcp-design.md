# Especificação de Design: Sistema Unificado de Skills & MCP (Synap)

**Data:** 10/10/2026  
**Status:** Aprovado  
**Tipo:** Nova Feature Arquitetural / Extensibilidade e Protocolo MCP  

---

## 1. Visão Geral
Esta especificação introduz suporte nativo a **Habilidades Modulares (Skills)** e ao protocolo aberto **Model Context Protocol (MCP)** no Synap.
- **Skills:** Comportamentos especializados e prompts comportamentais rigorosos (TDD, Debugging Sistemático, Auditoria de Código, Performance) que podem ser ativados individualmente ou criados pelo usuário.
- **MCP (Model Context Protocol):** Conexão com servidores MCP externos via SSE/HTTP (JSON-RPC), descobrindo ferramentas dinamicamente e permitindo que a IA interaja com bancos de dados, serviços na nuvem e ferramentas corporativas.

---

## 2. Princípios de Design
1. **Extensibilidade Sem Fricção:** Acesso direto na barra lateral (`Sidebar Tab: 'skills'`), sem telas escondidas.
2. **Built-in First:** Catálogo nativo já vem com 4 habilidades essenciais de engenharia de software prontas para uso.
3. **Padrão Oficial MCP:** Comunicação aderente à especificação JSON-RPC do Model Context Protocol (`tools/list` e `tools/call`).
4. **Isolamento e Controle:** O usuário pode ativar, desativar, testar conexões e remover servidores/skills com feedback visual claro de status.
5. **Persistência Local (Cloud-Ready):** Armazenamento estruturado no IndexedDB (`idb-keyval`).

---

## 3. Modelo de Dados (`src/lib/types.ts`)

```typescript
export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: 'flask' | 'bug' | 'shield' | 'zap' | 'sparkles';
  systemPrompt: string;
  enabled: boolean;
  isBuiltin?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: 'sse' | 'http';
  apiKey?: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  errorMessage?: string;
  tools: McpTool[];
  lastConnectedAt?: number;
}
```

---

## 4. Habilidades Nativas (Built-in Skills)

1. **Test-Driven Development (TDD):**
   - Regra estrita: escrever o teste unitário/integração antes da implementação (ciclo RED ➔ GREEN ➔ REFACTOR).
2. **Systematic Debugging:**
   - Proíbe tentativas e erros. Obriga formulação de hipóteses, inspeção de logs, isolamento e validação de causa raiz.
3. **Code Review & Security Audit:**
   - Analisa vulnerabilidades OWASP, tipagem estrita no TypeScript, edge-cases de concorrência e conformidade arquitetural.
4. **Performance & Optimization:**
   - Otimiza carregamento tardio (lazy loading), divide chunks, minimiza renderizações React desnecessárias e previne gargalos de I/O.

---

## 5. Motor de Cliente MCP (`src/lib/mcp-client.ts`)

1. **Descoberta de Ferramentas (`tools/list`):**
   - Envia requisição JSON-RPC `tools/list` para o endpoint MCP.
   - Normaliza os esquemas de ferramentas para o formato esperado pelo provedor de chat (OpenAI/NVIDIA function calling).
2. **Execução de Ferramentas (`tools/call`):**
   - Ao receber uma chamada de ferramenta identificada como pertencente a um servidor MCP, dispara `tools/call` com `{ name, arguments }`.
   - Formata a resposta (conteúdo textual ou JSON) e a devolve no fluxo de streaming do chat.

---

## 6. Interface do Usuário (UI)

1. **Aba na Sidebar:** Quarto botão na barra de navegação da `ChatSidebar`:
   - `[Chat] | [Repos] | [Git] | [Skills]`
2. **Painel de Extensões (`src/components/extensions/extensions-panel.tsx`):**
   - Sub-abas: **Habilidades** (Catálogo + Criar) e **Servidores MCP** (Conexões + Ferramentas ativas).
   - Card com switches on/off para ativação rápida.
   - Status visual (indicador verde pulsante para servidores conectados, amarelo para conectando, vermelho para erro).
   - Modal para cadastro de novo servidor MCP com validação e botão de "Testar Conexão".

---

## 7. Integração no Fluxo de Chat (`src/App.tsx`)

1. **Injeção de Prompts:** `prepareMessagesForApi` recebe as diretivas de todas as skills ativadas e as injeta no bloco de prompts de sistema.
2. **Exposição de Tools:** As ferramentas dos servidores MCP conectados e habilitados são mescladas com `ALL_CHAT_TOOLS`.
3. **Despacho Dinâmico:** No loop de `executeGitHubTool`, se a ferramenta for de um servidor MCP, é despachada via `mcpClient.callTool()`.

---

## 8. Critérios de Aceite
1. Tipos `Skill` e `McpServer` validados em `src/lib/types.ts`.
2. Persistência em `src/lib/storage.ts` com funções `loadSkills`, `saveSkills`, `loadMcpServers`, `saveMcpServers`.
3. Módulo `src/lib/mcp-client.ts` com testes e tratamento resiliente de erros e timeouts.
4. Painel de extensões integrado na `ChatSidebar` com suporte a alternância fluida entre tabs.
5. Injeção funcional das skills e ferramentas MCP no loop de geração do chat.
6. `npm run lint` e `npm run build` executando com zero erros.
