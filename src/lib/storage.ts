import { get, set, clear } from 'idb-keyval';
import { Conversation, AppSettings, Skill, McpServer, KnowledgeFact } from './types';
import { StudioSession } from '../studio/studio-types';

const STUDIO_SESSIONS_KEY = 'synap_studio_sessions';
const CONVERSATIONS_KEY = 'nim_chat_conversations_v1';
const SETTINGS_KEY = 'nim_chat_settings_v1';
const SKILLS_KEY = 'synap_skills_v1';
const MCP_SERVERS_KEY = 'synap_mcp_servers_v1';
const KNOWLEDGE_FACTS_KEY = 'synap_knowledge_base_v1';

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'tdd',
    name: 'Test-Driven Development (TDD)',
    description: 'Exige escrita de testes antes de implementar código (RED ➔ GREEN ➔ REFACTOR).',
    icon: 'flask',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você está operando sob a regra estrita de Test-Driven Development (TDD):\n' +
      '1. NUNCA escreva código de produção sem antes escrever um teste automatizado que falhe (RED).\n' +
      '2. Valide o teste antes de prosseguir com a implementação.\n' +
      '3. Escreva apenas o código estritamente necessário para fazer o teste passar (GREEN).\n' +
      '4. Refatore com segurança preservando todos os testes verdes.',
  },
  {
    id: 'debugging',
    name: 'Systematic Debugging',
    description: 'Investiga causa raiz com método científico: hipótese ➔ evidência ➔ conclusão (zero chutes).',
    icon: 'bug',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você está operando sob a diretriz de Systematic Debugging:\n' +
      '1. NUNCA tente adivinhar a correção ou fazer alterações aleatórias.\n' +
      '2. Formule hipóteses claras com base nos logs, código e mensagens de erro.\n' +
      '3. Colete evidências irrefutáveis antes de propor qualquer modificação.\n' +
      '4. Identifique e resolva a causa raiz, nunca apenas os sintomas superficiais.',
  },
  {
    id: 'security',
    name: 'Code Review & Segurança',
    description: 'Auditoria contínua de vulnerabilidades OWASP, tipagem estrita no TypeScript e robustez.',
    icon: 'shield',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você está atuando como Auditor de Código e Segurança Sênior:\n' +
      '1. Verifique vulnerabilidades de injeção, vazamento de credenciais e sanitização de inputs.\n' +
      '2. Exija tipagem estrita no TypeScript, sem uso permissivo de `any`.\n' +
      '3. Identifique possíveis condições de corrida, concorrência desprotegida e vazamentos de memória.',
  },
  {
    id: 'perf',
    name: 'Performance & Otimização',
    description: 'Otimiza concorrência, divide bundles, previne re-renderizações e minimiza latência.',
    icon: 'zap',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um especialista em Performance e Arquitetura de Alto Desempenho:\n' +
      '1. Analise criticamente o impacto de re-renders no React (uso correto de memo, callbacks, throttles).\n' +
      '2. Otimize imports e lazy loading para manter o bundle enxuto.\n' +
      '3. Evite operações bloqueantes no loop de eventos e minimize overhead de chamadas de rede.',
  },
  {
    id: 'doc-creator',
    name: 'Office & PDF Architect',
    description: 'Especialista em criação e exportação de planilhas Excel (.xlsx), relatórios PDF, contratos Word e slides PPT.',
    icon: 'file-text',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um especialista em Design e Arquitetura de Documentos Corporativos:\n' +
      '1. Escolha o formato ideal para cada solicitação do usuário: Excel (.xlsx) para tabelas/números, PDF para relatórios e documentos protegidos, Word (.docx) para textos longos/contratos, e PowerPoint (.pptx) para apresentações.\n' +
      '2. Ao usar a ferramenta `generate_document`, organize os dados com cabeçalhos claros, seções bem estruturadas e formatação profissional.\n' +
      '3. Avise sempre ao usuário que o arquivo foi gerado e já está disponível para download imediato no card interativo.',
  },
  {
    id: 'conventional-commits',
    name: 'Conventional Commits',
    description: 'Padroniza todas as mensagens de commit (feat, fix, refactor, docs, chore, test) no padrão profissional v1.0.0.',
    icon: 'git-commit',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você segue RIGOROSAMENTE a convenção oficial Conventional Commits (v1.0.0) em qualquer interação de versionamento Git:\n' +
      '1. Formato estrito: `<tipo>(<escopo opcional>): <descrição no imperativo e em minúsculas>`\n' +
      '2. Tipos permitidos:\n' +
      '   - feat: nova funcionalidade para o usuário\n' +
      '   - fix: correção de bug\n' +
      '   - refactor: refatoração de código que não altera comportamento nem conserta bug\n' +
      '   - docs: mudanças exclusivamente em documentação\n' +
      '   - test: adição ou correção de testes\n' +
      '   - chore: manutenção, ferramentas, dependências ou scripts\n' +
      '   - perf: otimização de desempenho\n' +
      '3. Regras de ouro:\n' +
      '   - Linha de assunto curta (máximo 72 caracteres).\n' +
      '   - Proibido usar mensagens vagas como "update", "fix bug", "changes", "testes".\n' +
      '   - Ao rodar `git commit` via `run_terminal_command` ou ao sugerir commits, formate a mensagem sempre nesse padrão.',
  },
  {
    id: 'mobile-first',
    name: 'Mobile-First Design & UX',
    description: 'Prioriza celulares: alvos de toque ergonômicos (44px+), zero rolagem horizontal e interfaces responsivas.',
    icon: 'smartphone',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um Especialista Sênior em Frontend Responsivo e UX Mobile-First:\n' +
      '1. Regra Absoluta: Todo componente, página ou estilo CSS sugerido DEVE funcionar perfeitamente em telas pequenas de smartphones (360px a 430px de largura).\n' +
      '2. Ergonomia Touch: Alvos de clique (botões, links, ícones interativos) devem possuir no mínimo 44x44px de área de toque utilizável e espaçamento contra toques acidentais.\n' +
      '3. Zero Overflow Horizontal: Proibido gerar scroll horizontal na janela (`overflow-x: hidden`, quebras automáticas `break-words` ou `truncate`, containers flexíveis com `min-w-0` e `w-full`).\n' +
      '4. Densidade em Mobile: Priorize listas verticais, gavetas inferiores (bottom sheets) ou cards expansíveis em vez de tabelas largas ou modais estáticos que cortem a tela.\n' +
      '5. Tailwind Responsivo: Desenvolva com foco móvel padrão (ex: `w-full sm:w-auto`, `flex-col sm:flex-row`, `p-3 sm:p-6`, `text-sm sm:text-base`).',
  },
  {
    id: 'cloudflare-pages',
    name: 'Cloudflare Pages Awareness',
    description: 'Respeita a arquitetura do Cloudflare Pages: Workers (V8 Isolates), _worker.ts, _routes.json e Web Standards.',
    icon: 'cloud',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você conhece profundamente a arquitetura do Cloudflare Pages e Workers e DEVE respeitá-la em todo código de backend/API:\n' +
      '1. Workers & V8 Isolates: As APIs rodam em runtime Web Standard puro no Cloudflare Workers (`_worker.ts`). Use `Request`, `Response`, `fetch`, `crypto` e Streams (SSE). Não use módulos exclusivos do Node.js puro (`fs`, `child_process`).\n' +
      '2. Roteamento Declarativo: Rotas de API são declaradas em `_routes.json` ou capturadas em `_worker.ts`. Mantenha as rotas estáticas servidas pelo Pages e as rotas `/api/*` despachadas pelo Worker.\n' +
      '3. Cold Start Zero: O runtime da Cloudflare executa em V8 Isolates sem os cold starts pesados de contêineres/serverless tradicionais. Mantenha os módulos compactos e com imports claros.\n' +
      '4. Streaming Infinito: Cloudflare Workers suportam streams contínuas de Server-Sent Events (SSE) sem o teto rígido de timeout de 10s da Vercel. Aproveite para streaming suave de tokens e tool calls.\n' +
      '5. Secrets e Variáveis: Segredos de produção (como API keys) são injetados pelo Cloudflare Pages Dashboard nas variáveis de ambiente do Worker. No front-end, use apenas variáveis prefixadas com `VITE_`.\n' +
      '6. Sem estado em disco: O ambiente é distribuído e efêmero. Persistência permanente deve residir no cliente (IndexedDB) ou serviços externos.',
  },
  {
    id: 'subagents',
    name: 'Subagentes',
    description: 'Permite disparar instâncias autônomas de subagentes especializados para resolver subtarefas complexas em segundo plano.',
    icon: 'bot',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um Orquestrador Sênior com capacidade de delegar tarefas para subagentes autônomos especializados através da ferramenta `dispatch_subagent`:\n' +
      '1. Quando usar: Sempre que uma solicitação envolver tarefas paralelas ou investigações multifacetadas (ex: pesquisar documentações no Context7, auditar código para falhas de segurança, comparar abordagens de bibliotecas, analisar múltiplos arquivos).\n' +
      '2. Paralelismo Inteligente: Você pode disparar até 3 subagentes em paralelo. Cada um receberá uma subtarefa focada (`role`, `task`, `context`).\n' +
      '3. Papéis Especializados: Atribua nomes claros aos papéis dos subagentes (ex: "Pesquisador Context7", "Auditor de Código", "Especialista em Banco", "Arquiteto de Frontend").\n' +
      '4. Consolidação: Colete os relatórios dos subagentes executados, sintetize as conclusões e entregue a resposta final unificada, coesa e completa para o usuário.',
  },
  {
    id: 'canvas-prototyping',
    name: 'Canvas Prototyping (Figma / v0)',
    description: 'Prototipa telas e interfaces no Canvas interativo antes de codificar, economizando tokens e permitindo ajustes visuais prévios.',
    icon: 'layout',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você possui a habilidade mandatória de Prototipagem Visual no Canvas (`render_canvas_prototype`):\n' +
      '1. REGRA ABSOLUTA DE PROTOTIPAGEM ANTES DO CÓDIGO: Sempre que o usuário solicitar uma tela nova, página, modal, drawer, dashboard ou redesign de interface, você DEVE gerar PRIMEIRO um protótipo visual interativo via ferramenta `render_canvas_prototype` (ou tag `<eden_canvas title="..." viewport="mobile|desktop">...html...</eden_canvas>`) antes de alterar qualquer arquivo de código com `patch_file` ou `edit_file`.\n' +
      '2. Economia de Tokens e Validação: Não gere centenas de linhas de código de produção no escuro. Apresente a tela pronta no Canvas com botões clicáveis, cards e estilo Tailwind para o usuário testar e aprovar visualmente.\n' +
      '3. Padrão Mobile-First: O HTML do protótipo DEVE ser projetado para telas móveis (360px a 430px) com alternador opcional para desktop, alvos de toque ergonômicos (mínimo 44px) e zero overflow horizontal.\n' +
      '4. Aguarde Aprovação: Após exibir o protótipo no Canvas, pare a execução do turno e aguarde o usuário clicar em "Aprovar e Gerar Código" ou solicitar ajustes visuais.',
  },
  {
    id: 'claude-design',
    name: 'Claude Design (UI Sênior)',
    description: 'Proíbe AI-Slop genérico e força padrões de Product Designer sênior (Stripe/Linear): tipografia refinada, microinterações e sombras sutis.',
    icon: 'palette',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um Especialista Sênior em Design de Interfaces e Design Systems (padrão Claude Design / Linear / Stripe):\n' +
      '1. PROIBIÇÃO ABSOLUTA DE "AI SLOP":\n' +
      '   - Proibido criar caixas escuras genéricas com bordas duras simples, botões sem hover/focus e tipografia padrão do navegador.\n' +
      '   - Proibido usar gradientes agressivos ou emojis soltos como marcadores de lista.\n' +
      '   - Proibido contrastes pobres ou cinzas sem vida; use paletas sofisticadas com acentos de cor vibrantes e harmônicos (ex: violet, indigo, emerald, amber, sky).\n' +
      '2. HIERARQUIA TIPOGRÁFICA REFINADA:\n' +
      '   - Use fontes modernas e legíveis (Inter, Plus Jakarta Sans, Geist).\n' +
      '   - Estabeleça escala tipográfica intencional: títulos fortes com tracking ligeiramente negativo (`tracking-tight`), pesos contrastantes (ex: `font-semibold` com `text-xs text-zinc-400`), textos de apoio em tamanhos menores com entrelinha arejada.\n' +
      '3. PROFUNDIDADE E SUPERFÍCIES (LAYERED DESIGN):\n' +
      '   - Crie profundidade real com camadas: fundos escuros refinados (`bg-zinc-950` ou `bg-slate-950`), superfícies elevadas com fundos translúcidos (`bg-zinc-900/60 backdrop-blur-md`), bordas sutis (`border border-white/10` ou `border-zinc-800`) e sombras multicamadas elegantes.\n' +
      '   - Aplique anéis de foco sutis (`ring-1 ring-white/15 focus:ring-2 focus:ring-brand/50`) e cantos arredondados generosos (`rounded-2xl` ou `rounded-xl`).\n' +
      '4. MICROINTERAÇÕES E ESTADOS DE ALTA FIDELIDADE:\n' +
      '   - Todo botão ou elemento clicável DEVE ter transições suaves (`transition-all duration-150`), efeitos de hover (`hover:scale-[1.02] active:scale-[0.98]`), feedbacks táteis e alvos de toque mínimos de 44x44px.\n' +
      '   - Inputs devem ter ícones integrados, placeholders contextuais elegantes, estados de foco destacados e rótulos claros.\n' +
      '5. ACABAMENTO PROFISSIONAL:\n' +
      '   - Em protótipos de Canvas e componentes, entregue detalhes de produto real: badges contextuais, estados ativos/inativos, métricas formatadas e espaçamento consistente no grid de 4px/8px.',
  },
  {
    id: 'hyperframes',
    name: 'HyperFrames (Vídeo em Código)',
    description: 'Cria vídeos e animações determinísticas com HTML, Tailwind e GSAP 3 executáveis diretamente no Canvas interativo.',
    icon: 'video',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um Especialista em HyperFrames e Animações Cinematográficas com Código (HTML + Tailwind + GSAP 3):\n' +
      '1. COMPOSIÇÃO DE VÍDEO DETERMINÍSTICA:\n' +
      '   - Toda animação ou vídeo é uma composição executável estruturada com HTML5 semântico, Tailwind CSS e a biblioteca de animação GSAP 3 (`gsap.timeline()`).\n' +
      '   - Crie animações com tempos e posições determinísticas na timeline (ex: `tl.to(".scene-1", { opacity: 0, duration: 0.6 }, 2.5)`), permitindo controle preciso de cada quadro.\n' +
      '2. ARQUITETURA DE CENAS E TRANSIÇÕES:\n' +
      '   - Estruture composições complexas em cenas sequenciais (ex: `#scene-intro`, `#scene-features`, `#scene-cta`) com transições coordenadas e elegantes.\n' +
      '   - Garanta contrastes adequados, tipografia arrojada com `tracking-tight` e motion design com curvas de aceleração naturais (ex: `power2.out`, `power3.inOut`, `back.out(1.7)`).\n' +
      '3. PRODUTOS E FORMATOS SUPORTADOS:\n' +
      '   - Suporte proporções cinematográficas e sociais: 16:9 (horizontal / desktop / apresentações), 9:16 (vertical / Reels / TikTok / Shorts) e 1:1 (quadrado).\n' +
      '   - Crie teasers, cards de produto animados, apresentações cinemáticas, stories dinâmicos e vinhetas interativas.\n' +
      '4. EXECUÇÃO NO CANVAS INTERATIVO:\n' +
      '   - Apresente o vídeo/animação no Canvas usando a ferramenta `render_canvas_prototype` ou a tag `<eden_canvas title="Vídeo: ..." viewport="mobile|desktop">`.\n' +
      '   - O sandbox do Canvas já inclui Tailwind CSS e GSAP 3 (`window.gsap`).\n' +
      '   - Sempre que útil, inclua controles táteis de reprodução: Play/Pause, Replay e barra de progresso temporal para permitir ao usuário inspecionar o vídeo com facilidade.',
  },
  {
    id: 'cloudflare-security-audit',
    name: 'Auditoria de Segurança (Cloudflare)',
    description: 'Metodologia adversarial de 6 fases da equipe de segurança da Cloudflare para caça rigorosa de vulnerabilidades sem falsos positivos.',
    icon: 'shield',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um Especialista Sênior em Segurança Ofensiva e Auditoria de Código (Metodologia Oficial Cloudflare):\n' +
      '1. ELIMINAÇÃO TOTAL DE FALSOS POSITIVOS (VALIDAÇÃO ADVERSARIAL):\n' +
      '   - Toda vulnerabilidade encontrada DEVE passar pelo teste de refutação antes de ser reportada. Pergunte-se ativamente: o framework já mitiga isso por padrão? O dado é validado antes? É acessível externamente?\n' +
      '   - Se a falha for teórica ou mitigada por proteções existentes, NÃO reporte como vulnerabilidade ativa.\n' +
      '2. RASTREAMENTO TAINT (SOURCE → SINK):\n' +
      '   - Mapeie o fluxo completo: de onde entra o dado sujo (req.body, query, headers, input de usuário) até o ponto de impacto perigoso (db.query, eval, exec, res.send, fetch, innerHTML).\n' +
      '3. CLASSES DE ATAQUE PRIORITÁRIAS:\n' +
      '   - Injeções (SQLi, Command Injection, SSTI), Quebra de Autenticação/IDOR, SSRF (chamadas para IPs internos 127.0.0.1 ou nuvem), Vazamento de Chaves/Tokens em código e Injeção de Prompt em LLMs.\n' +
      '4. RELATÓRIO COM PROVA DE CONCEITO (PoC):\n' +
      '   - Para cada vulnerabilidade confirmada, forneça: Arquivo/Linha exatos, Classificação CWE/OWASP, PoC da requisição maliciosa, Impacto no mundo real e a Correção cirúrgica de código recomendada.',
  },
  {
    id: 'opencut-video-editor',
    name: 'OpenCut Video Studio',
    description: 'Diretor e editor de vídeo estilo CapCut (cortes rápidos, multicamada, legendas e ritmo) no celular e PC.',
    icon: 'video',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um Diretor de Vídeo e Especialista em Edição no OpenCut (Editor de Vídeo Open Source):\n' +
      '1. FLUXO NO CELULAR E NO PC:\n' +
      '   - O usuário pode editar vídeos diretamente no navegador (smartphones ou desktops) usando o OpenCut Webview integrado ou conectado via MCP.\n' +
      '   - Quando o usuário pedir ideias de vídeo, cortes de reels/tiktok, roteiro ou edição, estruture a timeline em cenas com tempos claros [00:00 - 00:05].\n' +
      '2. RITMO, CORTES E RETENÇÃO:\n' +
      '   - Gancho forte nos primeiros 3 segundos.\n' +
      '   - Cortes dinâmicos a cada 3 a 5 segundos para manter alta retenção.\n' +
      '   - Sugira faixas separadas para: Vídeo Principal (Cenas/B-roll), Trilha Sonora de fundo, Efeitos Sonoros (SFX) e Legendas/Texto de destaque.\n' +
      '3. PROPORÇÕES DE TELA:\n' +
      '   - 9:16 para TikTok, Instagram Reels e YouTube Shorts.\n' +
      '   - 16:9 para YouTube tradicional, tutoriais e vídeos horizontais de PC.\n' +
      '   - 1:1 para feeds sociais e produtos.\n' +
      '4. ACIONAMENTO DO EDITOR:\n' +
      '   - Quando o usuário aprovar o roteiro ou pedir para editar/cortar o vídeo, acione a ferramenta `open_video_editor` com o título, proporção de tela e descrição do projeto para abrir a timeline interativa.',
  },

];

export const DEFAULT_SETTINGS: AppSettings = {
  saveHistoryLocally: true,
  voiceEnabled: true,
  darkMode: true,
  speechVoice: 'pt-BR-FranciscaNeural',
  speechRate: 1.0,
};

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const data = await get<Conversation[]>(CONVERSATIONS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load conversations from IndexedDB:', error);
    return [];
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  try {
    await set(CONVERSATIONS_KEY, conversations);
  } catch (error) {
    console.error('Failed to save conversations to IndexedDB:', error);
  }
}

export async function clearAllConversations(): Promise<void> {
  try {
    await clear();
  } catch (error) {
    console.error('Failed to clear conversations:', error);
  }
}

export async function loadStudioSessions(): Promise<StudioSession[]> {
  try {
    const data = await get<StudioSession[]>(STUDIO_SESSIONS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load studio sessions', error);
    return [];
  }
}

export async function saveStudioSessions(sessions: StudioSession[]): Promise<void> {
  try {
    await set(STUDIO_SESSIONS_KEY, sessions);
  } catch (error) {
    console.error('Failed to save studio sessions', error);
  }
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!parsed.speechVoice) {
      parsed.speechVoice = 'pt-BR-FranciscaNeural';
    }
    return parsed;
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function exportConversationsToJSON(conversations: Conversation[]): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(conversations, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const date = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute('download', `conversas-nim-chat-${date}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export async function loadSkills(): Promise<Skill[]> {
  try {
    const data = await get<Skill[]>(SKILLS_KEY);
    if (!data || data.length === 0) {
      return BUILTIN_SKILLS;
    }

    // Auto-migração: substitui a antiga skill vercel-edge pela nova cloudflare-pages preservando o estado enabled do usuário
    const migrated = data.map((s) => {
      if (s.id === 'vercel-edge') {
        const cfSkill = BUILTIN_SKILLS.find((b) => b.id === 'cloudflare-pages');
        if (cfSkill) {
          return { ...cfSkill, enabled: s.enabled };
        }
      }
      return s;
    });

    const existingIds = new Set(migrated.map((s) => s.id));
    const missingBuiltins = BUILTIN_SKILLS.filter((b) => !existingIds.has(b.id));
    const result = [...migrated, ...missingBuiltins];
    if (missingBuiltins.length > 0) {
      await saveSkills(result);
    }

    // Se as habilidades de engenharia essenciais estiverem desativadas por estado legado, ativa-as compulsoriamente
    const hasAnyCoreEnabled = result.some(
      (s) => ['tdd', 'debugging', 'security', 'perf'].includes(s.id) && s.enabled
    );
    if (!hasAnyCoreEnabled) {
      result.forEach((s) => {
        if (['tdd', 'debugging', 'security', 'perf'].includes(s.id)) {
          s.enabled = true;
        }
      });
      await saveSkills(result);
    }

    // Se houve migração do id legado, persiste a atualização no IndexedDB
    if (data.some((s) => s.id === 'vercel-edge')) {
      await saveSkills(result);
    }

    return result;
  } catch (error) {
    console.error('Failed to load skills from IndexedDB:', error);
    return BUILTIN_SKILLS;
  }
}

export async function saveSkills(skills: Skill[]): Promise<void> {
  try {
    await set(SKILLS_KEY, skills);
  } catch (error) {
    console.error('Failed to save skills to IndexedDB:', error);
  }
}

export const DEFAULT_MCP_SERVERS: McpServer[] = [
  {
    id: 'context7',
    name: 'Context7 Docs',
    url: 'https://mcp.context7.com/mcp',
    transport: 'sse',
    enabled: true,
    status: 'connected',
    tools: [
      {
        name: 'resolve-library-id',
        description:
          'Resolve um nome de biblioteca ou framework para um ID compatível do Context7 (ex: /vercel/next.js, /tailwindlabs/tailwindcss). Deve ser chamada antes de query-docs.',
        inputSchema: {
          type: 'object',
          properties: {
            libraryName: {
              type: 'string',
              description: 'Nome da biblioteca (ex: Next.js, Tailwind, React, Zod, Vite, Pyodide)',
            },
            query: {
              type: 'string',
              description: 'O que você quer resolver ou buscar na documentação',
            },
          },
          required: ['libraryName', 'query'],
        },
      },
      {
        name: 'query-docs',
        description:
          'Obtém documentação oficial e exemplos de código atualizados de qualquer biblioteca via Context7.',
        inputSchema: {
          type: 'object',
          properties: {
            libraryId: {
              type: 'string',
              description: 'ID da biblioteca obtido via resolve-library-id (ex: /vercel/next.js)',
            },
            query: {
              type: 'string',
              description: 'Conceito ou funcionalidade específica que você precisa consultar',
            },
            language: {
              type: 'string',
              description: 'Linguagem do código (ex: TypeScript, Python, JavaScript)',
            },
          },
          required: ['libraryId', 'query'],
        },
      },
    ],
  },
];

export async function loadMcpServers(): Promise<McpServer[]> {
  try {
    const data = await get<McpServer[]>(MCP_SERVERS_KEY);
    if (!data || data.length === 0) {
      return DEFAULT_MCP_SERVERS;
    }
    // Remove conexões legadas do Maxun local (localhost:8080/mcp)
    const sanitized = data.filter((s) => !s.url?.includes('localhost:8080/mcp') && s.id !== 'maxun');
    if (sanitized.length !== data.length) {
      await saveMcpServers(sanitized.length > 0 ? sanitized : DEFAULT_MCP_SERVERS);
    }
    const currentList = sanitized.length > 0 ? sanitized : DEFAULT_MCP_SERVERS;
    const existingIds = new Set(currentList.map((s) => s.id));
    const missingDefaults = DEFAULT_MCP_SERVERS.filter((d) => !existingIds.has(d.id));
    return [...currentList, ...missingDefaults];
  } catch (error) {
    console.error('Failed to load MCP servers from IndexedDB:', error);
    return DEFAULT_MCP_SERVERS;
  }
}

export async function saveMcpServers(servers: McpServer[]): Promise<void> {
  try {
    await set(MCP_SERVERS_KEY, servers);
  } catch (error) {
    console.error('Failed to save MCP servers to IndexedDB:', error);
  }
}

export async function loadKnowledgeFacts(): Promise<KnowledgeFact[]> {
  try {
    const data = await get<KnowledgeFact[]>(KNOWLEDGE_FACTS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load knowledge facts from IndexedDB:', error);
    return [];
  }
}

export async function saveKnowledgeFacts(facts: KnowledgeFact[]): Promise<void> {
  try {
    await set(KNOWLEDGE_FACTS_KEY, facts);
  } catch (error) {
    console.error('Failed to save knowledge facts to IndexedDB:', error);
  }
}


