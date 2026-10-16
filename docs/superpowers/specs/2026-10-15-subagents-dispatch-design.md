# Design: Motor de Subagentes Nativos e Orquestração Paralela no Synap

**Data:** 15 de Outubro de 2026  
**Status:** Aprovado para Planejamento  
**Objetivo:** Permitir que o modelo de IA ativo selecionado pelo usuário (ex: Google Gemma 4 31B, GLM 5.3, etc.) atue como coordenador autônomo, disparando instâncias de subagentes especializados em segundo plano para resolver subtarefas complexas em paralelo, consolidando o resultado final de forma transparente.

---

## 1. Arquitetura e Fluxo

```
[ Usuário ] ---> Mensagem no Chat
                      |
                      v
             [ Modelo Ativo (ex: Google Gemma 4 31B) ]
                      |
                      +---> Chama Tool: dispatch_subagent(role, task, context)
                      |         |
                      |         +---> [ Subagente 1: Pesquisa Context7 ] 
                      |         |         | (chama query-docs, sintetiza)
                      |         |         v
                      |         +---> [ Subagente 2: Análise de Código ]
                      |         |         | (lê arquivos, avalia regras)
                      |         |         v
                      |         +---> Retorna relatórios para o Modelo Ativo
                      v
             [ Modelo Ativo ] Consolida e responde ao usuário
```

### Princípios Chave:
1. **100% Gratuito & Mesma Stack:** Utiliza a mesma infraestrutura de chat e a mesma chave de API configurada no Synap (`/api/chat`), sem custos extras nem serviços externos pagos.
2. **Mesmo Modelo Ativo:** O subagente herda o modelo atualmente selecionado pelo usuário (ou modelo rápido equivalente se configurado), garantindo coerência total.
3. **Isolamento de Contexto:** Cada subagente recebe um prompt focado na sua tarefa específica, sem o inchaço de todo o histórico do chat principal.
4. **Capacidade com Ferramentas:** O subagente tem permissão para usar ferramentas de leitura (`mcp__context7__query-docs`, `fetch_url`, `read_file`, `search_code`, `run_python`).
5. **Transparência Visual:** O usuário vê em tempo real no chat os mini-cartões com avatar, papel, tarefa e status de cada subagente em execução.

---

## 2. Tool Schema: `dispatch_subagent`

Registrada em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`:

```json
{
  "type": "function",
  "function": {
    "name": "dispatch_subagent",
    "description": "Dispara um subagente autônomo especializado para executar uma subtarefa em segundo plano e retornar um relatório sintetizado. Use para dividir problemas complexos (ex: pesquisar documentações técnicas, auditar trechos de código, analisar arquivos ou realizar cálculos).",
    "parameters": {
      "type": "object",
      "properties": {
        "role": {
          "type": "string",
          "description": "Papel do subagente (ex: 'Pesquisador de Docs', 'Auditor de Segurança', 'Arquiteto de Banco', 'Revisor de Código')."
        },
        "task": {
          "type": "string",
          "description": "Instrução clara e objetiva do que o subagente deve investigar, analisar ou resolver."
        },
        "context": {
          "type": "string",
          "description": "Dados, trechos de código ou contexto específico necessário para o subagente cumprir a tarefa."
        }
      },
      "required": ["role", "task"]
    }
  }
}
```

---

## 3. Motor de Execução: `src/lib/subagent-runner.ts`

- **Função Principal:** `runSubagent(config: SubagentConfig): Promise<SubagentResult>`
- **Configuração:**
  - `role`: string
  - `task`: string
  - `context`?: string
  - `model`: ModelId (modelo ativo selecionado no app)
  - `apiKeySecret`: string
  - `tools`?: any[] (ferramentas de leitura permitidas: Context7, fetch_url, python, leitura de arquivo)
  - `signal`?: AbortSignal
- **System Prompt do Subagente:**
  Instrui o subagente a ser direto, focado exclusivamente na tarefa dada, usar as ferramentas se necessário e devolver uma resposta concisa e estruturada em Markdown para o modelo principal.
- **Ciclo de Execução:** Loop enxuto de até 3 iterações de ferramentas para prevenir loops infinitos em subagentes.

---

## 4. Interface Visual: `chat-message.tsx`

- Adicionado badge dinâmico e card expansível:
  - **Em Execução:** Mini-cartão com `ThinkingOrb` no modo `weaving`, badge com o nome do papel (ex: `Pesquisador`) e a tarefa em andamento.
  - **Concluído:** Ícone de `Bot` ou `Sparkles`, badge verde `Subagente Concluído`, tempo decorrido e botão *"Ver Relatório"* para expandir o conteúdo retornado.
  - **Falha:** Alerta discreto em carmim caso haja timeout ou erro de rede.

---

## 5. Skill Nativa: `subagent-orchestrator`

Adicionada ao catálogo padrão em `src/lib/storage.ts`:
- **ID:** `subagent-orchestrator`
- **Nome:** "Orquestrador de Subagentes"
- **Ícone:** `Bot` (`'bot'`)
- **System Prompt:**
  Orienta a IA principal sobre quando e como particionar problemas complexos, encorajando o disparo de até 3 subagentes paralelos antes de formular a resposta definitiva ao usuário.

---

## 6. Plano de Testes & Verificação

1. **Testes Unitários:** `src/lib/subagent-runner.test.ts`
   - Teste de montagem de prompt do subagente com papel e contexto.
   - Teste de execução com mock de resposta.
   - Teste de captura de erros e timeouts.
2. **Verificação de Tipos:** `npm run lint` (`tsc --noEmit`).
3. **Regressão Completa:** `npm test` (25+ testes passando).
4. **Compilação de Produção:** `npm run build`.
