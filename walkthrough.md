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

## 60. Mapa de Arquitetura Graphify 3D de Alta Performance (60 FPS no Navegador)
- **Solicitação do Usuário:** Evoluir o Mapa de Arquitetura (Graphify) para um modelo 3D de alta performance e qualidade visual rodando diretamente no navegador.
- **Solução Implementada:**
  1. **Motor Físico e Matemático 3D (`src/lib/graph-3d-engine.ts` + `src/lib/graph-3d-engine.test.ts`):**
     - `compute3DLayout`: Distribuição esférica de Fibonacci + cascas orbitais 3D (Hubs centrais no núcleo interno e comunidades nas órbitas externas) combinada com simulação física 3D (`step3DForceSimulation` com repulsão de Coulomb e molas elásticas de Hooke).
     - `project3DNodes` e `findClosestProjectedNode`: Projeção em perspectiva 3D com distância focal (`fov`), matriz de rotação orbital (`rotX`, `rotY`), ordenação de profundidade `z-sorting` (Painter's Algorithm), efeito de profundidade atmosférica (*Depth of Field*) e hit-testing 3D preciso.
  2. **Renderizador 3D Interativo HiDPI a 60 FPS (`src/components/graph-modal.tsx`):**
     - Substituído o SVG 2D estático por um `<canvas>` acelerado em HiDPI (`devicePixelRatio`) a 60 FPS com zero peso extra de bibliotecas externas.
     - **Qualidade Visual 3D:** Esferas volumétricas com iluminação especular, halo neon pulsante nos Hubs, anéis orbitais 3D holográficos e **partículas luminosas de fluxo de dados** viajando pelas conexões do módulo selecionado.
     - **Controles 3D:** Rotação 360° com inércia via mouse/touch, auto-giro orbital ativável, alternância 3D/2D, zoom suave e transição animada de câmera (*Focar 3D*) ao selecionar qualquer arquivo.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 56/56 testes passando em 13 suítes.
  - `npm run build`: bundle de produção compilado com sucesso.

## 61. Correção do Motor de Dependências Graphify e Flicker 3D
- **Solicitação do Usuário:**
  1. Eliminar a piscada da tela ao passar o mouse sobre as esferas do grafo 3D.
  2. Verificar e corrigir a exibição de arquivos usados (`Usado por` / `inDegree`), arquivos importados (`Importa` / `outDegree`) e quem depende de quem no Mapa de Arquitetura Graphify.
- **Causa Raiz Identificada (`systematic-debugging`):**
  1. **Flicker no Hover (`src/components/graph-modal.tsx`):** `hoveredNodeId` estava nas dependências do `useEffect` que criava o `<canvas>` e o loop `requestAnimationFrame`, zerando o buffer do canvas a cada hover.
  2. **Conteúdo Vazio em Projetos Reais (`src/App.tsx`):** `activeProject.files` armazena objetos `ProjectFile` (`{ path, content }`), mas `projectGraph` fazia `typeof content === 'string' ? content : ''`, passando strings vazias para todos os arquivos de projetos reais e gerando `0 dependências`.
  3. **Fallback Limitado e Resolução de Imports (`src/App.tsx` e `src/lib/graphify-engine.ts`):** O fallback sem projeto externo tinha apenas 10 arquivos resumidos (sem `main.tsx`, `graph-3d-engine.ts`, `studio-engine.ts`, etc.) e não mesclava `changes` pendentes. Além disso, `normalizePath` não removia `/` inicial e `resolveRelativePath` ignorava aliases `@/` e `src/`.
- **Solução Implementada:**
  - `src/components/graph-modal.tsx`: Desacoplado `hoveredNodeIdRef` e `sceneRef` do `useEffect` do loop 3D, eliminando 100% da piscada ao encostar o mouse nas esferas.
  - `src/lib/graphify-engine.ts` + `src/lib/graphify-engine.test.ts`: Normalização de `/` inicial, suporte a aliases (`@/`, `~/`, `src/`) e extração completa de `import`/`export ... from` multiline, `import type`, side-effect imports e `import()` dinâmico.
  - `src/App.tsx`: Extração correta de `fileEntry.content` em `activeProject.files`, mesclagem em tempo real das alterações pendentes (`changes`) do Source Control e atualização do mapa arquitetural padrão do Synap com todos os 17 módulos reais e suas dependências.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes.
  - `npm run build`: bundle de produção compilado com sucesso.

## 62. GraphRAG Passivo Automático no System Prompt + Sincronização Prioritária de Código (Economia de Tokens)
- **Solicitação do Usuário:** Garantir 100% que a IA no chat use o grafo de dependências (quem importa quem e quem depende de quem) automaticamente para entender o repositório sem precisar sair lendo todos os arquivos e gastando tokens.
- **Solução Implementada:**
  1. **GraphRAG Passivo em Todas as Mensagens (`src/App.tsx`):**
     - Ao enviar qualquer mensagem com repositório ativo, o Synap executa `queryGraphContext(projectGraph, { query: userMessage.content.slice(0, 120), maxNodes: 8 })` e injeta o resumo cirúrgico de dependências (**Importa** / **Usado por** + **Hubs Centrais**) diretamente no `repoPrompt` (modelos nativos) e no `basePrompt` (6º modelo `DeepSeek R1 Distill 32B`).
     - Adicionada diretriz explícita de **Economia de Tokens (GraphRAG)** instruindo a IA a consultar o mapa injetado antes de chamar `read_file`, evitando leituras cegas.
  2. **Sincronização Prioritária de Código e Auto-Sync na Troca de Branch (`src/lib/project-context.tsx` e `src/App.tsx`):**
     - `handleChangeBranch` agora dispara `syncRepoToProject` automaticamente ao alternar de branch.
     - `syncRepoToProject` passou a aceitar qualquer repositório com arquivos de código (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.dart`, etc.), ignorar lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) e ordenar/priorizar até **80 arquivos de código-fonte** para alimentar o Graphify.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: todas as suítes passando.
  - `npm run build`: bundle de produção compilado com sucesso.

## 63. Otimização Máxima do Preview Web (Zero "Compilando", Zero Glitch Branco e 0ms Keep-Alive)
- **Solicitação do Usuário:** Otimização máxima da função de Preview: ao clicar, ver a página web imediatamente, sem overlay de "Compilando preview..." e sem o glitch de tela branca antes de carregar.
- **Causa Raiz Identificada (`systematic-debugging`):**
  1. O `<ProjectWorkspace>` era completamente desmontado ao voltar para o chat e reconstruído do zero ao clicar em Preview, adicionando um atraso artificial de `setTimeout(..., 250)` no `local-preview.tsx`.
  2. O `<iframe>` iniciava com `srcDoc=""` (`about:blank` padrão branco dos browsers), disparando um flash branco perceptível antes do Tailwind e do React montarem.
  3. Havia 591 KB de imports não utilizados do `@codesandbox/sandpack-react` em `project-workspace.tsx`.
  4. As alterações em tempo real feitas pela IA no chat (`changes` no Source Control) não eram refletidas no Preview antes do commit.
- **Solução Implementada:**
  - `src/App.tsx`: Pré-aquecimento automático do Babel em background (`loadBabel()`), mesclagem instantânea das edições pendentes (`changes`) da IA sobre o `previewProject` e **Keep-Alive em background**: a aba de preview permanece renderizada no DOM (com alternância `hidden` vs `flex`), permitindo que a troca de abas ocorra instantaneamente em 0ms.
  - `src/components/project-workspace/local-preview.tsx`: Removido o overlay "Compilando preview..." e o atraso de 250ms. Compilação síncrona imediata quando o Babel já está em cache; fundo `#09090b` travado e `opacity: 0` até receber `__SYNAP_PREVIEW_READY__` ou evento `onLoad`, eliminando 100% do flash branco.
  - `src/lib/preview-html.ts` + `src/lib/preview-html.test.ts`: CSS anti-flash imediato injetado no `<head>` (`html, body { background-color: #09090b; }`) e notificação `postMessage({ type: '__SYNAP_PREVIEW_READY__' })` logo após a montagem do React ou término do HTML estático.
  - `src/components/project-workspace/project-workspace.tsx`: Removido todo o bundle obsoleto do Sandpack (591 KB eliminados).
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 53/53 testes passando em 13 suítes (+ `preview-html.test.ts` verde).
  - `npm run build`: bundle compilado em 1.62s.

## 64. Correção de Desabilitação do Preview ao Recarregar a Página (F5)
- **Solicitação do Usuário:** Ao estar dentro de um chat e dar F5 (recarregar a página), o botão de Preview desabilitava e exigia clicar no chat novamente pela barra lateral para voltar a funcionar.
- **Causa Raiz Identificada (`systematic-debugging`):**
  1. Ao dar F5, o React inicializava `activeId` como `null`, e o `useEffect` de carregamento inicial pegava apenas `enhanced[0].id` ignorando qual conversa o usuário estava realmente usando.
  2. Mais crítico: a sincronização e abertura automática do projeto Sandpack (`openProject(matchingProject.id)`) só existia dentro do clique manual `handleSelectConversation`. No carregamento inicial por F5, `activeProject` continuava `null`, fazendo o botão de Preview desabilitar (`disabled={!activeProjectName}`).
- **Solução Implementada:**
  - `src/App.tsx`:
    - Criada persistência de `synap_active_conv_id` no `localStorage`, restaurando no F5 exatamente a mesma conversa que você estava vendo.
    - Criado `useEffect` de auto-associação reativa: assim que `activeRepo` e `projectsIndex` carregam na montagem inicial (F5), ele localiza o projeto do repositório e chama `openProject` automaticamente (ou dispara `syncRepoToProject`), garantindo que o Preview já nasça habilitado e pronto.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 53/53 testes passando em 13 suítes.
  - `npm run build`: bundle compilado em 1.78s.

## 65. Cache Síncrono de Inicialização e Pré-Renderização Off-Screen (0ms Real)
- **Solicitação do Usuário:** Eliminar o tempo em que o botão Preview fica em preto e branco ao dar F5 e eliminar o tempo de tela preta ao clicar em Preview pela primeira vez.
- **Causa Raiz Identificada (`systematic-debugging`):**
  1. **Botão P&B no F5:** O estado inicial de `activeProject` e `projectsIndex` vinha do IndexedDB assíncrono. Até o Promise resolver, o React renderizava sem projeto ativo.
  2. **Tela Preta no 1º Clique:** O Keep-Alive usava `display: none` (`hidden`). Navegadores congelam iframes invisíveis via `display: none`, adiando o download dos scripts/módulos para o momento exato em que o usuário clica em Preview.
- **Solução Implementada:**
  - `src/lib/project-storage.ts`: Adicionado cache síncrono no `localStorage` (`synap_cached_active_project` e `synap_cached_projects_index`).
  - `src/lib/project-context.tsx`: `ProjectProvider` inicializa `activeProject` e `projectsIndex` diretamente do cache síncrono no milissegundo zero da montagem.
  - `src/App.tsx`: A camada Keep-Alive agora renderiza o preview em modo off-screen invisível (`absolute -left-[9999px] pointer-events-none opacity-0`) enquanto você conversa no chat. O iframe carrega React, Tailwind e pacotes em background; ao clicar em Preview, a página já está 100% montada e salta na tela instantaneamente.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 53/53 testes passando em 13 suítes.
  - `npm run build`: compilado em 1.84s.

## 66. Harmonização Visual dos Botões Flutuantes do Preview e Workspace
- **Solicitação do Usuário:** Adaptar os botões flutuantes de ação do Preview (recarregar e abrir em nova aba) ao padrão visual escuro, elegante e consistente do Synap (removendo o estilo branco quadrado).
- **Solução Implementada:**
  - `src/components/project-workspace/local-preview.tsx`:
    - Substituído o container branco por card pill flutuante com blur: `bg-[color:var(--c-bg-181714,#181714)]/90 backdrop-blur-md border border-[color:var(--c-bg-2d2b26,#2d2b26)]/80 shadow-lg p-1 rounded-xl`.
    - Botões de recarregar e abrir em nova aba estilizados com: `text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-[color:var(--c-fg-f3efe6,#f3efe6)] hover:bg-[color:var(--c-bg-25231e,#25231e)] active:scale-95 transition-all`.
    - Ao recarregar, o ícone de `RefreshCw` gira destacando a cor de destaque âmbar/laranja do Synap (`text-[#d97757]`).
  - `src/components/project-workspace/project-workspace.tsx`:
    - Botão flutuante de fechar (`X`) no canto superior esquerdo harmonizado com o mesmo design pill escuro com blur e microinteração `active:scale-95`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 53/53 testes passando em 13 suítes.
  - `npm run build`: compilado com sucesso em 1.89s.

## 67. Correção de Promessas de Ação da IA Sem Execução e Resiliência a 'The operation was aborted'
- **Solicitação do Usuário:** O modelo Gemma 4 31B (no modo pensar `low`) prometeu listar arquivos para remover um ícone no componente `Maintenance` e parou sem executar a ferramenta. No turno seguinte, após listar e ler o arquivo, a geração abortou com `⚠️ Erro: The operation was aborted`.
- **Causas Raízes Identificadas (`systematic-debugging`):**
  1. O prompt de sistema anti-preâmbulo citava apenas ações de edição, terminal, busca e documentos, mas não proibia expressamente narrativas preliminares em texto para listagem (`list_files`) e leitura (`read_file`).
  2. As funções de detecção do Agentic Loop (`looksLikeIncompleteWork` e `looksLikeFileModificationPromise`) falhavam em frases com pontuação (`"Primeiro, vou..."`) e não cobriam verbos de remoção/deleção (`remover`, `deletar`, `apagar`) nem de inspeção (`listar`, `ler`, `localizar`).
  3. Quedas ou interrupções de stream no socket com a NVIDIA disparavam `AbortError: The operation was aborted` no fetch. O backend tratava como encerramento padrão (`finish_reason: 'stop'`) e o frontend exibia o erro em texto puro na tela em vez de classificar como erro recuperável e retomar a geração com os dados das ferramentas já executadas.
- **Solução Implementada:**
  - `src/lib/agentic-patterns.ts` + `src/lib/agentic-patterns.test.ts`:
    - Criado módulo dedicado e testado via TDD com regex abrangente para detectar intenções de listar, localizar, remover e deletar arquivos mesmo com pontuação.
    - Criada função `isRecoverableStreamErrorMessage` cobrindo `The operation was aborted`, `AbortError`, quedas de stream e resets de socket.
  - `src/App.tsx`:
    - Substituída a lógica inlined pela importação de `src/lib/agentic-patterns.ts`.
    - Atualizados `repoPrompt` e `basePrompt` com a diretriz estrita: *"NUNCA anuncie ou prometa em texto puro que vai listar, buscar, ler ou alterar arquivos... Chame as ferramentas diretamente via tool_call"*.
    - Ao detectar interrupção de stream com leituras já concluídas (`read_file` ou `list_files`), o Synap injeta prompt de continuação cirúrgico ordenando a emissão imediata de `edit_file`.
  - `api/chat.ts`:
    - Adicionado suporte a `chat_template_kwargs: { enable_thinking: true }` no payload do `google/gemma-4-31b-it` para canalizar pensamentos antes das ferramentas.
    - Corrigido `buildFormattedMessages` para enviar `content: ""` em vez de `null` para mensagens de assistente com tool_calls no histórico.
    - Atualizado o catch do stream para marcar `isInterruption: true` em caso de `AbortError` / socket reset e formatar mensagem descritiva.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes (incluindo testes dedicados de padrões de agentic loop e resiliência de stream).
  - `npm run build`: bundle compilado com sucesso em 1.77s.

## 68. Ancoragem Automática no Fim do Chat ao Voltar de Preview e Studio
- **Solicitação do Usuário:** Ao ir para a aba Preview ou Studio e retornar ao Chat clicando nas abas superiores, o chat abria posicionado no topo da conversa, forçando a rolar manualmente até o fim para ver as mensagens mais recentes.
- **Causas Raízes Identificadas (`systematic-debugging`):**
  1. O contêiner de mensagens do Chat era desmontado do DOM (`null`) enquanto a aba Preview ou Studio estava ativa. Ao retornar para "Chat", o elemento recém-montado nascia com `scrollTop = 0` (topo).
  2. O efeito de auto-scroll só respondia a novas mensagens de streaming ou troca de conversa (`activeId`), inexistindo gatilho para a alternância entre abas (`mainViewTab`).
- **Solução Implementada:**
  - `src/App.tsx`:
    - O contêiner do Chat agora permanece montado no DOM alternando classe `hidden` vs `flex-1 flex flex-col min-h-0 relative`, preservando o estado e evitando remontagens custosas.
    - Criado `useEffect` dedicado monitorando `[mainViewTab, isStudioMode, activeId]`:
      - Reseta flags de scroll do usuário (`isAtBottomRef.current = true; isUserScrollingRef.current = false;`).
      - Executa scroll imediato para `messagesContainerRef.current.scrollHeight`.
      - Executa ancoragem precisa em `requestAnimationFrame` e via `messagesEndRef.current.scrollIntoView({ block: 'end' })`.
      - Timers de segurança (40ms e 120ms) garantem o alinhamento no rodapé mesmo com renderização assíncrona de blocos de markdown e código.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes.
  - `npm run build`: bundle compilado com sucesso em 2.57s.



## 69. Remoção do Toast Flutuante Sobreposto e Agrupamento Recolhível de Ferramentas Concluídas
- **Solicitação do Usuário:**
  1. Remover o toast flutuante no canto inferior direito que sobrepunha o chat durante a edição de arquivos, mantendo exclusivamente o card de arquivo editado que já é exibido no corpo da mensagem com o botão "Ver diff".
  2. Agrupar os chips de ferramentas concluídas (`list_files`, `read_file`, `edit_file`, etc.) dentro de um acordeão recolhível, iniciando fechado/agrupado por padrão e permitindo ao usuário expandir quando quiser para ver todos os arquivos lidos e editados.
- **Solução Implementada:**
  1. **Remoção do Toast Flutuante Redundante (`src/App.tsx`):**
     - Removidos o estado `toastNotification`, seus disparos em `edit_file` e `batch_edit_files`, e o bloco JSX `fixed bottom-24 right-4 z-50` que sobrepunha a caixa de entrada do chat.
     - Preservado integralmente o card de arquivo editado incorporado na mensagem (`ChatMessage`).
  2. **Acordeão Recolhível de Ferramentas Concluídas (`src/components/chat-message.tsx`):**
     - Criado estado `isToolsExpanded` (iniciando em `false`).
     - Separadas as ferramentas ativas (`running`), ferramentas aguardando (`waiting`) e ferramentas concluídas.
     - Ferramentas de inspeção e manipulação de arquivos concluídas (`list_files`, `read_file`, `edit_file`, `search_code`, etc.) agora são agrupadas em um card compacto com contagem e tags das ferramentas (`X ferramentas executadas`), acompanhado de botão de expandir/recolher e chevron animado.
     - Ao clicar, o grupo expande suavemente exibindo a lista detalhada com checks e caminhos de arquivos.
     - Ferramentas em execução mantêm o `ThinkingOrb` animado ativo em tempo real.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes.
  - `npm run build`: bundle de produção e artefatos Cloudflare Pages gerados com sucesso.

## 70. Integração Completa do Modelo NVIDIA Nemotron-3 Ultra 550B (Frontend e Backend)
- **Solicitação do Usuário:** Adicionar o modelo `nvidia/nemotron-3-ultra-550b-a55b` com autenticação via `NVIDIA_API_KEY`, habilitando-o de ponta a ponta no frontend e no backend.
- **Solução Implementada:**
  1. **Tipagem e Matriz de Segurança (`src/lib/types.ts`, `src/lib/models.ts` e `lib/server/_security.ts`):**
     - Adicionado `'nvidia/nemotron-3-ultra-550b-a55b'` ao `ModelId`, `ALLOWED_MODELS` e `TOOL_MODELS` no cliente e servidor, permitindo o uso de ferramentas nativas e do `text-tool-parser`.
  2. **Roteamento de Chat e Pensamento Estendido (`api/chat.ts`):**
     - Injetado `p.chat_template_kwargs = { enable_thinking: true }` no payload da API da NVIDIA para o modelo `nvidia/nemotron-3-ultra-550b-a55b`.
     - Suporte a até 16.384 tokens de resposta no modo `max`.
  3. **Interface e Monitoramento de Contexto (`src/components/model-controls.tsx` e `src/App.tsx`):**
     - Adicionado ao dropdown de modelos com o título **Nemotron-3 Ultra 550B**, subtítulo e badge **NVIDIA · 550B**.
     - Configurado label abreviado **Nemotron 550B** no botão pill do seletor.
     - Limite de contexto ampliado para 256.000 tokens no monitor de tokens.
     - Persistência e restauração do modelo via `localStorage` em `src/App.tsx`.
  4. **Testes de Paridade (`src/lib/models.test.ts`):**
     - Testes unitários atualizados validando a paridade de capacidades entre cliente e servidor com 100% de cobertura.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes.
  - `npm run build`: bundle compilado em 2.51s com artefatos Cloudflare Pages gerados.

## 71. Remoção Completa do Pollinations e Atualização para Nemotron-3.5 Super VL
- **Solicitação do Usuário:**
  1. Remover 100% o Pollinations (`image.pollinations.ai`). Geração e edição de imagens passam a ser exclusivamente via NVIDIA NIM (`qwen-image` e `qwen-image-edit`), com retorno transparente de erro caso a chave não esteja configurada ou ocorra falha.
  2. Substituir o modelo Nemotron anterior pelo mais novo: `nvidia/nemotron-3.5-super-vl-120b-a12b` (Vision-Language de 120B com raciocínio e visão nativos).
- **Solução Implementada:**
  1. **Remoção de Pollinations e Motor Exclusivo NVIDIA NIM (`api/image.ts`):**
     - Removido todo e qualquer bloco de fallback para `image.pollinations.ai`.
     - Validação explícita de `NVIDIA_API_KEY`: retorna status `401 Unauthorized` imediato com mensagem orientando configuração da chave no Cloudflare Pages ou ambiente local.
     - Repasse transparente do código HTTP e corpo de erro (`${nvidiaRes.status}: ${errorBody}`) quando a API da NVIDIA retornar falha, eliminando silenciamento de erros.
  2. **Atualização para `nvidia/nemotron-3.5-super-vl-120b-a12b`:**
     - `src/lib/types.ts`: Atualizado `ModelId` com o novo identificador.
     - `src/lib/models.ts` e `lib/server/_security.ts`: Modelo adicionado em `ALLOWED_MODELS`, `TOOL_MODELS` e `VISION_MODELS` (suporte multimodal a imagens no chat).
     - `api/chat.ts`: Injetado `chat_template_kwargs: { enable_thinking: true }` para o modelo `nvidia/nemotron-3.5-super-vl-120b-a12b`.
     - `src/components/model-controls.tsx`: Interface atualizada com o título **Nemotron-3.5 Super VL**, badge **NVIDIA · VL**, pill **Nemotron VL** e janela de 256k tokens.
     - `src/components/chat-input.tsx`: Verificação `isVisionModel` garantindo que o Nemotron VL aceite anexos de imagem diretamente sem alternar forçadamente para outro modelo.
     - `src/App.tsx`: Atualizada restauração de `localStorage` e checagem de flag `isFlashModel`.
  3. **Testes Unitários (`src/lib/models.test.ts`):**
     - Atualizados testes de paridade validando `isVisionModel` e `isToolCapableModel` para `nvidia/nemotron-3.5-super-vl-120b-a12b`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes.
  - `npm run build`: bundle compilado em 2.48s com artefatos Cloudflare Pages gerados com sucesso.

## 72. Eliminação do Glitch de Rolagem (Sobe e Desce) Durante o Pensamento da IA
- **Solicitação do Usuário:** Durante a execução/pensamento da IA, a tela ficava dando glitch e pulando para cima e para baixo repetidamente, mesmo sem nenhum texto final gerado. Solicitado teste em simulação automatizada para não ser um "tiro no escuro".
- **Diagnóstico com Evidência Empírica (`systematic-debugging`):**
  - Criado script de simulação CDP com Edge headless (`scratch/simulate.js`) monitorando o contêiner de rolagem sob stream de pensamento.
  - Reproduzido com precisão o glitch de subida e descida:
    - Step 0: `scrollTop +299px (DOWN)`
    - Step 1: `scrollTop -122px (UP)` <-- tela subia 122px devido a chunk `\n` desmontando o card `ThinkingOrb` e montando markdown vazio de 0px.
    - Step 2: `scrollTop +174px (DOWN)` <-- tela descia 174px ao detectar `<think>` e remontar o card.
    - Step 7: `scrollTop -36px (UP)` <-- tela subia ao término do pensamento pelo colapso do card duplicado.
  - Causas raízes identificadas:
    1. Whitespace puro (`\n`, espaços) tratado como conteúdo real (`Boolean('\n') === true`).
    2. Card duplicado do `ThinkingOrb` (128px) abaixo do markdown competindo com o acordeão de raciocínio no topo.
    3. `[overflow-anchor:none]` desativando a estabilização nativa de rolagem do navegador.
    4. Auto-scroll programático ativando a flag `isUserScrollingRef = true` por 250ms, bloqueando frames seguintes.
- **Solução Implementada:**
  1. `src/components/chat-message.tsx`:
     - Implementado `hasRealContent = Boolean(cleanContent && cleanContent.trim().length > 0)`. Espaços e quebras de linha não ocultam o estado de espera.
     - Unificado o card de conexão/espera com o Acordeão de Raciocínio no mesmo ponto superior do componente com altura idêntica (`min-h-[42px]`), eliminando completamente o card de 128px redundante e quedas bruscas de altura.
  2. `src/App.tsx`:
     - Criada flag `isProgrammaticScrollRef` para que rolagens acionadas pelo sistema não travem o auto-scroll como se fossem gestos do usuário.
     - Substituída a rolagem suave concorrente por rolagem direta no envio de mensagens.
     - Removida a classe `[overflow-anchor:none]`, restaurando a ancoragem estável nativa do navegador.
     - Substituído `scrollIntoView` (que afetava elementos externos e viewport) por rolagem interna restrita a `messagesContainerRef`.
  3. `api/chat.ts`:
     - Habilitado `CloudflareThinkSplitter` para modelos com `enable_thinking` (Nemotron e Gemma), entregando tokens de pensamento diretamente como `delta.reasoning_content`.
- **Evidências de Verificação:**
  - **Simulação CDP no Edge (`scratch/simulate.js`):** 100% dos eventos registrados com `direction: 'DOWN'`. Nenhuma ocorrência de `direction: 'UP'` ou sobressalto visual.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: 57/57 testes passando em 14 suítes.
  - `npm run build`: bundle compilado em 2.20s com artefatos Cloudflare Pages gerados.

## 73. Correção do Pyodide ESM no Web Worker e Blindagem Anti-Base64 de Edição de Código
- **Problema Relatado:** Ao editar arquivos em repositórios conectados, a IA falhou ao tentar rodar Python no navegador com a exceção `Failed to execute 'importScripts' on 'WorkerGlobalScope': Module scripts don't support importScripts()`, codificou arquivos em Base64 bruto quebrando componentes React (Erro #130) e tentou comandos bash de Linux (`cat > ... << 'EOF'`, `find`) no emulador Git.
- **Causas Raízes:**
  1. *Pyodide Web Worker:* O worker foi instanciado com `{ type: 'module' }`. Pela especificação da Web (W3C/MDN), Workers do tipo módulo proíbem `importScripts()`.
  2. *Contorno errôneo da IA:* A IA tentou usar `run_python` e comandos Bash de redirecionamento para gravar arquivos em vez de chamar diretamente a ferramenta nativa `edit_file` com o código JSX limpo.
- **Solução Implementada:**
  1. **Carregador ESM do Pyodide (`src/workers/pyodide-worker.ts`):**
     - Substituída a chamada `importScripts(...)` por import dinâmico ESM oficial com diretiva `/* @vite-ignore */`:
       `const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs');`
     - Elimina 100% da incompatibilidade de Web Workers de módulo no navegador.
  2. **Blindagem do System Prompt (`src/App.tsx` & `src/lib/text-tool-parser.ts`):**
     - Adicionada regra estrita anti-Base64: arquivos devem ser criados e alterados OBRIGATORIAMENTE em texto claro legível (TypeScript, JSX, CSS) via `edit_file` / `batch_edit_files`.
     - Esclarecidos os limites do emulador de terminal Git: proibição de comandos de shell Linux com redirecionamento (`>`, `cat >`, heredocs `<< EOF`, `touch`, `nano`, `find`).
     - Delimitado o sandbox do `run_python`: exclusivo para cálculos matemáticos e testes de algoritmos, sem acesso ao repositório ou disco.
- **Evidências de Verificação:**
  - `npm test`: 57/57 testes unitários passando em 14 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado em 2.12s com chunk isolado do worker `pyodide-worker-LDet7bQ4.js` (0.88 kB).

## 74. Obrigatoriedade do Grafo de Arquitetura e Exibição Visual de Habilidades no Chat
- **Solicitação do Usuário:** O usuário notou em chat anterior que a IA não havia consultado o grafo de arquitetura (`query_architecture_graph`) antes de alterar arquivos e que as habilidades deveriam ser compulsórias, com exibição explícita na tela de qual habilidade foi usada em cada resposta/alteração.
- **Diagnóstico & Causas Raízes:**
  1. *Mismatch de nome de ferramenta:* O System Prompt instruía o uso de `query_architecture_graph`, mas a ferramenta estava registrada no catálogo OpenAI apenas como `query_code_graph`.
  2. *Habilidades essenciais desativadas por padrão:* As habilidades `tdd`, `debugging`, `security` e `perf` estavam com `enabled: false` por padrão em `src/lib/storage.ts`.
  3. *Ausência de feedback visual de habilidades:* A interface do chat não possuía elementos visuais para indicar quais habilidades estavam sendo aplicadas na resposta ou edição de código.
- **Solução Implementada:**
  1. **Unificação e Obrigatoriedade do Grafo de Arquitetura:**
     - Criado e registrado o alias formal `QUERY_ARCHITECTURE_GRAPH_TOOL` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS` em `src/App.tsx`.
     - Tratamento unificado em `executeGitHubTool` para `query_code_graph` e `query_architecture_graph`.
     - Injeção obrigatória no `repoPrompt`: instrução imperativa de que o modelo DEVE consultar o grafo antes de qualquer edição de arquivo.
     - Injeção automática das conexões de nós (`queryGraphContext`) diretamente no retorno das ferramentas `edit_file` e `batch_edit_files`.
     - Suporte em `chat-message.tsx` para renderizar o card de visualização do grafo GraphRAG para ambos os nomes.
  2. **Ativação Compulsória das Habilidades Essenciais:**
     - Habilitadas por padrão (`enabled: true`) em `BUILTIN_SKILLS` (`tdd`, `debugging`, `security`, `perf`) em `src/lib/storage.ts`.
     - `loadSkills()` garante a ativação automática caso perfis legados no IndexedDB estivessem com elas desativadas.
     - Diretriz mandatória no `skillsPrompt` exigindo declaração de habilidades via `[Habilidade: <Nome>]`.
  3. **Módulo de Extração e Testes Unitários TDD (`src/lib/skills-extractor.ts`):**
     - Extrai habilidades declaradas ou associa habilidades ativas pertinentes caso arquivos tenham sido alterados.
     - 4 testes unitários automatizados em `src/lib/skills-extractor.test.ts`.
  4. **Componente Visual de Habilidades Aplicadas (`src/components/chat-message.tsx`):**
     - Adicionado card visual com ícone `Sparkles`, bordas âmbar e pills com os nomes das habilidades aplicadas na resposta da IA.
     - Limpeza automática de tags brutas `[Habilidade: ...]` do corpo de texto para apresentação limpa e sem ruídos.
- **Evidências de Verificação:**
  - `npm test`: 61/61 testes unitários passando em 15 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado em 2.15s com sucesso.

## 75. Restauração do Card Visual Rico de Conexão com a IA
- **Solicitação do Usuário:** O usuário solicitou o retorno do visual anterior de "conectando com a IA" (com o orb expandido de 64px e card detalhado) que havia sido substituído por uma barra fina de 42px no commit `2645cb4`, mantendo a correção da interface que eliminou o glitch de rolagem (sobe e desce da tela).
- **Diagnóstico e Não-Regressão:**
  - A barra simplificada de 42px havia sido introduzida para evitar que a tela pulasse ao receber tokens de pensamento.
  - Contudo, a causa real do salto de tela identificada na Seção 72 foi:
    1. Whitespace puro tratado como conteúdo (`Boolean('\n') === true`).
    2. Eventos de rolagem programáticos travando o auto-scroll (`isUserScrollingRef`).
    3. Falta de ancoragem nativa de scroll do navegador (`[overflow-anchor:none]`).
  - Como esses três pontos foram corrigidos de forma estrutural (com `hasRealContent = Boolean(cleanContent && cleanContent.trim().length > 0)`, `isProgrammaticScrollRef` e restauração do overflow-anchor nativo), o card visual rico com `ThinkingOrb` (size 64) pôde ser restaurado com segurança no contêiner de markdown sem reintroduzir nenhum salto de tela.
- **Solução Implementada (`src/components/chat-message.tsx`):**
  1. **Remoção da Barra Fina (42px):** Retirada a barra simplificada que substituía o estado de carregamento nas linhas superiores do componente.
  2. **Restauração do Card Visual Rico:** Reinserido o card estilizado com:
     - `ThinkingOrb` no modo `working`, tamanho 64, tema dark e velocidade `1.5x`.
     - Título dinâmico (`Conectando…` / `Pensando…` / `Aguardando…`) com ponto âmbar pulsante (`#d97757`).
     - Subtítulo em fonte monospace detalhando a etapa em andamento (ex.: *"Estabelecendo conexão com o modelo de IA…"*, contagem de caracteres de raciocínio ou modo de plano estratégico).
     - Estilização com cantos arredondados (`rounded-2xl`), bordas sutis e fundo semitransparente com variáveis CSS adaptáveis ao tema.
  3. **Correção de Escopo de Variáveis:** Organizada a declaração de `hasRealContent` logo após a limpeza de texto para uso em `isAwaitingCompletion` e `isConnecting`, garantindo compatibilidade estrita com TypeScript (`tsc --noEmit` com 0 erros).
- **Evidências de Verificação:**
  - `npm test`: 61/61 testes unitários passando em 15 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e artefatos Cloudflare Pages compilados em 2.37s.

## 76. Remoção Completa das Ferramentas e Recursos de Geração e Edição de Imagens
- **Solicitação do Usuário:** Remover os modelos e ferramentas de geração e edição de imagens, uma vez que modelos de imagem locais (como Qwen-Image / Qwen-Image-Edit da NVIDIA) não possuem endpoints de inferência serverless online gratuitos, mantendo o Synap focado 100% em desenvolvimento de software, código, arquitetura, terminal e documentos.
- **Solução Implementada:**
  1. **Exclusão de Arquivos e Módulos Obsoletos:**
     - Deletado `api/image.ts` (backend da rota de imagens).
     - Deletado `src/components/image-editor-modal.tsx` (modal com canvas de inpainting).
     - Deletado `src/lib/image-mask-helper.ts` e sua suíte de testes `src/lib/image-mask-helper.test.ts`.
  2. **Limpeza de Rotas de Servidor (`server.ts` e `_worker.ts`):**
     - Removidos imports de `imageHandler` e roteamentos de `/api/image` no Express local e no Cloudflare Pages Worker.
  3. **Limpeza do Frontend Core (`src/App.tsx`):**
     - Removida a ferramenta `IMAGE_GEN_TOOL` (`generate_image`) de `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Removido o handler de execução da ferramenta.
     - Removida a diretriz de geração de imagens do System Prompt (`repoPrompt`), renumerando as regras remanescentes de 1 a 6.
     - Removidos estados e callbacks de `ImageEditorModal`.
  4. **Limpeza de UI e Protocolo Textual (`chat-message.tsx` e `text-tool-parser.ts`):**
     - Removido o botão de "Retocar" com ícone de pincel sobre imagens.
     - Removidas referências a `generate_image` no parser de ferramentas textuais.
     - Preservado o componente `ChatImage` para renderização, zoom/lightbox e download de anexos enviados pelo usuário ou diagramas/imagens pré-existentes.
- **Evidências de Verificação:**
  - `npm test`: 56/56 testes unitários passando em 14 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção compilado em 1.67s com economia de ~12 kB no bundle principal.

## 77. Seletor Visual Multi-Componentes no Preview (Estilo Google AI Studio / Element Inspector)
- **Solicitação do Usuário:** Adicionar recurso no Preview para inspecionar e selecionar visualmente componentes da aplicação. Ao clicar em um elemento, ele deve ser selecionado e enviado ao chat em segundo plano. O usuário pode selecionar múltiplos componentes consecutivamente sem sair do Preview (ex: 2 ou 3 componentes), retornando manualmente para o Chat quando desejar, onde os elementos aparecem como chips de contexto para que a IA saiba com precisão cirúrgica o que alterar. Além disso, incluir botão liga/desliga da ferramenta no Preview para permitir navegação livre sem seleções acidentais.
- **Solução Implementada:**
  1. **Tipagem do Elemento Selecionado (`src/lib/types.ts`):**
     - Criada a interface `SelectedPreviewElement` com `id`, `tagName`, `className`, `textContent`, `selector` e `outerHtmlSnippet`.
  2. **Script de Inspeção no Iframe com Capture Event (`src/lib/preview-html.ts`):**
     - Desenvolvido `getInspectorScriptHtml()` injetado antes de `</body>` tanto em projetos estáticos quanto em projetos React pré-transpilados.
     - Escuta eventos `postMessage` com `{ type: '__SYNAP_SET_INSPECT_MODE__', active: boolean }` para alternar o cursor para `crosshair` e ativar o overlay visual (#d97757 com badge flutuante de tag e classes).
     - Intercepta cliques com `{ capture: true }` chamando `e.preventDefault()`, `e.stopPropagation()` e `e.stopImmediatePropagation()`, prevenindo navegação acidental ou disparo de handlers internos da aplicação.
     - Suporte robusto para classes de elementos SVG (`SVGAnimatedString`).
     - Emite `{ type: '__SYNAP_ELEMENT_SELECTED__', element }` para a janela mãe (`window.parent`).
  3. **Controles na Barra de Ferramentas do Preview (`src/components/project-workspace/local-preview.tsx`):**
     - Botão toggle com ícone `MousePointerClick`: visual escuro discreto quando desligado e destaque âmbar pulsante quando ligado.
     - Pill de contagem em tempo real exibindo `N selecionado(s)` e botão de atalho `Ir para o Chat →`.
     - Sincronização automática via `postMessage` com a janela do iframe.
  4. **Acúmulo de Seleções e Injeção no Prompt (`src/App.tsx`):**
     - Estado `selectedPreviewElements` no núcleo da aplicação com proteção contra seleção duplicada do mesmo elemento.
     - No `handleSendMessage`, formata um bloco estruturado `### [Componentes Selecionados no Preview para Edição]` com seletores CSS, tags, classes, texto visível e snippets HTML de todos os elementos inspecionados, limpando a seleção após o envio.
  5. **Chips Visuais no Chat Input (`src/components/chat-input.tsx`):**
     - Renderização de chips elegantes com ícone de mira, tag `<button>`, preview de texto e botão de remoção individual `✕`.
     - Botão de atalho "Limpar todos" quando houver 2 ou mais elementos.
     - Placeholder contextual inteligente: *"Instrua a IA sobre o que alterar no(s) N componente(s) selecionado(s)..."*.
- **Evidências de Verificação:**
  - `npm test`: 57/57 testes unitários passando em 14 suítes (incluindo teste específico de injeção do inspetor).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e workers Cloudflare Pages compilados com 0 erros em 1.78s.

## 78. Remoção Completa dos Modelos da Cloudflare (Qwen 2.5 Coder e DeepSeek R1 Distill)
- **Solicitação do Usuário:** Remover os modelos da Cloudflare Workers AI (`@cf/qwen/qwen2.5-coder-32b-instruct` e `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`), pois o Qwen 2.5 Coder ficava apenas simulando alterações em texto em vez de alterar o código de fato via ferramentas (`edit_file`), e o DeepSeek R1 Distill opera estritamente como modelo de texto puro sem ferramentas de edição.
- **Diagnóstico:** A API da Cloudflare Workers AI possui instabilidades conhecidas de streaming de Function Calling, fazendo com que chamadas de ferramentas vazem como texto puro para o chat ou sejam descartadas em fallback 400. Como o Synap exige execução real de ferramentas de arquivo, esses modelos não atendem ao fluxo de trabalho da plataforma.
- **Solução Implementada:**
  1. **Remoção das Matrizes de Modelos (`src/lib/models.ts` & `lib/server/_security.ts`):**
     - Removidos ambos os modelos de `ALLOWED_MODELS`, `CLOUDFLARE_MODELS` e `TOOL_MODELS`.
     - `ALLOWED_MODELS` agora possui exatamente 5 modelos NVIDIA oficiais, todos com 100% de suporte nativo a ferramentas.
  2. **Tipagem Estrita (`src/lib/types.ts`):**
     - Removidos os dois IDs da união TypeScript `ModelId`.
  3. **Limpeza de UI no Dropdown (`src/components/model-controls.tsx`):**
     - Removidos os cards dos dois modelos da lista e seus respectivos rótulos ternários.
  4. **Migração Automática no App Core (`src/App.tsx`):**
     - Implementado fallback inteligente na inicialização: se o `localStorage` do usuário possuir um modelo antigo `@cf/...`, o sistema migra automaticamente para o `z-ai/glm-5.3-flash`.
     - Removidos os modelos removidos da condicional de `isFlashModel`.
  5. **Atualização da Suíte de Testes Unitários (`src/lib/models.test.ts`):**
     - Atualizados testes de paridade entre cliente e servidor, confirmando 5 modelos permitidos e rejeição correta para modelos desativados.
- **Evidências de Verificação:**
  - `npm test`: 57/57 testes unitários passando em 14 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção compilado com sucesso em 6.35s (Vite + Cloudflare Pages Worker).





## 79. Migração do Backend de Transcrição e Modo Live para NVIDIA NIM (Whisper Large v3)
- **Solicitação do Usuário:** Migrar a infraestrutura de Speech-to-Text / transcrição de áudio e do modo Live do Synap para a NVIDIA NIM, otimizando o tempo de processamento da IA para a resposta no modo live.
- **Diagnóstico & Escolha Técnica:** O modelo `openai/whisper-large-v3` executado nos clusters NVIDIA NIM com aceleração TensorRT em GPUs H100 entrega latência de inferência ultrabaixa (~250ms a 400ms para trechos típicos de fala de 3 a 5 segundos) e precisão superior para português do Brasil (`pt-BR`) com termos técnicos e comandos de programação. Isso reduz o tempo total de resposta de ponta a ponta (Áudio -> Transcrição -> Raciocínio com GLM-5.3 Flash -> Resposta) para menos de 1 segundo, tornando a interação do modo Live fluida e natural.
- **Solução Implementada:**
  1. **Refatoração do Handler Serverless (`api/transcribe.ts`):**
     - Substituição do backend da Cloudflare Workers AI pelo endpoint `https://integrate.api.nvidia.com/v1/audio/transcriptions`.
     - Autenticação direta com `env.NVIDIA_API_KEY` (dispensando `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`).
     - Normalização universal de entradas: processa `multipart/form-data`, payloads JSON com áudio em base64 (com suporte a data URLs) ou áudios binários diretos (`audio/webm`, `audio/wav`, `audio/mp4`, `audio/ogg`, etc.).
     - Despacho em `FormData` multipart padrão contendo `file`, `model: "openai/whisper-large-v3"`, `language: "pt"` e `response_format: "json"`.
     - Retorno estruturado contendo `{ text, word_count, model: "openai/whisper-large-v3" }`.
  2. **Atualização do Cliente de Áudio (`src/lib/audio-transcriber.ts`):**
     - Atualização do modelo padrão retornado para `openai/whisper-large-v3`.
  3. **Expansão da Suíte de Testes Automatizados (`src/lib/audio-transcriber.test.ts`):**
     - Atualização das asserções de cliente para o novo modelo NVIDIA.
     - Criação de suíte de testes de integração do handler `api/transcribe Handler (NVIDIA NIM)` cobrindo:
       - Rejeição de métodos HTTP incorretos com 405.
       - Rejeição de chamadas sem chave de API da NVIDIA com 401.
       - Processamento e envio de áudio binário direto com 200.
       - Processamento e envio de áudio via JSON Base64 com 200.
- **Evidências de Verificação:**
  - `npm test`: 61/61 testes unitários passando em 15 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 2.29s (Vite + Cloudflare Pages Worker).

## 80. Rebranding da Aplicação: Atualização do Nome para Éden
- **Solicitação do Usuário:** Alterar o nome oficial do aplicativo de "Synap" para "Éden" em toda a interface do usuário e metadados onde for necessário.
- **Solução Implementada:**
  1. **Documento HTML & Metadados PWA (`index.html` & `public/manifest.json`):**
     - Atualizados `<title>Éden — AI Chat</title>`, descrições OpenGraph, `apple-mobile-web-app-title` e manifest web (`name: "Éden AI Chat"`, `short_name: "Éden"`).
  2. **Identidade Visual e Layout (`src/components/chat-sidebar.tsx` & `src/components/chat-message.tsx`):**
     - Título e logo principal da barra lateral atualizados para **Éden**.
     - Nome do assistente editorial no cabeçalho das respostas atualizado para **Éden**.
  3. **Telas, Boas-Vindas e Diálogos de Sistema:**
     - Tela de boas-vindas do chat principal (`src/App.tsx`): *"Éden com modelos GLM-5.3 e Flash"*.
     - Modal de configurações (`src/components/settings-modal.tsx`): *"Éden • Claude Design System"*, *"Éden Studio ✨"* e rodapé.
     - Seletor de modelos (`src/components/model-controls.tsx`): *"Selecione o modelo do Éden"*.
     - Tela de reload de nova versão (`src/components/global-error-boundary.tsx`): *"Nova versão do Éden disponível"*.
     - MediaSession em background (`src/lib/wake-lock.ts`): *"Éden — Codando em segundo plano..."*.
     - Emulador Git do Terminal (`src/lib/git-terminal-emulator.ts`): Banners e mensagens de ajuda atualizados para Éden.
     - Gerador de Documentos (`src/lib/document-generator.ts`): Metadados de autor atualizados para *"Éden Document Engine"*.
  4. **Preservação de Compatibilidade:**
     - Mantidas intactas as chaves internas de banco IndexedDB, classes de estilização CSS e protocolos de ferramentas para evitar qualquer quebra ou perda de dados locais do usuário.
- **Evidências de Verificação:**
  - `npm test`: 61/61 testes unitários passando em 15 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e workers Cloudflare Pages compilados com 0 erros.

## 81. Streaming TTS por Sentenças & Correção do Modo Live (Conversação 50/50)
- **Solicitação do Usuário:** Corrigir os travamentos e a falta de fluidez ao término da resposta da IA no modo Live e implementar a reprodução de voz progressiva enquanto o modelo está gerando o texto (dando uma vantagem no buffer de 50/50 para que a conversa soe fluida sem pausas ou engasgos).
- **Diagnóstico da Causa Raiz:**
  1. *Bloqueio por isStreaming:* O efeito de voz anterior esperava a conclusão total da mensagem para começar a falar, criando um atraso de 4 a 8 segundos de silêncio antes do áudio.
  2. *Erro 403 e Timeout no Backend:* A rota `/api/tts` chamava `@andresaya/edge-tts` que sofria bloqueio 403 nos WebSockets da Microsoft, gerando mais 3 segundos de tentativa antes do fallback.
  3. *Loop de Eco:* O microfone ficava aberto e captava a própria saída dos alto-falantes da IA, disparando transcrições fantasmas e interrompendo a fala involuntariamente.
- **Solução Implementada:**
  1. **Motor de Fila de Fala Progressiva (`src/lib/streaming-speech-queue.ts`):**
     - Função `extractCleanSpeechText`: sanitiza blocos de raciocínio `<think>`, código markdown e tags XML sem alterar o texto original.
     - Função `splitSpeechSentences`: segmenta o texto em frases completas por pontuação (`.`, `!`, `?`, `:`) com agrupamento de frases excessivamente curtas (<18 caracteres) para cadência natural.
     - Classe `StreamingSpeechQueue`: gerencia a fila sequencial via Web Speech API nativa, disparando a primeira frase com prioridade e emendando as frases seguintes sem intervalo de silêncio.
  2. **Integração no App Core (`src/App.tsx`):**
     - O streaming do assistente alimenta progressivamente a fila através de `liveSpeechQueueRef.current.feed()`.
     - Ao concluir a geração do modelo, chama `liveSpeechQueueRef.current.finalize()`.
     - Blindagem anti-eco: o microfone pausa a auto-transcrição durante a fala, reabrindo imediatamente ao término da última sentença (`synap:resume-listening`).
     - Suporte nativo a interrupção intencional (*barge-in*): se o usuário falar frases não coincidentes, a fila de fala é cancelada instantaneamente.
  3. **Suíte de Testes Automatizados (`src/lib/streaming-speech-queue.test.ts`):**
     - Testes de sanitização, separação de sentenças, retenção de trechos parciais e ciclo de vida da fila (100% verde).
- **Evidências de Verificação:**
  - `npm test`: 66/66 testes unitários passando em 16 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e workers Cloudflare Pages compilados com 0 erros em 7.50s.

## 82. Identidade Visual: Favicon SVG do Bonsai Japonês do Éden
- **Solicitação do Usuário:** Criar um favicon em formato vetorial SVG de um bonsai japonês para uso na aplicação e aba do navegador.
- **Design & Conceito Zen:**
  - **Paleta Harmônica:** Fundo zen escuro suave com cantos arredondados (`#1a1815` a `#0d0c0a`), borda e sol sutil com anel tracejado no terracota oficial do Éden (`#d97757`).
  - **Tronco Sinuoso (Moyogi):** Tronco orgânico de bonsai japonês com curvatura sinuosa clássica, nós e galhos laterais estilizados em degradê de madeira nobre.
  - **Nuvens de Folhagem (Matsu):** Quatro copas de folhagem em degradê verde esmeralda e jade com brilhos e profundidade em camadas.
  - **Vaso Cerâmico Tradicional (Hachi):** Vaso raso com borda chanfrada, pés de apoio e leito de musgo verde.
- **Arquivos & Integração:**
  - `public/favicon.svg`: Arquivo raiz padrão para navegadores modernos.
  - `public/icons/icon.svg`: Ícone PWA e favicon alternativo.
  - `index.html`: Links `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` e `<link rel="alternate icon" href="/icons/icon.svg" />`.
  - `public/manifest.json`: Alinhamento do `theme_color` com a identidade terracota (`#d97757`).
- **Evidências de Verificação:**
  - `npm test`: 66/66 testes unitários passando.
  - `npm run lint`: 0 erros no TypeScript.
  - `npm run build`: Vite build e compilação Cloudflare Pages com 0 erros.

## 83. Identidade Visual: Logo do Bonsai Japonês em Todo o Chat
- **Solicitação do Usuário:** Aplicar o bonsai japonês como logo oficial em todos os pontos dentro do chat e da interface do Éden.
- **Solução Implementada:**
  1. **Componente de Arte Vetorial (`src/components/claude-logo.tsx` & `src/components/eden-logo.tsx`):**
     - Refatoração do componente `<EdenBonsaiLogo>` (com alias `<ClaudeLogo>` para compatibilidade total).
     - Renderização em SVG vetorial autônomo com viewBox otimizado (`85 70 340 355`), destacando o vaso cerâmico tradicional (*Hachi*), tronco sinuoso (*Moyogi*) em madeira nobre, nuvens de folhagem (*Matsu*) verde esmeralda e anel zen solar terracota (`#d97757`).
     - Geração de IDs dinâmicos e isolados via `React.useId()` para gradientes SVG, prevenindo qualquer conflito de renderização entre mensagens simultâneas na tela.
  2. **Pontos de Presença no Chat:**
     - **Mensagens do Assistente:** Avatar do assistente ao lado do título "Éden" em todas as respostas (`src/components/chat-message.tsx`).
     - **Tela de Boas-Vindas:** Destaque hero ampliado no centro do chat vazio (`src/App.tsx`).
     - **Barra Lateral:** Logo oficial no cabeçalho superior da barra de conversas (`src/components/chat-sidebar.tsx`).
     - **Modal de Configurações:** Insígnia da marca no cabeçalho de configurações (`src/components/settings-modal.tsx`).
- **Evidências de Verificação:**
  - `npm test`: 66/66 testes unitários passando em 16 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.80s (Vite + Cloudflare Pages Worker).

## 84. Ações de Mensagem: Botão de Copiar Próprias Mensagens do Usuário
- **Solicitação do Usuário:** Habilitar a capacidade de copiar o texto das próprias mensagens enviadas no chat (recurso ausente na bolha do usuário).
- **Solução Implementada (`src/components/chat-message.tsx`):**
  - **Barra de Ações Alinhada:** Envolveu a mensagem do usuário em contêiner flexível (`flex flex-col items-end group`) com barra de ação inferior à direita.
  - **Botão de Cópia Elegante:** Integrado botão "Copiar" com ícone `Copy` e transição para `Check` + texto verde "Copiado" por 2 segundos.
  - **Design Responsivo & Hover:** Em desktop, o botão surge suavemente ao passar o mouse sobre a mensagem (`group-hover:opacity-100`). Em telas touch móveis, mantém-se visível e acessível (`opacity-80`).
  - **Proteção de Conteúdo:** O botão só é exibido quando a mensagem contém texto copiável real.
- **Evidências de Verificação:**
  - `npm test`: 66/66 testes unitários passando em 16 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção compilado com sucesso em 1.63s.

## 85. Produtividade & Visão: Colar Prints Diretamente (Ctrl+V) e Captura de Tela no Chat
- **Solicitação do Usuário:** Permitir colocar prints tirados no PC diretamente no chat sem precisar salvar arquivo no computador e passar pelo botão de anexar.
- **Solução Implementada:**
  1. **Utilitário de Extração do Clipboard (`src/lib/clipboard-utils.ts`):**
     - Função `extractImagesFromClipboardData`: extrai e valida imagens a partir de `clipboardData.items` e `clipboardData.files`.
     - Normalização automática de arquivos (`print-<timestamp>.png`) mantendo o tipo mime original.
  2. **Colar Direto com Ctrl+V (`src/components/chat-input.tsx`):**
     - Handlers `onPaste` integrados no `<textarea>` e no contêiner do chat.
     - Listener global de paste (`window.addEventListener('paste')`): captura prints colados em qualquer área da janela do Éden, anexando a imagem instantaneamente e focando o cursor no textarea.
     - Conexão direta com `processFiles`: compactação inteligente (<600KB), chaveamento automático para modelo multimodal (`GLM-5.3 Flash`) e notificação amigável (*"📸 Print colado com sucesso!"*).
  3. **Botão de Captura de Tela ("Tirar Print"):**
     - Botão de câmera adicionado na barra inferior do chat com atalho direto à Screen Capture API (`navigator.mediaDevices.getDisplayMedia`).
     - Permite ao usuário clicar, escolher a tela ou janela e o print cai imediatamente no chat pronto para envio à IA.
  4. **Suíte de Testes Automatizados (`src/lib/clipboard-utils.test.ts`):**
     - Validação de nulos, extração via `items`, filtragem de texto puro e fallback de `files`.
- **Evidências de Verificação:**
  - `npm test`: 70/70 testes unitários passando em 17 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção compilado com sucesso em 1.62s.

## 86. Simplificação da UI: Remoção do Botão da Câmera (Foco no Ctrl+V Nativo)
- **Solicitação do Usuário:** Remover o botão de câmera da barra inferior, mantendo a interface enxuta e priorizando a colagem direta via teclado (`Ctrl+V`).
- **Ajustes Efetuados (`src/components/chat-input.tsx`):**
  - Removido o botão `<Camera>` e sua função `handleTakeScreenshot`.
  - Preservado integralmente o fluxo de colagem direta de prints (`Ctrl+V`) tanto no textarea quanto no listener global da janela do Éden.
  - O botão de clipe (`Paperclip`) continua exclusivo para anexar arquivos manuais quando desejado.
- **Evidências de Verificação:**
  - `npm test`: 70/70 testes unitários passando em 17 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.64s.

## 87. Precisão Cirúrgica do Inspetor de Elementos do Preview e Edição Local Sem GitHub
- **Solicitação do Usuário:** Checar o funcionamento da seleção de elementos no preview e garantir que a IA realmente compreenda o componente selecionado e consiga modificá-lo com precisão.
- **Diagnóstico da Causa Raiz:**
  1. *Falta de Mapeamento com o Código-Fonte:* O inspetor no iframe enviava apenas dados do DOM client-side (`selector`, `className`, `tagName`, `textContent` e snippet de HTML renderizado). A IA tinha que adivinhar em qual arquivo (`App.tsx`, `Header.tsx`, etc.) e em qual linha o componente estava declarado.
  2. *Bloqueio Fatal de Ferramentas de Workspace:* Em `src/App.tsx`, `if (!currentRepo)` retornava erro antes de alcançar `create_project` e `update_project_files`. Sem repositório GitHub conectado, a IA não conseguia atualizar os arquivos do projeto no Live Preview.
  3. *Ausência do Esquema de Edição sem Repositório:* Quando não havia repositório vinculado, `baseTools` recebia apenas `DEFAULT_CHAT_TOOLS` (que não continha `edit_file`), impedindo que a IA emitisse comandos de edição de arquivos para o preview.
- **Solução Implementada:**
  1. **Motor Localizador de Código-Fonte (`src/lib/preview-element-locator.ts`):**
     - Função `locateElementInProjectFiles`: cruza o elemento inspecionado com os arquivos do projeto (`.tsx`, `.jsx`, `.html`, `.vue`), pontuando candidatos por ID específico, texto visível (`textContent`), classes Tailwind distintas e tags JSX.
     - Extrai o arquivo correspondente, o número exato da linha (`lineNumber`) e um snippet de código contextual com 3 linhas de margem.
     - Função `formatElementInspectorPrompt`: formata um bloco estruturado contendo a localização cirúrgica (`Arquivo Fonte Provável`, `Linha`, `Código-Fonte Original`) além do seletor e do snippet HTML.
  2. **Desbloqueio de Ferramentas e Fallback Local (`src/App.tsx`):**
     - Ferramentas de projeto (`create_project`, `update_project_files`, `open_project`) movidas para execução prioritária antes do bloqueio `!currentRepo`.
     - Implementado fallback automático para `edit_file`, `read_file`, `list_files` e `search_code`: quando não há repositório GitHub, essas ferramentas operam diretamente no `activeProject.files`, persistindo a alteração e recarregando o Live Preview instantaneamente.
  3. **Conscientização de Contexto e Ferramentas no Chat (`src/App.tsx`):**
     - `baseTools` habilitado com `ALL_CHAT_TOOLS` sempre que `chatActiveRepo` ou `activeProject` estiver ativo.
     - `repoPrompt` contextualiza a IA sobre o projeto ativo no workspace, listando os arquivos disponíveis e instruindo a chamada compulsória e imediata de `edit_file` / `update_project_files`.
  4. **Suíte de Testes Automatizados TDD (`src/lib/preview-element-locator.test.ts`):**
     - Cobertura de correspondência por `textContent`, localização em componentes filhos, identificação por ID único, formatação do prompt e tratamento de ausência de correspondência.
- **Evidências de Verificação:**
  - `npm test`: 75/75 testes unitários passando em 18 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.68s (Vite + Cloudflare Pages Worker).

## 88. Interface de Usuário: Remoção do Subtítulo da Tela de Boas-Vindas
- **Solicitação do Usuário:** Remover o texto descritivo *"Éden com modelos GLM-5.3 e Flash. Source Control Git e Modo Plano integrados."* da tela inicial do chat.
- **Ajustes Efetuados (`src/App.tsx`):**
  - Removido o elemento `<p>` com a descrição de modelos e ferramentas sob a saudação inicial do assistente na tela de chat vazio.
  - A interface inicial do Éden agora exibe com elegância e minimalismo apenas o logo zen do bonsai japonês e a saudação amigável (*"Bom dia/Boa tarde/Boa noite, como posso ajudar?"*).
- **Evidências de Verificação:**
  - `npm test`: 75/75 testes unitários passando em 18 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.62s.

## 89. Personalização: Saudação Dedicada a Near no Chat
- **Solicitação do Usuário:** Personalizar a saudação da tela de boas-vindas para incluir o nome "Near" (*"Boa noite Near, como posso ajudar?"*).
- **Ajustes Efetuados (`src/App.tsx`):**
  - O cabeçalho de boas-vindas foi atualizado para `{getGreeting()} Near, como posso ajudar?`.
  - Mantida a reatividade dinâmica de horário: adapta-se naturalmente a *"Bom dia Near, como posso ajudar?"*, *"Boa tarde Near, como posso ajudar?"* e *"Boa noite Near, como posso ajudar?"*.
- **Evidências de Verificação:**
  - `npm test`: 75/75 testes unitários passando em 18 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.63s.

## 90. Downloader: Motor Universal de Extração e Eliminação de Instâncias Mortas do Cobalt
- **Solicitação do Usuário:** Resolver falha no download de vídeos em qualquer plataforma, inclusive no YouTube, que exibia o erro: *"Falha no download Resposta inválida da instância https://cobalt.synzr.ru: error code: 1016"*.
- **Diagnóstico da Causa Raiz:**
  1. As 5 instâncias Cobalt públicas configuradas em `api/download.ts` tornaram-se inoperantes ou bloquearam requisições automáticas:
     - `https://cobalt.synzr.ru` e `https://cobalt-api.kwiatekmiki.com`: DNS morto (Cloudflare Error 1016: Origin DNS error).
     - `https://api.cobalt.tools` e `https://cobalt-backend.canine.tools`: exigem token de captcha humano (`error.api.auth.jwt.missing`).
     - `https://co.eepy.today`: 502 Bad Gateway.
  2. O downloader dependia 100% de instâncias terceiras do Cobalt, sem nenhum motor nativo direto de extração de mídias.
  3. CDNs como o `googlevideo.com` do YouTube amarram o IP da requisição à URL gerada, causando erro 403 se o navegador tentar abrir o link diretamente sem um túnel proxy.
- **Solução Implementada:**
  1. **Motor Universal de Extração (`src/lib/video-extractors.ts`):**
     - **YouTube & YouTube Shorts:** Extração nativa através da API YouTube Innertube (clientes Android 20.03.32 e iOS) obtendo streams MP4 completos (vídeo+áudio) e faixas de áudio M4A/WebM em alta fidelidade, com fallback secundário automático para o cascade Piped (`api.piped.private.coffee`, `pipedapi.ducks.party`).
     - **TikTok:** Extração nativa via API TikWM (`tikwm.com/api/`), retornando vídeo HD sem marca d'água e faixa de áudio MP3 original.
     - **Twitter / X:** Extração nativa via API VxTwitter / FxTwitter (`api.vxtwitter.com`), suportando múltiplos vídeos, GIFs e fotos.
     - **Reddit:** Extração nativa via Reddit JSON API (`<url>.json`), capturando `fallback_url` e streams de vídeo.
     - **Instagram, Facebook, Pinterest, Vimeo, Twitch e Web Geral:** Extrator universal de metadados OpenGraph / Twitter Card (`og:video`, `og:video:secure_url`, `twitter:player:stream`, tags `<video src="...">`) e links diretos `.mp4`/`.mp3`.
  2. **Túnel de Download Direto (`GET /api/download?stream=1`):**
     - Rota proxy de streaming de alta performance que recebe a URL do stream gerado e injeta o cabeçalho `Content-Disposition: attachment; filename="..."`.
     - Permite que o navegador inicie o download imediato do arquivo no disco do usuário (sem abrir aba de reprodução) e contorna bloqueios de IP/CORS da CDN.
  3. **Interface Aprimorada no Downloader Panel (`src/components/downloader/downloader-panel.tsx`):**
     - Exibição de opções de download com badges de qualidade (`360p`, `HD`, `130kbps`) e formato (`MP4`, `M4A`, `MP3`).
     - Eliminação de cards duplicados quando múltiplos formatos estão disponíveis.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (incluindo suíte completa de `video-extractors.test.ts`).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso e worker Cloudflare Pages gerado em 1.98s.

## 91. Downloader: Curadoria Inteligente (Máximo 2 Opções Limpas e Modo 1-Click)
- **Solicitação do Usuário:** *"Que tanto de opção e essa? Boa parte audio"* (exibia mais de 23 cards repetitivos de áudio com múltiplos codecs e bitrates baixos do YouTube).
- **Diagnóstico da Causa Raiz:**
  - O YouTube Innertube e o cascade Piped retornam dezenas de faixas de áudio adaptativas (`adaptiveFormats`) para dublagens em múltiplos idiomas, spatial audio e codecs alternativos (itags 139, 140, 249, 250, 251, 599, 600).
  - O extrator iterava sobre todos os streams sem deduplicação de bitrate, gerando inchaço e sobrecarga cognitiva no painel.
  - No componente `downloader-panel.tsx`, quando `picker.length === 1`, o card verde único e o card do picker eram renderizados simultaneamente, causando duplicação visual desnecessária.
- **Solução Implementada:**
  1. **Curadoria Inteligente em `src/lib/video-extractors.ts`:**
     - **Modo Padrão (Vídeo):** Seleciona estritamente o **melhor vídeo MP4** (maior resolução muxed com áudio) e o **melhor áudio** (maior bitrate, priorizando M4A 130/160kbps). Reduz os 23 cards poluídos para **apenas 2 opções limpas e claras**.
     - **Modo "Extrair apenas áudio" (1-Click):** Retorna estritamente **1 única opção** direta de áudio na máxima fidelidade (tanto no Innertube quanto no Piped e no TikTok).
  2. **Refinamento do Painel de Download (`src/components/downloader/downloader-panel.tsx`):**
     - Eliminação da duplicação visual quando há apenas 1 opção disponível.
     - Rótulo contextual: `"Arquivo pronto para download:"` quando há 1 item, e `"2 opções disponíveis:"` quando vídeo e áudio estão presentes.
  3. **Suíte de Testes Automatizados TDD (`src/lib/video-extractors.test.ts`):**
     - Verificação estrita de que o resultado normal possui exatamente 2 itens e que o modo `audioOnly` possui exatamente 1 item de áudio com a URL de maior fidelidade.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros de tipagem estrita.
  - `npm run build`: bundle de produção Vite e Cloudflare Pages Worker compilados com 0 erros em 1.66s.

## 92. Downloader: Resolução de Encurtadores, Fallback Adaptativo e Diagnóstico Preciso
- **Solicitação do Usuário:** *"Ta dizendonisso: Falha no download, pra ver se o video ta publico e etc, ta normal ele, ta e com bug pra baixar"*
- **Diagnóstico da Causa Raiz:**
  1. **Falha Ocultada pelo Fallback:** Quando a extração nativa falhava por qualquer motivo ou recebia links encurtados (`youtu.be`, `vm.tiktok.com`, `vt.tiktok.com`, `t.co`, `bit.ly`, `instagram.com/share/`), o erro real era descartado silenciosamente e a requisição caía no fallback do Cobalt (que retornava 400 por falta de JWT). Isso forçava o erro genérico *"Não foi possível extrair a mídia deste link no momento. Verifique se o vídeo é público e tente novamente."*.
  2. **Vídeos com Apenas Streams Adaptativos:** Vídeos do YouTube que não continham streams muxed em `formats` (muitos vídeos em 1080p/4K) resultavam em `videoItem = null`, falhando a montagem da opção de vídeo.
  3. **Links Encurtados e Redirecionamentos:** Links de compartilhamento móvel (como `vm.tiktok.com` ou `instagram.com/share/`) não eram seguidos até a URL de destino antes de acionar a extração.
- **Solução Implementada:**
  1. **Resolução Automática de Encurtadores (`api/download.ts`):**
     - Função `resolveRedirectUrl`: segue automaticamente redirecionamentos HTTP 301/302 para links de compartilhamento mobile (`youtu.be`, `vm.tiktok.com`, `vt.tiktok.com`, `t.co`, `bit.ly`, `instagram.com/share/`, `pin.it`) antes de processar a extração.
  2. **Fallback para Streams Adaptativos (`src/lib/video-extractors.ts`):**
     - Se `formats` muxed estiver ausente, o extrator agora seleciona o melhor stream de vídeo em `adaptiveFormats` (priorizando qualidade HD e formato MP4/WebM), impedindo falhas em vídeos modernos.
  3. **Diagnóstico Transparente no Painel (`src/components/downloader/downloader-panel.tsx`):**
     - Propriedade `detail` exibida na interface com a mensagem técnica real em badge mono, facilitando identificar links privados ou removidos.
     - Preservação da mensagem de erro real de `extracted.error` em vez de mascará-la.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e worker Cloudflare Pages compilados com 0 erros em 1.71s.

## 93. Identidade Visual: Favicons Multiplataforma do Bonsai (ICO, PNGs e PWA)
- **Solicitação do Usuário:** *"Ei nosso bonsai nn ta na aba do navegador"*
- **Diagnóstico da Causa Raiz:**
  1. O navegador procurava por `/favicon.ico` na raiz, arquivo que não existia (gerando fallback SPA de 404).
  2. Navegadores mobile e abas do Chrome priorizam ícones rasterizados declarados em `manifest.json` (`/icons/icon-192.png`, `/icons/icon-512.png`) e `apple-touch-icon.png`. Esses arquivos continham os ícones antigos pré-bonsai criados em 14/10.
  3. `index.html` não possuía declarações de fallbacks PNG específicos (`favicon-32x32.png`, `favicon-48x48.png` e `shortcut icon`).
- **Solução Implementada:**
  1. **Geração Automatizada com Sharp (`scripts/generate-favicons.mjs`):**
     - Renderizados a partir do SVG mestre do bonsai (`public/favicon.svg`):
       - `public/favicon.ico` (32x32)
       - `public/favicon-32x32.png` (32x32 para abas de desktop)
       - `public/favicon-48x48.png` (48x48 para abas de alta densidade)
       - `public/apple-touch-icon.png` (180x180 para iOS Safari)
       - `public/icons/icon-192.png` (192x192 para Android Chrome / PWA)
       - `public/icons/icon-512.png` (512x512 para splash e PWA)
       - `public/icons/icon-maskable-512.png` (512x512 adaptativo para launcher)
  2. **Atualização Completa em `index.html`:**
     - Links explícitos com prioridade SVG + fallback PNG + ICO:
       - `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
       - `<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />`
       - `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />`
       - `<link rel="shortcut icon" href="/favicon.ico" />`
       - `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`
- **Evidências de Verificação:**
  - Todos os 7 arquivos gerados e validados no diretório `public/`.
  - `npm test`: 92/92 testes passando (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e workers gerados com sucesso em 1.56s.

## 94. Identidade Visual: Favicon do Bonsai com Fundo 100% Transparente
- **Solicitação do Usuário:** *"O bonsai ta dentro um fundo preto, tem como deixar só o bonsai? Isso la na aba do navegador"*
- **Diagnóstico da Causa Raiz:**
  - O arquivo vetorial original continha um `<rect fill="url(#edenBg)" />` escuro e borda de cantos arredondados, que criava uma caixa preta quadrada dentro da aba do navegador.
  - As margens externas no `viewBox="0 0 512 512"` deixavam o bonsai reduzido no centro do quadro.
- **Solução Implementada:**
  1. **Remoção do Fundo Escuro:**
     - Removidos os retângulos de fundo escuro e bordas em `public/favicon.svg` e `public/icons/icon.svg`.
     - Preservado o anel solar zen terracota com transparência nativa (`fill="none"` no contêiner SVG).
  2. **Enquadramento Perfeito do Bonsai:**
     - Ajustado o `viewBox` para `85 70 340 355` (idêntico ao componente oficial `<EdenBonsaiLogo>`), preenchendo 100% do ícone da aba com o bonsai e seu vaso tradicional.
  3. **Regeneração de Todos os Ícones Rasterizados:**
     - Executado `node scripts/generate-favicons.mjs` com o `sharp`, atualizando com fundo transparente:
       - `public/favicon.ico`
       - `public/favicon-32x32.png`
       - `public/favicon-48x48.png`
       - `public/apple-touch-icon.png`
       - `public/icons/icon-192.png`
       - `public/icons/icon-512.png`
       - `public/icons/icon-maskable-512.png`
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes passando (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.62s.

## 95. Layout Mobile: Reposicionamento do Badge de Deploy Anti-Sobreposição no Header
- **Solicitação do Usuário:** *"A parte la de deploy precia ser repocionada no movel"* com print demonstrando colisão do botão Deploy sobre a aba Studio (botão de robô).
- **Diagnóstico da Causa Raiz:**
  1. No componente `<DeploymentStatusBadge>`, a label de texto `"Deploy"` estava fixada sem a classe de responsividade `hidden sm:inline`. Isso ampliava a largura do botão para ~75px em telas pequenas.
  2. No `<ChatHeader>`, o switcher central (`[Chat] [Preview] [Studio]`) fica posicionado absolutamente no centro da tela (`absolute left-1/2 -translate-x-1/2`).
  3. No cluster direito (`z-10`), a presença simultânea do `DeploymentStatusBadge` (~75px), `Grafo` (~32px) e `Terminal` (~32px) totalizava mais de 155px de largura, fazendo o contêiner direito invadir a área central e truncar o botão Deploy em *"eploy"* por cima do ícone do Studio.
  4. Por outro lado, a extremidade esquerda do cabeçalho móvel continha apenas o botão de abrir o menu lateral (`PanelLeft`), deixando um espaço livre de ~80px desocupado.
- **Solução Implementada:**
  1. **Badge Compacto & Acessível (`src/components/deployments/deployment-status-badge.tsx`):**
     - Rótulo `"Deploy"` ajustado para `<span className="hidden sm:inline font-semibold text-[11px]">Deploy</span>`.
     - Padding dinâmico: `p-1.5` quadrado e compacto no mobile, e `sm:px-2.5 sm:py-1.5` no desktop.
     - `aria-label` descritivo preservado para acessibilidade e leitores de tela em modo ícone puro.
  2. **Reposicionamento Inteligente no Header (`src/components/chat-header.tsx`):**
     - Em telas móveis (`sm:hidden`), o `DeploymentStatusBadge` é renderizado no contêiner da esquerda, diretamente ao lado do menu lateral (`PanelLeft`).
     - Em telas maiores (`hidden sm:block`), preserva o posicionamento original na extremidade direita com o rótulo completo.
  3. **Equilíbrio Visual no Mobile (360px):**
     - Esquerda: `[Menu] [Deploy Icon]` = ~70px.
     - Centro: `[Chat] [Preview] [Studio]` = ~110px (de 125px a 235px).
     - Direita: `[Grafo] [Terminal]` = ~68px (a partir de 280px).
     - Resultado: mais de 45px de margem livre em ambos os lados e **zero colisão visual**.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.69s.
  - `git push`: commit `b1c2035` publicado com sucesso no repositório remoto.

## 96. Design de Interface: Gradiente Laranja Pôr do Sol Vibrante no Switcher do Header
- **Solicitação do Usuário:** *"Essa cor laranja em volta do chat no superior, quero um laranja mais bonito"* com print destacando o botão ativo do Chat.
- **Diagnóstico:** A cor anterior era o terracota opaco `#d97757` (RGB 217, 119, 87), que em telas OLED móveis sobre fundo escuro (`#0f0e0d`) aparentava um tom desbotado, fosco e marrom/barro sem brilho ou destaque moderno.
- **Solução Implementada (`src/components/chat-header.tsx`):**
  - Substituição do bloco sólido `#d97757` por um gradiente vivo de **Laranja Pôr do Sol Vibrante**:
    `bg-gradient-to-r from-[#ff6b35] to-[#ea580c]`
  - Injeção de brilho quente suave e borda delicada de acabamento:
    `shadow-[0_2px_12px_rgba(255,107,53,0.35)] border border-[#ff8c42]/30`
  - Aplicação simétrica nos botões ativos de **Chat**, **Preview** e **Studio**.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle compilado com sucesso em 1.65s.
  - `git push`: commit `7647c53` publicado com sucesso no repositório remoto.

## 97. Otimização Mobile: Adaptação Completa do Modal Graphify e Demais Modais da Aplicação
- **Solicitação do Usuário:** *"Ajusfa todo esse modal para dispositivo movel, se tiver mais no apo que nn ta adpatado para celular aproveita logo"* com print do modal do Mapa de Arquitetura 3D apresentando sobreposição do cabeçalho, canvas comprimido e painel inferior cortado.
- **Diagnóstico da Causa Raiz:**
  1. No `GraphModal` (`src/components/graph-modal.tsx`), o padding externo `p-2` e o cabeçalho com `flex-wrap` faziam títulos e botões quebrarem em múltiplas linhas desorganizadas em telas de 360-400px.
  2. O canvas 3D possuía `min-h-[340px]`, estrangulando o painel de detalhes inferior (`max-h-[42vh]`) e empurrando o conteúdo para baixo da barra de navegação do navegador móvel.
  3. A legenda 3D ficava ancorada no rodapé do canvas, colidindo com os nós da esfera 3D e sobrepondo os botões de zoom.
  4. Outros modais da aplicação (`SettingsModal`, `DeploymentLogModal`, `ErrorModal` e `DiffViewer`) utilizavam paddings fixos `p-4` que desperdiçavam espaço lateral nos celulares e não aproveitavam a altura da tela como gavetas nativas.
- **Solução Implementada:**
  1. **Modal de Arquitetura 3D Graphify (`src/components/graph-modal.tsx`):**
     - **Tela Cheia Nativa:** Enquadramento `p-0 sm:p-6` com cantos `rounded-none sm:rounded-2xl` e `h-full sm:h-[92vh]`.
     - **Cabeçalho Compacto:** Título truncado de forma fluida, badge `3D Engine · 60 FPS` oculto em mobile (`hidden sm:inline-block`), e botões de ação touch sem quebra de linha.
     - **Divisão de Altura Inteligente:** Canvas com `h-[42vh] sm:h-[50vh] lg:h-auto lg:flex-1` e drawer de detalhes com `flex-1 min-h-0 overflow-y-auto pb-8 sm:pb-4`.
     - **Pill Indicador de Gaveta:** Adicionada barra tátil arredondada (`w-8 h-1 rounded-full bg-zinc-600/60 mx-auto mb-2 lg:hidden`).
     - **Legenda e Controles Flutuantes:** Legenda reposicionada para `top-2 left-2` no mobile em badge ultra-compacto com backdrop-blur, desobstruindo os nós 3D e os botões de zoom (`bottom-2 right-2`).
  2. **Modal de Configurações (`src/components/settings-modal.tsx`):**
     - Otimizado para `p-0 sm:p-4`, `h-full sm:h-auto sm:max-h-[90vh]` e quebra flexível de badges de status em telas estreitas.
  3. **Modal de Logs de Implantação (`src/components/deployments/deployment-log-modal.tsx`):**
     - Enquadramento nativo `p-0 sm:p-4`, título truncado, botão de cópia compacto para mobile e rodapé com margem segura.
  4. **Inspetor de Erros e Diff Viewer (`error-modal.tsx` e `diff-viewer.tsx`):**
     - Ajustados para enquadramento full-screen em dispositivos móveis com barras de rolagem internas independentes.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e Cloudflare Pages compilados em 1.58s.
  - `git push`: commit `2a10c50` publicado com sucesso no repositório remoto.

## 98. Identidade Visual: Remoção do Fundo Marrom do Bonsai na Barra Lateral
- **Solicitação do Usuário:** *"A nossa bonsai ali canto dirieto superior, tita esse fundo marrom dela"* com print da barra lateral exibindo o bonsai envolto por um quadrado escuro terracota.
- **Diagnóstico da Causa Raiz:**
  - No cabeçalho da barra lateral (`src/components/chat-sidebar.tsx`), o ícone `<ClaudeLogo>` estava contido em uma `<div>` com classe de cor `bg-[#d97757]/15` e cantos `rounded-lg`, criando uma caixa marrom/terracota sólida em volta do bonsai.
- **Solução Implementada (`src/components/chat-sidebar.tsx`):**
  - Removida a classe `bg-[#d97757]/15` e a borda arredondada da caixa contenedora.
  - O bonsai agora é renderizado com **fundo 100% transparente**, diretamente sobre o tema escuro do app, com escala ajustada para `w-6 h-6` e suas cores naturais ricas (verde jade/esmeralda no topo e madeira nobre no tronco).
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e worker Cloudflare Pages compilados em 1.51s.
  - `git push`: commit `67d2a75` publicado com sucesso no repositório remoto.

## 99. Microcopy & Simplificação: 'Espaço' na Barra Lateral e 'Vincular' na Lista de Repos
- **Solicitação do Usuário:** *"Muda o texto: IA Workspace, para "Espaço" e la na aba Vincular a esta chat, deixa somente "Vincular ""*
- **Ajustes Implementados:**
  1. **Subtítulo da Marca (`src/components/chat-sidebar.tsx`):**
     - Alterado de `"IA Workspace"` para `"Espaço"` logo abaixo do logo e nome oficial Éden no topo da barra de navegação.
  2. **Botão de Ação nos Cards de Repositório (`src/components/github/repo-list.tsx`):**
     - Simplificado de `"Vincular a este Chat"` para `"Vincular"` (ou `"Explorar Arquivos"` quando já ativo), tornando os cartões de repositórios do GitHub muito mais limpos e concisos em telas móveis e desktop.
- **Evidências de Verificação:**
  - `npm test`: 92/92 testes unitários passando em 27 suítes (100% verde).
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: bundle de produção e workers compilados em 1.60s.
  - `git push`: commit `7ab1492` publicado com sucesso no repositório remoto.

## 100. Inicialização e Mapeamento Completo com Graphify
- **Solicitação do Usuário:** *"Graphify CHECA PRASMINS E JA TEMOS"*
- **Diagnóstico e Verificação:**
  1. A ferramenta CLI global `graphify` já estava instalada no ambiente Node (`@ Roaming/npm/graphify`).
  2. O repositório Synap ainda não possuía o grafo de conhecimento e comunidades gerados (`graphify-out/` inexistente).
- **Ações Realizadas:**
  1. **Extração de AST (`graphify extract . --code-only`):**
     - Varredura de 301 arquivos de código com 8 workers sem consumo de tokens de API.
  2. **Clusterização de Comunidades (`graphify cluster-only .`):**
     - Geração de 2.760 nós, 5.088 arestas e 187 comunidades estruturais.
     - Criação do relatório arquitetural `graphify-out/GRAPH_REPORT.md` e visualizador interativo `graphify-out/graph.html`.
  3. **Validação de Consultas (`graphify query "App"`):**
     - Tempo de resposta sub-segundo navegando pelos nós de backend e componentes React.
  4. **Configuração de Git:**
     - Adicionados `graphify-out/.graphify_cache/` e `graphify-out/cache/` ao `.gitignore`.
- **Evidências de Verificação:**
  - Grafo 100% gerado e funcional em `graphify-out/graph.json`.
  - Teste de consulta CLI executado com sucesso.

## 101. Upgrades de Elite dos Agentes Éden: `patch_file`, Memória Contínua e Superpoderes Multi-Agente
- **Solicitação do Usuário:** *"Eu quero que você use o nosso grafo para ver no nosso aplicativo se eu consigo manter longas conversas com nossos agentes lá no aplicativo, se eles conseguem alterar os arquivos direitinho, modificar sem parar, e se eles têm todas as ferramentas necessárias ou se a gente precisa integrar, dar poder mais alguma para elas, ou se as que eles têm são as melhores. Eu quero só a melhor."*
- **Diagnóstico via Graphify (`graphify query` / `graphify explain`):**
  1. **Edição Cirúrgica (`patch_file`):** Antes, os agentes dependiam de `edit_file` (reescrita integral do arquivo), o que consumia muitos tokens e arriscava truncamento em arquivos longos (>300 linhas).
  2. **Memória Contínua de Edições Pendentes:** `read_file`, `edit_file` e `search_code` buscavam o arquivo bruto da API do GitHub sem verificar antes se o arquivo já havia sido modificado na conversa atual (`changes` do Source Control), causando perda de alterações anteriores ao editar o mesmo arquivo múltiplas vezes.
  3. **Paridade do Studio e Subagentes:** O motor Multi-Agentes (`studio-engine.ts`) e o `subagent-runner.ts` tinham limite curto de iterações (3 a 5 turnos) e o Studio não contava com `patch_file`, `search_code` nem `query_code_graph`.
- **Upgrades Implementados:**
  1. **Motor Cirúrgico (`src/lib/file-patcher.ts` + `src/lib/file-patcher.test.ts`):**
     - Implementados `applyFilePatches`, `normalizePatchArgs`, `resolveEffectiveFileContent` e `normalizeRepoPath` com suporte a blocos únicos/múltiplos, normalização automática de `CRLF`/`LF` e detecção de ambiguidade.
  2. **Integração de `patch_file` e Overlay em Tempo Real (`src/App.tsx`, `src/lib/text-tool-parser.ts`, `src/components/chat-message.tsx`):**
     - Adicionada a ferramenta nativa `patch_file` e a tag textual `<synap_patch path="...">` com blocos `<old>` e `<new>`.
     - Criado `liveChangesRef` sincronizado em tempo real dentro do loop de até 45 turnos (`handleSendMessage`), garantindo que `read_file`, `patch_file`, `edit_file`, `batch_edit_files` e `search_code` enxerguem imediatamente todas as edições não commitadas da sessão.
  3. **Superpoderes no Studio e Subagentes (`src/studio/studio-engine.ts`, `src/studio/studio-panel.tsx`, `src/lib/subagent-runner.ts`):**
     - Adicionados `patch_file`, `search_code` e `query_code_graph` aos agentes Planner, Reviewer e Implementer do Studio, com `fileStateCache` compartilhado entre etapas e `maxIterations` elevado para **12 turnos**.
     - Expandido `subagent-runner.ts` para **12 iterações**, timeout de **90s** e truncamento automático de saídas de ferramentas acima de 24.000 caracteres para proteger a janela de contexto.
- **Evidências de Verificação:**
  - `npm test`: 100/100 testes unitários passando em 28 suítes (incluindo os novos testes de `file-patcher.test.ts` e `text-tool-parser.test.ts`).
  - `npm run lint` (`tsc --noEmit`): 0 erros de compilação/tipagem.
  - `npm run build`: bundle de produção Vite + Cloudflare Worker compilado com sucesso.
  - `graphify update .`: grafo de conhecimento atualizado e sincronizado.

## 102. Modo Plano Obrigatório (Hard-Gate de Escrita + Botão Aprovar e Executar Plano)
- **Solicitação do Usuário:** *"conseguimos obrigar os agentes / modelos a criar um plano sempre que for querer aletrar arquivos: que nem vc faz, ai la eu tenho um botão que liga e desliga plano, quando ligado e obrigado"*
- **Diagnóstico da Causa Raiz:**
  1. O botão **`Plano ON / OFF`** (`isPlanMode`) em `model-controls.tsx` funcionava apenas como instrução de texto (`planPrompt`), deixando `patch_file`, `edit_file` e `batch_edit_files` expostos e liberados na chamada da API.
  2. O detector `looksLikeFileModificationPromise` em `src/App.tsx` forçava a IA a editar arquivos se ela descrevesse mudanças de código dentro do plano.
  3. O estado do botão `Plano ON / OFF` não era persistido no `localStorage` e não havia um botão interativo para aprovar e disparar a execução do plano.
- **Solução Implementada:**
  1. **Motor de Hard-Gate (`src/lib/plan-mode-gate.ts` + `src/lib/plan-mode-gate.test.ts`):**
     - `filterToolsForPlanMode`: quando `Plano ON`, mantém 100% das ferramentas de leitura e diagnóstico (`query_code_graph`, `read_file`, `list_files`, `search_code`, `web_search`, `dispatch_subagent`), mas remove todas as ferramentas de escrita (`patch_file`, `edit_file`, `batch_edit_files`, `update_project_files`, `create_project`).
     - `checkPlanModeWriteGate`: bloqueia qualquer tentativa de escrita (nativa ou via tags `<synap_edit>`/`<synap_patch>`) antes da aprovação.
     - `isPlanApprovalReply`: detecta automaticamente respostas diretas de aprovação no chat (`"sim"`, `"aprovado"`, `"pode fazer"`, etc.) após um plano ser apresentado, liberando as ferramentas de escrita no turno seguinte.
  2. **Integração e Persistência (`src/App.tsx`):**
     - Persistência de `isPlanMode` em `localStorage` (`synap_plan_mode_v1`).
     - Desativação de `looksLikeFileModificationPromise` quando `activePlan === true`.
     - Criação do handler `handleApprovePlan` que dispara a execução imediata do plano aprovado (`overridePlanMode = false`).
  3. **Card Interativo de Aprovação (`src/components/chat-message.tsx`):**
     - Exibição de card de aprovação no rodapé de toda resposta gerada em Modo Plano com os botões **"Aprovar e Executar Plano"** e **"Desligar Plano"**.
- **Evidências de Verificação:**
  - `npm test`: 105/105 testes unitários passando em 29 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: compilado com sucesso em 3.71s.
  - `graphify update .`: grafo de conhecimento atualizado.

## 103. Auditoria Arquitetural e Correção de 5 Bugs Críticos e Médios
- **Solicitação do Usuário:** *"procure por bugs no app"* → aprovado para correção imediata.
- **Diagnóstico via Graphify (`graphify query` + inspeção dos God Nodes):**
  1. **Bug 1 (Crítico — Source Control):** `addChange` em `src/lib/pending-changes.tsx` comparava `c.path === params.path` sem normalizar barras ou `./`, criando entradas duplicadas e risco de erro HTTP 422 no commit do GitHub.
  2. **Bug 2 (Alto — Sincronia GitHub ↔ Live Preview):** `patch_file`, `edit_file` e `batch_edit_files` em `src/App.tsx` (e o Implementer em `src/studio/studio-panel.tsx`) gravavam no Source Control, mas não atualizavam `activeProject.files` quando o repositório estava aberto no Live Preview (`sourceRepoFullName === currentRepo.fullName`).
  3. **Bug 3 (Alto — Stale Closure em Edições Consecutivas):** `updateProjectFiles` e `updateFileContent` em `src/lib/project-context.tsx` liam `activeProject` da closure do React, sobrescrevendo edições anteriores quando a IA modificava múltiplos arquivos no mesmo turno.
  4. **Bug 4 (Médio — Studio Multi-Agente):** `StudioPanel` não recebia `projectGraph` de `App.tsx`, e uma falha no `runReviewer` caía no `catch` externo de `startStudio`, sobrescrevendo o card do Planner como `"Erro no planejamento"`.
  5. **Bug 5 (Baixo — Modal de Tokens):** `src/components/model-controls.tsx` exibia `"Janela de 128k"` / `"128.000 tokens"` fixos mesmo para os modelos de `256k` (`Gemma 4 31B IT` e `Nemotron 3.5 Super`).
- **Correções Aplicadas:**
  - Normalização de caminhos com `normalizeRepoPath` em `src/lib/pending-changes.tsx` e `src/lib/project-context.tsx`.
  - Introdução de `activeProjectRef` sincronizado em tempo real em `src/lib/project-context.tsx`.
  - Sincronização imediata com `updateProjectFiles` ao editar arquivos de repositório GitHub vinculado ao Live Preview (`src/App.tsx` e `src/studio/studio-panel.tsx`).
  - Repasse de `projectGraph` para `StudioPanel` / `StudioRuntimeContext` (`src/studio/studio-engine.ts`) e isolamento do `try/catch` do Revisor em `src/studio/studio-panel.tsx`.
  - Exibição dinâmica de `256k` (`256.000 tokens`) vs `128k` (`128.000 tokens`) em `src/components/model-controls.tsx`.
- **Evidências de Verificação:**
  - `npm test`: 105/105 testes passando em 29 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: compilado com sucesso em 2.46s.
  - `graphify update .`: grafo de conhecimento atualizado (14.697 nós).

## 104. Correção do Travamento Infinito em "Pensando…" e Auto-Continuação Inteligente
- **Solicitação do Usuário:** Análise de transcrição real do Éden onde a IA ficava presa indefinidamente no estado `"Pensando…"` após concluir edições (`"Feito! ✅"`), ou parava de responder após prometer ações terminadas em dois-pontos (`"Preciso conferir o config:"` / `"Agora deixa eu resolver...:"`) e alucinava comandos CLI do Graphify (`graphify extract . --code-only`).
- **Causas Raiz Identificadas (`systematic-debugging` + `graphify`):**
  1. **`break` Incompleto no Leitor SSE (`src/App.tsx`):** `if (dataStr === '[DONE]') break;` saía apenas do loop interno `for (const line of lines)`, mantendo o `while (true) { await reader.read() }` externo bloqueado indefinidamente caso a conexão HTTP não fechasse imediatamente no navegador.
  2. **Ausência de Watchdog no Cliente e Duplicação de Auto-Continuação em Erros de Stream (`src/App.tsx`):** Se o stream ficasse mudo ou só enviasse keepalives, `reader.read()` nunca resolvia. Além disso, quando ocorria `streamErrorMsg` recuperável, o código empilhava a mensagem de continuação no bloco do stream E caía novamente no `else if (iterationFinishReason === 'interrupted')`, duplicando turnos até 45 vezes (`MAX_TOOL_ITERATIONS = 45`).
  3. **Falso Positivo em `looksLikeIncompleteWork` após Conclusão (`src/lib/agentic-patterns.ts`):** Quando o 1º parágrafo dizia `"Vou aplicar tudo de uma vez:"` e o último dizia `"Feito! ✅"`, a regex avaliava os últimos 450 caracteres como um todo e reativava o loop agêntico mesmo com a tarefa concluída. Por outro lado, faltavam os verbos `"aplicar"`, `"conferir"`, `"resolver"` e `"corrigir"` quando a IA parava em dois-pontos (`:`).
  4. **Alucinação de CLI do Graphify e Falta de Feedback no Rodapé (`src/App.tsx`, `src/components/chat-message.tsx`):** O prompt de repositório não deixava explícito que o grafo já reside em memória (`query_code_graph`), e o card inferior de status só aparecia quando `!hasRealContent`, deixando apenas a pílula pequena no topo durante turnos subsequentes.
- **Correções Aplicadas:**
  - Adição da flag `streamDone`, `finally { await reader.cancel(); }` e Watchdog de leitura no cliente (`READ_CHUNK_TIMEOUT_MS = 40_000`, `MAX_SILENT_KEEPALIVE_MS = 85_000`) em `src/App.tsx`.
  - Unificação do tratamento de `hadRecoverableStreamError` e limite estrito de `MAX_CONSECUTIVE_AUTO_CONTINUES = 2` para auto-continuações sem chamadas de ferramenta.
  - Verificação de `COMPLETION_MARKERS` no último parágrafo/linha (`extractLastParagraph`) e suporte a verbos `aplicar`/`conferir`/`resolver`/`corrigir` em `src/lib/agentic-patterns.ts` (+ 2 novos testes em `src/lib/agentic-patterns.test.ts`).
  - Blindagem anti-alucinação de CLI do Graphify no `repoPrompt` (`src/App.tsx`) e barra de status viva no rodapé da mensagem em `src/components/chat-message.tsx`.
- **Evidências de Verificação:**
  - `npm test`: 107/107 testes unitários passando em 29 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: compilado com sucesso.
  - `graphify update .`: grafo de conhecimento atualizado (14.699 nós).

## 105. Aceleração de Conexão e Redução de Time-To-First-Token (TTFT) com a NVIDIA NIM
- **Solicitação do Usuário:** Otimizar a velocidade de conexão com a IA para eliminar a demora excessiva no estado `"Conectando… Estabelecendo conexão com o modelo de IA…"`.
- **Diagnóstico de Gargalos (`systematic-debugging` + `graphify`):**
  1. **Sobrecarga de Prefill e Guided Decoding (`src/App.tsx`):** Toda requisição enviava até 23 ferramentas (`ALL_CHAT_TOOLS` + MCP) e todas as 9 Skills ativas, obrigando o motor vLLM/TensorRT-LLM da NVIDIA a compilar schemas JSON duplicados ou fora de contexto (ex.: `generate_document`, `run_python`, tools locais do Sandpack mesmo quando um repositório GitHub estava ativo).
  2. **Repetição de Fallbacks HTTP 400/422 sem Memória (`api/chat.ts`):** Quando um modelo rejeitava `reasoning_effort`, `tools` ou `max_tokens`, o backend fazia um 2º POST do zero em todas as mensagens por não cachear a configuração aceita. Além disso, o modo `low` forçava `enable_thinking: true` no Gemma 4 31B e Nemotron 3.5 Super.
  3. **Timeout Único de 75s na Conexão Inicial (`api/chat.ts`):** Se a 1ª conexão caísse em uma fila congestionada da NVIDIA NIM, aguardava 75s antes de tentar outra rota.
  4. **Atraso Visual na Transição de `"Conectando…"` para `"Pensando…"` (`src/components/chat-message.tsx`):** `isConnecting` permanecia `true` até chegar o 1º token de texto/raciocínio, mesmo após o handshake HTTP 200 da NVIDIA já ter sido concluído.
- **Correções e Otimizações Aplicadas:**
  - **Poda Inteligente de Tools e Skills (`src/lib/smart-prefill.ts` + `src/lib/smart-prefill.test.ts`):** Criação de `selectContextualTools` e `selectContextualSkills` para remover ferramentas duplicadas (`query_architecture_graph`, `read_github_file`, `search_github_repos`), omitir tools do Sandpack quando em repositório GitHub, e enviar `generate_document`/`run_python` e skills específicas (`doc-creator`, `conventional-commits`, `cloudflare-pages`) apenas quando relevantes ao prompt.
  - **Cache de Fallbacks + Fast-Connect Retry (`api/chat.ts`):** Adição de `modelFallbackCache` em memória, desativação de `enable_thinking` forçado quando `selectedEffort === 'low'`, timeout inicial rápido de **20s** com retry automático em nova rota, e emissão imediata de `data: {"meta":{"stage":"connected"}}\n\n` ao receber HTTP 200 da NVIDIA.
  - **Transição Instantânea na UI (`src/lib/types.ts`, `src/App.tsx`, `src/components/chat-message.tsx`):** Adição de `isConnected` na mensagem para mudar imediatamente de `"Conectando…"` para `"Pensando…"` assim que o handshake HTTP 200 com a GPU é confirmado.
- **Evidências de Verificação:**
  - `npm test`: 111/111 testes unitários passando em 30 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: compilado com sucesso.
  - `graphify update .`: grafo de conhecimento atualizado.

## 106. Higienização do Live Preview (Import Map e Exclusão de Testes/Linters)
- **Solicitação do Usuário:** Análise e correção de erros no console do navegador (`Ignored an import map value of "react-dom/"`, `@testing-library/jest-dom`, `typescript-eslint`).
- **Diagnóstico das Falhas (`systematic-debugging`):**
  1. **Violação da Especificação W3C de Import Maps (`src/lib/preview-html.ts`):** O mapeamento `'react-dom/': https://esm.sh/react-dom@.../?external=react` terminava com query string em vez de barra `/`, violando a regra de prefixos do W3C e fazendo o navegador ignorar a entrada com aviso.
  2. **Inclusão de Pacotes de Teste e Linter no Browser Bundle (`src/lib/preview-html.ts`):** Arquivos como `setupTests.ts` e configurações de eslint/jest eram analisados pelo extrator de imports bare do preview, tentando carregar `@testing-library/jest-dom` e `typescript-eslint` via esm.sh no navegador (onde `expect` não existe e dependências de Node falham com HTTP 500).
- **Correções Aplicadas:**
  - Remoção da chave `'react-dom/'` do `importMap` em `src/lib/preview-html.ts` (já coberta por `'react-dom'` e `'react-dom/client'`).
  - Adição de `@testing-library/*`, `typescript-eslint`, `@typescript-eslint/*`, `eslint*`, `jest`, `vitest` em `BROWSER_INCOMPATIBLE_DEPS`.
  - Exclusão de arquivos `setupTests`, `setup-tests`, `*.spec.*`, `eslint.config`, `jest.config` da transpilação do Live Preview.
  - Testes unitários atualizados em `src/lib/preview-html.test.ts`.
- **Evidências de Verificação:**
  - `npm test`: 112/112 testes unitários passando em 30 suítes.
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm run build`: compilado com sucesso.
  - `graphify update .`: grafo de conhecimento atualizado.

## 107. Superpoderes de Scraping, `curl`, `ffprobe` e Ponte de Rede Python no Éden
- **Solicitação do Usuário:** Integrar nativamente no aplicativo web **Éden** os recursos de inspeção de páginas, embeds e streams de vídeo (`curl` com `Referer` e `Range`, `ffprobe`/`ffmpeg`, `urllib.request.urlopen` e `pip install` sob demanda no Python).
- **Implementações Realizadas:**
  1. **Motor Nativo de Inspeção de Mídia e HTML Bruto (`src/lib/media-probe.ts` + `src/lib/media-probe.test.ts`):**
     - `parseMp4Buffer`: lê os átomos binários ISO-BMFF (`ftyp`, `moov`, `mvhd`, `tkhd`, `stsd`) e extrai codec (`h264`, `hevc`, `aac`, etc.), resolução (`width` x `height`) e duração em segundos.
     - `parseHlsManifest`: analisa playlists `.m3u8` Master (variantes, bandwidth, resoluções) e Media (contagem de segmentos `.ts`, duração total e URLs de amostra).
     - `inspectMpegTsSegment`: valida pacotes de vídeo MPEG-TS reais checando o byte de sincronismo `0x47` a cada 188 bytes.
     - `extractEmbedsAndStreamsFromHtml`: extrai `<iframe src>`, `<video>`, `<source>` e links `.mp4`/`.m3u8`/`get_video` ocultos no HTML bruto.
  2. **Upgrade do Proxy Serverless `/api/fetch-url` (`api/fetch-url.ts`):**
     - Suporte a `GET` e `POST` com cabeçalhos customizados (`Referer`, `Range`, `User-Agent`, `Origin`, `Accept`, `Cookie`), método `HEAD`, medição de `ttfbMs`, modo `raw: true` (HTML bruto + `iframes` + `mediaUrls`) e modo `probeMedia: true` (auto-injetando `Range: bytes=0-65535` para inspecionar streams sem baixar centenas de MB).
  3. **Ponte de Rede Síncrona e Auto-Micropip no Pyodide (`src/workers/pyodide-worker.ts`):**
     - Monkey-patch transparente em `urllib.request.urlopen` usando `XMLHttpRequest` síncrono apontando para `/api/fetch-url`, permitindo que scripts Python no navegador acessem URLs externas com headers `Referer`/`Range` sem bloqueio de CORS ou erro de socket WASM.
     - Auto-detecção e instalação sob demanda via `micropip` para pacotes como `bs4` (`beautifulsoup4`), `lxml` e `html5lib`.
  4. **Evolução da Tool `fetch_url` e Comandos de Terminal (`src/App.tsx`, `src/lib/git-terminal-emulator.ts`, `src/lib/smart-prefill.ts`):**
     - Schema da tool `fetch_url` expandido com `headers`, `raw`, `method` e `probe_media`.
     - Comandos `curl` (suportando `-I`, `-X`, `-H`, `-w`), `ffprobe` e `ffmpeg` adicionados ao emulador de terminal do Éden.
     - `PYTHON_INTENT_REGEX` ampliado para ativar `run_python` em prompts de scraping, `urllib`, `bs4`, `m3u8`, `mp4` e `ffprobe`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
## 108. Browser Headless Real (`render_js` / Playwright Free) e Hard-Gate de Autorização para VPS
- **Solicitação do Usuário:** Resolver os itens 4 (Playwright / Chromium sem peso de VPS na Cloudflare Free) e 7 (Envio para VPS sem expor SSH na porta 22 bloqueada), adicionando uma trava obrigatória (Hard-Gate) no chat que exige autorização por clique em botão antes de qualquer envio.
- **Implementações Realizadas:**
  1. **Motor de Browser Headless Gratuito (`api/fetch-url.ts`, `src/lib/remote-gate.ts` + `src/lib/remote-gate.test.ts`):**
     - Flag `render_js: true` (e parâmetro `wait_for_selector`) na tool `fetch_url` e comando `playwright <url>` no terminal do Éden.
     - Executa o JavaScript dinâmico de páginas SPA e protegidas via motor Chromium Headless na nuvem (Jina Reader Engine via `r.jina.ai` com `X-Return-Format: html`), extraindo o DOM final hidratado, `<iframe src>` e streams de mídia gerados via JS.
  2. **Hard-Gate de Autorização para VPS / Servidor Remoto no Chat (`src/components/chat-message.tsx`):**
     - Trava de segurança no rodapé da mensagem da IA (layout idêntico ao de aprovação de plano) exibindo o host de destino, resumo da operação e código/arquivo.
     - Dois botões de decisão: **"Cancelar Envio"** (descarta a operação com status `rejected`) e **"Autorizar e Enviar para VPS"** (dispara a execução autorizada com status `approved` → `executed`).
  3. **Backend de Execução Segura (`api/deployments.ts`):**
     - Rota POST `action=trigger` com barreira rígida: rejeita HTTP 403 se `userAuthorized !== true`.
     - Suporte a Webhooks HTTPS de VPS, Deploy Hooks da Cloudflare e pipelines do GitHub Actions (`workflow_dispatch`).
  4. **Interceptação no Terminal e Poda Contextual (`src/App.tsx`, `src/lib/git-terminal-emulator.ts`, `src/lib/smart-prefill.ts`):**
     - Comandos `ssh`, `scp`, `sftp` e `deploy` no terminal da IA são interceptados e bloqueados com código 126, convertendo-se em cards de autorização no chat.
     - Tool `request_remote_deploy` podada contextual via `REMOTE_DEPLOY_INTENT_REGEX`.
- **Evidências de Verificação:**
  - `npm run lint` (`tsc --noEmit`): 0 erros.
  - `npm test`: **120/120 testes unitários passando em 32 suítes** (incluindo os 4 novos testes de `remote-gate.test.ts`).
  - `npm run build`: `dist/_worker.js` (158.0 kB) compilado com sucesso.

## 109. Decodificação Real de Vídeo e Áudio no Navegador (Motor Híbrido 5s FFmpeg + WASM)
- **Solicitação do Usuário:** *"⚠️ Sem decode real (5s de ffmpeg), só probe , como melhoramso isso?"* -> Escolhida a Opção 3 (Híbrido: WebCodecs/GPU nativa ultrarrápida por padrão + FFmpeg WASM sob demanda para conversões e transcode).
- **Diagnóstico da Causa Raiz:**
  - A Seção 107 inspecionava apenas os átomos de cabeçalho ISO-BMFF / MP4 (`Range: bytes=0-65535`) e playlists HLS (`.m3u8`), sem decodificar frames reais de vídeo na GPU.
  - Não havia aferição de frames descartados (`dropped frames`), taxa real de quadros (`actual FPS`), integridade de áudio via Web Audio API (`AudioContext`/`AnalyserNode`), nem prova irrefutável com captura de snapshot em canvas.
- **Implementações Realizadas:**
  1. **Motor Nativo de Decodificação Real (`src/lib/video-decoder-engine.ts` + `src/lib/video-decoder-engine.test.ts`):**
     - `decodeVideoSampleInBrowser`: decodifica 5 segundos reais de stream/arquivo na GPU usando `HTMLVideoElement`, `requestVideoFrameCallback` e `getVideoPlaybackQuality()`.
     - Medição precisa de `decodedFrames`, `droppedFrames`, `actualFps` e integridade (`verified`, `corrupted`, `drm_blocked`, `codec_unsupported`).
     - Web Audio API (`AudioContext`, `createMediaElementSource`, `AnalyserNode`): afere presença de amplitude de áudio e calcula RMS em dB.
     - Captura automática de frame JPEG em Canvas (`capturedFrameBase64`) como prova visual da decodificação.
     - `parseFfmpegCliArgs` e `formatFfmpegDecodeLog`: emula com fidelidade o banner, estatísticas e saída de terminal do FFmpeg oficial.
  2. **Cliente FFmpeg WASM sob Demanda (`src/lib/ffmpeg-wasm-client.ts`):**
     - Lazy-load dinâmico de `@ffmpeg/ffmpeg` via CDN UMD sem poluir o bundle inicial da aplicação.
     - Executa comandos complexos do FFmpeg (`-vn -c:a mp3`, filtros, conversões reais e arquivos de saída) via WebAssembly apenas quando solicitado pelo usuário (`--wasm` ou conversão de extensão).
  3. **Integração no Emulador de Terminal (`src/lib/git-terminal-emulator.ts`):**
     - Separação completa de `ffprobe` e `ffmpeg`.
     - `ffprobe`: exibe streams, codecs, taxa de bits e duração formatados ou JSON via `-print_format json`.
     - `ffmpeg`: executa o motor híbrido de decodificação real padrão ou despacha para FFmpeg WASM se `--wasm`/transcode for solicitado.
- **Evidências de Verificação:**
  - `npm test`: **123/123 testes unitários passando em 33 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle de produção Vite (936 kB) e Cloudflare Pages Worker (`dist/_worker.js`, 158.0 kB) compilados com sucesso em 1.49s.
  - `graphify update .`: grafo de conhecimento atualizado com 14.757 nós e 35.052 arestas.

## 110. Modo "🌐 Web ao Vivo" Estilo Perplexity (Pré-busca Instantânea, Citações Inline e Carrossel de Fontes)
- **Solicitação do Usuário:** *"e o perplexity em nosso app èden internet ao vivo oque acha dissow"*, *"e gratis e?"*, *"o botão poderia ficar dentro do espaço de chat do lado daquele de anexar arquivos"* -> Aprovada a implementação da experiência Perplexity 100% gratuita no Éden.
- **Implementações Realizadas:**
  1. **Motor de Citações e Busca Web TDD (`src/lib/web-search-engine.ts` + `src/lib/web-search-engine.test.ts`):**
     - `extractDomainFromUrl`: extrai o domínio limpo da URL (ex: `g1.globo.com`, `github.com`).
     - `getFaviconUrl`: gera link para o ícone oficial via Google S2 Favicons em 32x32.
     - `parseWebSourcesFromSearchResults`: mapeia e deduplica respostas brutas da API `/api/search` em `WebSourceItem[]`.
     - `buildLiveWebPrompt`: constrói bloco contextual de injeção em tempo real com diretrizes rigorosas de síntese e citação de fontes numeradas (`[1]`, `[2]`).
     - `linkifyCitations`: converte marcadores `[1]`, `[2]` em links markdown interativos apontando para as fontes correspondentes.
     - `fetchLiveWebSources`: cliente HTTP com AbortController de 4.0s para pré-busca instantânea no `/api/search`.
  2. **Botão Toggle "🌐 Web" Dentro do Chat Input (`src/components/chat-input.tsx`):**
     - Posicionado ergonomicamente na barra de ferramentas inferior da caixa de digitação, logo ao lado do botão de anexar arquivos (`Paperclip`).
     - Estado ativo com destaque ciano vibrante (`bg-cyan-500/20 text-cyan-400 border-cyan-500/40`), badge `Web` e placeholder dinâmico (*"Pesquisar na web ao vivo ou fazer uma pergunta..."*).
     - Persistência em `localStorage` (`synap_web_mode_v1`) e memória por conversa.
  3. **Pré-busca Instantânea e Injeção no Contexto (`src/App.tsx`, `src/lib/context-compactor.ts`, `src/lib/types.ts`):**
     - Ao enviar mensagem com `Web ON`, o Éden pré-busca automaticamente as páginas via `/api/search` em paralelo antes de iniciar o streaming do LLM.
     - Anexa `webSources` na mensagem do assistente e injeta `liveWebPrompt` no contexto do modelo (`prepareMessagesForApi`), permitindo respostas no 1º turno sem latência de tool call.
     - Quando o modelo chama a tool `web_search` dinamicamente, os resultados também enriquecem as `webSources` da mensagem atual.
  4. **Carrossel de Fontes e Citações Estilo Perplexity (`src/components/chat-message.tsx`):**
     - Cabeçalho expansível **"Fontes da Web (N)"** no topo da resposta com cards horizontais roláveis (favicon, domínio limpo, badge numérico e título).
     - Renderizador customizado de links no `ReactMarkdown` que exibe citações `[1]`, `[2]` como pílulas ciano sobrescritas (`align-super`) com link direto para a fonte.
  5. **Obrigatoriedade Compulsória (Regra Suprema de Web ao Vivo):**
     - O prompt injetado proíbe categoricamente o modelo de ignorar as fontes ou responder com conhecimento pré-corte desatualizado quando a Web estiver ligada.
     - Obriga citações `[1]`, `[2]` no corpo do texto para cada dado ou fato.
     - Caso a pré-busca automática não retorne fontes a tempo (timeout de 4s), o modelo recebe ordem expressa para disparar a tool `web_search` IMEDIATAMENTE no primeiro turno antes de responder.
- **Evidências de Verificação:**
  - `npm test`: **130/130 testes unitários passando em 34 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle de produção Vite e Cloudflare Pages Worker compilados com 0 erros em 2.63s.
  - `graphify update .`: grafo de conhecimento atualizado com 14.781 nós e 16.583 arestas.

## 111. Controle Autônomo de Navegador para Modelos de IA (Playwright / Browser-Use)
- **Solicitação do Usuário:** *"ja temos o playwright para meus modelos conseguirem controlar o navegador sozinho?"* -> Escolhida a Opção 1 (Integração em nuvem com Browserless.io / Puppeteer com fallback gratuito e feedback visual de screenshots).
- **Implementações Realizadas:**
  1. **Motor de Ações de Navegador TDD (`src/lib/browser-agent-engine.ts` + `src/lib/browser-agent-engine.test.ts`):**
     - `buildPuppeteerFunctionScript`: gera scripts dinâmicos de automação para executar `navigate`, `click`, `type`, `press_key`, `scroll`, `wait` e `screenshot`.
     - `parseInteractiveElementsFromHtml`: parseia o DOM renderizado e extrai lista estruturada de botões, links e inputs numerados (`[1] Botão 'Entrar'`, `[2] Input 'Pesquisar'`) com seletores CSS amigáveis.
     - `formatBrowserToolResultForModel`: formata o resultado em Markdown de alta densidade sem poluir a janela de contexto do LLM.
  2. **Backend Serverless API (`api/browser.ts`, `_worker.ts`, `server.ts`, `lib/server/env.ts`):**
     - Rota POST `/api/browser` compatível com Cloudflare Pages Edge Worker e Node local.
     - Suporte transparente a token do Browserless.io (`BROWSERLESS_API_KEY` ou `browserEndpoint` customizado).
     - Fallback Edge sem chave: usa renderização Chromium Headless e parse de DOM interativo para nunca falhar mesmo quando o usuário não tiver token configurado.
  3. **Ferramenta `control_browser` e Diretrizes de Navegação Autônoma (`src/App.tsx`, `src/lib/types.ts`):**
     - Registrada em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Injetada regra 7 no System Prompt instruindo os modelos a navegar passo a passo guiados pelos elementos interativos da página.
     - `executeGitHubTool`: despacha ações para `/api/browser` e anexa `browserResult` na mensagem do assistente.
  4. **Feedback Visual no Chat e Configurações (`src/components/chat-message.tsx`, `src/components/settings-modal.tsx`):**
     - Card ciano de "Navegador Autônomo" com URL, status da ação e miniatura de screenshot capturada com zoom/lightbox.
     - Campo em Configurações para salvar token opcional do Browserless.io.
  5. **Regra Anti-Recusa e Descrição Explícita de Ferramentas (`src/App.tsx`):**
     - Schema da ferramenta `run_terminal_command` atualizado para declarar explicitamente suporte a `curl`, `ffprobe`, `ffmpeg` e `playwright`.
     - Injetada regra suprema no `basePrompt` proibindo expressamente o modelo de recusar ferramentas, dizer que suas ferramentas são fixas ou mandar o usuário rodar externamente.
- **Evidências de Verificação:**
  - `npm test`: **136/136 testes unitários passando em 35 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle de produção Vite e Cloudflare Pages Worker (`dist/_worker.js`, 168.5 kB) compilados com sucesso em 2.54s.
  - `graphify update .`: grafo atualizado.

## 112. Blindagem de Aspas, Buffer Virtual `/tmp` em Memória, Pipes e Retenção de URL no Navegador
- **Solicitação do Usuário:** Investigar e corrigir a falha de scraping no terminal (*"O escaping das aspas deu problema no terminal"*, erro de `/tmp/anime_page.html` e desvio do navegador autônomo para o Google).
- **Diagnóstico Técnico da Causa Raiz:**
  1. **Falha de Disco Virtual (/tmp):** O modelo executava `curl ... -o /tmp/anime_page.html` e em seguida `grep "<iframe" /tmp/anime_page.html`. Como o terminal do Éden é executado em memória no cliente e não possuía diretório `/tmp` persistido, o `grep` falhava com erro de repositório inexistente. A LLM alucinava que a causa da falha eram as aspas e interrompia o fluxo.
  2. **Parser de Aspas com Escapes:** O parser de comandos não processava barras invertidas (`\"`, `\'`, `\\`), corrompendo termos com aspas escapadas como `\<iframe`.
  3. **Ausência de Pipes Unix:** Comandos encadeados com `|` (ex: `echo ... | grep ...` ou `curl ... | grep ...`) eram interpretados como argumentos soltos do primeiro comando.
  4. **Navegador Desviando para Google:** O fallback de `api/browser.ts` navegava para `google.com` sempre que a chamada subsequente omitia a URL.
- **Implementações Realizadas:**
  1. **Parser Robusto com Suporte a Escape (`src/lib/git-terminal-emulator.ts`):**
     - Tratamento completo de barras invertidas (`isEscaped`), preservando caracteres e removendo aspas envolventes de forma limpa sem corromper argumentos.
  2. **Sistema de Arquivos `/tmp` Virtual em Memória (`src/lib/git-terminal-emulator.ts`):**
     - Estrutura `virtualTmpFiles` (`Map<string, string>`) acessível por `getVirtualTmpFile`, `setVirtualTmpFile`, `listVirtualTmpFiles` e `clearVirtualTmpFiles`.
     - `curl -o /tmp/<arquivo>` e redirecionamento `> /tmp/<arquivo>` gravam o conteúdo HTML/texto no buffer virtual com confirmação de bytes gravados.
     - Comandos `cat`, `head`, `tail`, `ls` e `grep` leem arquivos de `/tmp` em memória instantaneamente, dispensando conexão com o GitHub.
  3. **Pipes Unix Básicos (`| grep`):**
     - Divisor inteligente `splitPipeSegments` e função `executeSingleCommand` com passagem de `stdin`, permitindo encadeamento transparente de comandos.
  4. **Retenção de URL no Navegador Autônomo (`src/App.tsx`, `api/browser.ts`):**
     - Adicionado `lastBrowserUrlRef` em `src/App.tsx` para persistir a última URL navegada entre turnos.
     - `api/browser.ts` não desvia mais para `google.com`, retornando status explicativo amigável caso nenhuma página esteja aberta.
- **Evidências de Verificação:**
  - `npm test`: **140/140 testes unitários passando em 35 suítes** (incluindo 4 novos testes em `src/lib/git-terminal-emulator.test.ts`).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: compilado com sucesso com Cloudflare Pages Worker (`dist/_worker.js`, 169.1 kB).
## 113. Chrome DevTools Integrado (Console, Rede e "⚡ Corrigir com IA")
- **Solicitação do Usuário:** *"Temos ou podemos ter? : CHROME DEVTOOLS — Ele enxerga o console, os erros e a página junto com você - e aponta o problema na hora."* -> Escolhida a Opção 3 ("Os dois juntos: Live Preview DevTools + Navegador Autônomo DevTools").
- **Implementações Realizadas:**
  1. **Motor de Captura e Formatação TDD (`src/lib/preview-devtools.ts` + `src/lib/preview-devtools.test.ts`):**
     - `createConsoleLogItem`: sanitiza mensagens de console, erros (`Error`), objetos JSON circulares e captura `source`, `line`, `column` e `stack`.
     - `createNetworkRequestItem`: mapeia chamadas HTTP com método, URL limpa, status, duração em milissegundos e statusText.
     - `parseDevToolsMessage`: parseia eventos de postMessage (`__SYNAP_DEVTOOLS_LOG__` e `__SYNAP_DEVTOOLS_NETWORK__`) emitidos pelo iframe do Live Preview.
     - `formatDevToolsErrorForAi`: monta o prompt estruturado com o stack trace, arquivo e linha exatos para o botão *"⚡ Corrigir com IA"*.
     - `formatDevToolsSummaryForAi`: gera relatório de auditoria para a ferramenta da IA inspecionar erros e chamadas HTTP sob demanda.
  2. **Instrumentação do Live Preview (`src/lib/preview-html.ts`):**
     - `getDevToolsScriptHtml`: injeta script não bloqueante no `<head>` interceptando `console.log`, `console.info`, `console.warn`, `console.error`, `window.onerror`, `unhandledrejection`, `window.fetch` e `XMLHttpRequest`.
     - Medição precisa de latência via `performance.now()`.
     - Dispara `postMessage` pai automaticamente com dados higienizados e serializados.
  3. **Gaveta e Interface do DevTools (`src/components/preview-devtools.tsx` + `src/components/project-workspace/local-preview.tsx`):**
     - Painel retrátil na parte inferior do Live Preview com abas **Console** e **Network**, contadores de erros/avisos, filtros de severidade e busca.
     - Auto-abertura inteligente da gaveta ao detectar qualquer exceção ou falha de rede (status >= 400).
     - Botão flutuante na barra superior com badge de contagem de erros.
     - Botão *"⚡ Corrigir com IA"* em cada erro de log ou falha de rede que injeta o diagnóstico diretamente no chat e aciona o modelo automaticamente.
  4. **DevTools no Navegador Autônomo (`src/lib/browser-agent-engine.ts`, `api/browser.ts`, `src/components/chat-message.tsx`):**
     - Listeners de Puppeteer (`page.on('console')`, `page.on('pageerror')`, `page.on('response')`) capturando logs de runtime e erros de rede (403, 404, 500, Cloudflare 429).
     - Formatação compacta no prompt da IA (`formatBrowserToolResultForModel`) com seção `## DevTools da Página (Console & Rede)`.
     - Card visual no chat com badges de contagem e lista de falhas de rede e logs destacados por cor.
  5. **Ferramenta de IA do Chrome DevTools (`src/App.tsx`):**
     - Registrada ferramenta `get_preview_devtools_logs` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Injetada regra 8 no System Prompt orientando a IA a auditar o console e rede sempre que o usuário relatar tela branca ou falha de renderização.
- **Evidências de Verificação:**
  - `npm test`: **147/147 testes unitários passando em 35 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle de produção Vite e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) compilados com sucesso.

## 114. Maxun MCP Oficial e Gravador Visual de Scraping & Automação No-Code ("Browser Recipes")
- **Solicitação do Usuário:** Análise e integração da ferramenta **Maxun** (plataforma open-source de scraping no-code com 16.7k stars no GitHub) -> Escolhida a Opção 3 ("Os dois juntos: Preset Maxun no Painel de Extensões + Motor de Scraping No-Code nativo no Éden").
- **Implementações Realizadas:**
  1. **Motor de Receitas de Navegação e Scraping TDD (`src/lib/browser-recipe-engine.ts` + `src/lib/browser-recipe-engine.test.ts`):**
     - Criação de tipos (`BrowserRecipe`, `BrowserRecipeAction`, `BrowserRecipeActionType`, `BrowserRecipeRunResult`).
     - Ações com seletores e parâmetros (`navigate`, `click`, `type`, `wait_for_selector`, `scroll`, `wait`, `screenshot`, `extract_text`, `extract_table`, `extract_attribute`).
     - Validação rigorosa de receitas (`validateRecipe`) e compilação para scripts Puppeteer (`compileRecipeToPuppeteerScript`).
     - Formatação compacta e semântica para injeção no prompt da IA (`formatRecipeRunResultForAi`).
     - Dupla camada de persistência: IndexedDB assíncrono via `idb-keyval` com fallback para `localStorage` (`synap_browser_recipes_v1`).
  2. **Preset Oficial do Maxun no Painel de Extensões (`src/components/extensions/extensions-panel.tsx`):**
     - Card de destaque com logo, métricas do GitHub (16.7k stars, Open-Source) e descrição do ecossistema Maxun.
     - Botão *"Copiar Comando Docker"* (`docker run -v maxun-data:/app/data -p 8080:8080 getmaxun/maxun`) com feedback de cópia em 1 clique.
     - Botão *"Conectar Preset"* com pré-preenchimento automático da URL MCP local (`http://localhost:8080/mcp`) e nome identificador.
     - Presets rápidos de 1 clique no modal de conexão MCP para Maxun, Puppeteer e SQLite.
  3. **Interface Visual do Gravador de Receitas (`src/components/browser-recipe-modal.tsx`):**
     - Modal split-view com lista lateral de robôs salvos e painel de edição/execução em tempo real.
     - Editor de passos interativo: formulários dinâmicos por tipo de ação, timeout, seletores CSS/XPath e captura de atributos.
     - Execução direta com teste em 1 clique via API `/api/browser`, com exibição de logs de runtime, dados extraídos em JSON formatado e screenshot capturada.
     - Botão *"⚡ Enviar Dados para o Chat com IA"*, injetando o payload extraído no chat com acionamento automático do modelo.
     - Acesso direto pelo botão **"Robôs"** com ícone `Globe` no cabeçalho superior (`ChatHeader`).
  4. **Ferramentas de IA para Orquestração de Scraping (`src/App.tsx`):**
     - Registradas as ferramentas `list_browser_recipes` e `run_browser_recipe` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Injetada regra 9 no System Prompt instruindo os modelos a consultar as receitas disponíveis antes de tentar extrações complexas manuais.
     - Handlers dedicados no fluxo `executeGitHubTool` para executar passos sequenciais via endpoint `/api/browser` e sintetizar os dados no chat.
- **Evidências de Verificação:**
  - `npm test`: **152/152 testes unitários passando em 35 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle de produção Vite e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) compilados com sucesso em 18.55s.

## 115. Refinamento de UX: Responsividade Mobile do Gravador de Robôs, Ícone Workflow e Clareza de Status MCP
- **Solicitações do Usuário:**
  1. *Dúvida sobre a aba MCP:* Dificuldade em entender se o servidor está ligado/desligado (bolinha cinza com toggle verde).
  2. *Troca do ícone de Robôs:* O ícone de globo/planeta se confundia com a pesquisa Web do chat.
  3. *Otimização para celulares:* O modal de robôs ficava quebrado horizontalmente em telas móveis devido à coluna fixa de 256px.
- **Implementações Realizadas:**
  1. **Clareza de Conexão MCP (`src/components/extensions/extensions-panel.tsx`):**
     - Adicionado badge explícito de status com cores semânticas (`Online` verde, `Conectando...` âmbar, `Offline` cinza).
     - Adicionado card explicativo com ícone `AlertCircle` quando um servidor local (ex.: Maxun `http://localhost:8080/mcp`) está habilitado no Éden mas ainda não foi iniciado via Docker na máquina.
  2. **Novo Ícone Exclusivo `Workflow` (`src/components/chat-header.tsx`, `src/components/browser-recipe-modal.tsx`):**
     - Substituído o ícone `Globe` pelo ícone `Workflow` (fluxo de passos e automação) no botão "Robôs" do cabeçalho e nos headers do modal, eliminando qualquer colisão com a ferramenta Web.
  3. **Layout Fluido Mobile-First no Gravador de Robôs (`src/components/browser-recipe-modal.tsx`):**
     - Implementado padrão master-detail responsivo: no mobile, a lista de robôs ocupa 100% da largura. Ao selecionar ou criar um robô, a tela transiciona suavemente para o editor/executor em tela cheia com botão *"← Voltar para lista"*.
     - Modal ocupa tela inteira no celular (`h-full p-0 rounded-none sm:h-[85vh] sm:p-4 sm:rounded-2xl`).
     - Desabilitada a auto-seleção inicial de robô em telas < 640px para que o usuário em celular visualize a lista de robôs primeiro.
- **Evidências de Verificação:**
  - `npm test`: **152/152 testes unitários passando em 35 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
## 116. Identidade Visual Azul Ciano Oceano nos Cards MCP e Remoção do Maxun
- **Solicitação do Usuário:** Remover a vitrine do Maxun da aba MCP (já que o scraping no Éden roda via Robôs/Workflow na nuvem sem exigir terminal/Docker no computador) e aplicar o estilo visual azul ciano oceano (fundo translúcido, bordas brilhantes, badges e toggle harmonizados) em todos os cards de servidores MCP, incluindo o Context7 Docs.
- **Implementações Realizadas:**
  1. **Remoção Limpa do Maxun no MCP (`src/components/extensions/extensions-panel.tsx`):**
     - Removido o card promocional do Maxun e os botões de Docker/Preset local que falhavam em conexões móveis.
     - Removidos estados e imports órfãos (`copiedDocker`, `Globe`, `Copy`, `Check`).
     - No modal de adicionar conexão MCP, o preset de 1 clique foi simplificado mantendo exclusivamente o **Context7 Docs** oficial.
  2. **Identidade Visual Ciano Oceano nos Cards de Servidores MCP (`src/components/extensions/extensions-panel.tsx`):**
     - Card de servidor MCP estilizado com `bg-cyan-950/25 border-cyan-500/35 hover:border-cyan-500/50 shadow-[0_2px_14px_rgba(6,182,212,0.08)]`.
     - Indicador de status online com ponto ciano brilhante (`bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]`) e badge semântico `Online` ciano.
     - Chavinha (Toggle switch) com preenchimento ciano vibrante (`bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.45)]`) quando ativo.
     - Botões de ação, contadores de ferramentas e lista expandida de tools formatados em harmonia com a paleta ciano.
     - Sub-aba MCP e cabeçalho do modal de conexão harmonizados com ícones e badges ciano (`text-cyan-400`).
  3. **Higienização Automática de Servidores Legados (`src/lib/storage.ts`):**
     - Função `loadMcpServers` com filtro defensivo (`!s.url?.includes('localhost:8080/mcp') && s.id !== 'maxun'`), garantindo que servidores locais legados adicionados em sessões anteriores sejam expurgados sem intervenção manual do usuário.
- **Evidências de Verificação:**
  - `npm test`: **152/152 testes unitários passando em 35 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle compilado com sucesso e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) gerado em 2.31s.
  - `graphify update .`: grafo de conhecimento atualizado com 14.850 nós, 16.758 arestas e 1.011 comunidades.

## 117. Restauração do Ícone MCP Verde Esmeralda Original
- **Solicitação do Usuário:** *"Ok. Agora icone do mcp, continua na cor original verde ta"*
- **Implementações Realizadas (`src/components/extensions/extensions-panel.tsx`):**
  1. **Ícone `<Server>` da Sub-aba MCP:** Restaurado para o tom verde esmeralda original (`text-emerald-400`), juntamente com o badge numérico de servidores ativos (`bg-emerald-500/20 text-emerald-300`).
  2. **Botão "Conectar":** Restaurado com o ícone `<Plus className="w-3 h-3 text-emerald-400" />` e tokens de estilo consistentes com a aba de Skills.
  3. **Modal de Conexão MCP:** Ícone `<Server className="w-4 h-4 text-emerald-400" />` no título do modal e `<Server className="w-3 h-3 text-emerald-400" />` no preset do Context7 Docs.
  4. **Preservação dos Cards Ciano Oceano:** O fundo, as bordas, a chavinha (toggle `bg-cyan-500`), o status online e a lista expandida de ferramentas mantiveram integralmente o estilo azul ciano oceano aprovado pelo usuário.
- **Evidências de Verificação:**
  - `npm test`: **152/152 testes unitários passando em 35 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle e worker Cloudflare Pages compilados em 2.20s.
  - `graphify update .`: grafo sincronizado com 14.851 nós e 16.759 arestas.
## 118. Canvas Prototyping (Figma / Claude Canvas / v0) Ativo por Padrão
- **Solicitação do Usuário:** *"Eu queria implantar uma parada tanto aqui quanto lá no Eden para os modelos de lá também usarem. É uma coisa que o Claude usa, Cloud Canvas, que é prototipar, tipo Figma. Então, antes de criar a tela, porque no caso a pessoa o modelo está programando e tal, e eu só vou saber como fica a tela, o designer, quando fica pronto. Então seria o antes, né, o canvas. Aí eu mudaria lá antes de criar código. Acho que até economizaria token."* + *"Coloca como skill e já deixa ativada por padrão. Força quando a skill estiver ativada ela usar, desativada não precisa. E sim, vai ser a opção A."*
- **Implementações Realizadas:**
  1. **Configuração Global e Regras no Antigravity:**
     - Criada a skill `~/.gemini/config/skills/canvas-prototyping/SKILL.md` orientando o agente a gerar protótipos interativos com HTML + Tailwind CSS antes de criar ou modificar telas em qualquer projeto.
     - Adicionada regra `.agents/rules/canvas-prototyping.md` estipulando a obrigatoriedade do Canvas quando a skill estiver ativa.
  2. **Motor TDD no Éden (`src/lib/canvas-prototype.ts` + `src/lib/canvas-prototype.test.ts`):**
     - Interface `CanvasPrototype` com viewport (`mobile` | `desktop`), status (`pending` | `approved` | `rejected`), título, descrição e HTML.
     - Função `sanitizePrototypeHtml`: isolamento sandbox com meta viewport mobile-first, Tailwind Play CDN e injeção resiliente de `<head>`.
     - Função `extractCanvasPrototypeFromText`: suporte híbrido para extração de tags textuais `<eden_canvas>` com atributos durante o streaming.
     - Suíte TDD com 7 novos testes unitários (159/159 testes passando na suíte completa).
  3. **Skill Built-in no Storage do Éden (`src/lib/storage.ts`, `src/components/extensions/extensions-panel.tsx`):**
     - Registrada a skill nativa `canvas-prototyping` em `BUILTIN_SKILLS` com `enabled: true`, ícone `'layout'` e auto-migração no IndexedDB.
     - Suporte ao ícone `Layout` nos cards do Painel de Extensões.
  4. **Componente Visual Interativo (`src/components/canvas-prototype-card.tsx`):**
     - Moldura mobile-first (375px) com alternador Desktop em 1 clique.
     - Sandbox seguro com `sandbox="allow-scripts allow-forms allow-modals"` (sem same-origin, origem nula protegida contra ataques ao DOM do Éden).
     - Botões de ação com feedback de 1 clique: *"⚡ Aprovar e Gerar Código"* (marca status como aprovado e instrui a IA a codificar) e *"💬 Pedir Ajustes"* (preenche o campo de mensagem com texto padrão via setter nativo).
     - Abertura protegida em nova aba com `noopener,noreferrer` e revogação de URL Blob.
  5. **Integração no Chat e Handlers da IA (`src/App.tsx`, `src/components/chat-message.tsx`):**
     - Ferramenta `render_canvas_prototype` em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
     - Diretiva de prototipagem visual obrigatória injetada no System Prompt.
     - ThinkingOrb dinâmico no modo `weaving` com badge *"Canvas Prototyping (Figma / v0)"* e *"Tailwind Sandbox"*.
     - Remoção limpa das tags `<eden_canvas>` do texto markdown para prevenir vazamento de HTML bruto na mensagem.
- **Evidências de Verificação:**
  - `npm test`: **159/159 testes passando em 36 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle compilado em 2.65s e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) gerado com sucesso.
  - `graphify update .`: grafo de conhecimento sincronizado com 14.865 nós, 16.795 arestas e 1.013 comunidades.
  - Code Review aprovado com incorporação de todas as recomendações de segurança e robustez.
## 119. Skill Claude Design (UI Sênior & Anti-Slop) e Eliminação da Barra de Rolagem Branca
- **Solicitação do Usuário:** *"Sim, coloca na diretriz e transforma essa Claude Design em uma skill para ativar ou desativar. Em toda criação, torna obrigatório qualquer modelo usar essa skill de design em toda criação."* + *"Não, no antigravity não precisa não. Ele já faz esse trabalho excelente. É só lá no eden mesmo"*
- **Implementações Realizadas:**
  1. **Tipagem e Ícone (`src/lib/types.ts` & `src/components/extensions/extensions-panel.tsx`):**
     - Adicionado `'palette'` ao tipo `SkillIcon`.
     - Adicionado o ícone `Palette` do `lucide-react` em violeta (`text-violet-400`) no renderizador de ícones do painel de extensões.
  2. **Skill Built-in no Storage com Toggle (`src/lib/storage.ts`):**
     - Registrada a skill `claude-design` (*"Claude Design (UI Sênior)"*) com `enabled: true`, ícone `'palette'` e diretrizes anti-slop inspiradas no padrão oficial do Claude.ai.
     - Auto-migração transparente em `loadSkills()`, injetando a skill no IndexedDB de usuários existentes.
  3. **Reset CSS de Scrollbar & Tipografia Inter no Canvas (`src/lib/canvas-prototype.ts`):**
     - Injeção da Google Font `Inter` no `<head>` do sandbox com preconnect.
     - Reset de scrollbars finas e translúcidas (`scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.15) transparent; ::-webkit-scrollbar ...`), eliminando a barra de rolagem branca nativa do Windows no iframe.
     - Tratamento robusto contra falsos negativos de substring em documentos completos.
  4. **Diretriz de Design no System Prompt (`src/App.tsx`, `src/lib/skills-extractor.ts`):**
     - Injetada Regra 11 no System Prompt do Éden exigindo padrões de design system sênior (Stripe/Linear): tipografia refinada com `tracking-tight`, superfícies em camadas com glassmorphism suave (`bg-zinc-900/60 backdrop-blur-md`), bordas translúcidas (`border-white/10`) e microinterações táteis nos botões (`hover:scale-[1.02] active:scale-[0.98]`).
     - Adicionado `'Claude Design (UI Sênior)'` na extração de habilidades de transparência no chat.
- **Evidências de Verificação:**
  - `npm test`: **160/160 testes unitários passando em 36 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) gerados com sucesso.
  - `graphify update .`: grafo de conhecimento atualizado com 14.866 nós, 16.796 arestas e 1.013 comunidades.
  - Code Review formal aprovado sem pendências.
## 120. Harmonização Visual dos Botões de Parar e Enviar com as Abas do Cabeçalho
- **Solicitação do Usuário:** *"troca a cor dess biotão pela cor que ta usando nos uperiores de chat preview e studio"* (anexado print do botão de stop generation com fundo terracota `#d97757`).
- **Implementações Realizadas (`src/components/chat-input.tsx`):**
  1. **Botão de Parar Resposta (`isLoading`):**
     - Substituída a cor sólida `#d97757` pelo gradiente vibrante moderno das abas ativas do cabeçalho: `bg-gradient-to-r from-[#ff6b35] to-[#ea580c] hover:from-[#ff7a47] hover:to-[#f97316]`.
     - Adicionado brilho e borda harmonizada: `shadow-[0_2px_12px_rgba(255,107,53,0.35)] border border-[#ff8c42]/40`.
  2. **Botão de Envio de Mensagem (`canSend`):**
     - Harmonizado com a mesma paleta `bg-gradient-to-r from-[#ff6b35] to-[#ea580c]` com hover suave, mantendo coerência visual total entre todas as ações primárias da aplicação.
- **Evidências de Verificação:**
  - `npm test`: **160/160 testes unitários passando em 36 suítes** (100% verde).
  - `npm run lint` (`tsc --noEmit`): **0 erros**.
  - `npm run build`: bundle e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) gerados com sucesso.
  - `graphify update .`: grafo atualizado com 14.867 nós e 16.797 arestas.

## 121. Botão de Pesquisa Web Minimalista (Icon-Only)
- **Solicitação do Usuário:** *"tira o texto web"*.
- **Implementações Realizadas (`src/components/chat-input.tsx`):**
  1. Removido o elemento `<span>Web</span>` do botão de alternância de pesquisa web ao vivo no chat.
  2. Ajustado layout para `flex items-center justify-center` com padding uniforme `p-1.5 rounded-lg`, alinhando-se perfeitamente em proporção com o botão adjacente de anexo (`Paperclip`).
  3. Preservados `aria-label` e `title` para suporte completo a acessibilidade e navegação por teclado.
- **Evidências de Verificação:**
  - `npm test`: **160/160 testes unitários passando em 36 suítes**.
  - `tsc --noEmit`: **0 erros**.
  - `npm run build`: compilado com sucesso.
  - Code Review formal: Aprovado.
  - Commit: `be7a60c` enviado para `origin/main`.

## 122. Simplificação do Placeholder da Caixa de Mensagens
- **Solicitação do Usuário:** *"tira  aparte do texto ou cole um print (ctrl+v)..."* (anexado print destacando o placeholder).
- **Implementações Realizadas (`src/components/chat-input.tsx`):**
  1. Simplificado o placeholder padrão do textarea de `'Escreva uma mensagem ou cole um print (Ctrl+V)...'` para `'Escreva uma mensagem...'`.
  2. Eliminada menção a atalho de desktop (`Ctrl+V`), melhorando a concisão visual e ergonomia mobile (360px-430px).
  3. Preservada a condicionalidade de placeholders para inspeção de componentes, busca web ativa e modo plano.
- **Evidências de Verificação:**
  - `npm test`: **160/160 testes unitários passando em 36 suítes**.
  - `tsc --noEmit`: **0 erros**.
  - `npm run build`: compilado com sucesso.
  - Code Review formal: Aprovado sem ressalvas.
  - Commit: `923ba0e` enviado para `origin/main`.

## 123. Reposicionamento do Botão de Deploy (Icon-Only no Extremo Superior Direito)
- **Solicitação do Usuário:** *"coloca esse deploy no mesmo jeito e lugar que foi feito no mobile la pro lado direito superior"* (anexado print mostrando o botão Deploy colado ao lado do Studio e antes de Grafo).
- **Diagnóstico da Causa Raiz:**
  1. No desktop, o `DeploymentStatusBadge` estava inserido como o primeiro item do contêiner da direita, ficando adjacente ao switcher central (`[Chat] [Preview] [Studio]`) e espremendo a aba Studio.
  2. No componente `DeploymentStatusBadge`, o texto `"Deploy"` estava visível no desktop (`sm:inline`), ocupando largura desnecessária (~75px), enquanto no mobile já era icon-only.
  3. No mobile, o badge havia sido alocado temporariamente à esquerda ao lado do menu lateral, gerando assimetria entre plataformas.
- **Implementações Realizadas:**
  1. **Componente Icon-Only Unificado (`src/components/deployments/deployment-status-badge.tsx`):**
     - Removido o rótulo de texto `"Deploy"` em todos os 4 estados (`building`, `failure`, `success`, `idle`), transformando-o em botão quadrado compacto icon-only (`p-1.5 rounded-lg`), exatamente como o padrão mobile.
     - Removida importação não utilizada do `Loader2`.
     - Preservados `aria-label` e `title` descritivos completos para acessibilidade.
  2. **Reposicionamento no Topo Direito (`src/components/chat-header.tsx`):**
     - Removido o badge duplicado do container esquerdo do mobile.
     - Movido o `DeploymentStatusBadge` para a extrema direita (após o botão do Terminal), tornando-o o último elemento no canto superior direito.
     - Ajustado espaçamento para `gap-1.5 sm:gap-2 shrink-0`, garantindo folga extra em viewports mobile (360px).
     - Restabelecido amplo respiro visual entre as abas centrais e as ferramentas da direita.
- **Evidências de Verificação:**
  - `npm test`: **160/160 testes unitários passando em 36 suítes**.
  - `tsc --noEmit`: **0 erros**.
  - `npm run build`: bundle de produção e Worker compilados com sucesso em 1.80s.
  - Code Review formal: Aprovado.
  - Commit: `b6e0926` enviado para `origin/main`.

## 124. Despoluição Visual do Cabeçalho de Conversas Recentes na Sidebar
- **Solicitação do Usuário:** *"Esse apagar e arquivar, remove dai, ja tem aqueles que aprece quando a gente arrasta o cartão"* (anexado print destacando o texto `‹ apagar | arquivar ›` ao lado de `RECENTES (1)`).
- **Implementações Realizadas (`src/components/chat-sidebar.tsx`):**
  1. Removido o elemento de dica `‹ apagar | arquivar ›` do cabeçalho da lista de conversas recentes.
  2. Simplificada a marcação para focar apenas no contador `Recentes ({activeConversations.length})`.
  3. Preservada integralmente a mecânica de gesto swipe nos cartões (`SwipeableConversationItem`), mantendo a funcionalidade de arrastar para deletar (esquerda) e arquivar (direita).
- **Evidências de Verificação:**
  - `npm test`: **160/160 testes unitários passando em 36 suítes**.
  - `tsc --noEmit`: **0 erros**.
  - `npm run build`: bundle de produção compilado com sucesso.
  - Code Review formal: Aprovado sem ressalvas.
  - Commit: `1bdbbd2` enviado para `origin/main`.

## 125. Skill HyperFrames (Vídeos e Animações em Código com HTML, Tailwind e GSAP 3)
- **Solicitação do Usuário:** Integrar a skill nativa **HyperFrames (Vídeos em Código com HTML, Tailwind e GSAP)** no Éden, permitindo que qualquer modelo de IA crie animações determinísticas, teasers e vídeos executáveis diretamente no Canvas interativo.
- **Implementações Realizadas:**
  1. **Tipagem e Ícone (`src/lib/types.ts` & `src/components/extensions/extensions-panel.tsx`):**
     - Adicionado `'video'` na união `SkillIcon`.
     - Importado ícone `Video` de `lucide-react` com acabamento em rosa suave (`text-rose-400`) no renderizador do catálogo de extensões.
  2. **Catálogo de Habilidades e Migração Automática (`src/lib/storage.ts`):**
     - Registrada a skill `hyperframes` (*"HyperFrames (Vídeo em Código)"*) com `enabled: true`, ícone `'video'` e diretrizes estruturadas para animações determinísticas, controle de cenas (#scene-1, #scene-2), proporções de vídeo (16:9, 9:16 e 1:1) e controles interativos (Play/Pause/Replay).
     - Auto-migração via `missingBuiltins` no `loadSkills()`, injetando a nova skill ativada por padrão no IndexedDB do usuário sem sobrescrever configurações prévias.
  3. **Injeção do GSAP 3 e Suporte no Sandbox do Canvas (`src/lib/canvas-prototype.ts`):**
     - Injetada a biblioteca GSAP 3 via CDN seguro (`https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js`) tanto para fragmentos quanto para documentos HTML5 completos no `sanitizePrototypeHtml`.
     - Adicionada blindagem defensiva contra duplicação de scripts se o documento já incluir GSAP (mesmo sem Tailwind).
     - Expandido o regex `CANVAS_PROTOTYPE_INTENT_REGEX` para reconhecer termos no singular e plural (`v[ií]deos?`, `anima[cç](?:[aã]o|[õo]es)`, `teasers?`, `modais`, `painéis`, etc.).
  4. **System Prompt e Transparência no Chat (`src/App.tsx`, `src/lib/skills-extractor.ts`):**
     - Injetada a Regra 12 no System Prompt do Éden exigindo que vídeos e animações sejam estruturados como composições determinísticas com timelines do GSAP e exibidos no Canvas.
     - Adicionado `'HyperFrames (Vídeo em Código)'` na lista de fallback de transparência de habilidades em `skills-extractor.ts`.
- **Evidências de Verificação:**
  - `npm test`: **163/163 testes unitários passando em 36 suítes** (100% verde).
  - `tsc --noEmit`: **0 erros**.
  - `npm run build`: bundle e Cloudflare Pages Worker (`dist/_worker.js`, 170.1 kB) gerados com sucesso em 2.60s.
  - Code Review formal: Aprovado com incorporação de todas as recomendações de plurais e idempotência.

