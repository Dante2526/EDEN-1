# Ideias e Catálogo Recomendado de Servidores MCP para o Synap

Este documento reúne os servidores **Model Context Protocol (MCP)** mais estratégicos para integração com o Synap, divididos por utilidade, pacotes de referência e casos de uso práticos.

---

## 1. Banco de Dados e Persistência

### PostgreSQL / Supabase MCP
- **Pacote / Referência:** `@modelcontextprotocol/server-postgres`
- **Transporte recomendado:** HTTP / SSE
- **O que faz:** Inspeciona schemas, lista tabelas, lê constraints e executa queries SQL controladas (somente leitura ou análise estrutural).
- **Caso de uso no Synap:**
  - Diagnosticar falhas de migrations e índices ausentes.
  - Otimizar consultas lentas sugerindo `EXPLAIN ANALYZE`.
  - Gerar tipos TypeScript diretamente a partir do schema do banco em tempo real.

### SQLite MCP
- **Pacote / Referência:** `@modelcontextprotocol/server-sqlite`
- **O que faz:** Leitura e inspeção de bancos SQLite locais ou embarcados em stacks locais.
- **Caso de uso no Synap:** Inspecionar e validar dados de mock ou bancos de teste locais.

---

## 2. Front-End, Teste Visual e Navegação Web

### Puppeteer / Playwright MCP
- **Pacote / Referência:** `@modelcontextprotocol/server-puppeteer`
- **Transporte recomendado:** HTTP / SSE
- **O que faz:** Abre navegadores Chromium headless, tira screenshots de páginas web, interage com botões/inputs e inspeciona o DOM.
- **Caso de uso no Synap:**
  - Validação visual de componentes: tirar print do app rodando em `localhost:5173` para a IA auditar espaçamentos, contraste e responsividade.
  - E2E testing automatizado conversando no chat.

---

## 3. Documentação Atualizada e Pesquisa Técnica

### Context7 / Fetch Docs MCP
- **Pacote / Referência:** `@modelcontextprotocol/server-fetch`
- **O que faz:** Extrai documentações limpas em Markdown diretamente das URLs oficiais dos frameworks (React 19, Tailwind CSS, Vite, TanStack, etc.).
- **Caso de uso no Synap:**
  - Evitar alucinações de versões legadas de bibliotecas.
  - Fornecer à IA a documentação mais recente de SDKs e APIs recém-lançadas.

---

## 4. Design Systems e UI

### Figma MCP
- **Pacote / Referência:** Servidores comunitários Figma MCP (REST API Figma)
- **O que faz:** Consulta tokens de design, especificações de componentes, variáveis de cores e layouts vetoriais de arquivos Figma via token de acesso.
- **Caso de uso no Synap:**
  - Traduzir componentes do Figma diretamente para código React/CSS compatível com o design system do Synap.
  - Sincronizar tokens de cor e tipografia automaticamente.

---

## 5. DevOps, Containers e Monitoramento

### Docker MCP
- **Pacote / Referência:** Servidores MCP para Docker Engine
- **O que faz:** Lista containers ativos, inspeciona status de serviços, lê logs de execução e monitora consumo de recursos.
- **Caso de uso no Synap:**
  - Analisar logs de containers com erro sem sair da IDE.
  - Auxiliar na escrita de `docker-compose.yml` e Dockerfiles baseados no ambiente real.

### Sentry / Datadog MCP
- **Pacote / Referência:** Sentry MCP
- **O que faz:** Consulta issues ativas, stack traces de produção e contagem de eventos de erro.
- **Caso de uso no Synap:**
  - Solução orientada a incidentes: *"Analise o último erro 500 do Sentry e localize onde corrigir no código do repositório ativo."*

---

## Como Conectar no Synap:
1. Abra a aba **Skills** na barra lateral do Synap.
2. Selecione a sub-aba **Servidores MCP**.
3. Clique em **Conectar Servidor**.
4. Insira o nome, URL do endpoint MCP (ex: `http://localhost:3001/sse`) e chave de autenticação (se houver).
5. O Synap descobrirá automaticamente as ferramentas e as tornará acessíveis no chat principal.
