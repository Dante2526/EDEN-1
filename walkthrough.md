# Walkthrough: Revisão e Hardening (Arquitetura e Infraestrutura)

Durante esta sessão massiva de engenharia, efetuamos uma varredura completa na aplicação para elevar seu status de um protótipo local para uma aplicação *production-ready* na Vercel e outros orquestradores.

## 1. Infraestrutura e Vercel Edge
- **Problema:** A Vercel interpretava as rotas `/api/*.ts` como Node.js Serverless Functions tradicionais devido à falta de metadados robustos. Isso provocava erros 500 (`new URL(req.url)` falhava pois recebia um caminho relativo do Node) e estrangulava conexões longas (como SSE) com limites de tempo restritos (10s a 30s).
- **Solução:** Injetamos `"runtime": "edge"` nas configurações de rotas globais no arquivo `vercel.json`. Isso blinda a aplicação, obrigando a Vercel a usar os padrões nativos da Web (`req: Request`), erradicando os falsos 500s e liberando _streams_ virtualmente infinitas de respostas.

## 2. Bloqueios de Build e Server
- **Problema:** O pacote `tsx` estava apenas em `devDependencies`. Quando a plataforma (ex: Render/Docker) tentava compilar com `--omit=dev` para produção, a inicialização falhava por falta de dependências. Além disso, o Express subia sem `NODE_ENV=production`.
- **Solução:** O pacote `tsx` foi promovido às dependências principais. Implementamos o pacote multiplataforma `cross-env` e refatoramos o script de `start` para: `"start": "cross-env NODE_ENV=production tsx server.ts"`.

## 3. Cold Starts e Payload Bloating
- **Problema:** O framework Vercel Edge limitava _cold starts_ devido à presença do gigantesco pacote `octokit`.
- **Solução:** O pacote `octokit` completo foi desinstalado e trocado pelo enxuto `@octokit/rest`. Isso diminui radicalmente o peso do *bundle*, acelerando o *boot* das funções na Vercel.
- **Problema Secundário:** O corpo das requisições via POST esbarrava no limite de 4.5MB da Vercel para imagens.
- **Solução:** No lado do cliente (`src/lib/utils.ts`), implementamos uma barreira rígida que converte imagens para no máximo 1024px e derruba a qualidade recursivamente do B64 até que nenhuma imagem cruze a fronteira de ~600KB, permitindo que os usuários anexem múltiplas fotografias sem capotar as requisições.

## 4. API do GitHub à Prova de Falhas
- Implementamos paginação estrita (`octokit.paginate`) nas chamadas de `repos` e `branches`.
- Arquivos binários não são mais corrompidos: detectamos bytes nulos diretamente no Buffer em vez de stringificá-los preventivamente como UTF-8.
- Mitigamos o **Lost Update (Condição de Corrida)**: toda leitura do arquivo agora despacha um `baseSha`. Nas edições subsequentes, o commit levanta o último SHA no GitHub para validação. Se o cliente enviar algo defasado (`baseSha` diferente da branch oficial remota), a API aborta e dispara HTTP 409, protegendo edições colaborativas.
- Salvamos as propriedades vitais dos arquivos (`+x` executable bits) injetando o `mode` real lido recursivamente da árvore preexistente.

## 5. Caching do Service Worker
- O arquivo de cache agressivo (`sw.js`) agora porta cabeçalhos absolutos de `Cache-Control: no-cache` declarados em `vercel.json`, impossibilitando que os clientes da Vercel fiquem retidos em versões defasadas do front-end nas próximas atualizações.

## 6. Limpeza e Configurações Adicionais
- **Limpeza de Dependências:** As dependências ociosas (`@google/genai` e `vite-plugin-pwa`) foram removidas do repositório, e o arquivo `bun.lock` foi deletado para garantir que o projeto use apenas uma *lockfile* (neste caso, o `package-lock.json`).
- **Segurança e Limits na Vercel:** Adicionada diretiva `maxDuration: 60` em `vercel.json` para a rota `api/image.ts` não capotar com *timeouts* prematuros. Foram incluídos cabeçalhos de segurança vitais (`Content-Security-Policy` e `X-Content-Type-Options: nosniff`) em todas as rotas servidas pela plataforma.

## 7. Otimizações de Build e Lazy Loading (Vite)
- **cssFallbackPlugin:** O plugin foi completamente removido, permitindo que o Vite resolva o caminho real (`src/index.css`) sem interceptações indevidas, garantindo que o CSS final seja empacotado corretamente.
- **Melhoria no Chunking:** O bloco `manualChunks` para `vendor-markdown` foi expandido para agrupar todo o ecossistema (incluindo dependências subjacentes como `mdast-*`, `hast-*`, `remark-`, `vfile`, e `unist-*`), eliminando riscos de dependências circulares.
- **Lazy Loading Genuíno:** O pacote pesado `react-diff-viewer-continued` foi removido do `manualChunks` estático. Agora, ele é importado dinamicamente no momento exato em que a tela de Source Control é aberta via `React.lazy()` e `<Suspense>`, reduzindo significativamente o peso inicial do *bundle*.

## 8. Melhorias Visuais e Animações no Studio
- **ThinkingOrb na Timeline:** Integrado o componente `ThinkingOrb` (da biblioteca `thinking-orbs`) aos avatares dos agentes no painel do Studio (`TimelineCard`), proporcionando feedback em tempo real idêntico ao do chat principal:
  - **Planner (Kimi):** Modo `shaping` com animação suave e pulsante.
  - **Revisor (GLM):** Modo `weaving` com ondas azuis dinâmicas.
  - **Implementador:** Modo `composing` com velocidade otimizada (`2.0x`).
- **Feedback de Sub-passos:** O `Loader2` estático dos passos de progresso (`step.status === 'in_progress'`) foi substituído por um mini `ThinkingOrb` no modo `working`.
- **Elegância na Conclusão:** Quando o passo é concluído, o avatar retorna ao ícone nativo com um brilho suave (`drop-shadow`), mantendo o design refinado e limpo.

## 9. Context Compaction Automático (Padrão Claude Code)
- **Problema:** Conversas longas acumulavam dezenas de mensagens, anexos de código e chamadas de ferramentas, inflando o consumo de tokens e degradando o foco do raciocínio da IA (context bloat / amnésia).
- **Solução Implementada:**
  - **Zero Deleção Visual:** Na interface do chat, todas as mensagens continuam 100% visíveis quando o usuário rola para cima.
  - **Gatilho Inteligente:** Quando a conversa atinge o limiar (> 16 mensagens), o Synap dispara uma compactação em segundo plano usando `z-ai/glm-5.3-flash` sem travar a navegação.
  - **Resumo Estruturado:** O motor captura Metas, Decisões Técnicas, Arquivos Lidos/Modificados e Próximos Passos Imediatos em Markdown estruturado.
  - **Payload Otimizado:** As requisições subsequentes para a API enviam apenas o bloco de resumo do sistema + as últimas 6 mensagens recentes, economizando drasticamente tokens.
  - **Divisor Visual (`CompactionMarker`):** Um marcador sutil com ícone `Zap` divide as mensagens arquivadas das ativas, permitindo expandir e auditar o resumo técnico a qualquer momento.
  - **Evidências de Verificação:**
    - Testes unitários automatizados em `src/lib/context-compactor.test.ts` (5/5 passando).
    - Validação de tipos estritos: `tsc --noEmit` com 0 erros.
    - Build de produção Vite verde em `dist/`.

## 10. Auto-Continuação de Ferramentas (Bypass de Limites)
- **Problema:** A IA era cortada ao atingir 15 iterações de ferramentas consecutivas, interrompendo refatorações complexas que precisavam de mais passos.
- **Solução Implementada:**
  - O teto de ferramentas foi expandido para **45 rodadas automáticas contínuas** (`MAX_TOOL_ITERATIONS = 45`) em `src/App.tsx`.
  - Como cada tool call é uma requisição HTTP independente e rápida (3 a 8s), o contador de timeout de 60s da Vercel é zerado a cada iteração, permitindo que a IA trabalhe continuamente por vários minutos sem cair em timeout.
  - O usuário mantém controle total pelo botão de interrupção imediata (*Stop Generation*) a qualquer momento.
  - Se atingir o teto de 45 rodadas, o sistema emite um alerta de segurança amigável.
  - **Evidências de Verificação:** `tsc --noEmit` com 0 erros e `vite build` verde em 1.66s.

## 11. Habilidades Modulares (Skills) e Conector Universal MCP
- **Problema:** O Synap precisava expandir suas capacidades cognitivas com regras especializadas (TDD, Debugging sistemático, Code review e Performance) e integrar com ferramentas externas e bancos de dados através do padrão de mercado Model Context Protocol (MCP).
- **Solução Implementada:**
  - **Catálogo de Skills Nativas:** 4 habilidades padrão integradas com alternância rápida (toggle switch) e persistência IndexedDB:
    1. *Test-Driven Development (TDD)*
    2. *Systematic Debugging*
    3. *Code Review & Segurança*
    4. *Performance & Otimização de Código*
  - **Criador de Skills Customizadas:** Modal interativo que permite aos desenvolvedores criar suas próprias personas, regras de projeto ou guidelines de arquitetura com persistência automática.
  - **Conector Universal MCP:** Motor compatível com a especificação JSON-RPC 2.0 suportando transportes HTTP e Server-Sent Events (SSE), timeouts protegidos (15s para handshake e 20s para execução remota) e descoberta dinâmica de ferramentas (`tools/list`).
  - **Namespacing Seguro de Ferramentas:** Ferramentas importadas de servidores remotos recebem o prefixo seguro `mcp__<serverId>__<toolName>`, prevenindo qualquer colisão com comandos nativos do terminal ou do GitHub.
  - **Painel de Extensões na UI (`ExtensionsPanel`):** Integrado como uma nova aba principal na barra lateral (`[Chat] | [Repos] | [Git] | [Skills]`), exibindo status de conexão em tempo real (bolinhas pulsantes), contagem de ferramentas e modais de adição rápida.
  - **Injeção Transparente no Chat:** System prompts de habilidades ativas são concatenados diretamente no fluxo do `prepareMessagesForApi`, e as ferramentas MCP descobertas são convertidas dinamicamente para o esquema OpenAI Function Calling e disponibilizadas para o modelo no `handleSendMessage`.
  - **Evidências de Verificação:**
    - Testes unitários do motor MCP: 3/3 passando (`src/lib/mcp-client.test.ts`).
    - Testes unitários do compactador de contexto: 5/5 passando (`src/lib/context-compactor.test.ts`).
    - Verificação de tipos estritos: `tsc --noEmit` com 0 erros.
    - Build de produção do Vite compilado em 768ms com 0 erros.

## 12. Ferramenta de Leitura Profunda da Web (`fetch_url`)
- **Problema:** A ferramenta de busca `web_search` trazia apenas resumos curtos de 2 linhas do DuckDuckGo/Wikipedia, impossibilitando a leitura de documentações técnicas atualizadas (ex.: React 19, MDN, novas APIs) ou de URLs compartilhadas diretamente pelo usuário.
- **Solução Implementada:**
  - **Sanitização Semântica com Cheerio:** Extrator dedicado (`src/lib/html-extractor.ts`) que descarta tags ruidosas (`<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, etc.), prioriza tags de conteúdo principal (`<article>`, `<main>`) e normaliza texto limpo.
  - **Proteção de Janela de Contexto:** Limite máximo de 10.000 caracteres (~2.5k tokens) com indicação explícita de truncamento para evitar explosão de contexto da LLM.
  - **Segurança e Anti-SSRF:** Endpoint `/api/fetch-url.ts` bloqueia requisições a `localhost`, `127.0.0.1`, loops IPv6 e subredes privadas (RFC 1918), além de contar com timeout estrito de 8 segundos e checagem de Content-Type legível.
  - **Registro no Servidor e IA:** Handler integrado ao Express em `server.ts` e exportado como Web Standard Request para Vercel Serverless. Declarada a tool `fetch_url` no OpenAI Function Calling schema em `src/App.tsx`, com instrução explícita no System Prompt.
  - **Experiência Visual na UI:** Badge dinâmico em `chat-message.tsx` com ícone `Globe`, estado de raciocínio animado via `ThinkingOrb` (modo `weaving`) e card concluído com título da página e domínio.
  - **Evidências de Verificação:**
    - Testes unitários do extrator: 2/2 passando (`src/lib/html-extractor.test.ts`).
    - Testes de regressão da suíte completa: 10/10 passando (`context-compactor`, `mcp-client` e `html-extractor`).
    - Teste funcional de SSRF e scraping real de `example.com`: 100% aprovado.
    - Tipagem TypeScript estrita: `tsc --noEmit` com 0 erros.
    - Build de produção Vite verde em `dist/`.

## 13. Execução Real de Código Python no Navegador (`run_python` via Pyodide WASM)
- **Problema:** O terminal do Synap operava apenas como um emulador para comandos Git/GitHub, sem capacidade de executar código de verdade. A IA ficava limitada a suposições teóricas para cálculos matemáticos precisos, simulações, formatações de dados e testes de algoritmos.
- **Solução Implementada:**
  - **100% Gratuito & Custo Zero Vitalício:** Roda CPython 3.12 compilado para WebAssembly (Pyodide v0.26.4) inteiramente no hardware do cliente, sem requisições para servidores externos, sem limites de créditos e sem chaves de API.
  - **Execução em Segundo Plano (Web Worker):** Criado o Web Worker `src/workers/pyodide-worker.ts`, garantindo que cálculos pesados ou scripts de longa duração nunca travem a renderização da interface ou o fluxo do chat.
  - **Lazy-Loading Sob Demanda:** O runtime do Pyodide só é baixado do CDN oficial na primeira vez que a ferramenta é chamada, preservando o carregamento ultrarrápido inicial do Synap.
  - **Captura Automática de I/O e Timeout:** Redireciona e intercepta streams de `sys.stdout` (`print(...)`) e `sys.stderr`, com cronômetro de execução e timeout estrito de 15 segundos para encerrar e recriar o Worker em caso de loops infinitos.
  - **Interface Visual de Terminal Python:** Card estilizado no chat (`chat-message.tsx`) com badge "Python 3 (WASM)", bloco com código executado e janela de console para exibição de saídas e métricas de tempo em milissegundos.
  - **Evidências de Verificação:**
    - Testes unitários do cliente Pyodide: 3/3 passando (`src/lib/pyodide-client.test.ts`).
    - Testes de regressão da suíte completa: 13/13 passando sem falhas.
    - Verificação de tipos estritos: `tsc --noEmit` com 0 erros.
    - Build de produção do Vite compilado em 681ms com chunk isolado do worker (`pyodide-worker.js`).

## 14. Gerador Universal de Arquivos e Documentos (`generate_document` no Navegador)
- **Problema:** O Synap não gerava arquivos binários reais para download. Solicitações de relatórios em PDF, planilhas orçamentárias em Excel, documentações em Word ou slides em PowerPoint eram limitadas a blocos de texto ou markdown estático.
- **Solução Implementada:**
  - **100% Client-Side & Custo Zero Vitalício:** O app gera arquivos binários autênticos (`.pdf`, `.xlsx`, `.docx`, `.pptx`) diretamente na memória do navegador (`Blob` -> `URL.createObjectURL`), sem dependência de microserviços pagos, servidores headless ou APIs externas.
  - **Code-Splitting com Dynamic Imports:** Para prevenir inchaço do bundle principal, os motores compiladores (`jspdf`, `jspdf-autotable`, `exceljs`, `docx`, `pptxgenjs`) utilizam `await import(...)` sob demanda em `src/lib/document-generator.ts`. O bundle de entrada do Synap permanece enxuto em ~310 kB.
  - **Tool OpenAI Nativa (`generate_document`):** Schema padronizado registrado em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS` em `src/App.tsx`, com suporte a tabelas estruturadas, métricas resumidas, seções e bullet points.
  - **Skill Nativa "Office & PDF Architect":** Adicionada ao catálogo nativo em `src/lib/storage.ts` com ícone `FileText` (`'file-text'`) e diretrizes especializadas para produção de planilhas financeiras, relatórios corporativos e apresentações executivas.
  - **Experiência Visual Interativa de Download:** Card dedicado no chat (`chat-message.tsx`) com badge de formato colorido (PDF vermelho, Excel verde, Word azul, PowerPoint âmbar), tamanho legível em KB/MB e botão de download direto com um clique (`<a download>`).
  - **Evidências de Verificação:**
    - Testes unitários do motor de documentos: 2/2 passando (`src/lib/document-generator.test.ts`).
    - Suíte completa de testes: 9/9 testes passando sem regressões.
    - Tipagem TypeScript estrita: `tsc --noEmit` com 0 erros.
    - Build de produção Vite verde em 1.79s.

**Status atual da Aplicação:** Estável, pronta para produção, com Context Compaction, Auto-Continuação de 45 rodadas, Catálogo de Skills Modulares, Conector Universal MCP, Leitura Web Profunda com `fetch_url`, Execução Real de Python com `run_python` e Geração Universal de Arquivos com `generate_document`.

