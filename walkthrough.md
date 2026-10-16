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

## 15. Base de Conhecimento e Memória Persistente entre Conversas (`save_memory` e `forget_memory`)
- **Problema:** Cada conversa no Synap operava de forma 100% isolada. Informações repetidas pelo usuário (ex.: plano da Vercel, versões de libs como Tailwind v4, diretrizes pessoais de comunicação ADHD) precisavam ser reditadas em cada novo chat.
- **Solução Implementada:**
  - **100% Client-Side & Custo Zero Vitalício:** Memória persistida no IndexedDB local do navegador (`synap_knowledge_base_v1`) sem servidor externo, sem custos de API de banco de dados e com privacidade integral no dispositivo.
  - **Aprendizado Autônomo da IA:** Registradas as ferramentas `save_memory` e `forget_memory` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`. A IA extrai e salva fatos atemporais autonomamente no decorrer da interação.
  - **Injeção Transparente em Todo Chat:** O motor de montagem de contexto (`prepareMessagesForApi` em `context-compactor.ts`) injeta o bloco estruturado `--- BASE DE CONHECIMENTO PERSISTENTE (MEMÓRIA DE LONGO PRAZO) ---` no topo do System Prompt em todas as conversas ativas ou futuras.
  - **Painel de Gestão e Auditoria:** Nova sub-aba *"Memória"* no painel lateral de Extensões com contador em tempo real, badges por categoria (`Stack`, `Preferência`, `Regra`, `Geral`), formulário para cadastro manual rápido e exclusão individual ou em massa.
  - **Feedback Visual no Chat:** Cards estilizados no histórico com ícone de cérebro (`Brain`), indicação da categoria do fato e badge verde de confirmação `Salvo`.
  - **Evidências de Verificação:**
    - Testes unitários do motor de memória: 5/5 passando (`src/lib/knowledge-base.test.ts`).
    - Testes unitários do compactador com memórias: 6/6 passando (`src/lib/context-compactor.test.ts`).
    - Suíte completa de testes: 14/14 testes passando (100% verde).
    - Verificação de tipos estritos: `tsc --noEmit` com 0 erros.
    - Build de produção Vite verde em 2.61s.

## 16. Habilidade Nativa: Conventional Commits (`conventional-commits`)
- **Problema:** A IA gerava mensagens de commit em formatos arbitrários ou sem padronização ao rodar comandos no terminal ou sugerir commits.
- **Solução Implementada:**
  - **Skill Built-in Nativa:** Adicionada ao catálogo padrão em `src/lib/storage.ts` com ID `conventional-commits` e ícone `GitCommit` (`git-commit`).
  - **Diretrizes Estritas:** Exige estrutura `<tipo>(<escopo>): <descrição no imperativo>`, restringe tipos permitidos (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`), limita o assunto a 72 caracteres e proíbe mensagens genéricas ("update", "changes", etc.).
  - **Auto-merge com IndexedDB:** O carregador de habilidades (`loadSkills`) funde automaticamente a nova skill para usuários existentes sem sobrescrever preferências prévias.
  - **Evidências de Verificação:**
    - 14/14 testes unitários passando.
    - Tipagem TypeScript estrita: `tsc --noEmit` com 0 erros.
    - Build de produção do Vite compilado em 1.49s.

## 17. Habilidade Nativa: Mobile-First Design & UX (`mobile-first`)
- **Problema:** Ao sugerir componentes visuais, telas ou estilização CSS/Tailwind, a IA muitas vezes pensava prioritariamente em telas desktop, gerando botões pequenos para toque, tabelas cortadas e scroll horizontal indesejado em celulares.
- **Solução Implementada:**
  - **Skill Built-in Nativa:** Adicionada em `src/lib/storage.ts` com ID `mobile-first` e ícone `Smartphone` (`smartphone`).
  - **Diretrizes Estritas:**
    - Teste de viewport base: 360px a 430px.
    - Touch targets mínimos de 44x44px e padding de clique ergonômico.
    - Prevenção total de scroll horizontal (`overflow-x: hidden`, quebras `break-words`/`truncate`, `min-w-0`).
    - Tailwind mobile-first por padrão (ex: `flex-col sm:flex-row`, `w-full sm:w-auto`).
  - **Evidências de Verificação:**
    - 14/14 testes unitários passando.
    - Tipagem TypeScript estrita: `tsc --noEmit` com 0 erros.
    - Build de produção do Vite compilado em 1.73s.

## 18. Habilidade Nativa: Vercel Edge Awareness (`vercel-edge`)
- **Problema:** A IA sugeria código incompatível com a Vercel Hobby (uso de `fs`/Node nativo no Edge, operações longas sem streaming, payloads acima de 4.5MB, bundles pesados), causando erros 500 e timeouts já vividos no projeto.
- **Solução Implementada:**
  - **Skill Built-in Nativa:** ID `vercel-edge`, ícone `Cloud`, ativada por padrão em `src/lib/storage.ts`.
  - **Diretrizes:** Edge Runtime com Web Standard APIs apenas; timeouts (10–60s) com streaming SSE; limite de payload ~4.5MB; bundles enxutos e imports dinâmicos; filesystem efêmero; segredos nunca no bundle (`VITE_*` só para valores públicos).
  - **Evidências de Verificação:** 14/14 testes passando, `tsc --noEmit` com 0 erros, build Vite verde em 1.71s.

**Status atual da Aplicação:** Estável, pronta para produção, com Context Compaction, Auto-Continuação de 45 rodadas, Catálogo de 8 Skills Nativas (incluindo Vercel Edge Awareness, Mobile-First, Conventional Commits e Office Architect), Conector Universal MCP, Leitura Web Profunda com `fetch_url`, Execução Real de Python com `run_python`, Geração Universal de Arquivos com `generate_document` e Base de Conhecimento Persistente com `save_memory`/`forget_memory`.





## 19. Tema Claro/Escuro Funcional
- **Problema:** a classe `.dark` alternava, mas ~760 cores hex fixas nunca reagiam (0 usos de `dark:`).
- **Solução:** codemod `scripts/migrate-theme.mjs` troca os hex por variáveis CSS (`src/theme-vars.generated.css`: claro neutro/branco, escuro igual ao anterior). Escalas slate/zinc invertidas no claro; scrollbar, seleção, body e `text-white` adaptados. Terminal e code-block permanecem escuros nos dois temas.
- **FOUC:** script inline em `index.html` aplica o tema salvo antes do React; `applyTheme` atualiza `color-scheme` e `theme-color`.
- **UI:** botão Sol/Lua movido do header para o rodapé da sidebar, ao lado de Configurações.
- **Evidências:** `tsc --noEmit` 0 erros, `npm test` verde, `vite build` ok. Verificação visual no navegador ainda pendente (feita pelo usuário).

## 20. Transcrição por Voz em Tempo Real sem Popup Flutuante
- **Problema:** O microfone exibia uma barra/popup flutuante invasiva sobre o chat e sofria com atraso superior a 15 segundos antes de transcrever a fala.
- **Causa Raiz:** O componente realizava uma chamada prévia a `navigator.mediaDevices.getUserMedia` encerrando as faixas de áudio imediatamente (`track.stop()`), o que prendia o hardware de áudio no SO antes de instanciar a API nativa `SpeechRecognition`. Além disso, havia um popup flutuante redundante na interface.
- **Solução:**
  - **Eliminação do Popup:** Removido o card flutuante. O feedback visual ocorre diretamente no botão de microfone (anel pulsante e realce).
  - **Zero Delay (Tempo Real):** Removido o pré-aquecimento bloqueante de áudio. A SpeechRecognition inicia imediatamente.
  - **Transcrição Direta no Input:** O texto reconhecido é inserido continuamente no textarea em tempo real sem latência.
- **Evidências:**
## 21. Blindagem de Raciocínio na Cloudflare e Prevenção de Falsas Execuções
- **Problema:** A IA cortava o raciocínio no meio em modelos de pensamento (DeepSeek R1 na Cloudflare) e dizia que ia alterar arquivos ou executar comandos sem disparar as ferramentas.
- **Causas Raízes:**
  1. Teto de tokens cravado em 4.096 no Cloudflare Workers AI, estourando durante o `<think>`.
  2. Ferramentas desativadas (`modelSupportsTools = false`) para a Cloudflare e ausência de repositório vinculado nos chats.
  3. Falsos positivos no Implementer do Studio (`studio-engine.ts`), que considerava texto explicativo como sucesso sem chamar `edit_file`.
  4. Reconhecimento de voz (`voice-button.tsx`) travando no `onend` por reutilização da mesma instância SpeechRecognition (`InvalidStateError`).
  5. Rota SPA do Cloudflare Pages retornando `index.html` para assets estáticos faltantes com extensão (.js, .css).
- **Solução Implementada:**
  - **Expansão de Tokens:** `max_tokens` na Cloudflare ampliado para até 8.192/12.288 para permitir conclusão integral do raciocínio.
  - **Diretriz Anti-Preâmbulo & Modo Consulta:** O System Prompt agora exige execução imediata de `tool_call` quando houver ferramentas e impede promessas vazias quando não houver repositório ativo.
  - **Auto-Continuação durante Raciocínio:** Se `finish_reason === 'length'` ocorrer durante o `<think>`, o sistema reengaja o modelo automaticamente para concluir e responder.
  - **Alerta Visual na UI:** Badges de "Tokens esgotados" e "Stream interrompido" no rodapé da mensagem.
  - **Blindagem no Studio:** Passos de edição agora falham ou exigem chamada real da ferramenta `edit_file` caso o agente apenas envie texto explicativo.
  - **Estabilidade de Voz:** `voice-button.tsx` agora instancia uma nova sessão limpa via `startListening()` ao reiniciar.
  - **Assets Estáticos no Worker:** `_worker.ts` não reescreve arquivos com extensão para `index.html`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 14/14 testes passando.
  - `npm run build`: bundle compilado com sucesso e artefatos Cloudflare copiados para `dist/`.

## 22. Varredura Profunda de Bugs e Blindagem de Edge Cases
- **Auditoria Executada:**
  1. **Preservação de `finish_reason` e `tool_calls` no SSE (`api/chat.ts`):** No modo transformador da Cloudflare, se o modelo emitia `finish_reason` junto com um fragmento final retido no buffer de lookahead, o `finish_reason` e eventuais `tool_calls` podiam ser suprimidos. Agora, a detecção de `finish_reason` força o flush imediato de todo o buffer restante e garante emissão completa do chunk.
  2. **Proteção de Parsing JSON no Sandbox (`src/lib/preview-html.ts`):** O `JSON.parse` direto de arquivos locais foi encapsulado em bloco defensivo que aponta o arquivo exato com erro de sintaxe, impedindo congelamento opaco do sandbox.
  3. **Eliminação de `InvalidStateError` no Microfone (`src/components/voice-button.tsx`):** Removida a tentativa ilegal pela especificação W3C de invocar `.start()` em instâncias encerradas de `SpeechRecognition`. O reinício agora cria uma instância nova com debounce seguro de 20ms.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 14/14 testes passando.
  - `npm run build`: bundle de produção e `dist/_worker.js` gerados em 11.44s.

## 23. Transcrição com Whisper Large V3 Turbo na Cloudflare
- **Problema:** A transcrição de voz dependia exclusivamente da API `SpeechRecognition` nativa do navegador (Chromium/Edge), falhando completamente em navegadores mobile como Safari (iOS) ou Firefox no desktop.
- **Solução Implementada:**
  - **Endpoint Serverless (`api/transcribe.ts`):** Rota dedicada que aceita áudio binário (`audio/webm`, `audio/mp4`, `audio/wav`), `FormData` ou JSON Base64, e despacha para `@cf/openai/whisper-large-v3-turbo` via `env.AI` ou REST API da Cloudflare Workers AI com `language: "pt"`.
  - **Roteamento Centralizado (`_worker.ts` & `server.ts`):** Mapeamento direto de `/api/transcribe` no Cloudflare Pages Advanced Worker e Express local.
  - **Captura Universal no Cliente (`src/lib/audio-transcriber.ts`):** Módulo de gravação baseado em `MediaRecorder` padrão da Web com suporte a `audio/webm;codecs=opus`, `audio/mp4` e cancelamento seguro de streams.
  - **Fallback Inteligente na UI (`src/components/voice-button.tsx`):** Se o navegador não suportar a Web Speech API, o botão ativa automaticamente o gravador `MediaRecorder` + Whisper na Cloudflare com feedback visual de carregamento (`Loader2` animado).
- **Evidências de Verificação:**
  - `npm test`: 19/19 testes passando (incluindo 5 novos testes de transcrição).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e `dist/_worker.js` (91.9 kB) gerados com sucesso em 4.60s.

## 24. Maximização dos Tetos de Streaming da Cloudflare
- **Objetivo:** Explorar a capacidade máxima permitida pela Cloudflare Workers AI sem risco de corte prematuro ou erros de estouro.
- **Configurações Atualizadas (`api/chat.ts`):**
  - **Teto de Saída Ampliado:** `max_tokens` elevado para até **16.384 tokens** no esforço `max` (e 12.288 em `high`/`medium`).
  - **Fallback Dinâmico Inteligente:** Se a Cloudflare retornar erro de payload/tokens (HTTP 400/422), o sistema reduz automaticamente para 4.096 tokens sem travar a requisição do usuário.
  - **Timeout Inicial Estendido:** Cronômetro de primeiro byte (`fetchWithTimeout`) expandido de 45s para **75 segundos**, concedendo folga máxima para a GPU da Cloudflare processar o raciocínio profundo inicial do DeepSeek R1.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando.
  - `npm run build`: `dist/_worker.js` (92.4 kB) compilado em 3.73s.

## 25. Polimento e Refinamento do Design Existente
- **Filosofia:** Preservação estrita da identidade visual do Synap (paleta terracota Anthropic `#d97757` e tema escuro), aprimorando acabamentos de contornos, profundidade, transições e ergonomia tátil ("melhorar o que já tenho").
- **Melhorias Implementadas:**
  1. **Barra de Entrada do Chat (`src/components/chat-input.tsx`):** Container arredondado (`rounded-2xl`) com glow sutil focado no terracota (`focus-within:border-[#d97757]/60` e `shadow-[0_8px_30px_rgba(0,0,0,0.25),0_0_20px_rgba(217,119,87,0.12)]`), e botões de Enviar/Parar com feedback de microescala (`active:scale-[0.96]`).
  2. **Balões de Mensagem e Accordion (`src/components/chat-message.tsx`):** Espaçamento refinado no balão do usuário (`px-4.5 py-3 rounded-2xl` com `shadow-sm`), e accordion de raciocínio da IA com efeito de desfoque sutil (`backdrop-blur-xs`, `border-[color:var(--c-bg-38352e)]/90` e `bg-[color:var(--c-bg-24221e)]/95`).
  3. **Cabeçalho e Seletor Central (`src/components/chat-header.tsx`):** Cápsula central translúcida (`backdrop-blur-md bg-[color:var(--c-bg-181714)]/95 border-[color:var(--c-bg-2d2b26)]/90`) para alternância entre Chat, Preview e Studio com animações instantâneas e feedback tátil (`active:scale-[0.97]`).
  4. **Blocos de Código (`src/components/code-block.tsx`):** Fundo enriquecido com contraste preciso (`#161513`), cabeçalho de barra de ferramentas em `#1f1d19` e contornos arredondados harmoniosos (`rounded-2xl`).
  5. **Barra Lateral (`src/components/chat-sidebar.tsx`):** Transições suaves e feedback de clique (`active:scale-[0.99]`) na lista de conversas, mantendo o acento terracota de seleção ativa (`border-l-2 border-l-[#d97757]`).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: `dist/_worker.js` (92.4 kB) e assets compilados com sucesso em 6.28s.

## 26. Blindagem de Execução Autônoma e Resolução do Stream Interrompido
- **Problema:** Ao solicitar alterações em repositórios conectados via Synap em modelos como GLM 5.3 com thinking low e conversas longas (>25k tokens), a IA emitia texto preliminar e era cortada com `⚠️ Erro: Stream was cancelled.`, finalizando o turno sem disparar as ferramentas (`edit_file`/`create_file`) e sem alterar os arquivos no GitHub.
- **Causas Raízes:**
  1. **Idle Timeout Precoce no Backend (`api/chat.ts`):** O leitor SSE possuía um timeout de 45s. Quando a GPU da NVIDIA demorava para iniciar a geração do payload volumoso da tool call, o backend abortava a stream via `reader.cancel()`, lançando a exceção `Stream was cancelled`.
  2. **Falso `finish_reason: 'stop'`:** O tratador de erro `sendErrorAndClose` emitia evento SSE com `finish_reason: 'stop'`, mascarando o cancelamento como uma conclusão bem-sucedida.
  3. **Ausência de Auto-Recuperação no Frontend (`src/App.tsx`):** O tratador de erros recuperáveis ignorava `Stream was cancelled`, adicionava o texto de erro na mensagem e encerrava o loop sem executar nenhuma ferramenta.
  4. **Falsas Conclusões por Texto:** Se o modelo prometesse alterar/criar arquivos mas não emitisse a chamada de ferramenta, o chat encerrava sem validar se os arquivos foram de fato alterados.
- **Solução Implementada:**
  - **Expansão do Idle Timer (`api/chat.ts`):** Timeout elevado de 45s para **90 segundos**, garantindo tempo hábil para a IA processar o raciocínio e gerar ferramentas complexas em prompts grandes.
  - **Sinalização Transparente de Interrupção:** `sendErrorAndClose` agora marca `finish_reason: 'error'` e envia a flag `isInterruption: true`, alertando o cliente de que o streaming foi cortado antes do fim.
  - **Auto-Continuação Resiliente no Loop (`src/App.tsx`):** O frontend captura erros de stream interrompido (`Stream was cancelled`, timeouts de rede) e reinvoca o modelo imediatamente com ordem de execução imperativa (*"Execute IMEDIATAMENTE a ferramenta agora para concluir as alterações no repositório"*), preservando o contexto e prosseguindo no loop.
  - **Trava Anti-Falsa-Conclusão (`looksLikeFileModificationPromise`):** Se houver repositório ativo e o modelo emitir promessas de alteração de arquivo sem ter disparado nenhuma ferramenta de código (`allEditedFiles === 0` e `detectedCalls === 0`), o Synap bloqueia o encerramento do turno e força a chamada imediata de `edit_file` ou `create_file`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (92.9 kB) gerados com 0 erros.

## 27. Otimização do Gerador de Mensagens de Commit e Refinamento do Botão
- **Problema:** Ao clicar em "Gerar com IA" no painel de Source Control, o botão ficava travado em "Analisando diff com IA..." e a caixa de texto não era preenchida. Além disso, o botão possuía dois ícones de IA duplicados (`<Sparkles />` SVG + emoji `✨`) e texto longo.
- **Causas Raízes:**
  1. **Timeout Agressivo de Leitura (10s):** O leitor da stream continha um `setInterval` que abortava a requisição se nenhum chunk de conteúdo chegasse em 10s. Como o GLM 5.3 com raciocínio (`reasoning_effort: 'low'`) demorava 12s a 20s para soltar os primeiros tokens, a requisição era cancelada silenciosamente pelo `controller.abort()`.
  2. **Ausência de Fallback:** Se a IA atrasasse ou falhasse, o campo de texto permanecia vazio sem nenhuma mensagem sugerida.
  3. **Poluição Visual no Botão:** Dois símbolos de IA concorrentes e texto `✨ Gerar com IA`.
- **Solução Implementada:**
  - **Ajuste Visual Cirúrgico (`source-control-panel.tsx`):**
    - Mantido apenas o ícone `<Sparkles className="w-3 h-3 text-amber-400" />` amarelinho na extrema esquerda.
    - Removido o emoji `✨` duplicado.
    - Texto encurtado para apenas **"Gerar"** (durante execução: "Gerando...").
    - Placeholder atualizado para `"Escreva a mensagem ou clique em 'Gerar'..."`.
  - **Timeout Resiliente e Fallback Garantido:**
    - Timeout de inatividade estendido de 10s para 25s, e teto geral para 40s.
    - Implementado gerador automático de fallback no padrão Conventional Commits baseado nos arquivos alterados (ex: `feat: atualizar App.tsx`), garantindo que o usuário nunca fique com a caixa vazia.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle compilado em 2.85s com sucesso.

## 28. Eliminação de Quebras de Linha no Card de Pull (Source Control)
- **Problema:** Na barra lateral do Source Control, o card de aviso de commits remotos para puxar (Pull) quebrava texto em várias linhas apertadas, quebrando a contagem de commits (`1` sobre `commit(s)`) e o botão laranja (`Puxar Alterações` sobre `Agora (Pull)`).
- **Solução Implementada (`source-control-panel.tsx`):**
  - **Título Conciso:** Texto encurtado para `{N} alteração(ões) no GitHub` em 1 linha com `truncate`.
  - **Badge Sem Quebra:** Adicionadas classes `whitespace-nowrap shrink-0` para a contagem `{N} commit(s)` permanecer sempre inline.
  - **Botão Otimizado:** Rótulo simplificado para `Puxar Alterações` (e `Puxando...`) com `whitespace-nowrap`, encaixando lado a lado com o botão `Detalhes`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando.
  - `npm run build`: bundle compilado em 4.01s com sucesso.

## 29. Correção de Sincronização Local-Remoto e Refinamento do Botão de Commit
- **Problemas Identificados:**
  1. **Falso Alerta de Pull após Push Local:** Após realizar um commit pelo Source Control ou terminal do Synap e recarregar a página, a UI exibia "1 alteração no GitHub — 1 commit" pedindo para puxar o mesmo commit recém-enviado pelo próprio usuário.
  2. **Rótulo Inapropriado no Botão:** Com apenas 1 arquivo alterado, o botão exibia "Commit Tudo (1)", gerando estranheza semântica ("tudo" só faz sentido para múltiplos arquivos).
- **Causas Raízes:**
  1. O método `commitStagedChanges` e o handler `handleCommit` criavam o commit no GitHub via API, mas não atualizavam a chave `synap_synced_sha_${owner}/${repo}_${branch}` no `localStorage`. Ao recarregar, o `checkRemoteChanges` comparava o commit remoto com o SHA anterior defasado e assumia que o novo commit viera de fora.
  2. A expressão ternária no botão de commit sempre concatenava `Commit Tudo (${repoChanges.length})` independentemente da quantidade ser unitária.
- **Solução Implementada:**
  - **Sincronização de SHA Atômica (`src/lib/github-commit.ts`):** `commitStagedChanges` agora atualiza imediatamente `synap_synced_sha_` com o novo `res.sha` e registra o SHA em `synap_recent_commits_` no `localStorage`.
  - **Blindagem Anti-Falso-Pull (`src/components/source-control/source-control-panel.tsx`):** `checkRemoteChanges` verifica se os commits remotos à frente foram originados localmente pelo Synap (`localCreatedShas`). Se todos os commits à frente forem locais, a âncora é sincronizada silenciosamente sem exibir aviso de pull.
  - **Rótulo Gramatical Inteligente:** Quando há apenas 1 arquivo alterado, o botão exibe estritamente **"Commitar"**. Quando há 2 ou mais arquivos, passa a exibir **"Commitar Tudo ({N})"** (ou `Commitar ({N})` se staged).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle compilado em 2.70s e artefatos de Cloudflare copiados para `dist/`.

## 30. Aceleração Instantânea do Gerador de Mensagens de Commit
- **Problema:** O botão "Gerar" mensagem de commit com IA demorava muito (10 a 20 segundos) para preencher a caixa de texto, deixando o usuário esperando com o botão travado em "Gerando...".
- **Causas Raízes:**
  1. **Raciocínio Desnecessário:** O payload enviava `reasoning_effort: 'low'` para modelos de raciocínio, fazendo a IA gastar segundos preciosos escrevendo tags `<think>...</think>` ocultas antes de emitir o primeiro caractere do commit.
  2. **Orçamento Excessivo de Tokens:** O backend `api/chat.ts` não aceitava `max_tokens` customizado no body e alocava o teto padrão de 8.192 tokens para uma tarefa de apenas 1 linha (~30 tokens).
  3. **Payload com Fragmentos de Código Longos:** O frontend serializava trechos de arquivos com centenas de caracteres em vez de apenas a lista de arquivos alterados.
  4. **Ausência de Feedback Imediato (Zero-Delay):** O campo de texto permanecia vazio até que o primeiro token do stream chegasse da nuvem.
- **Solução Implementada:**
  - **Preenchimento Instantâneo (0ms):** Ao clicar em "Gerar", o sistema preenche imediatamente a caixa de texto com uma sugestão Conventional Commits precisa baseada nos arquivos alterados (`getFallbackCommitMsg()`). O usuário já tem um commit válido na mesma fração de segundo.
  - **Desativação de Raciocínio & Rota Flash:** Requisição ajustada para `reasoning_effort: 'none'` com diretiva de sistema anti-thinking e `temperature: 0.2`, indo direto para o texto final.
  - **Teto Restrito de Tokens (`max_tokens: 50`):** `api/chat.ts` atualizado para honrar `customMaxTokens` no payload da NVIDIA e Cloudflare, reduzindo a janela de computação da GPU para o tamanho exato de um commit.
  - **Payload Compacto:** O prompt agora envia apenas o resumo de caminhos (`+`, `-`, `~`) sem código bruto, baixando a ingestão para menos de 100 caracteres.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle compilado em 2.59s com sucesso (`dist/_worker.js` 93.4 kB).

## 31. Correção do Monitor de Tokens: Janela de Contexto Ativa vs. Total Acumulado
- **Problema:** A barra de tokens no cabeçalho exibia `186 495 tokens` e ficava vermelha em `100%`, sugerindo falsamente que a conversa havia estourado o limite da IA.
- **Causa Raiz:** O helper `conversationTokens` em `src/App.tsx` somava cumulativamente os tokens de todos os turnos passados (`reduce` sobre todas as mensagens). O componente `model-controls.tsx` dividia essa soma total acumulada (como um hodômetro de horas de uso) pelo limite de contexto de uma única mensagem (`128.000` tokens). Como $186.495 \div 128.000 = 145\%$, a barra travava no teto de 100% em vermelho, mesmo que a janela ativa real na GPU tivesse apenas ~35k tokens.
- **Solução Implementada:**
  - **Cálculo da Janela Ativa Real (`src/App.tsx`):** `conversationTokens` agora calcula separadamente `activeContextTokens` a partir do prompt e completion do turno mais recente (o que de fato ocupa a memória da IA).
  - **Medição Precisa na Barra (`src/components/model-controls.tsx`):** A barra de progresso e porcentagem no cabeçalho agora medem a ocupação real da janela de contexto ativa (ficando verde/saudável na faixa de ~25% a ~35%).
## 32. Bordas Arredondadas e Visual Flutuante da Barra Lateral no Celular
- **Problema:** No computador, a barra lateral (drawer/sidebar) possuía acabamento estético refinado com bordas arredondadas (`rounded-2xl`) e margens flutuantes (`my-2 ml-2`). No celular, as classes estavam limitadas com `md:`, fazendo com que a gaveta ficasse colada nas bordas e com cantos retos (`rounded-none`).
- **Solução Implementada (`src/components/chat-sidebar.tsx`):**
  - Removido o prefixo `md:` de `my-2 ml-2 rounded-2xl max-h-[calc(100dvh-1rem)]`.
  - Adicionado `max-w-[calc(100vw-1.5rem)]` para preservar a margem lateral em telas pequenas.
  - Ajustado o recuo fora da tela para `-translate-x-[calc(100%+2rem)]` para ocultação completa sem cortar sombras.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle compilado com sucesso (`dist/_worker.js` 93.4 kB).

## 33. Integração dos Modelos NVIDIA NIM: Google Gemma 4 31B + Qwen-Image & Edit
- **Solicitação do Usuário:** Habilitar modelos adicionais disponíveis em sua conta NVIDIA NIM: o modelo de chat/visão **Google Gemma 4 31B** (`google/gemma-4-31b-it`) e os modelos visuais **Qwen-Image** e **Qwen-Image-Edit**.
- **Solução Implementada:**
  - **Google Gemma 4 31B no Chat (`src/lib/models.ts`, `src/lib/types.ts`, `src/components/model-controls.tsx`, `api/chat.ts`):**
    - Adicionado à lista de modelos permitidos e ao menu de seleção com o badge `Google · 31B`.
    - Habilitado para suporte a imagens multimodais (`isVisionCapable`), ferramentas (`modelSupportsTools`) e cálculo de contexto de 256.000 tokens (`CONTEXT_LIMIT = 256000`).
    - Validação de storage em `src/App.tsx` e auto-detecção no `src/components/chat-input.tsx`.
  - **Qwen-Image & Qwen-Image-Edit no Motor de Imagens (`api/image.ts`, `src/App.tsx`):**
    - `api/image.ts` atualizado para ler `env.NVIDIA_API_KEY`. Se presente, invoca diretamente os endpoints da NVIDIA NIM (`ai.api.nvidia.com/v1/genai/qwen/qwen-image` para criação do zero e `qwen-image-edit` quando `image_url` for fornecida).
    - Retorno imediato em Base64 Data URI sem latência de hospedagem intermediária.
    - Fallback resiliente para FLUX (Pollinations) mantido caso haja oscilação na cota da NVIDIA.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle compilado com sucesso em 2.33s (`dist/_worker.js` 95.6 kB).

## 34. Design System de Cartões com Profundidade em Camadas 3D (Layered Depth Shadows)
- **Objetivo:** Elevar o acabamento estético de todos os cartões da aplicação para um nível premium e tridimensional, introduzindo sombras em camadas (ambient + direct occlusions), specular highlights (`inset 0 1px 0 rgba(255,255,255,0.08)`), gradientes de superfície sutis e micro-elevação ao passar o mouse (`translateY(-1.5px)`).
- **Tokens e Utilitários Globais (`src/index.css`):**
  - `--synap-card-bg`: gradiente sutil vertical fundido com a cor de superfície base.
  - `--synap-card-border` e `--synap-card-border-hover`: realce de contraste de alta precisão adaptado para tema claro e escuro.
  - `--synap-card-shadow`: combinação de 3 camadas de sombras (sombra de contato rente + difusa suave + specular highlight superior).
  - Classes padronizadas: `.synap-card`, `.synap-card-interactive` (com curvas `cubic-bezier(0.16, 1, 0.3, 1)`) e `.synap-card-subtle`.
- **Componentes Modernizados:**
  1. **Chat & Mensagens (`chat-message.tsx`, `compaction-marker.tsx`):** Balão do usuário, accordion de raciocínio da IA, cartões de execução de ferramentas em tempo real (Terminal, Fetch URL, Python WASM, Habilidades), cartões de refatoração em lote e arquivos modificados, e popup de resumo de compactação ativa.
  2. **Controle de Versão (`source-control-panel.tsx`):** Card de alerta de Pull/commits remotos, caixa de digitação de commit e itens de arquivos modificados (`ChangeRow`) com micro-elevação interativa.
  3. **Navegação & Repositórios (`chat-sidebar.tsx`, `repo-list.tsx`):** Itens de conversas no histórico com hover suave e cards de repositórios do GitHub.
  4. **Habilidades & MCP (`extensions-panel.tsx`):** Cards de regras nativas e customizadas e servidores MCP conectados.
  5. **Painel do Studio (`studio-panel.tsx`):** Timeline cards dos agentes (Kimi, GLM, Implementador) e passos de execução do plano.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 19/19 testes passando (5 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (95.6 kB) compilados com 0 erros.

## 35. Monitor de Deploy da Cloudflare Pages e Correção Assistida por IA
- **Solicitação do Usuário:** Monitorar a compilação e implantação no Cloudflare Pages em tempo real ("ó, Cloudflare está implementando..."), capturar os logs de erro em caso de falha de build e disponibilizar um botão no chat ("Corrigir erro") para que a IA só aja após o comando explícito do usuário, sem círculos/bolinhas genéricas.
- **Solução Implementada:**
  1. **Backend Serverless (`api/deployments.ts`):**
     - Ações `status` e `logs` com consulta à API oficial do Cloudflare Pages (`/accounts/{id}/pages/projects/{project}/deployments` e `/history/logs`).
     - Fallback automático e transparente para a API de Check Runs do GitHub (`/repos/{owner}/{repo}/commits/{sha}/check-runs`) caso o token da Cloudflare não possua escopo de leitura de Pages.
     - Extrator inteligente de trechos de falha (`extractRelevantErrorSnippet`) com foco em erros TypeScript (`TSxxxx`), falhas de sintaxe e quebras do `npm run build`.
     - Roteamento configurado no `server.ts` (Express dev) e no `_worker.ts` (Cloudflare Pages Advanced Worker).
  2. **Serviço Frontend com Testes Unitários TDD (`src/lib/deployment-service.ts`):**
     - Normalização robusta de status (`idle`, `building`, `success`, `failure`).
     - Hook `useDeploymentMonitor` com polling adaptativo (8s durante compilação ativa; 45s ou sob demanda em repouso).
     - Testes automatizados em `src/lib/deployment-service.test.ts` cobrindo normalização, extração de logs e consumo de endpoints (6/6 passando).
  3. **Visualizador de Logs do Terminal (`src/components/deployments/deployment-log-modal.tsx`):**
     - Console escuro retroiluminado (`#12110f`) em container `.synap-card`.
     - Linhas numeradas, realce em vermelho para erros, botão de copiar logs completos e botão de ação direta "Corrigir Erro com IA".
  4. **Card de Alerta com Ação Sob Demanda no Chat (`src/components/deployments/deployment-error-card.tsx`):**
     - Em caso de falha no build, renderiza alerta visual no topo da barra de digitação.
     - Ícone temático `<AlertTriangle />` moderno (sem bolinhas genéricas).
     - Botão secundário "Ver Logs do Build" e botão primário com destaque terracota **"⚡ Corrigir Erro com IA"**.
     - **Controle Total:** A IA nunca mexe no código de forma não solicitada; ao clicar no botão, o prompt com o log exato da Cloudflare é entregue para a IA no chat para diagnosticar e editar os arquivos com precisão cirúrgica.
  5. **Badge de Status Moderno no Cabeçalho (`src/components/deployments/deployment-status-badge.tsx`):**
     - Integrado ao `ChatHeader` com ícones Lucide ricos (`CloudUpload` pulsante em compilação, `CheckCircle2` esmeralda no ar, e `AlertTriangle` carmim em falhas).
- **Evidências de Verificação:**
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso em 18.52s.

## 36. Correção de Autorização do Modelo Google Gemma 4 31B (`/api/chat` HTTP 403)
- **Problema:** Ao selecionar o modelo `google/gemma-4-31b-it` e enviar uma mensagem, o servidor retornava `HTTP 403: {"error":"Modelo não autorizado."}`.
- **Causa Raiz:** O modelo havia sido cadastrado na lista de modelos do frontend (`src/lib/models.ts`), mas a lista de segurança do backend (`lib/server/_security.ts` em `ALLOWED_MODELS` e `VISION_MODELS`) ainda não continha `'google/gemma-4-31b-it'`. Como `api/chat.ts` valida estritamente a lista do backend antes de despachar a chamada à NVIDIA NIM, a requisição era rejeitada com 403.
- **Solução Implementada:**
  - Adicionado `'google/gemma-4-31b-it'` à constante `ALLOWED_MODELS` e à constante `VISION_MODELS` em `lib/server/_security.ts`.
  - Recompilados os artefatos de produção e o worker (`dist/_worker.js`).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando.
  - `npm run build`: `dist/_worker.js` (106.0 kB) compilado com sucesso.

## 38. Estilo Cartão e Gestos de Arraste na Barra Lateral (Swipe to Delete / Swipe to Archive)
- **Solicitação do Usuário:** Transformar os itens da barra lateral em estilo cartão moderno e permitir arquivar e deletar deslizando/arrastando: arrastar para o lado esquerdo deleta, arrastar para o lado direito arquiva.
- **Solução Implementada:**
  1. **Modelo de Dados & Persistência (`src/lib/types.ts` & `src/App.tsx`):**
     - Adicionado o campo opcional `isArchived?: boolean` na interface `Conversation`.
     - Implementados os handlers `handleArchiveConversation(id)` e `handleUnarchiveConversation(id)` no `App.tsx`, com chaveamento automático de chat ativo caso a conversa arquivada seja a aberta no momento.
  2. **Componente de Cartão Deslizável (`SwipeableConversationCard` em `src/components/chat-sidebar.tsx`):**
     - **Design Estilo Cartão:** Cada conversa é renderizada como um cartão individual (`rounded-xl`, superfície `bg-[color:var(--c-bg-201e1a)]/75`, borda sutil `border-[color:var(--c-bg-322e27)]/80`, ícone em container arredondado e acento terracota `#d97757` no card ativo).
     - **Gesto de Arraste Unificado (Touch & Pointer):**
       - **Arrastar para a Esquerda ($offsetX < -60px$):** Revela fundo carmim (`bg-rose-600/90`) com ícone `Trash2` e rótulo "Deletar". Ao soltar além do threshold, aciona a exclusão.
       - **Arrastar para a Direita ($offsetX > 60px$):** Revela fundo esmeralda (`bg-emerald-600/90`) com ícone `Archive` e rótulo "Arquivar". Ao soltar além do threshold, move para as arquivadas.
       - **Amortecimento & Trava de Rolagem:** Se o usuário estiver rolando verticalmente a lista, o arraste horizontal é cancelado imediatamente para não travar a fluidez de navegação.
       - **Retorno Suave (*Spring Back*):** Caso o arraste seja solto antes de 60px, o cartão retorna à posição de repouso com transição elástica `cubic-bezier(0.16, 1, 0.3, 1)`.
  3. **Ações Desktop & Gaveta de Arquivadas:**
     - Botões rápidos no hover para usuários de mouse (Renomear, Arquivar, Deletar).
     - Seção expansível "Arquivadas ({count})" no rodapé da lista com botão de desarquivar instantâneo (`ArchiveRestore`).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 39. Integração do Switch BB-8 (Star Wars) para Modo Escuro/Claro
- **Solicitação do Usuário:** Importar o componente interativo do robô BB-8 do projeto `PAINEL-DSS` (`C:\Users\nayla\.antigravity\PAINEL-DSS`) e colocá-lo no Synap para controle do modo escuro.
- **Solução Implementada:**
  1. **Extração dos Estilos do BB-8 (`src/bb8-toggle.css`):**
     - Transpostos integralmente os estilos CSS do BB-8 (`.bb8-toggle`, cabeça, antenas, corpo rotacionando a 225°, sombra inclinada, cenários com sóis de Tatooine no modo claro e constelações/planetas Gomrassen, Hermes e Chenini no modo escuro).
     - Adicionado suporte à variável `--bb8-size` para escala paramétrica e responsiva.
     - Importado em `src/index.css`.
  2. **Componente Reutilizável (`src/components/dark-mode-toggle.tsx`):**
     - Estruturado com `React.memo`, suporta propriedades `isDarkMode`, `onToggle`, `size` e `className`.
     - Previne disparo duplo do evento de clique com `e.preventDefault()`.
  3. **Integração na Interface (`ChatSidebar` & `ChatHeader`):**
     - **Rodapé da Barra Lateral (`src/components/chat-sidebar.tsx`):** Substituído o botão simples de Sol/Lua pelo BB-8 animado ao lado do botão de Configurações (`size={5.2}`).
     - **Cabeçalho Principal (`src/components/chat-header.tsx`):** Integrado o BB-8 (`size={4.8}`) na barra superior ao lado do Terminal para alternância instantânea sem necessidade de abrir a barra lateral.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso em 5.73s.

## 40. Estilo Camada e Hierarquia Visual de Seleção na Barra Lateral
- **Problema:** Ambos os cartões (ativo e inativo) possuíam bordas inteiras bem visíveis e o mesmo tom de texto branco no título, gerando ruído e confusão visual sobre qual conversa estava de fato selecionada.
- **Solução Implementada (`src/components/chat-sidebar.tsx`):**
  1. **Camada Superior Elevada (Cartão Ativo):**
     - Superfície iluminada em gradiente vertical suave (`from-[#2e2a25] to-[#221f1c]`).
     - Sombra em camadas 3D com specular highlight superior (`inset 0 1px 0 rgba(255,255,255,0.08)`) e glow terracota suave (`0 0 12px rgba(217,119,87,0.15)`).
     - **Indicador Físico de Camada:** Barra lateral vertical no canto esquerdo (`w-1 rounded-r-full bg-[#d97757]`) com brilho sutil.
     - Ícone em container terracota destacado (`bg-[#d97757]/20 border border-[#d97757]/30 text-[#d97757]`) e título em negrito branco (`font-semibold text-white`).
  2. **Camada Base Recuada (Cartões Inativos):**
     - Borda atenuada e translúcida (`border-white/5` ou `border-[#322e27]/40`) para não concorrer com o ativo.
     - Título e ícone com cores de repouso secundárias (`text-[#8c867a]`), acendendo suavemente apenas no hover do mouse.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso em 6.04s.

## 41. Restauração do Estilo Original das Conversas na Barra Lateral
- **Solicitação do Usuário:** *"nn ta bo nn, deixa no esrilo eles no estilo que tava quando começamos a progaramr hoje, so eles"*.
- **Causa & Decisão:**
  - Os experimentos de cartões pesados e camadas causavam ruído e dúvida na distinção do chat ativo vs inativo.
  - Apenas os itens de conversa foram restaurados para o estilo original limpo e direto do início do dia (commit `bdc5714`), preservando todas as demais novidades implementadas hoje (switch BB-8 Star Wars, monitor de deploy, modelos atualizados, persistência de arquivamento).
- **Implementação (`src/components/chat-sidebar.tsx`):**
  - **Item Ativo:** `bg-dark-card text-[color:var(--c-fg-f3efe6)] font-medium border-l-2 border-l-[#d97757] border-y border-r border-gray-800/40 dark:border-white/5 shadow-xs`.
  - **Item Inativo:** `text-[color:var(--c-fg-a0aec0)] hover:bg-dark-bg-secondary hover:text-[color:var(--c-fg-f3efe6)]` com transição suave.
  - **Ícone e Texto:** Ícone `MessageSquare` inline com destaque `#d97757` quando selecionado e tons neutros em repouso.
  - **Ações:** Botões de hover rápidos para renomear, arquivar e deletar com confirmação.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 42. Swipe Unificado e Estética Limpa do Lápis (Mobile & Desktop)
- **Solicitação do Usuário:**
  - Remover os botões estáticos de arquivar e lixeira da linha de conversa.
  - Ações por gesto: arrastar para a esquerda deleta (lixeira vermelha), arrastar para a direita arquiva (verde esmeralda).
  - Manter apenas o lápis de editar centralizado no lado direito.
  - No celular: não deixar uma fileira de lápis poluindo visualmente a estética dos chats. Tocar no canto direito abre a edição sem bugar.
- **Solução Implementada (`src/components/chat-sidebar.tsx`):**
  1. **Componente Deslizável (`SwipeableConversationItem`):**
     - **Estilo Visual:** Mantém a linha limpa e minimalista aprovada pelo usuário (`px-3 py-2.5 rounded-xl`, borda terracota `#d97757` no ativo).
     - **Camada de Arraste:**
       - Arraste para a direita ($offsetX > 60px$): verde esmeralda (`bg-emerald-600/90`) com ícone `Archive` e texto "Arquivar" (ou "Desarquivar").
       - Arraste para a esquerda ($offsetX < -60px$): vermelho carmim (`bg-rose-600/90`) com ícone `Trash2` e texto "Deletar".
       - Trava de rolagem vertical para não interromper a navegação em celulares.
  2. **Estética do Lápis no Mobile e Desktop:**
     - **Mobile (Celular):** Chats inativos ficam com `opacity-0` no lápis (zero poluição na lista, estética 100% clean). O chat ativo exibe o lápis de forma sutil (`opacity-70`). Tocar no canto direito (`w-8 h-8`) ativa a renomeação imediatamente sem selecionar outra conversa nem bugar.
     - **Desktop:** O lápis surge suavemente apenas quando o cursor do mouse passa sobre a conversa (`md:opacity-0 md:group-hover:opacity-100`).
     - Zero outros botões visíveis no corpo do item.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 43. Remoção do Switch BB-8 do Cabeçalho Superior
- **Solicitação do Usuário:** *"Ok, e o botão do BB-8 tu tira lá do canto superior direito, tá? Deixa só lá no inferior do lado de configurações."*
- **Ajuste Realizado:**
  - Removido o componente `DarkModeToggle` do canto superior direito de `src/components/chat-header.tsx`, mantendo a barra de topo enxuta e focada em navegação e ferramentas (Terminal, Tabs, Erros).
  - O switch BB-8 (Star Wars) permanece ativo exclusivamente no rodapé inferior da barra lateral (`src/components/chat-sidebar.tsx`), logo ao lado do botão de Configurações (`size={5.2}`).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 44. Realocação e Simplificação do Botão de Deploy
- **Solicitação do Usuário:** *"Essa confirmação de deploy no ar, coloque em outro local e bota, deixa só 'Deploy', tira o ': no ar'."*
- **Solução Implementada:**
  1. **Simplificação de Texto (`deployment-status-badge.tsx`):**
     - O texto foi padronizado em **"Deploy"** (removido o sufixo `: no ar` e `: compilando`), com ícones temáticos para cada estado (`CheckCircle2` verde em sucesso, `AlertTriangle` vermelho em falha, `CloudUpload` âmbar pulsante em compilação).
  2. **Realocação no Cabeçalho (`chat-header.tsx`):**
     - Retirado do lado esquerdo (onde ficava colado ao menu e repositório).
     - Reposicionado no canto superior direito, harmoniosamente alinhado ao botão `Terminal`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 45. Centralização dos Controles Abaixo da Caixa de Chat
- **Solicitação do Usuário:** *"centraliza esses campos abaixo da caixa de chat"* (referente aos seletores de modelo, pensamento, modo plano e monitor de tokens).
- **Ajuste Realizado (`src/components/model-controls.tsx`):**
  - Ajustado o alinhamento da barra de pills (`ModelControls`) de `justify-between` / `justify-start` para `justify-center`, garantindo que tanto o container principal quanto a lista de pills fiquem perfeitamente centralizados horizontalmente sob a caixa de digitação em qualquer largura de tela.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 35. Correção de Contraste e Textos Ocultos no Tema Claro (Modo Branco)
- **Problema:** No tema claro, vários textos sumiram ou ficaram com contraste baixíssimo:
  1. *Sidebar:* Botões "Projetos" e "Baixar vídeo" com texto invisível sobre o fundo claro.
  2. *Header:* Badge de status de deploy com texto verde-claro esmaecido sobre o fundo branco.
  3. *Chat:* Accordion de raciocínio da IA com badge `Modo low`, contagem de caracteres e `Ver processo` quase imperceptíveis; botão "Copiar" da mensagem do usuário com contraste fraco.
  4. *Controles Inferiores (`ModelControls`):* Rótulos `pensar:`, `Plano`, o badge `OFF` e `tokens` sem contraste nos pills claros.
- **Causas Raízes:**
  - Uso de hexadecimais estáticos claros (`text-[#f3efe6]`, `text-emerald-300`, `text-[color:var(--c-fg-a0aec0)]` inexistente) sobre fundos com tons pêssego ou off-white.
  - Ausência de variantes adaptativas `dark:` para estados semânticos de badges de status.
- **Solução Implementada:**
  - `src/components/chat-sidebar.tsx`: `text-[#f3efe6]` substituído por `text-zinc-900 dark:text-[#f3efe6]` em "Projetos" e "Baixar vídeo"; badges de atalho ajustados para `text-[#d97757] font-semibold`; cabeçalho de Recentes ajustado para `text-zinc-600 dark:text-[color:var(--c-fg-8c867a)]`; variáveis inexistentes trocadas por `text-dark-text-secondary`.
  - `src/components/github/repo-list.tsx`: Botão de criar repositório corrigido com `text-zinc-900 dark:text-[#f3efe6]`.
  - `src/components/deployments/deployment-status-badge.tsx`: Estados `success`, `failure`, `building` e `idle` agora contam com pares nítidos de cores para os temas claro e escuro (`text-emerald-900 dark:text-emerald-300 bg-emerald-100/90 dark:bg-emerald-950/30 border-emerald-300/80 dark:border-emerald-600/30`).
  - `src/components/chat-message.tsx`: Badge `Modo low` com `bg-zinc-200/80 text-zinc-800`, contagem com `text-zinc-600`, `Ver processo` nítido com hover sublinhado, e botão `Copiar` no balão do usuário calibrado com `text-zinc-600 dark:text-[color:var(--c-fg-c4bfb6)] hover:text-zinc-900`.
  - `src/components/model-controls.tsx`: Rótulos `pensar:`, `tokens:`, `Plano` e badge `OFF` agora utilizam `text-zinc-700` e bordas nítidas `border-zinc-300/80` no tema claro.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run build`: bundle compilado em 3.78s e artefatos copiados para `dist/`.

## 36. Padronização de Nomenclatura: "Habilidades" renomeado para "Skills"
- **Solicitação do Usuário:** *"renomeia o texto habilidades para Skills"*
- **Ajustes Realizados (`src/components/extensions/extensions-panel.tsx`):**
  - Sub-aba do painel: `<span>Habilidades</span>` alterado para `<span>Skills</span>`.
  - Cabeçalho da seção: `Habilidades Comportamentais` alterado para `Skills Comportamentais`.
  - Tooltips de botões de exclusão e alternância: `Excluir skill` e `Ativar/Desativar skill`.
  - Modal de criação: `Nova Skill Customizada`, `Nome da Skill` e botão `Salvar Skill`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 25/25 testes passando (6 suítes).

## 46. Conexão Direta do Servidor Remoto Context7 MCP (Documentação Oficial & Exemplos)
- **Solicitação do Usuário:** *"conecta direto esse mcp ai"* (referente ao Context7 MCP `https://mcp.context7.com/mcp`).
- **Problema & Desafios Técnicos:**
  1. *Formato de Transporte:* O endpoint oficial do Context7 (`https://mcp.context7.com/mcp`) opera com Server-Sent Events (SSE) retornando `Content-Type: text/event-stream` com linhas `data: {...}`. Clientes MCP tradicionais com `res.json()` falhavam com `SyntaxError`.
  2. *Independência de Repositório:* Em `src/App.tsx`, o despachante de ferramentas bloqueava qualquer chamada caso nenhum repositório GitHub estivesse vinculado. Ferramentas de documentação MCP não dependem de repositório e precisavam rodar globalmente.
  3. *Configuração Zero:* Usuários novos e existentes precisavam ter o servidor ativo automaticamente sem necessidade de digitação manual de URLs.
- **Solução Implementada:**
  1. **Motor Híbrido JSON & SSE (`src/lib/mcp-client.ts`):**
     - Criado o helper `parseMcpResponsePayload(res)` que analisa a resposta HTTP e extrai tanto payloads JSON-RPC tradicionais quanto streams SSE (`data: {...}`).
     - Atualizados os métodos `testMcpConnection` e `executeMcpToolCall`.
  2. **Testes Unitários Automatizados (`src/lib/mcp-client.test.ts`):**
     - Adicionados testes para validação de extração direta de JSON e de pacotes Server-Sent Events com prefixo `data:`.
  3. **Servidor Padrão Nativo (`src/lib/storage.ts`):**
     - Adicionado `DEFAULT_MCP_SERVERS` contendo `Context7 Docs` (`https://mcp.context7.com/mcp`) com status `connected`, transporte `sse` e schemas completos de `resolve-library-id` e `query-docs`.
     - `loadMcpServers` realiza auto-merge inteligente preservando servidores customizados já adicionados pelo usuário.
  4. **Despacho Global no Chat (`src/App.tsx`):**
     - Despachante `mcp__` posicionado antes da checagem de repositório ativo, permitindo que a IA consulte documentação técnica em qualquer conversa.
  5. **Experiência Visual na UI (`src/components/chat-message.tsx`):**
     - Labels dinâmicos no accordion e status de execução (`Consultando Context7…`).
     - Card de resultado com ícone de documentação (`<BookOpen />`), título da biblioteca e badge de confirmação.
- **Evidências de Verificação:**
  - `npm test`: 25/25 testes passando (6 suítes).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso.

## 47. Motor de Subagentes Nativos e Orquestração Paralela no Chat
- **Solicitação do Usuário:** *"quero a ia consiga disparar sub agentes para as tarrefas, e skill ou mcp pra isso? gratis e melhor do mercado"* / *"o nome da skill deixa so Subagentes, e ta aprovado pra impenetar"*.
- **Problema & Decisão Arquitetural:**
  - Servidores MCP externos servem para dados e ferramentas remotas, não para o ciclo de vida de prompts internos.
  - A solução ideal é uma **Ferramenta Nativa (`dispatch_subagent`)** combinada com uma **Skill Comportamental (`Subagentes`)**:
    - **100% Grátis & Custo Zero:** Roda na infraestrutura interna existente (`/api/chat`), sem provedores pagos nem chaves adicionais.
    - **Herança do Modelo Ativo:** O subagente executa estritamente no modelo atualmente selecionado pelo usuário (ex: Google Gemma 4 31B, GLM 5.3).
- **Solução Implementada:**
  1. **Motor de Subagente com TDD (`src/lib/subagent-runner.ts` & `src/lib/subagent-runner.test.ts`):**
     - Função `runSubagent(config)` com `AbortController` (timeout de 35s), leitura resiliente de stream SSE / JSON e separação de `<think>` do relatório final via `parseSubagentResult`.
     - 4 testes unitários automatizados cobrindo montagem de prompt, validação de campos obrigatórios e parsing de relatórios.
  2. **Skill Nativa "Subagentes" (`src/lib/storage.ts` & `src/lib/types.ts`):**
     - Adicionada ao catálogo padrão com `id: 'subagents'`, `name: 'Subagentes'` e ícone `'bot'`.
     - System prompt orientando a IA principal a dividir automaticamente tarefas grandes em até 3 subagentes simultâneos com papéis definidos e consolidar o resultado.
     - Auto-merge inteligente em `loadSkills` preservando preferências do usuário.
  3. **Tool OpenAI Nativa (`dispatch_subagent` em `src/App.tsx`):**
     - Registrada em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Execução isolada em `executeGitHubTool` sem exigir repositório ativo, herdando `selectedModel`.
  4. **Experiência Visual de Subagente no Chat (`src/components/chat-message.tsx`):**
     - Label animado no accordion: `"Subagente em ação…"`.
     - Estado em execução animado com `ThinkingOrb` (modo `weaving`, velocidade `2.0x`).
     - Card concluído em tom esmeralda (`border-emerald-500/25 bg-[color:var(--c-bg-1c211f)]`) com badge de papel, subtarefa, tempo em segundos e botão *"Relatório"* para expandir os detalhes técnicos retornados.
- **Evidências de Verificação:**
  - `npm test`: 26/26 testes passando (6 suítes).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso em 4.46s.

## 48. Renomeação da Aba de Servidores para "MPC"
- **Solicitação do Usuário:** *"renomeia aba servidores mcp para MPC"*.
- **Ajuste Realizado (`src/components/extensions/extensions-panel.tsx`):**
  - O rótulo da sub-aba no painel de Extensões foi alterado de `<span>Servidores MCP</span>` para `<span>MPC</span>`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 26/26 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso em 2.63s.

## 49. Restauração do Balão de Mensagem do Usuário ao Modelo Original
- **Solicitação do Usuário:** *"retorna o modelo desse cartão para oque era antes tbm"* (com print do balão de mensagem do usuário).
- **Problema:** A adição experimental da classe `.synap-card` e de um botão interno "Copiar" com borda superior divisória dentro do balão da mensagem do usuário causava desproporção visual em mensagens curtas (como *"oi"*).
- **Ajustes Realizados (`src/components/chat-message.tsx`):**
  - Removida a classe `.synap-card` e o padding inflado.
  - Restaurada a estilização original limpa e arredondada: `bg-[color:var(--c-bg-302e2a)] text-[color:var(--c-fg-f3efe6)] border border-[color:var(--c-bg-3e3b34)] rounded-2xl px-4 py-2.5 max-w-[90%] sm:max-w-[80%] shadow-xs`.
  - Removida a divisória interna e o botão de cópia dentro do balão do usuário.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 26/26 testes passando (6 suítes).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.0 kB) compilados com sucesso em 2.67s.

## 50. Integração do Motor de Contexto Graphify (GraphRAG) e Modal Visual
- **Solicitação do Usuário:** *"graphify roda no navegador? daria pro app? (...) pl, pode fazer, ai esse mapa nn vai botar naquela barra que tem chat, repr, e git ta nn bota la que ja tem muita coisa"*
- **Problema & Decisão Arquitetural:**
  - Evitar sobrecarregar a barra lateral principal do Synap (`[Chat] | [Repos] | [Git] | [MPC]`), que já contém navegação densa.
  - Entregar à IA um motor de **GraphRAG** para mapeamento de dependências, nós centrais ("God Nodes") e caminhos de impacto antes de propor código ou refatorações.
  - Disponibilizar um mapa interativo completo acessível via botão discreto no cabeçalho (`ChatHeader`) e diretamente nos cards de resposta do chat (`ChatMessage`).
- **Solução Implementada:**
  1. **Motor de Grafos e GraphRAG (`src/lib/graphify-engine.ts` com TDD):**
     - Extração de dependências de código (`imports/exports`), cálculo de nós centrais (God Nodes) e busca de menor caminho via BFS (`findShortestPath`).
     - Função `queryGraphContext` que gera resumos estruturados em Markdown sem estourar a janela de contexto.
     - Parser `parseGraphJson` compatível com os arquivos de saída gerados pelo CLI Python do Graphify.
     - Suíte de 5 testes unitários automatizados em `src/lib/graphify-engine.test.ts`.
  2. **Modal Interativo em Tela Cheia (`src/components/graph-modal.tsx`):**
     - Visualizador interativo SVG com layout orgânico (hubs centrais em órbita interna, nós periféricos por comunidade).
     - Controles de zoom, pan arrastável, busca por módulos/símbolos e painel lateral de dependências (quem importa e o que o arquivo importa).
     - Acesso direto ao editor de código.
  3. **Ferramenta de IA (`query_code_graph` em `src/App.tsx`):**
     - Registrada em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Permite que a IA consulte relacionamentos arquiteturais do projeto ativo sob demanda.
  4. **Integração na Interface:**
     - Botão discreto `[Grafo]` com ícone `Network` no `ChatHeader` (lado direito, ao lado do terminal).
     - Card estilizado em `chat-message.tsx` com botão *"Abrir Mapa"* quando a ferramenta for acionada.
     - Zero alterações na barra lateral, respeitando estritamente a solicitação.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 31/31 testes passando (7 suítes completas).
  - `npm run build`: bundle compilado em 3.16s e artefatos de Cloudflare Pages copiados para `dist/`.

## 51. Migração da Skill Nativa para Cloudflare Pages Awareness
- **Solicitação do Usuário:** *"se estamos na cloaudfire agr essa skill aqui ainda e necessaria? ela meciona vercel"* (Usuário escolheu opção 1: atualizar para Cloudflare).
- **Problema:** A skill antiga `vercel-edge` orientava a IA com restrições e regras exclusivas da Vercel Hobby (limite de 4.5MB, serverless tradicional, `vercel.json`), gerando inconsistências com o runtime real do projeto.
- **Ajustes Realizados (`src/lib/storage.ts`):**
  - Substituída a skill nativa `vercel-edge` por `cloudflare-pages` (`Cloudflare Pages Awareness`).
  - Atualizada a descrição e o system prompt para cobrir:
    1. Runtime Web Standard puro em V8 Isolates (`_worker.ts`).
    2. Roteamento estático + worker via `_routes.json`.
    3. Cold start zero em V8 Isolates.
    4. Streaming de Server-Sent Events (SSE) sem teto restritivo de timeout.
    5. Injeção de variáveis de ambiente e secrets via Cloudflare Dashboard.
  - Implementada auto-migração suave na função `loadSkills`: se o IndexedDB do usuário contiver o ID legado `vercel-edge`, ele é automaticamente substituído por `cloudflare-pages` preservando o status ativo (`enabled`) e persistido.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 31/31 testes passando (7 suítes completas).
  - `npm run build`: bundle compilado com sucesso e artefatos copiados para `dist/`.

## 52. Blindagem Contra Crash de Dynamic Import Pós-Deploy (`lazyWithRetry`)
- **Problema Relatado:** Crash em produção:
  `[SYNAP CRASH] Failed to fetch dynamically imported module: https://synap-8yq.pages.dev/assets/project-workspace-B6OIUaNP.js`
- **Investigação & Causa Raiz:**
  - O usuário estava com uma aba aberta do Synap rodando o HTML do deploy anterior.
  - Quando um novo commit gerou um novo deploy no Cloudflare Pages, os chunks com hashes antigos foram substituídos por novos hashes.
  - Ao clicar na aba de preview/projetos, o React tentou importar `project-workspace` preguiçosamente com o hash antigo que retornou HTTP 404, disparando o crash capturado pelo `GlobalErrorBoundary`.
- **Solução Implementada:**
  1. **Helper de Resiliência (`src/lib/lazy-retry.ts` com TDD):**
     - Criado `isDynamicChunkError` para identificar falhas de importação de módulos dinâmicos.
     - Implementado `lazyWithRetry`: intercepta a falha de download do chunk desatualizado e dispara uma recarga de página limpa (`window.location.reload()`) com proteção anti-loop via `sessionStorage` (janela de 10s).
     - 3 testes unitários automatizados em `src/lib/lazy-retry.test.ts`.
  2. **Substituição de `React.lazy` por `lazyWithRetry`:**
     - Aplicado em `src/App.tsx` (`ProjectWorkspace` e `ProjectsPanel`).
     - Aplicado em `src/components/chat-sidebar.tsx` (`ProjectsPanel`).
     - Aplicado em `src/components/source-control/diff-viewer.tsx` (`ReactDiffViewer`).
  3. **Eventos Globais do Navegador & Vite (`src/main.tsx`):**
     - Adicionado listener para o evento oficial `vite:preloadError`.
     - Captura centralizada em `window.addEventListener('error')` e `unhandledrejection`.
  4. **Experiência Visual Amigável (`src/components/global-error-boundary.tsx`):**
     - Se um erro de chunk antigo atingir o Error Boundary, em vez da tela vermelha assustadora com stack trace técnico, é exibido um card moderno *"Nova versão do Synap disponível"* com auto-atualização em 1.5s e botão imediato.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 34/34 testes passando (8 suítes completas).
  - `npm run build`: bundle compilado com sucesso em 2.73s.

## 53. Permanência na Aba de Chat ao Alternar Conversas (Sem Salto para Preview)
- **Solicitação do Usuário:** *"quando abrir outros chat nn e pra ir direto pra aba preview, fica no chat mesmo, deixa qu vou pra aba preview quando eu desejar"*
- **Causa Raiz:** No `src/App.tsx`, ao clicar em uma conversa com repositório ou projeto correspondente, `handleSelectConversation` acionava `openProject(matchingProject.id)`. Um `useEffect` assistia a mudança de `activeProject?.id` e forçava compulsoriamente `setMainViewTab('preview')`, `setSidebarTab('chats')` e fechamento da barra lateral no mobile, tirando o usuário da tela de chat.
- **Solução Implementada (`src/App.tsx`):**
  1. **Desativação do Salto Compulsório:** Removidas as chamadas `setMainViewTab('preview')`, `setSidebarTab('chats')` e fechamento de sidebar do `useEffect` de `activeProject?.id`. O workspace agora é preparado e mantido em segundo plano sem desviar o foco da tela.
  2. **Garantia de Visualização no Chat:** `handleSelectConversation` e `handleNewChat` agora definem explicitamente `setMainViewTab('chat')`.
  3. **Controle Sob Demanda:** A transição para o Preview ocorre estritamente quando o usuário clica intencionalmente na aba "Preview" no cabeçalho.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 34/34 testes passando (8 suítes completas).
  - `npm run build`: bundle compilado com sucesso em 2.55s (`dist/_worker.js` 106.0 kB).

## 54. Eliminação da Tela Branca no Preview (Compatibilidade Total com Google AI Studio e LinkHub)
- **Solicitação do Usuário:** Resolução da tela branca no Preview para projetos importados/criados no Google AI Studio (como LinkHub e repositórios web vinculados).
- **Diagnóstico & Causas Raízes:**
  1. *Descarte de HTML estático:* O motor anterior descartava a tag `<body>` de projetos HTML/CSS puros e tentava injetar bundles React inexistentes.
  2. *Mismatch de Hooks do React (Singleton):* O import map trazia `react-dom/client` sem `?external=react`, resultando no download de cópias concorrentes do React e travando a renderização em silêncio.
  3. *Dynamic Imports HTTP 404:* O LinkHub usa `React.lazy(() => import('./components/Editor'))`. No iframe, esse dynamic import buscava o arquivo no servidor remoto e recebia HTTP 404.
  4. *Falta de Export Default em `main.tsx`:* Projetos do AI Studio chamam `createRoot` diretamente no `main.tsx` sem exportar default; o motor anterior aguardava `default` e não montava nada.
  5. *Flash Branco em Tema Escuro:* O iframe do preview continha a classe `bg-white` fixa.
- **Solução Implementada:**
  1. **Motor de Preview Híbrido (`src/lib/preview-html.ts`):**
     - *Projetos Estáticos:* Preserva o `index.html` original na íntegra, injetando Tailwind CDN e estilos locais sem apagar as tags do usuário.
     - *Singleton React 19:* Unificou `react`, `react-dom` e `react-dom/client` com `?external=react`.
     - *Dynamic Imports em Memória:* Intercepta `import(...)` via Babel para `window.__synapImport(...)`, permitindo que `React.lazy` carregue componentes locais diretamente da memória sem requisições HTTP 404.
     - *Montagem Flexível:* Executa `main.tsx` diretamente; se `#root` permanecer vazio, monta `App.tsx` automaticamente (suportando tanto default export quanto named export `App`).
     - *Mocks de Ambiente:* Injeta `process.env` e `window.__SYNAP_ENV__` com fallbacks para evitar exceções de chaves de API não definidas.
  2. **Iframe Transparente (`src/components/project-workspace/local-preview.tsx`):**
     - Substituída a classe fixa `bg-white` por `bg-transparent`, permitindo que o fundo do projeto (escuro ou claro) renderize sem flash branco.
  3. **Detecção Web Ampliada (`src/lib/project-context.tsx`):**
     - Reconhece projetos web mesmo com `index.html` em subpastas ou arquivos `App.tsx`/`main.tsx` soltos.
  4. **Suíte TDD de Testes Automatizados (`src/lib/preview-html.test.ts`):**
     - 4 testes unitários cobrindo HTML puro, singleton do React, resolução de caminhos locais e bundle executável do React.
- **Evidências de Verificação:**
  - `npm test`: 38/38 testes passando (9 suítes completas).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 2.02s e artefatos de Cloudflare Pages sincronizados.

## 55. Mini-Editor Visual de Imagem e Retoque com Pincel (Mobile-First)
- **Solicitação do Usuário:** *"eu queria ter a opção de na propria imagem selecionar o objeto que quero alterar, acho que ajuda a ia a entender ne? e possivel com o modelo da nvidia? (...) simm quero e leva em conta os divpositivos moveis pra cirar estruturas"*
- **Arquitetura & Solução Implementada:**
  1. **Helper de Processamento Visual (`src/lib/image-mask-helper.ts` com TDD):**
     - Calcula a Bounding Box normalizada e as porcentagens em relação às dimensões da imagem (`calculateBoundingBox`).
     - Descreve a região em linguagem natural amigável (`describeRegion`, ex: *"no centro da imagem"*, *"no canto inferior direito"*).
     - Compõe instrução enriquecida para o `qwen-image-edit` e inpainting (`buildRegionEditPrompt`, ex: `[Foco de edição: no centro da imagem (ocupando aprox. 40% de largura e 35% de altura)]: <instrução do usuário>`).
     - 5 testes unitários automatizados em `src/lib/image-mask-helper.test.ts`.
  2. **Modal Touch-Friendly Mobile-First (`src/components/image-editor-modal.tsx`):**
     - *Prevenção de Scroll Acidental:* `touch-action: none` e Pointer Events nativos (`pointerdown`, `pointermove`, `pointerup`, `setPointerCapture`), permitindo pintar com o dedo no celular sem provocar rolagem da página.
     - *Ergonomia do Polegar:* Controles inferiores acessíveis ao polegar com touch targets amplos (mínimo 44px), slider de espessura de pincel (10px a 60px), botões "Desfazer", "Limpar" e input direto com botão "Retocar".
     - *Tinta Ciano Neon Semi-transparente:* Feedback visual claro sobre o que foi selecionado.
     - *Fullscreen em Telas Pequenas:* `w-full h-full` no mobile e janela modal flutuante centralizada em desktops.
  3. **Acesso Direto no Chat (`src/components/chat-message.tsx` e `src/App.tsx`):**
     - Botão flutuante discreto com ícone `Paintbrush` e label *"Retocar"* sobre imagens geradas pela IA e anexos enviados pelo usuário.
     - Visibilidade garantida no celular (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`).
     - Integração direta: ao confirmar o retoque, a mensagem com a imagem e a instrução cirúrgica é despachada automaticamente para o chat.
- **Evidências de Verificação:**
  - `npm test`: 43/43 testes passando (10 suítes completas).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 2.88s com artefatos sincronizados para Cloudflare Pages.

## 56. Alinhamento Total da Matriz de IAs, Execução de Ferramentas e Subagentes Autônomos
- **Problema Identificado na Auditoria:**
  1. `deepseek-ai/deepseek-v4.1-flash` recebia o System Prompt de execução imediata de ferramentas no frontend, mas tinha suas `tools` bloqueadas em `api/chat.ts`.
  2. `google/gemma-4-31b-it` perdia a seleção e trocava à força para `z-ai/glm-5.3-flash` ao anexar uma imagem devido a uma checagem estática em `src/App.tsx`.
  3. Modelos em Modo Consulta (`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`) caíam na trava `looksLikeFileModificationPromise` exigindo `edit_file` quando havia repositório ativo.
  4. Subagentes (`dispatch_subagent` / `runSubagent`) operavam sem acesso a ferramentas de leitura ou pesquisa.
- **Solução Implementada:**
  1. **Matriz Unificada de Capacidades (`src/lib/models.ts`, `lib/server/_security.ts`, `api/chat.ts`):**
     - Exportados `TOOL_MODELS` e `isToolCapableModel(model)` com paridade testada entre cliente e servidor, habilitando ferramentas no `deepseek-ai/deepseek-v4.1-flash`.
     - `api/chat.ts` atualizado para consultar `isVisionModel` e `isToolCapableModel`.
  2. **Preservação do Gemma 4 31B e Blindagem de Modelos Sem Tools (`src/App.tsx`):**
     - `handleSendMessage` agora usa `isVisionModel(selectedModel)`, mantendo o `google/gemma-4-31b-it` ativo ao enviar fotos.
     - Sincronizado `isNoToolsModel = !isToolCapableModel(effectiveModel)` para omitir o envio de `tools`, adaptar o `repoPrompt` e desativar `looksLikeFileModificationPromise` em modelos de consulta.
  3. **Loop Autônomo de Ferramentas nos Subagentes (`src/lib/subagent-runner.ts` e `src/App.tsx`):**
     - `runSubagent` agora suporta `tools` e `onExecuteTool` com até 5 iterações autônomas (compatível com SSE e JSON).
     - `dispatch_subagent` equipa cada subagente com ferramentas seguras de leitura e pesquisa (`web_search`, `fetch_url`, `run_python`, `search_github_repos`, `read_github_file`, `query_code_graph`, `read_file`, `list_files`, `search_code`).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 46/46 testes passando (11 suítes, incluindo `src/lib/models.test.ts` e o novo teste de loop de tools em `src/lib/subagent-runner.test.ts`).
  - `npm run build`: bundle de produção e `dist/_worker.js` (106.2 kB) gerados com sucesso.

## 57. Extrator de Ferramentas e Edição de Repositório em 100% dos Modelos (`text-tool-parser.ts`)
- **Solicitação do Usuário:** Habilitar também o 6º modelo (`@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` na Cloudflare Workers AI) para ler e alterar o código do repositório vinculado no chat (100% dos modelos operacionais).
- **Solução Implementada:**
  1. **Motor `src/lib/text-tool-parser.ts` (TDD com 5 testes em `src/lib/text-tool-parser.test.ts`):**
     - `extractTextToolCalls(text)`: Extrai blocos multilinhas `<synap_edit path="..." type="modified|added|deleted">...código...</synap_edit>` (sem exigir escape JSON de quebras de linha ou aspas), tags `<synap_tool name="...">...JSON...</synap_tool>` para qualquer ferramenta (`read_file`, `list_files`, `search_code`, `run_terminal_command`, `web_search`, `fetch_url`, `run_python`, `submit_plan`, `submit_review`) e blocos de código Markdown anotados com `path="..."`.
     - `buildTextToolProtocolPrompt(...)`: Instrui modelos sem Function Calling nativo sobre como ler e editar arquivos do repositório ativo via tags estruturadas.
  2. **Integração no Chat (`src/App.tsx`), Studio (`src/studio/studio-engine.ts`) e Subagentes (`src/lib/subagent-runner.ts`):**
     - Quando um modelo não retorna `tool_calls` nativas no JSON/SSE, o Synap extrai automaticamente as chamadas do texto, limpa as tags brutas da mensagem exibida, aplica as alterações diretamente no **Source Control** (com toast de diff) e realimenta o resultado no loop agentic.
     - Agora **todos os 6 modelos (100%)** conseguem ler, inspecionar e editar repositórios vinculados no Chat, no Studio e em Subagentes.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 51/51 testes passando em 12 suítes.
  - `npm run build`: bundle compilado em 1.75s com artefatos Cloudflare Pages gerados.

## 58. Integração 100% de Skills e MCP nos 6 Modelos, Subagentes e Agent Studio
- **Solicitação do Usuário:** Garantir que as Skills ativas e servidores MCP conectados operem em 100% dos 6 modelos (incluindo `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`), nos Subagentes (`dispatch_subagent`) e no Agent Studio (`Planner`, `Reviewer` e `Implementer`).
- **Solução Implementada:**
  1. **Catálogo MCP no 6º Modelo (`src/lib/text-tool-parser.ts` e `src/App.tsx`):**
     - `buildTextToolProtocolPrompt` agora recebe `mcpTools` e documenta todas as ferramentas `mcp__<serverId>__<toolName>` ativas (com descrição e parâmetros) no prompt textual do `DeepSeek R1 Distill 32B (CF)`, permitindo sua execução via `<synap_tool name="mcp__...">`.
  2. **Skills + MCP nos Subagentes (`src/lib/subagent-runner.ts` e `src/App.tsx`):**
     - `SubagentConfig` e `buildSubagentSystemPrompt` passaram a aceitar `skillsPrompt`, injetando as Skills ativas nos subagentes.
     - `runSubagent` agora adapta o protocolo textual quando o modelo selecionado não possui Function Calling nativo e recebe `mcpOpenAiTools` em `dispatch_subagent`.
  3. **Skills + MCP no Agent Studio (`src/studio/studio-engine.ts`, `src/studio/studio-panel.tsx` e `src/App.tsx`):**
     - `StudioPanel` recebe `skills` e `mcpServers` e repassa `StudioRuntimeContext` para `runPlanner`, `runReviewer` e `runImplementer`.
     - Os 3 agentes do Studio agora recebem as Skills ativas no System Prompt e podem invocar ferramentas `mcp__*` (executadas via `executeMcpToolCall`).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 52/52 testes passando em 12 suítes.
  - `npm run build`: bundle compilado em 2.39s com artefatos Cloudflare Pages gerados.

## 59. Ajuste Visual: Cor do Ícone do Botão "Grafo"
- **Solicitação do Usuário:** Alterar o ícone do botão "Grafo" para a cor azul.
- **Solução Implementada:**
  - Atualizado `src/components/chat-header.tsx` para trocar a classe do ícone `Network` de `text-emerald-400` (verde) para `text-sky-400` (azul vibrante com alta legibilidade).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 52/52 testes passando.
  - `npm run build`: bundle compilado com sucesso.

