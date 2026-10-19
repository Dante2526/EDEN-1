import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AlertCircle, WifiOff, X, GitBranch, ExternalLink, FileCode, Check, Eye, RefreshCw } from 'lucide-react';
import {
  Conversation,
  Message,
  ModelId,
  ReasoningEffort,
  AppSettings,
  AttachedDocument,
  ActiveRepoState,
  PendingChange,
  MessageEditedFile,
  MessageToolCall,
  ChangeType,
  Skill,
  McpServer,
  KnowledgeFact,
  KnowledgeCategory,
  SelectedPreviewElement,
  WebSourceItem,
} from './lib/types';
import {
  loadConversations,
  saveConversations,
  loadSettings,
  saveSettings,
  clearAllConversations,
  DEFAULT_SETTINGS,
  loadSkills,
  saveSkills,
  loadMcpServers,
  saveMcpServers,
  loadKnowledgeFacts,
  saveKnowledgeFacts,
} from './lib/storage';
import { formatKnowledgePrompt, createKnowledgeFact } from './lib/knowledge-base';
import { generateId, generateTitleFromMessage, formatFileSize } from './lib/utils';
import { ChatHeader } from './components/chat-header';
import { useDeploymentMonitor } from './lib/deployment-service';
import { DeploymentErrorCard } from './components/deployments/deployment-error-card';
import { DeploymentLogModal } from './components/deployments/deployment-log-modal';
import { ChatSidebar } from './components/chat-sidebar';
import { lazyWithRetry } from './lib/lazy-retry';

import { ProjectWorkspace } from './components/project-workspace/project-workspace';
import { loadBabel } from './lib/preview-html';
import { extractUsedSkills } from './lib/skills-extractor';
const ProjectsPanel = lazyWithRetry(() =>
  import('./components/project-workspace/projects-panel').then((m) => ({ default: m.ProjectsPanel }))
);
import { ChatMessage } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { SettingsModal } from './components/settings-modal';
import { ClaudeLogo } from './components/claude-logo';
import { PendingChangesProvider, usePendingChanges } from './lib/pending-changes';
import { ProjectProvider, useProjects } from './lib/project-context';
import { DiffViewer } from './components/source-control/diff-viewer';
import { fetchFileContent, fetchRepoContents, searchCode } from './lib/github';
import { TerminalPanel, TerminalEntry } from './components/terminal-panel';
import { executeEmulatedCommand } from './lib/git-terminal-emulator';
import { buildPendingRemoteAction, isRemoteCommandRequiringApproval } from './lib/remote-gate';
import { commitStagedChanges } from './lib/github-commit';
import { StudioPanel } from './studio/studio-panel';
import { ErrorModal, AppErrorInfo } from './components/error-modal';
import { GraphModal } from './components/graph-modal';
import { buildGraphFromFiles, queryGraphContext, ProjectGraph } from './lib/graphify-engine';
import { CompactionMarker } from './components/compaction-marker';
import { executePythonCode, formatPythonOutput } from './lib/pyodide-client';
import { generateDocumentBlob } from './lib/document-generator';
import { prepareMessagesForApi, shouldCompact, compactConversation } from './lib/context-compactor';
import {
  convertMcpToolsToOpenAi,
  testMcpConnection,
  executeMcpToolCall,
} from './lib/mcp-client';
import { runSubagent } from './lib/subagent-runner';
import { isVisionModel, isToolCapableModel } from './lib/models';
import { extractTextToolCalls, buildTextToolProtocolPrompt } from './lib/text-tool-parser';
import { ThemeMode, getInitialTheme, applyTheme, toggleThemeWithTransition } from './lib/theme';
import { useContinuousVoice } from './lib/use-continuous-voice';
import { StreamingSpeechQueue } from './lib/streaming-speech-queue';
import { playThinkingSound, playSpeakingStartSound, playVoiceModeOnSound, playVoiceModeOffSound } from './lib/sound-effects';
import { formatElementInspectorPrompt } from './lib/preview-element-locator';
import { looksLikeEcho } from './lib/echo-filter';
import {
  looksLikeIncompleteWork,
  looksLikeFileModificationPromise,
  isRecoverableStreamErrorMessage,
} from './lib/agentic-patterns';
import {
  applyFilePatches,
  normalizePatchArgs,
  resolveEffectiveFileContent,
  normalizeRepoPath,
} from './lib/file-patcher';
import {
  filterToolsForPlanMode,
  checkPlanModeWriteGate,
  buildMandatoryPlanPrompt,
  isPlanApprovalReply,
} from './lib/plan-mode-gate';
import { selectContextualTools, selectContextualSkills } from './lib/smart-prefill';
import {
  fetchLiveWebSources,
  buildLiveWebPrompt,
  parseWebSourcesFromSearchResults,
} from './lib/web-search-engine';
import { formatBrowserToolResultForModel } from './lib/browser-agent-engine';

const MODEL_STORAGE_KEY = 'nim_chat_selected_model';
const REASONING_STORAGE_KEY = 'nim_chat_reasoning_effort';
const PLAN_MODE_STORAGE_KEY = 'synap_plan_mode_v1';
const WEB_SEARCH_MODE_STORAGE_KEY = 'synap_web_mode_v1';

// Tools que funcionam SEM repo ativo (busca global no GitHub)
const SEARCH_GITHUB_REPOS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_github_repos',
    description: 'Busca repositórios públicos no GitHub por nome, descrição ou tópico. Use para encontrar bibliotecas, ferramentas, skills, templates ou exemplos de código. Retorna: full_name, descrição, URL, stars, linguagem e branch padrão.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de busca (ex: "cursor rules", "ai skills", "tailwind components")' },
      },
      required: ['query'],
    },
  },
};

const READ_GITHUB_FILE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'read_github_file',
    description: 'Lê o conteúdo de um arquivo de QUALQUER repositório público do GitHub (não apenas o repositório ativo). Use após search_github_repos para ler READMEs, arquivos de configuração, prompts, skills ou código-fonte de repositórios encontrados.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Owner do repositório (ex: "Dante2526")' },
        repo: { type: 'string', description: 'Nome do repositório (ex: "Synap")' },
        path: { type: 'string', description: 'Caminho do arquivo (ex: "README.md", "src/index.ts")' },
        branch: { type: 'string', description: 'Branch (padrão: main)' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
};

const PATCH_FILE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'patch_file',
    description:
      'Edita cirurgicamente trechos específicos de um arquivo existente (substituindo old_str por new_str) sem precisar reescrever o arquivo inteiro. É 5x mais rápida e segura que edit_file para arquivos grandes. Suporta um único bloco (old_str/new_str) ou múltiplos blocos (patches).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo do arquivo (ex: "src/App.tsx")',
        },
        old_str: {
          type: 'string',
          description: 'Trecho exato atual no arquivo a ser substituído (inclua 2-3 linhas de contexto para ser único).',
        },
        new_str: {
          type: 'string',
          description: 'Novo código que substituirá old_str.',
        },
        allow_multiple: {
          type: 'boolean',
          description: 'Se true, substitui todas as ocorrências idênticas de old_str no arquivo.',
        },
        patches: {
          type: 'array',
          description: 'Opcional: lista de múltiplos blocos { old_str, new_str, allow_multiple } para aplicar em sequência no mesmo arquivo.',
          items: {
            type: 'object',
            properties: {
              old_str: { type: 'string', description: 'Trecho exato atual a substituir' },
              new_str: { type: 'string', description: 'Novo trecho substituto' },
              allow_multiple: { type: 'boolean' },
            },
            required: ['old_str', 'new_str'],
          },
        },
      },
      required: ['path'],
    },
  },
};

const GITHUB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê conteúdo atualizado de um arquivo do repositório ou projeto ativo (incluindo alterações já feitas nesta conversa)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo (ex: src/App.tsx)' },
          branch: { type: 'string', description: 'Branch opcional (padrão: branch ativa)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Lista arquivos e diretórios de um caminho no repositório ativo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo (vazio para a raiz do repositório)' },
          branch: { type: 'string', description: 'Branch opcional' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description:
        'Busca por ocorrências de texto, funções ou classes exclusivamente no repositório ativo (equivalente à busca de arquivos do VS Code Ctrl+Shift+F). Retorna caminhos e trechos de código (snippets).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca, nome de função, variável ou classe' },
          path: { type: 'string', description: 'Caminho ou pasta opcional para filtrar a busca (ex: src/)' },
          extension: { type: 'string', description: 'Extensão de arquivo opcional para filtrar (ex: ts, tsx, js, py)' },
        },
        required: ['query'],
      },
    },
  },
  PATCH_FILE_TOOL,
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Cria um novo arquivo, deleta ou reescreve o conteúdo completo de um arquivo no repositório ativo. Para editar trechos pontuais de arquivos existentes, prefira patch_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo (ex: src/lib/utils.ts)' },
          content: { type: 'string', description: 'Novo conteúdo completo do arquivo' },
          type: {
            type: 'string',
            enum: ['modified', 'added', 'deleted'],
            description: 'Tipo de modificação: modified (padrão), added ou deleted',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_edit_files',
      description:
        'Aplica uma refatoração em lote em múltiplos arquivos de uma só vez no repositório ativo. Todas as alterações ficam pendentes no Source Control para revisão atômica e unificada pelo usuário.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Breve resumo ou título da refatoração realizada (ex: Refatoração de componentes de UI e tipos)',
          },
          files: {
            type: 'array',
            description: 'Lista de arquivos a serem criados, alterados ou removidos',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Caminho relativo do arquivo (ex: src/components/button.tsx)' },
                content: { type: 'string', description: 'Conteúdo completo do arquivo' },
                type: {
                  type: 'string',
                  enum: ['modified', 'added', 'deleted'],
                  description: 'Tipo de alteração: modified (padrão), added ou deleted',
                },
              },
              required: ['path', 'content'],
            },
          },
        },
        required: ['summary', 'files'],
      },
    },
  },
];

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Pesquisa informações atualizadas, documentações, referências e fontes na Internet',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de pesquisa na internet' },
      },
      required: ['query'],
    },
  },
};

const FETCH_URL_TOOL = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Faz requisições HTTP (estilo `curl`) e inspeciona páginas web, APIs, players embed ou streams de vídeo (.mp4, .m3u8, .ts estilo `ffprobe`). ' +
      'Suporta headers customizados (`Referer`, `Range`, `User-Agent`, `Origin`), `raw: true` para obter o HTML bruto com todos os `<iframe src>` e links de vídeo ocultos, e `probe_media: true` para validar codec/resolução/duração real de um stream de vídeo.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A URL completa e válida (http:// ou https://) a ser requisitada ou inspecionada.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'HEAD', 'POST'],
          description: 'Método HTTP (padrão: GET). Use HEAD para checar apenas cabeçalhos/status.',
        },
        headers: {
          type: 'object',
          description:
            'Cabeçalhos HTTP customizados opcionais (ex.: {"Referer": "https://mxdrop.top/", "Range": "bytes=0-1023"}).',
        },
        raw: {
          type: 'boolean',
          description:
            'Se true, retorna o HTML bruto sem sanitização + lista automática de `iframes` e `mediaUrls` (.mp4/.m3u8) encontrados.',
        },
        probe_media: {
          type: 'boolean',
          description:
            'Se true, inspeciona os bytes do stream de vídeo (estilo ffprobe) e retorna codec (h264/aac), resolução (width x height), duração e validade de pacotes HLS/MP4/TS.',
        },
        render_js: {
          type: 'boolean',
          description:
            'Se true, abre a página em um navegador Chromium headless real (estilo Playwright) e retorna o DOM DEPOIS do JavaScript rodar. Use para sites SPA, players carregados via JS ou páginas com proteção Cloudflare.',
        },
        wait_for_selector: {
          type: 'string',
          description: 'Opcional (com render_js): seletor CSS a aguardar antes de capturar o DOM (ex.: "iframe", "video").',
        },
      },
      required: ['url'],
    },
  },
};

const PYTHON_TOOL = {
  type: 'function',
  function: {
    name: 'run_python',
    description:
      'Executa scripts Python 3 reais no navegador via WebAssembly (Pyodide). ' +
      'Possui acesso real à internet via `urllib.request.urlopen` (com suporte a `Request(url, headers={...})`), ' +
      'e instala pacotes automaticamente sob demanda (`bs4` / `BeautifulSoup`, `lxml`, `numpy`, `pandas`). ' +
      'Use para web scraping avançado, regex em HTML, stress test de Range requests, cálculos matemáticos ou simulações.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'O script Python completo e executável a ser rodado.',
        },
      },
      required: ['code'],
    },
  },
};

const DOCUMENT_GEN_TOOL = {
  type: 'function',
  function: {
    name: 'generate_document',
    description:
      'Gera arquivos reais para download nos formatos PDF, Excel (.xlsx), Word (.docx) ou PowerPoint (.pptx). ' +
      'Use SEMPRE que o usuário pedir para criar planilhas, relatórios, contratos, documentos formatados ou apresentações de slides.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['pdf', 'excel', 'docx', 'pptx'],
          description: 'O tipo do documento a ser gerado.',
        },
        filename: {
          type: 'string',
          description: 'Nome do arquivo com extensão (ex: relatorio.xlsx, proposta.pdf, contrato.docx, slides.pptx).',
        },
        title: {
          type: 'string',
          description: 'Título principal exibido no documento.',
        },
        content: {
          type: 'object',
          description:
            'Conteúdo estruturado. Para Excel: { sheets: [{ name, headers: string[], rows: any[][] }] }. ' +
            'Para PDF: { sections: [{ title?, text?, bulletPoints?: string[], table?: { headers: string[], rows: any[][] } }] }. ' +
            'Para Word: { sections: [{ heading?, text?, bulletPoints?: string[] }] }. ' +
            'Para PPT: { slides: [{ title, subtitle?, bullets?: string[] }] }.',
        },
      },
      required: ['type', 'filename', 'title', 'content'],
    },
  },
};

const TERMINAL_TOOL = {
  type: 'function',
  function: {
    name: 'run_terminal_command',
    description:
      'Executa comandos no Terminal do Éden com utilitários reais integrados:\n' +
      '1) Rede e HTTP: curl (com suporte a -I, -H, -X, requisições HTTP reais) e playwright <url> (renderização headless).\n' +
      '2) Multimídia e Streams: ffprobe (inspeção de streams, codecs, duração e integridade) e ffmpeg (decodificação de frames na GPU e transcode).\n' +
      '3) Git e Unix: git (status, log, diff, commit, branch, checkout), ls, cat, pwd, grep, echo, clear.\n' +
      'Use SEMPRE que precisar inspecionar requisições com curl, testar streams com ffprobe ou rodar comandos.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Comando do shell/bash a ser executado' },
      },
      required: ['command'],
    },
  },
};

const MEMORY_SAVE_TOOL = {
  type: 'function',
  function: {
    name: 'save_memory',
    description:
      'Salva um fato duradouro, regra de projeto ou preferência do usuário na Base de Conhecimento permanente para ser lembrado em todas as conversas futuras.',
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'O fato atemporal e claro a ser retido (ex: "O usuário hospeda a aplicação na Vercel no plano Hobby").',
        },
        category: {
          type: 'string',
          enum: ['stack', 'preference', 'rule', 'general'],
          description: 'Categoria do fato: stack técnica, preferência do usuário, regra de projeto ou geral.',
        },
      },
      required: ['fact'],
    },
  },
};

const MEMORY_FORGET_TOOL = {
  type: 'function',
  function: {
    name: 'forget_memory',
    description:
      'Remove um fato desatualizado ou revogado da memória permanente.',
    parameters: {
      type: 'object',
      properties: {
        factId: {
          type: 'string',
          description: 'O ID do fato a ser esquecido (ex: "mem_123").',
        },
        query: {
          type: 'string',
          description: 'Texto ou palavra-chave para buscar e esquecer se o ID não for conhecido.',
        },
      },
    },
  },
};

// ===== Project Workspace tools (criar/editar projetos Sandpack) =====
const CREATE_PROJECT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_project',
    description:
      'Cria um novo projeto Sandpack (preview ao vivo) e abre no workspace. Use quando o usuário pedir pra criar um app/site/componente React/Vue/Vanilla. Templates: react-ts (default), react, vite-react-ts, vanilla-ts, vanilla, vue, static (HTML/CSS/JS), node.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nome do projeto (curto, sem espaços). Ex: "todo-app", "landing-page".',
        },
        template: {
          type: 'string',
          enum: ['react-ts', 'react', 'vite-react-ts', 'vanilla-ts', 'vanilla', 'vue', 'static', 'node'],
          description: 'Template inicial. Default: react-ts. Use "static" para HTML/CSS/JS puro.',
        },
        description: {
          type: 'string',
          description: 'Descrição curta do projeto (opcional).',
        },
        files: {
          type: 'object',
          description:
            'Arquivos iniciais do projeto (override do template). Chave = caminho (ex: "src/App.tsx"), valor = conteúdo. Ex: {"src/App.tsx": "export default () => <h1>Olá</h1>"}.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['name'],
    },
  },
};

const UPDATE_PROJECT_FILES_TOOL = {
  type: 'function' as const,
  function: {
    name: 'update_project_files',
    description:
      'Atualiza arquivos de um projeto Sandpack existente. Use para editar/ciar/deletar arquivos quando o usuário pedir alterações num projeto que já está aberto. Hot-reload é automático.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description:
            'ID do projeto. Se omitido, usa o projeto atualmente ativo no workspace.',
        },
        updates: {
          type: 'array',
          description: 'Lista de alterações atômicas (multi-arquivo).',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Caminho do arquivo. Ex: "src/App.tsx", "src/components/Button.tsx", "index.html".',
              },
              content: {
                type: 'string',
                description: 'Novo conteúdo do arquivo. Ignorado se action=delete.',
              },
              action: {
                type: 'string',
                enum: ['create', 'update', 'delete'],
                description: 'create = novo arquivo, update = editar existente, delete = remover.',
              },
            },
            required: ['path', 'action'],
          },
        },
      },
      required: ['updates'],
    },
  },
};

const OPEN_PROJECT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'open_project',
    description:
      'Abre um projeto existente no workspace Sandpack. Use quando o usuário pedir pra abrir/continuar um projeto salvo.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'ID do projeto. Se omitido, abre o primeiro projeto disponível.',
        },
      },
    },
  },
};

const DISPATCH_SUBAGENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'dispatch_subagent',
    description:
      'Dispara um subagente autônomo especializado em segundo plano para resolver subtarefas complexas em paralelo (ex: pesquisar documentações, auditar segurança, analisar código, ler múltiplos arquivos ou investigar bugs) e retornar um relatório sintetizado.',
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'Papel do subagente (ex: "Pesquisador Context7", "Auditor de Código", "Especialista em Banco", "Revisor de Segurança").',
        },
        task: {
          type: 'string',
          description: 'Instrução precisa do que o subagente deve investigar, analisar ou resolver.',
        },
        context: {
          type: 'string',
          description: 'Trechos de código, contexto ou dados específicos para o subagente cumprir a missão.',
        },
      },
      required: ['role', 'task'],
    },
  },
};

const QUERY_CODE_GRAPH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'query_code_graph',
    description:
      'Consulta o Grafo de Conhecimento e Arquitetura do projeto (Graphify / GraphRAG). ' +
      'Mapeia dependências entre arquivos, nós centrais (God Nodes), quem importa quem e caminhos de impacto antes de propor refatorações ou ao responder dúvidas sobre como os módulos se conectam.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Termo de busca, símbolo, função ou conceito arquitetural a ser localizado no grafo.',
        },
        focus_file: {
          type: 'string',
          description: 'Caminho específico de um arquivo para inspecionar dependências diretas de entrada e saída (ex: "src/App.tsx").',
        },
      },
    },
  },
};

const QUERY_ARCHITECTURE_GRAPH_TOOL = {
  type: 'function' as const,
  function: {
    ...QUERY_CODE_GRAPH_TOOL.function,
    name: 'query_architecture_graph',
    description:
      'Consulta o Grafo de Conhecimento e Arquitetura do projeto (Graphify / GraphRAG). ' +
      'Mapeia dependências entre arquivos, nós centrais (God Nodes), quem importa quem e caminhos de impacto antes de propor alterações.',
  },
};

// ============================================================================
// IMAGE GENERATION TOOL — FLUX.1 Dev via Cloudflare Workers AI
// ============================================================================
// Modelo open-source de geração de imagem. 100% gratuito no free tier da CF
// (10k neurons/dia). Retorna data URL base64 direto (não precisa de CDN).
//
// NOTA: FLUX.2 Dev NÃO funciona via JSON path (requer multipart/form-data,
// dá erro "required properties at '/' are 'multipart'"). Por isso usamos só
// FLUX.1 family.
// ============================================================================
const IMAGE_GEN_TOOL = {
  type: 'function' as const,
  function: {
    name: 'generate_image',
    description:
      'Gera imagem a partir de descrição textual usando FLUX.1 Dev via Cloudflare Workers AI. ' +
      'Use para criar ilustrações, conceitos visuais, mockups, ícones, fotos estilizadas, etc. ' +
      'A imagem volta embutida na resposta (data URL) e aparece direto no chat. ' +
      'Sem watermark, sem custo, sem API key externa.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Descrição detalhada da imagem em inglês (melhor qualidade). Inclua estilo, sujeitos, cenário, iluminação, composição. ' +
            'Ex: "a majestic lion sitting on a cliff at sunset, golden hour lighting, hyperrealistic, 8k, cinematic composition".',
        },
        aspect_ratio: {
          type: 'string',
          description: 'Proporção da imagem. Valores: "1:1" (quadrado, padrão), "16:9" (paisagem), "9:16" (retrato), "4:3", "3:4".',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        },
        model: {
          type: 'string',
          description:
            'Modelo FLUX a usar (opcional, default: flux-1-dev). ' +
            '"flux-1-dev": melhor qualidade (recomendado, ~8s). ' +
            '"flux-1-schnell": mais rápido (~3s), qualidade um pouco menor.',
          enum: ['flux-1-dev', 'flux-1-schnell'],
        },
      },
      required: ['prompt'],
    },
  },
};

// ============================================================================
// REMOTE DEPLOY TOOL — Envio para VPS / servidor remoto com HARD-GATE
// ============================================================================
// A IA NUNCA envia nada direto. A chamada só cria um card de autorização no chat;
// o POST real para /api/deployments?action=trigger só acontece quando o usuário
// clicar em "Autorizar e Enviar para VPS".
// ============================================================================
const REMOTE_DEPLOY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'request_remote_deploy',
    description:
      'Solicita o envio de arquivo/comando para uma VPS ou servidor remoto (substitui ssh/scp/paramiko, que não funcionam aqui). ' +
      'NÃO executa nada sozinho: cria um card de autorização no chat e aguarda o usuário clicar em "Autorizar". ' +
      'Provedores: "vps_webhook" (POST HTTPS para um agente/webhook na VPS), "github_workflow" (dispara workflow_dispatch do GitHub Actions) e "cloudflare_hook" (Deploy Hook).',
    parameters: {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['vps_webhook', 'github_workflow', 'cloudflare_hook'],
          description: 'Canal de envio.',
        },
        target_host: { type: 'string', description: 'Host/IP ou nome do servidor de destino (para exibir ao usuário).' },
        summary: { type: 'string', description: 'Resumo curto do que será enviado e por quê.' },
        endpoint: { type: 'string', description: 'URL HTTPS do webhook/deploy hook (vps_webhook / cloudflare_hook).' },
        file_path: { type: 'string', description: 'Caminho de destino do arquivo no servidor (opcional).' },
        file_content: { type: 'string', description: 'Conteúdo do arquivo a enviar (opcional).' },
        command: { type: 'string', description: 'Comando a executar no servidor (opcional).' },
        workflow_id: { type: 'string', description: 'Arquivo do workflow (github_workflow), ex.: "deploy.yml".' },
        branch: { type: 'string', description: 'Branch/ref do workflow (padrão: main).' },
        owner: { type: 'string', description: 'Dono do repositório (github_workflow).' },
        repo: { type: 'string', description: 'Nome do repositório (github_workflow).' },
      },
      required: ['provider', 'summary'],
    },
  },
};

const BROWSER_CONTROL_TOOL = {
  type: 'function' as const,
  function: {
    name: 'control_browser',
    description:
      'Navega e interage autonomamente com páginas da web em um navegador real (estilo Playwright / Browser-Use). ' +
      'Permite navegar para URLs (action: "navigate"), clicar em botões/links (action: "click"), digitar em campos (action: "type"), ' +
      'pressionar teclas (action: "press_key"), rolar páginas (action: "scroll"), aguardar (action: "wait") ou capturar screenshot (action: "screenshot"). ' +
      'Retorna título, URL, resumo de conteúdo, elementos interativos numerados e screenshot da tela.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['navigate', 'click', 'type', 'press_key', 'scroll', 'wait', 'screenshot'],
          description: 'Ação a ser executada no navegador.',
        },
        url: {
          type: 'string',
          description: 'URL completa para navegar (obrigatório se action="navigate", ex: "https://github.com/login").',
        },
        selector: {
          type: 'string',
          description: 'Seletor CSS ou ID do elemento para clicar ou digitar (ex: "#login_field", "button.submit").',
        },
        text: {
          type: 'string',
          description: 'Texto a ser digitado no campo (obrigatório se action="type").',
        },
        key: {
          type: 'string',
          description: 'Tecla a pressionar (se action="press_key", ex: "Enter", "Tab", "Escape").',
        },
        scroll_direction: {
          type: 'string',
          enum: ['down', 'up'],
          description: 'Direção da rolagem (se action="scroll", padrão: "down").',
        },
        scroll_amount: {
          type: 'number',
          description: 'Quantidade de pixels para rolar (padrão: 500).',
        },
        wait_ms: {
          type: 'number',
          description: 'Tempo de espera em milissegundos após a ação (padrão: 1000).',
        },
      },
      required: ['action'],
    },
  },
};

const DEFAULT_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, BROWSER_CONTROL_TOOL, PYTHON_TOOL, DOCUMENT_GEN_TOOL, MEMORY_SAVE_TOOL, MEMORY_FORGET_TOOL, TERMINAL_TOOL, SEARCH_GITHUB_REPOS_TOOL, READ_GITHUB_FILE_TOOL, CREATE_PROJECT_TOOL, UPDATE_PROJECT_FILES_TOOL, OPEN_PROJECT_TOOL, DISPATCH_SUBAGENT_TOOL, QUERY_CODE_GRAPH_TOOL, QUERY_ARCHITECTURE_GRAPH_TOOL, IMAGE_GEN_TOOL, REMOTE_DEPLOY_TOOL];
const ALL_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, BROWSER_CONTROL_TOOL, PYTHON_TOOL, DOCUMENT_GEN_TOOL, MEMORY_SAVE_TOOL, MEMORY_FORGET_TOOL, TERMINAL_TOOL, SEARCH_GITHUB_REPOS_TOOL, READ_GITHUB_FILE_TOOL, CREATE_PROJECT_TOOL, UPDATE_PROJECT_FILES_TOOL, OPEN_PROJECT_TOOL, DISPATCH_SUBAGENT_TOOL, QUERY_CODE_GRAPH_TOOL, QUERY_ARCHITECTURE_GRAPH_TOOL, IMAGE_GEN_TOOL, REMOTE_DEPLOY_TOOL, ...GITHUB_TOOLS];

export default function App() {
  return (
    <PendingChangesProvider>
      <ProjectProvider>
        <AppContent />
      </ProjectProvider>
    </PendingChangesProvider>
  );
}

function AppContent() {
  const {
    changes,
    addChange,
    stageChange,
    unstageChange,
    discardChange,
    updateChangeContent,
    clearCommitted,
  } = usePendingChanges();

  const liveChangesRef = useRef(changes);
  useEffect(() => {
    liveChangesRef.current = changes;
  }, [changes]);

  const ACTIVE_CONV_STORAGE_KEY = 'synap_active_conv_id';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('synap_active_conv_id');
    }
    return null;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [hasGitHubToken, setHasGitHubToken] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [activeError, setActiveError] = useState<AppErrorInfo | null>(null);
  const [errorHistory, setErrorHistory] = useState<AppErrorInfo[]>([]);

  const reportAppError = useCallback((title: string, message: string, options?: { status?: number; endpoint?: string; rawResponse?: string; stack?: string }) => {
    const newErr: AppErrorInfo = {
      id: generateId(),
      title,
      message,
      status: options?.status,
      endpoint: options?.endpoint,
      rawResponse: options?.rawResponse,
      stack: options?.stack,
      timestamp: Date.now(),
    };
    setActiveError(newErr);
    setErrorHistory((prev) => [newErr, ...prev.slice(0, 19)]);
    setIsErrorModalOpen(true);
  }, []);

  // Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // GitHub, Source Control, Extensions & Projects state
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'repos' | 'source-control' | 'skills' | 'projects'>('chats');
  const [activeRepo, setActiveRepo] = useState<ActiveRepoState | null>(null);
  const [isStudioMode, setIsStudioMode] = useState<boolean>(false);

  // Cloudflare Pages Deployment Monitor
  const [isDeploymentLogsOpen, setIsDeploymentLogsOpen] = useState(false);
  const [dismissedDeploymentId, setDismissedDeploymentId] = useState<string | null>(null);

  const {
    deployment,
    isLoading: isLoadingDeployment,
    refreshNow: refreshDeployment,
  } = useDeploymentMonitor({
    projectName: 'synap',
    owner: activeRepo?.owner || 'Dante2526',
    repo: activeRepo?.repo || 'Synap',
    activeCommitSha: activeRepo?.commitSha,
    enabled: true,
  });

  // Main view tabs (Chat / Preview / Agentes) — estilo Google AI Studio
  type MainViewTab = 'chat' | 'preview' | 'agentes';
  const [mainViewTab, setMainViewTab] = useState<MainViewTab>('chat');

  // Projects (Sandpack workspace) state
  const {
    activeProject,
    closeProject,
    removeProject,
    renameProject,
    updateFileContent,
    createProject,
    openProject,
    updateProjectFiles,
    projectsIndex,
    syncRepoToProject,
  } = useProjects();
  const [showProjectWorkspace, setShowProjectWorkspace] = useState(false);

  // Elementos do Preview selecionados para edição com IA (estilo Element Inspector)
  const [selectedPreviewElements, setSelectedPreviewElements] = useState<SelectedPreviewElement[]>([]);

  const handleSelectPreviewElement = useCallback((element: SelectedPreviewElement) => {
    setSelectedPreviewElements((prev) => {
      const exists = prev.some(
        (el) => el.selector === element.selector && el.tagName === element.tagName
      );
      if (exists) return prev;
      return [...prev, element];
    });
  }, []);

  const handleRemoveSelectedPreviewElement = useCallback((id: string) => {
    setSelectedPreviewElements((prev) => prev.filter((el) => el.id !== id));
  }, []);

  // Graphify Architecture Graph (GraphRAG) state
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [graphFocusNodeId, setGraphFocusNodeId] = useState<string | undefined>();

  const projectGraph = useMemo<ProjectGraph>(() => {
    const fileMap = new Map<string, string>();

    if (activeProject?.files && Object.keys(activeProject.files).length > 0) {
      for (const [rawPath, fileEntry] of Object.entries(activeProject.files)) {
        const cleanPath = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
        const content =
          typeof fileEntry === 'string'
            ? fileEntry
            : fileEntry && typeof fileEntry === 'object' && typeof fileEntry.content === 'string'
              ? fileEntry.content
              : '';
        fileMap.set(cleanPath, content);
      }
    } else {
      // Grafo completo da arquitetura real do Synap caso nenhum projeto externo esteja aberto
      const defaultWorkspaceFiles = [
        {
          path: 'src/main.tsx',
          content: "import App from './App';\nimport './index.css';",
        },
        {
          path: 'src/App.tsx',
          content: [
            "import { ChatHeader } from './components/chat-header';",
            "import { ChatMessage } from './components/chat-message';",
            "import { ChatInput } from './components/chat-input';",
            "import { GraphModal } from './components/graph-modal';",
            "import { StudioPanel } from './studio/studio-panel';",
            "import { buildGraphFromFiles, queryGraphContext } from './lib/graphify-engine';",
            "import { extractTextToolCalls, buildTextToolProtocolPrompt } from './lib/text-tool-parser';",
            "import { runSubagent } from './lib/subagent-runner';",
            "import { convertMcpToolsToOpenAi } from './lib/mcp-client';",
            "import { formatSkillsPrompt } from './lib/skills-manager';",
            "import { loadConversations, saveConversations } from './lib/storage';",
            "import { AVAILABLE_MODELS, modelSupportsTools } from './lib/models';",
            "import { formatFileSize } from './lib/utils';",
            "import type { Conversation, Message, SynapProject } from './lib/types';",
          ].join('\n'),
        },
        {
          path: 'src/components/chat-header.tsx',
          content: "import type { ModelOption } from '../lib/types';\nimport { AVAILABLE_MODELS } from '../lib/models';\nimport { cn } from '../lib/utils';",
        },
        {
          path: 'src/components/chat-message.tsx',
          content: "import type { Message } from '../lib/types';\nimport { formatFileSize, cn } from '../lib/utils';",
        },
        {
          path: 'src/components/chat-input.tsx',
          content: "import type { Attachment } from '../lib/types';\nimport { formatFileSize, cn } from '../lib/utils';",
        },
        {
          path: 'src/components/graph-modal.tsx',
          content: "import type { ProjectGraph, GraphNode } from '../lib/graphify-engine';\nimport { compute3DLayout, step3DForceSimulation, project3DNodes, findClosestProjectedNode } from '../lib/graph-3d-engine';",
        },
        {
          path: 'src/lib/graph-3d-engine.ts',
          content: "import type { ProjectGraph, GraphNode, GraphEdge } from './graphify-engine';",
        },
        {
          path: 'src/lib/graphify-engine.ts',
          content: "export function buildGraphFromFiles() {}\nexport function queryGraphContext() {}",
        },
        {
          path: 'src/lib/text-tool-parser.ts',
          content: "export function extractTextToolCalls() {}\nexport function buildTextToolProtocolPrompt() {}",
        },
        {
          path: 'src/lib/subagent-runner.ts',
          content: "import { extractTextToolCalls, buildTextToolProtocolPrompt } from './text-tool-parser';\nimport { modelSupportsTools } from './models';",
        },
        {
          path: 'src/studio/studio-panel.tsx',
          content: "import { runPlanner, runReviewer, runImplementer } from './studio-engine';\nimport type { Skill, McpServerConfig } from '../lib/types';",
        },
        {
          path: 'src/studio/studio-engine.ts',
          content: "import { convertMcpToolsToOpenAi } from '../lib/mcp-client';\nimport { formatSkillsPrompt } from '../lib/skills-manager';\nimport type { Skill, McpServerConfig } from '../lib/types';",
        },
        {
          path: 'src/lib/mcp-client.ts',
          content: "import type { McpServerConfig, McpTool } from './types';",
        },
        {
          path: 'src/lib/skills-manager.ts',
          content: "import type { Skill } from './types';\nimport { loadSkills } from './storage';",
        },
        {
          path: 'src/lib/models.ts',
          content: "import type { ModelOption } from './types';",
        },
        {
          path: 'src/lib/storage.ts',
          content: "import type { Conversation, Message, AppSettings, Skill } from './types';",
        },
        {
          path: 'src/lib/types.ts',
          content: "export interface Message {}\nexport interface Conversation {}\nexport interface SynapProject {}",
        },
        {
          path: 'src/lib/utils.ts',
          content: "export function cn() {}\nexport function formatFileSize() {}",
        },
      ];
      for (const f of defaultWorkspaceFiles) {
        fileMap.set(f.path, f.content);
      }
    }

    // Mescla alterações pendentes (Source Control) em tempo real sobre o grafo
    for (const change of changes) {
      const cleanPath = change.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
      if (change.type === 'deleted') {
        fileMap.delete(cleanPath);
      } else if (typeof change.newContent === 'string') {
        fileMap.set(cleanPath, change.newContent);
      }
    }

    const files = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
    return buildGraphFromFiles(files);
  }, [activeProject, changes]);

  const handleOpenGraph = useCallback((focusFile?: string) => {
    setGraphFocusNodeId(focusFile);
    setIsGraphModalOpen(true);
  }, []);

  // Pré-aquece o Babel em background assim que o app abre ou um projeto é ativado
  useEffect(() => {
    loadBabel().catch(() => {
      // Silencioso: tentará novamente sob demanda se offline
    });
  }, [activeProject?.id]);

  // Mescla alterações pendentes da IA (Source Control) em tempo real sobre o projeto do Preview
  const previewProject = useMemo(() => {
    if (!activeProject) return null;
    if (changes.length === 0) return activeProject;

    const mergedFiles = { ...activeProject.files };
    let hasDiff = false;
    for (const change of changes) {
      if (activeRepo && change.repo && change.repo !== activeRepo.fullName) continue;
      const cleanPath = change.path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
      if (change.type === 'deleted') {
        if (mergedFiles[cleanPath] || mergedFiles[`/${cleanPath}`]) {
          delete mergedFiles[cleanPath];
          delete mergedFiles[`/${cleanPath}`];
          hasDiff = true;
        }
      } else if (typeof change.newContent === 'string') {
        mergedFiles[cleanPath] = {
          ...(mergedFiles[cleanPath] || {}),
          path: cleanPath,
          content: change.newContent,
        };
        hasDiff = true;
      }
    }
    return hasDiff ? { ...activeProject, files: mergedFiles } : activeProject;
  }, [activeProject, changes, activeRepo]);

  // Auto-associação resiliente do repositório ativo com seu projeto no F5 / recarregamento
  useEffect(() => {
    if (!activeRepo) return;
    // Se já tem activeProject para este repositório, não precisa reabrir
    if (
      activeProject &&
      (activeProject as any).sourceRepoFullName === activeRepo.fullName &&
      (activeProject as any).sourceRepoBranch === activeRepo.branch
    ) {
      return;
    }
    const matchingProject = projectsIndex.find(
      (p: any) =>
        p.sourceRepoFullName === activeRepo.fullName &&
        p.sourceRepoBranch === activeRepo.branch
    );
    if (matchingProject) {
      openProject(matchingProject.id);
    } else if (activeId) {
      syncRepoToProject({
        repoFullName: activeRepo.fullName,
        owner: activeRepo.owner,
        repo: activeRepo.repo,
        branch: activeRepo.branch,
        conversationId: activeId,
      }).catch((err) => {
        console.warn('[Synap] Auto-sync no F5 falhou:', err);
      });
    }
  }, [activeRepo?.fullName, activeRepo?.branch, projectsIndex, activeProject, openProject, syncRepoToProject, activeId]);

  // Prepara o workspace quando um projeto é selecionado ou fechado
  useEffect(() => {
    if (activeProject) {
      setShowProjectWorkspace(true);
    } else {
      setShowProjectWorkspace(false);
      setMainViewTab((curr) => (curr === 'preview' ? 'chat' : curr));
    }
  }, [activeProject?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quando ativa/desativa Studio Mode, sincroniza com a aba Agentes
  useEffect(() => {
    if (isStudioMode) setMainViewTab('agentes');
    else setMainViewTab((curr) => (curr === 'agentes' ? 'chat' : curr));
  }, [isStudioMode]);

  // Skills & MCP state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);

  // Knowledge Base & Persistent Memory state
  const [knowledgeFacts, setKnowledgeFacts] = useState<KnowledgeFact[]>([]);

  // Theme state (dark / light mode)
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const [diffViewingChange, setDiffViewingChange] = useState<PendingChange | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelId>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(MODEL_STORAGE_KEY);
      if (
        saved === 'z-ai/glm-5.3' ||
        saved === 'z-ai/glm-5.3-flash' ||
        saved === 'google/gemma-4-31b-it' ||
        saved === 'deepseek-ai/deepseek-v4.1-flash' ||
        saved === 'nvidia/nemotron-3.5-super-vl-120b-a12b'
      ) {
        return saved;
      }
      if (saved && saved.startsWith('@cf/')) {
        localStorage.setItem(MODEL_STORAGE_KEY, 'z-ai/glm-5.3-flash');
        return 'z-ai/glm-5.3-flash';
      }
    }
    return 'z-ai/glm-5.3'; // Modelo padrão: GLM-5.3 full (mais robusto)
  });

  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(REASONING_STORAGE_KEY);
      if (saved === 'low' || saved === 'high' || saved === 'max') return saved;
    }
    return 'low'; // Always low by default - 'max' is slow and 'high' is unnecessary for most tasks
  });

  // One-time migration: if user has 'max' or 'high' saved, reset to 'low' for faster responses
  // This runs once when the app loads to fix slow responses from previous settings
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(REASONING_STORAGE_KEY);
    const MIGRATION_KEY = 'synap_reasoning_migration_v1';
    const migrated = localStorage.getItem(MIGRATION_KEY);
    if (!migrated && (saved === 'max' || saved === 'high')) {
      localStorage.setItem(REASONING_STORAGE_KEY, 'low');
      localStorage.setItem(MIGRATION_KEY, 'true');
      setReasoningEffort('low');
      console.log('[Synap] Reasoning effort reset to low for faster responses (one-time migration)');
    }
  }, []);

  const [isPlanMode, setIsPlanMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(PLAN_MODE_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [isWebSearchMode, setIsWebSearchMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(WEB_SEARCH_MODE_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([]);
  const [isTerminalRunning, setIsTerminalRunning] = useState<boolean>(false);
  const [terminalCwd, setTerminalCwd] = useState<string>('/');

  // Modo Voz Contínua
  const [continuousVoiceActive, setContinuousVoiceActive] = useState(false);
  const continuousVoiceTranscriptRef = useRef<string>('');
  const continuousVoiceListeningRef = useRef<boolean>(false);
  // Controle ÚNICO do que a IA está falando (áudio neural OU voz do navegador)
  const currentTTSAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentTTSUrlRef = useRef<string | null>(null);
  const liveSpeechTokenRef = useRef(0); // muda a cada fala/interrupção: invalida falas em andamento
  const liveIsSpeakingRef = useRef(false);
  const liveSpokenTextRef = useRef(''); // o que a IA está falando (pro filtro de eco)
  const liveSpeechQueueRef = useRef<StreamingSpeechQueue | null>(null);
  const liveSpeechMsgIdRef = useRef<string>('');

  // Para TODA fala da IA imediatamente (fila de streaming, áudio neural e Web Speech)
  const stopLiveSpeech = useCallback(() => {
    liveSpeechTokenRef.current += 1;
    liveIsSpeakingRef.current = false;
    if (liveSpeechQueueRef.current) {
      liveSpeechQueueRef.current.cancel();
      liveSpeechQueueRef.current = null;
    }
    const audio = currentTTSAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      currentTTSAudioRef.current = null;
    }
    if (currentTTSUrlRef.current) {
      URL.revokeObjectURL(currentTTSUrlRef.current);
      currentTTSUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }, []);

  const handleContinuousVoiceToggle = useCallback(() => {
    setContinuousVoiceActive(prev => {
      const next = !prev;
      if (next) {
        playVoiceModeOnSound();
      } else {
        playVoiceModeOffSound();
        continuousVoiceListeningRef.current = false;
      }
      return next;
    });
  }, []);

  // Ligou: marca a última resposta como "já lida" (não lê o histórico). Desligou: para a fala.
  useEffect(() => {
    if (!continuousVoiceActive) {
      stopLiveSpeech();
      liveSpeechMsgIdRef.current = '';
      return;
    }
    const conv = conversations.find(c => c.id === activeId);
    const last = conv?.messages[conv.messages.length - 1];
    if (last && last.role === 'assistant') liveSpeechMsgIdRef.current = last.id;
  }, [continuousVoiceActive]);

  // Streaming Speech (Modo Live 50/50): fala por sentenças enquanto a IA escreve
  useEffect(() => {
    if (!continuousVoiceActive) {
      stopLiveSpeech();
      liveSpeechMsgIdRef.current = '';
      return;
    }

    const conv = conversations.find(c => c.id === activeId);
    if (!conv || conv.messages.length === 0) return;

    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg.role !== 'assistant' || !lastMsg.content) return;

    // Nova mensagem do assistente detectada: inicializa a fila de fala
    if (lastMsg.id !== liveSpeechMsgIdRef.current) {
      stopLiveSpeech();
      liveSpeechMsgIdRef.current = lastMsg.id;
      playSpeakingStartSound();

      const settings = JSON.parse(localStorage.getItem('synap_settings_v1') || '{}');
      const preferredVoice = settings.speechVoice || 'pt-BR-FranciscaNeural';

      liveSpeechQueueRef.current = new StreamingSpeechQueue({
        voice: preferredVoice,
        rate: 1.05,
        onStartSentence: (sentence) => {
          liveIsSpeakingRef.current = true;
          liveSpokenTextRef.current = liveSpeechQueueRef.current?.getSpokenText() || sentence;
          // Pausa o microfone enquanto fala para evitar que capte o próprio áudio
          continuousVoiceListeningRef.current = false;
        },
        onFinishedAll: () => {
          liveIsSpeakingRef.current = false;
          continuousVoiceListeningRef.current = true;
          // Reabre o microfone imediatamente após a conclusão de todas as sentenças
          window.dispatchEvent(new CustomEvent('synap:resume-listening'));
        },
      });
    }

    // Alimenta o texto atual na fila de streaming
    if (liveSpeechQueueRef.current) {
      if (isStreaming) {
        liveSpeechQueueRef.current.feed(lastMsg.content);
      } else {
        liveSpeechQueueRef.current.finalize(lastMsg.content);
      }
    }
  }, [continuousVoiceActive, isStreaming, conversations, activeId, stopLiveSpeech]);

  // Handler pra quando o usuário fala no modo contínuo (definido depois de handleSendMessage)
  // Veja handleContinuousVoiceTranscript mais abaixo

  // Reset window scroll position when switching modes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [isStudioMode]);

  // Terminal shortcut (Ctrl + ` or Alt + T)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === '`') || (e.altKey && (e.key === 't' || e.key === 'T'))) {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef<boolean>(true);
  const isUserScrollingRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderRef = useRef<number>(0);
  // ====== RESUME-AFTER-SCREEN-OFF ======
  // Quando a tela do celular apaga durante um streaming, o fetch é abortado
  // pelo SO. Em vez de mostrar erro, salvamos o estado e tentamos retomar
  // automaticamente quando a tela acender.
  const userInitiatedAbortRef = useRef<boolean>(false);
  const pendingResumeRef = useRef<{
    conversationId: string;
    assistantMessageId: string;
    accumulatedText: string;
    accumulatedReasoning: string;
    timestamp: number;
  } | null>(null);
  // Snapshot do accumulatedText atualizado durante o streaming — necessário
  // pra podermos salvar no pendingResumeRef quando o fetch é abortado.
  const streamingAccumulatedTextRef = useRef<string>('');
  const streamingAccumulatedReasoningRef = useRef<string>('');
  const currentAssistantMessageIdRef = useRef<string>('');
  const currentConversationIdRef = useRef<string>('');
  const lastBrowserUrlRef = useRef<string>('');
  // Snapshot de info de debug — atualizado durante o loop, lido no catch
  const debugInfoRef = useRef<{
    requestStartTime: number;
    loopCount: number;
    maxIterations: number;
    toolCallsExecuted: number;
  }>({ requestStartTime: 0, loopCount: 0, maxIterations: 45, toolCallsExecuted: 0 });

  // Check backend server status
  useEffect(() => {
    fetch('/api/status', { headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' } })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHasApiKey(Boolean(data.hasApiKey));
        setHasGeminiKey(Boolean(data.hasGeminiKey));
        setHasGitHubToken(Boolean(data.hasGitHubToken));
      })
      .catch((err) => {
        // Falha na checagem não significa chave ausente: o /api/chat reporta o erro real.
        console.warn('Could not verify server status:', err);
        if (import.meta.env.PROD) setHasApiKey(true);
        else {
          setHasApiKey(false);
          setHasGitHubToken(false);
        }
      });
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load Settings and Conversations
  useEffect(() => {
    const loadedSettings = loadSettings();
    setSettings(loadedSettings);

    loadConversations().then((loaded) => {
      // Backfill tokenUsage for any past assistant messages that don't have it
      const enhanced = loaded.map((conv) => ({
        ...conv,
        messages: conv.messages.map((m) => {
          if (m.role === 'assistant' && !m.tokenUsage && m.content) {
            const promptEstimate = 45;
            const completionEstimate = Math.max(1, Math.round(m.content.length / 3.6));
            return {
              ...m,
              tokenUsage: {
                promptTokens: promptEstimate,
                completionTokens: completionEstimate,
                totalTokens: promptEstimate + completionEstimate,
              },
            };
          }
          return m;
        }),
      }));
      setConversations(enhanced);
      if (enhanced.length > 0) {
        const savedActiveId = localStorage.getItem('synap_active_conv_id');
        const initialConv = (savedActiveId && enhanced.find((c) => c.id === savedActiveId)) || enhanced[0];
        setActiveId(initialConv.id);
        localStorage.setItem('synap_active_conv_id', initialConv.id);
        if (initialConv.model) setSelectedModel(initialConv.model as ModelId);
        if (initialConv.reasoningEffort) setReasoningEffort(initialConv.reasoningEffort);
        if (initialConv.isPlanMode !== undefined) setIsPlanMode(initialConv.isPlanMode);
        if (initialConv.isWebSearchMode !== undefined) setIsWebSearchMode(initialConv.isWebSearchMode);
        if (initialConv.activeRepo) setActiveRepo(initialConv.activeRepo);
        else setActiveRepo(null);
      }
    });

    loadSkills().then((loadedSkills) => {
      setSkills(loadedSkills);
    });

    loadMcpServers().then((loadedServers) => {
      setMcpServers(loadedServers);
    });

    loadKnowledgeFacts().then((loadedFacts) => {
      setKnowledgeFacts(loadedFacts);
    });
  }, []);

  // Persist conversations
  useEffect(() => {
    if (conversations.length > 0 && settings.saveHistoryLocally) {
      saveConversations(conversations);
    }
  }, [conversations, settings.saveHistoryLocally]);

  // Persist skills
  useEffect(() => {
    if (skills.length > 0) {
      saveSkills(skills);
    }
  }, [skills]);

  // Persist mcpServers
  useEffect(() => {
    if (mcpServers.length > 0) {
      saveMcpServers(mcpServers);
    }
  }, [mcpServers]);

  // Persist knowledgeFacts
  useEffect(() => {
    saveKnowledgeFacts(knowledgeFacts);
  }, [knowledgeFacts]);

  // Handle user scroll detection on message container
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Se a rolagem foi disparada programaticamente pelo auto-scroll do Synap, não ativa a trava de scroll do usuário
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isAtBottomRef.current = distanceFromBottom <= 100;
      return;
    }

    // Considera que está no fim se estiver a menos de 100px do fundo
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom <= 100;

    isUserScrollingRef.current = true;
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 250);
  }, []);

  // Controlled scroll to bottom without locking user gestures
  const scrollToBottom = useCallback((force = false, smooth = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (force || (isAtBottomRef.current && !isUserScrollingRef.current)) {
      isProgrammaticScrollRef.current = true;
      if (smooth) {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, []);

  // Auto-scroll when messages stream or change (apenas se o usuário já estiver no fundo e não estiver interagindo)
  useEffect(() => {
    if (isAtBottomRef.current && !isUserScrollingRef.current && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      requestAnimationFrame(() => {
        if (isAtBottomRef.current && !isUserScrollingRef.current && el) {
          isProgrammaticScrollRef.current = true;
          el.scrollTop = el.scrollHeight;
        }
      });
    }
  }, [conversations, isStreaming]);

  // Ancoragem automática no fim do chat ao carregar conversa ou alternar abas (ex: vindo de Preview ou Studio)
  useEffect(() => {
    if (mainViewTab === 'chat' && !isStudioMode) {
      isAtBottomRef.current = true;
      isUserScrollingRef.current = false;
      const scrollDown = () => {
        if (messagesContainerRef.current) {
          isProgrammaticScrollRef.current = true;
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      };

      // 1. Imediato
      scrollDown();
      // 2. Próximo frame de layout do navegador
      const rafId = requestAnimationFrame(scrollDown);
      // 3. Após renderização completa de componentes filhos (markdown, blocos de código)
      const t1 = setTimeout(scrollDown, 40);
      const t2 = setTimeout(scrollDown, 120);

      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [mainViewTab, isStudioMode, activeId]);

  // Active conversation helper
  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  // Active conversation token usage helper
  const conversationTokens = React.useMemo(() => {
    if (!activeConversation) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0, activeContextTokens: 0 };
    }
    const totalAccumulated = activeConversation.messages.reduce(
      (acc, m) => {
        if (m.tokenUsage) {
          acc.promptTokens += m.tokenUsage.promptTokens || 0;
          acc.completionTokens += m.tokenUsage.completionTokens || 0;
          acc.totalTokens += m.tokenUsage.totalTokens || 0;
        }
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    );

    // Contexto ativo real da IA no turno mais recente (tamanho real que vai para a GPU)
    let latestActiveTokens = 0;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      const m = activeConversation.messages[i];
      if (m.role === 'assistant' && m.tokenUsage?.promptTokens) {
        latestActiveTokens = m.tokenUsage.promptTokens + (m.tokenUsage.completionTokens || 0);
        break;
      }
    }

    return {
      ...totalAccumulated,
      activeContextTokens: latestActiveTokens || totalAccumulated.totalTokens,
    };
  }, [activeConversation]);

  // Active repo changes count
  const pendingChangesCount = React.useMemo(() => {
    return activeRepo
      ? changes.filter(
          (c) => c.repo === activeRepo.fullName && c.branch === activeRepo.branch
        ).length
      : 0;
  }, [activeRepo, changes]);

  const handleSelectRepo = useCallback((repo: ActiveRepoState) => {
    setActiveRepo(repo);
    if (activeId) {
      setConversations((all) =>
        all.map((c) =>
          c.id === activeId ? { ...c, activeRepo: repo, updatedAt: Date.now() } : c
        )
      );
    }

    // Sincroniza o repo como projeto Sandpack (se for web)
    // Reporta erros no ErrorModal ao invés de falhar silenciosamente
    syncRepoToProject({
      repoFullName: repo.fullName,
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      conversationId: activeId || undefined,
    })
      .then((result) => {
        if (result.ok) {
          console.log(`[Synap] Projeto Sandpack criado/reutilizado para ${repo.fullName}`);
        } else if (result.reason === 'not_web') {
          // Repo não-web (Python, Go, etc.) — comportamento normal, não é erro
          console.log(`[Synap] Repo ${repo.fullName} não é web. Preview não disponível.`);
        } else if (result.reason === 'fetch_error') {
          // Erro real ao buscar arquivos — mostra no ErrorModal
          reportAppError(
            'Falha ao sincronizar repositório',
            `Não foi possível buscar os arquivos do repositório ${repo.fullName} (branch ${repo.branch}). O Preview não pôde ser criado.`,
            {
              endpoint: `/api/github?action=files&owner=${repo.owner}&repo=${repo.repo}&branch=${repo.branch}`,
              stack: `syncRepoToProject(${repo.fullName})`,
            }
          );
        }
      })
      .catch((err) => {
        console.warn('[Synap] Falha ao sincronizar repo como projeto:', err);
        reportAppError(
          'Erro ao vincular repositório',
          `Erro inesperado ao sincronizar o repositório ${repo.fullName} como projeto Sandpack.\n\nDetalhe: ${err?.message || err}`,
          {
            endpoint: repo.fullName,
            stack: err?.stack,
          }
        );
      });
  }, [activeId, syncRepoToProject, reportAppError]);

  const handleCloseRepo = useCallback(() => {
    setActiveRepo(null);
    if (activeId) {
      setConversations((all) =>
        all.map((c) =>
          c.id === activeId ? { ...c, activeRepo: null, updatedAt: Date.now() } : c
        )
      );
    }
  }, [activeId]);

  const handleChangeBranch = useCallback((branch: string) => {
    if (!activeRepo) return;
    const updated = { ...activeRepo, branch };
    setActiveRepo(updated);
    if (activeId) {
      setConversations((all) =>
        all.map((c) =>
          c.id === activeId ? { ...c, activeRepo: updated, updatedAt: Date.now() } : c
        )
      );
    }
    syncRepoToProject({
      repoFullName: updated.fullName,
      owner: updated.owner,
      repo: updated.repo,
      branch: updated.branch,
      conversationId: activeId || undefined,
    }).catch((err) => {
      console.warn('[Synap] Auto-sync falhou ao trocar branch:', err);
    });
  }, [activeRepo, activeId, syncRepoToProject]);

  // Skills & MCP Handlers
  const handleToggleSkill = useCallback((id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const handleAddSkill = useCallback((skillData: Omit<Skill, 'id' | 'isBuiltin'>) => {
    const newSkill: Skill = {
      ...skillData,
      id: generateId(),
      isBuiltin: false,
    };
    setSkills((prev) => [...prev, newSkill]);
  }, []);

  const handleDeleteSkill = useCallback((id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id || s.isBuiltin));
  }, []);

  // Knowledge Base Memory Handlers
  const handleAddKnowledgeFact = useCallback((factText: string, category?: KnowledgeCategory) => {
    try {
      const newFact = createKnowledgeFact(factText, category);
      setKnowledgeFacts((prev) => [...prev, newFact]);
      return newFact;
    } catch (e) {
      console.error(e);
      return null;
    }
  }, []);

  const handleDeleteKnowledgeFact = useCallback((id: string) => {
    setKnowledgeFacts((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleClearKnowledgeFacts = useCallback(() => {
    setKnowledgeFacts([]);
  }, []);

  const handleAddMcpServer = useCallback(async (serverData: { name: string; url: string; transport: 'sse' | 'http'; apiKey?: string }) => {
    const newServer: McpServer = {
      id: generateId(),
      name: serverData.name,
      url: serverData.url,
      transport: serverData.transport,
      apiKey: serverData.apiKey,
      enabled: true,
      status: 'disconnected',
      tools: [],
    };
    setMcpServers((prev) => [...prev, newServer]);
    setTestingServerId(newServer.id);
    const result = await testMcpConnection(newServer);
    setMcpServers((prev) =>
      prev.map((s) =>
        s.id === newServer.id
          ? {
              ...s,
              status: result.success ? 'connected' : 'error',
              tools: result.tools,
              errorMessage: result.error,
            }
          : s
      )
    );
    setTestingServerId(null);
  }, []);

  const handleToggleMcpServer = useCallback((id: string) => {
    setMcpServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  }, []);

  const handleDeleteMcpServer = useCallback((id: string) => {
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleTestMcpServer = useCallback(async (id: string) => {
    const target = mcpServers.find((s) => s.id === id);
    if (!target) return;
    setTestingServerId(id);
    const result = await testMcpConnection(target);
    setMcpServers((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: result.success ? 'connected' : 'error',
              tools: result.tools,
              errorMessage: result.error,
            }
          : s
      )
    );
    setTestingServerId(null);
  }, [mcpServers]);

  const handleOpenTerminal = useCallback(() => {
    setIsTerminalOpen(true);
  }, []);

  const handleToggleTheme = useCallback((e?: React.MouseEvent) => {
    toggleThemeWithTransition(theme, e, (newTheme) => {
      setTheme(newTheme);
    });
  }, [theme]);

  const handleViewDiffForPath = useCallback((path: string) => {
    const found = changes.find(
      (c) => c.path === path && (activeRepo ? c.repo === activeRepo.fullName : true)
    );
    if (found) {
      setDiffViewingChange(found);
    } else {
      setSidebarTab('source-control');
      setIsSidebarOpen(true);
    }
  }, [changes, activeRepo]);

  const handleTogglePlanMode = useCallback(() => {
    setIsPlanMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PLAN_MODE_STORAGE_KEY, String(next));
      } catch {}
      if (next && reasoningEffort === 'low') {
        setReasoningEffort('high');
        localStorage.setItem(REASONING_STORAGE_KEY, 'high');
      }
      if (activeId) {
        setConversations((all) =>
          all.map((c) => (c.id === activeId ? { ...c, isPlanMode: next } : c))
        );
      }
      return next;
    });
  }, [reasoningEffort, activeId]);

  const handleToggleWebSearchMode = useCallback(() => {
    setIsWebSearchMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(WEB_SEARCH_MODE_STORAGE_KEY, String(next));
      } catch {}
      if (activeId) {
        setConversations((all) =>
          all.map((c) => (c.id === activeId ? { ...c, isWebSearchMode: next } : c))
        );
      }
      return next;
    });
  }, [activeId]);

  const handleSelectModel = useCallback((model: ModelId) => {
    setSelectedModel(model);
    localStorage.setItem(MODEL_STORAGE_KEY, model);
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, model, updatedAt: Date.now() } : c))
      );
    }
  }, [activeId]);

  const handleSelectReasoningEffort = useCallback((effort: ReasoningEffort) => {
    setReasoningEffort(effort);
    localStorage.setItem(REASONING_STORAGE_KEY, effort);
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, reasoningEffort: effort, updatedAt: Date.now() } : c
        )
      );
    }
  }, [activeId]);

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    try { localStorage.removeItem('synap_active_conv_id'); } catch {}
    setActiveRepo(null);
    setMainViewTab('chat');
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
    try { localStorage.setItem('synap_active_conv_id', id); } catch {}
    setMainViewTab('chat');
    const target = conversations.find((c) => c.id === id);
    if (target) {
      if (target.model) setSelectedModel(target.model as ModelId);
      if (target.reasoningEffort) setReasoningEffort(target.reasoningEffort);
      if (target.isPlanMode !== undefined) setIsPlanMode(target.isPlanMode);
      if (target.isWebSearchMode !== undefined) setIsWebSearchMode(target.isWebSearchMode);
      setActiveRepo(target.activeRepo || null);

      // Se o chat tem repo vinculado, procura um projeto Sandpack
      // que foi sincronizado desse repo e abre automaticamente.
      // Isso resolve o bug de "preview preto" quando você volta pra
      // um chat que já tinha repo vinculado de uma sessão anterior.
      if (target.activeRepo) {
        const matchingProject = projectsIndex.find(
          (p: any) =>
            p.sourceRepoFullName === target.activeRepo!.fullName &&
            p.sourceRepoBranch === target.activeRepo!.branch
        );
        if (matchingProject) {
          // Projeto existe — abre sem re-buscar arquivos
          openProject(matchingProject.id);
        } else {
          // Projeto não existe — sincroniza do repo (cria novo)
          syncRepoToProject({
            repoFullName: target.activeRepo.fullName,
            owner: target.activeRepo.owner,
            repo: target.activeRepo.repo,
            branch: target.activeRepo.branch,
            conversationId: id,
          }).catch((err) => {
            console.warn('[Synap] Auto-sync falhou ao abrir chat:', err);
          });
        }
      }
    }
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, [conversations, projectsIndex, openProject, syncRepoToProject]);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        if (remaining[0].model) setSelectedModel(remaining[0].model as ModelId);
        if (remaining[0].reasoningEffort) setReasoningEffort(remaining[0].reasoningEffort);
        if (remaining[0].isPlanMode !== undefined) setIsPlanMode(remaining[0].isPlanMode);
        if (remaining[0].isWebSearchMode !== undefined) setIsWebSearchMode(remaining[0].isWebSearchMode);
        setActiveRepo(remaining[0].activeRepo || null);
      } else {
        setActiveId(null);
        setIsPlanMode(false);
        setActiveRepo(null);
      }
    }
  }, [activeId, conversations]);

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  }, []);

  const handleArchiveConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isArchived: true, updatedAt: Date.now() } : c))
    );
    if (activeId === id) {
      const remaining = conversations.filter((c) => c.id !== id && !c.isArchived);
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        if (remaining[0].model) setSelectedModel(remaining[0].model as ModelId);
        if (remaining[0].reasoningEffort) setReasoningEffort(remaining[0].reasoningEffort);
        if (remaining[0].isPlanMode !== undefined) setIsPlanMode(remaining[0].isPlanMode);
        if (remaining[0].isWebSearchMode !== undefined) setIsWebSearchMode(remaining[0].isWebSearchMode);
        setActiveRepo(remaining[0].activeRepo || null);
      } else {
        setActiveId(null);
        setIsPlanMode(false);
        setActiveRepo(null);
      }
    }
  }, [activeId, conversations]);

  const handleUnarchiveConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isArchived: false, updatedAt: Date.now() } : c))
    );
  }, []);

  const handleUpdateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveSettings(updated);
      return updated;
    });
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearAllConversations();
    setConversations([]);
    setActiveId(null);
    setIsPlanMode(false);
  }, []);

  const handleStopGeneration = useCallback(() => {
    // Marca que foi o usuário que parou (não tela apagando) — pra não retomar
    userInitiatedAbortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // ====== HARD-GATE DE ENVIO PARA VPS / SERVIDOR REMOTO ======
  // Atualiza o card de autorização anexado a uma mensagem (procura em todas as conversas).
  const patchRemoteAction = useCallback(
    (messageId: string, patch: Partial<NonNullable<Message['pendingRemoteAction']>>) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId && m.pendingRemoteAction
              ? { ...m, pendingRemoteAction: { ...m.pendingRemoteAction, ...patch } }
              : m
          ),
        }))
      );
    },
    []
  );

  // Anexa o card "pendente" na mensagem da IA que está sendo gerada agora.
  const attachPendingRemoteAction = (pending: NonNullable<Message['pendingRemoteAction']>) => {
    const targetMessageId = currentAssistantMessageIdRef.current;
    if (!targetMessageId) return;
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === targetMessageId ? { ...m, pendingRemoteAction: pending } : m
        ),
      }))
    );
  };

  const handleRejectRemoteAction = useCallback(
    (messageId: string) => {
      patchRemoteAction(messageId, {
        status: 'rejected',
        resultMessage: 'Nada foi enviado.',
      });
    },
    [patchRemoteAction]
  );

  const handleApproveRemoteAction = useCallback(
    async (messageId: string) => {
      const msg = conversations.flatMap((c) => c.messages).find((m) => m.id === messageId);
      const action = msg?.pendingRemoteAction;
      if (!action || action.status !== 'pending') return;

      patchRemoteAction(messageId, { status: 'approved', resultMessage: 'Enviando…' });

      try {
        const res = await fetch('/api/deployments?action=trigger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify({
            userAuthorized: true,
            provider: action.provider,
            targetHost: action.targetHost,
            summary: action.summary,
            payload: action.payload,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          patchRemoteAction(messageId, {
            status: 'failed',
            resultMessage: data.error || `Falha HTTP ${res.status}`,
          });
          return;
        }
        patchRemoteAction(messageId, {
          status: 'executed',
          resultMessage: data.message || 'Envio concluído.',
        });
      } catch (err: any) {
        patchRemoteAction(messageId, {
          status: 'failed',
          resultMessage: err?.message || 'Erro de rede ao enviar.',
        });
      }
    },
    [conversations, patchRemoteAction]
  );

  // Helper to execute client-side GitHub and web tools
  const executeGitHubTool = async (
    name: string,
    args: any,
    currentRepo: ActiveRepoState | null
  ): Promise<{
    result: string;
    editedFile?: MessageEditedFile;
    editedFiles?: MessageEditedFile[];
    batchRefactor?: { summary: string; files: MessageEditedFile[] };
  }> => {
    if (name === 'web_search' || name === 'search_web') {
      try {
        const query = args.query || args.q || '';
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' }
        });
        if (!res.ok) throw new Error(`Falha na busca web (${res.status})`);
        const searchResults = await res.json();
        const parsedSources = parseWebSourcesFromSearchResults(searchResults);
        if (parsedSources.length > 0 && currentAssistantMessageIdRef.current) {
          const targetMsgId = currentAssistantMessageIdRef.current;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== activeId) return c;
              return {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== targetMsgId) return m;
                  const existing = m.webSources || [];
                  const combined = [...existing, ...parsedSources];
                  const unique = combined.filter(
                    (s, idx, arr) => arr.findIndex((x) => x.link === s.link) === idx
                  );
                  return { ...m, webSources: unique };
                }),
              };
            })
          );
        }
        return { result: JSON.stringify(searchResults) };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao pesquisar ${args.query}` }) };
      }
    }

    if (name === 'request_remote_deploy') {
      const pending = buildPendingRemoteAction({
        provider: args.provider || 'vps_webhook',
        targetHost: args.target_host || args.targetHost || args.endpoint || args.repo || '',
        summary: args.summary || '',
        filesOrCommand:
          args.command ||
          (args.file_path ? `put → ${args.file_path}` : '') ||
          (args.workflow_id ? `workflow_dispatch ${args.workflow_id}` : ''),
        payload: {
          endpoint: args.endpoint,
          filePath: args.file_path,
          fileContent: args.file_content,
          command: args.command,
          workflowId: args.workflow_id,
          branch: args.branch,
          owner: args.owner,
          repo: args.repo,
        },
      });
      attachPendingRemoteAction(pending);
      return {
        result: JSON.stringify({
          status: 'awaiting_user_authorization',
          id: pending.id,
          instruction:
            'Envio BLOQUEADO pelo Hard-Gate. Um card de autorização foi exibido ao usuário no chat. ' +
            'NÃO tente reenviar nem usar outro caminho. Informe ao usuário o que será enviado e aguarde ele clicar em "Autorizar e Enviar para VPS".',
        }),
      };
    }

    if (name === 'fetch_url') {
      try {
        const targetUrl = args.url || args.link || '';
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify({
            url: targetUrl,
            method: args.method || 'GET',
            headers: args.headers || {},
            raw: Boolean(args.raw),
            probeMedia: Boolean(args.probe_media || args.probeMedia),
            renderJs: Boolean(args.render_js || args.renderJs),
            waitForSelector: args.wait_for_selector || args.waitForSelector,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            result: JSON.stringify({
              error: data.error || `Erro HTTP ${res.status}`,
              status: data.status || res.status,
              headers: data.headers,
              ttfbMs: data.ttfbMs,
            }),
          };
        }
        return {
          result: JSON.stringify({
            url: data.url,
            finalUrl: data.finalUrl,
            status: data.status,
            ttfbMs: data.ttfbMs,
            headers: data.headers,
            title: data.title,
            content: data.content,
            iframes: data.iframes,
            mediaUrls: data.mediaUrls,
            mediaProbe: data.mediaProbe,
            truncated: data.truncated,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao ler URL ${args.url}` }) };
      }
    }

    if (name === 'control_browser' || name === 'browser_action') {
      try {
        const resolvedUrl = args.url || lastBrowserUrlRef.current || undefined;
        if (args.url) {
          lastBrowserUrlRef.current = args.url;
        }

        const res = await fetch('/api/browser', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify({
            action: args.action,
            url: resolvedUrl,
            selector: args.selector,
            text: args.text,
            key: args.key,
            scrollDirection: args.scroll_direction || args.scrollDirection,
            scrollAmount: args.scroll_amount || args.scrollAmount,
            waitMs: args.wait_ms || args.waitMs,
            apiKey: settings.browserlessApiKey,
            browserEndpoint: settings.browserEndpoint,
          }),
        });

        const browserData = await res.json();
        if (browserData?.currentUrl && browserData.currentUrl !== 'about:blank') {
          lastBrowserUrlRef.current = browserData.currentUrl;
        }

        if (browserData && currentAssistantMessageIdRef.current) {
          const targetMsgId = currentAssistantMessageIdRef.current;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== activeId) return c;
              return {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== targetMsgId) return m;
                  return { ...m, browserResult: browserData };
                }),
              };
            })
          );
        }

        const formatted = formatBrowserToolResultForModel(browserData);
        return { result: formatted };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao executar ação no navegador' }) };
      }
    }

    if (name === 'generate_image') {
      try {
        const prompt = args.prompt || '';
        const aspectRatio = args.aspect_ratio || args.aspectRatio || '1:1';
        const model = args.model || 'flux-1-dev';
        const res = await fetch('/api/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_SECRET || '',
          },
          body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, model }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { result: JSON.stringify({ error: data.error || `Erro HTTP ${res.status} ao gerar imagem` }) };
        }
        // Retorna info da imagem + markdown pra IA embutir na resposta
        return {
          result: JSON.stringify({
            success: true,
            url: data.url,
            is_data_url: true,
            markdown: data.markdown,
            model: data.model,
            size: data.size,
            aspect_ratio: data.aspect_ratio,
            // Importante: instrução pra IA saber que pode embutir a imagem
            hint: 'Imagem gerada com sucesso. Para exibi-la na resposta, escreva o markdown exatamente como está no campo "markdown" acima. NÃO modifique o data URL.',
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao gerar imagem via FLUX.2 Dev' }) };
      }
    }

    if (name === 'run_python') {
      try {
        const code = args.code || args.script || '';
        const execRes = await executePythonCode(code);
        const formatted = formatPythonOutput(execRes);
        return {
          result: JSON.stringify({
            code,
            success: execRes.success,
            stdout: execRes.stdout,
            stderr: execRes.stderr,
            result: execRes.result,
            executionTimeMs: execRes.executionTimeMs,
            error: execRes.error,
            output: formatted,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao executar código Python' }) };
      }
    }

    if (name === 'generate_document') {
      try {
        const docResult = await generateDocumentBlob({
          type: args.type,
          filename: args.filename,
          title: args.title,
          content: args.content,
        });

        return {
          result: JSON.stringify({
            status: 'success',
            type: docResult.type,
            filename: docResult.filename,
            title: docResult.title,
            sizeBytes: docResult.sizeBytes,
            url: docResult.url,
            instruction: `Arquivo ${docResult.filename} gerado com sucesso (${Math.round(docResult.sizeBytes / 1024)} KB). O card de download está disponível na mensagem para o usuário.`,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao compilar documento' }) };
      }
    }

    if (name === 'save_memory') {
      try {
        const factText = args.fact?.trim();
        if (!factText) {
          return { result: JSON.stringify({ error: 'O parâmetro fact é obrigatório.' }) };
        }
        const newFact = createKnowledgeFact(factText, args.category);
        setKnowledgeFacts((prev) => {
          const exists = prev.some((f) => f.fact.toLowerCase() === factText.toLowerCase());
          return exists ? prev : [...prev, newFact];
        });
        return {
          result: JSON.stringify({
            status: 'success',
            id: newFact.id,
            fact: newFact.fact,
            category: newFact.category,
            instruction: `Fato gravado com sucesso na Base de Conhecimento permanente (ID: ${newFact.id}). Ele estará ativo em todas as conversas futuras.`,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao salvar memória' }) };
      }
    }

    if (name === 'forget_memory') {
      try {
        const targetId = args.factId?.trim();
        const query = args.query?.toLowerCase()?.trim();
        let removedCount = 0;
        setKnowledgeFacts((prev) => {
          const filtered = prev.filter((f) => {
            if (targetId && f.id === targetId) {
              removedCount++;
              return false;
            }
            if (query && (f.fact.toLowerCase().includes(query) || f.id.toLowerCase().includes(query))) {
              removedCount++;
              return false;
            }
            return true;
          });
          removedCount = prev.length - filtered.length;
          return filtered;
        });
        return {
          result: JSON.stringify({
            status: 'success',
            instruction: removedCount > 0
              ? `${removedCount} fato(s) removido(s) com sucesso da memória permanente.`
              : 'Nenhum fato correspondente encontrado para remover.',
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Falha ao remover memória' }) };
      }
    }

    if (name === 'run_terminal_command' || name === 'terminal') {
      try {
        const cmd = args.command || args.cmd || '';

        // Hard-Gate: comandos que enviam algo para VPS/servidor remoto nunca rodam sem autorização
        if (isRemoteCommandRequiringApproval(cmd)) {
          const hostMatch = cmd.match(/[\w.-]+@([\w.-]+)/);
          const pending = buildPendingRemoteAction({
            provider: 'vps_webhook',
            targetHost: hostMatch ? hostMatch[1] : 'Servidor Remoto / VPS',
            summary: 'A IA tentou executar um comando de envio remoto pelo terminal.',
            filesOrCommand: cmd,
            payload: { command: cmd },
          });
          attachPendingRemoteAction(pending);
          return {
            result: JSON.stringify({
              command: cmd,
              exitCode: 126,
              success: false,
              status: 'awaiting_user_authorization',
              stderr:
                'Bloqueado pelo Hard-Gate: SSH/SCP (porta 22) não roda aqui e envio remoto exige autorização do usuário. ' +
                'Um card foi exibido no chat. Para executar de verdade, use request_remote_deploy com um endpoint HTTPS (vps_webhook) ou um workflow do GitHub Actions.',
            }),
          };
        }

        const termData = await executeEmulatedCommand(cmd, {
          activeRepo,
          changes,
          cwd: terminalCwd,
          setCwd: setTerminalCwd,
          gitHubUser: null,
          onChangeBranch: (newBranch) => {
            if (activeRepo) {
              setActiveRepo({ ...activeRepo, branch: newBranch });
            }
          },
          onCommitChanges: async (msg) => {
            const repoFullName = activeRepo?.fullName || `${activeRepo?.owner}/${activeRepo?.repo}`;
            const repoChanges = changes.filter((c) => !c.repo || c.repo === repoFullName);
            if (!activeRepo || repoChanges.length === 0) return false;

            const res = await commitStagedChanges(
              null,
              activeRepo.owner,
              activeRepo.repo,
              activeRepo.branch,
              msg,
              repoChanges
            );
            await clearCommitted(repoChanges);
            return true;
          },
          onClearTerminal: () => setTerminalEntries([]),
        });

        const entry: TerminalEntry = {
          id: generateId(),
          command: cmd,
          stdout: termData.stdout || '',
          stderr: termData.stderr || '',
          exitCode: termData.exitCode,
          cwd: termData.cwd || terminalCwd,
          executionTimeMs: termData.executionTimeMs,
          timestamp: Date.now(),
        };
        setTerminalEntries((prev) => [...prev, entry]);

        return {
          result: JSON.stringify({
            command: cmd,
            stdout: termData.stdout,
            stderr: termData.stderr,
            exitCode: termData.exitCode,
            success: termData.success,
          }),
        };
      } catch (err: any) {
        return {
          result: JSON.stringify({ error: err?.message || 'Falha ao executar comando no terminal.' }),
        };
      }
    }

    // Buscar repos no GitHub (NÃO precisa de repo ativo)
    if (name === 'search_github_repos') {
      try {
        const res = await fetch(`/api/github?action=search_repos&q=${encodeURIComponent(args.query)}`, {
          headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' },
        });
        if (!res.ok) throw new Error(`Erro na busca (${res.status})`);
        const repos = await res.json();
        return { result: JSON.stringify(repos) };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao buscar repos: ${args.query}` }) };
      }
    }

    // Ler arquivo de QUALQUER repo (NÃO precisa de repo ativo)
    if (name === 'read_github_file') {
      try {
        const params = new URLSearchParams({
          action: 'read_any_file',
          owner: args.owner,
          repo: args.repo,
          path: args.path,
          branch: args.branch || 'main',
        });
        const res = await fetch(`/api/github?${params.toString()}`, {
          headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' },
        });
        if (!res.ok) throw new Error(`Erro ao ler arquivo (${res.status})`);
        const data = await res.json();
        if (data.content && data.encoding === 'base64') {
          const decoded = atob(data.content.replace(/\n/g, ''));
          return { result: decoded };
        }
        return { result: JSON.stringify(data) };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao ler arquivo: ${args.owner}/${args.repo}/${args.path}` }) };
      }
    }

    // Disparo de Subagentes Autônomos em Paralelo — NÃO depende de repositório ativo
    if (name === 'dispatch_subagent') {
      try {
        const readOnlyRepoTools = currentRepo
          ? GITHUB_TOOLS.filter((t) => ['read_file', 'list_files', 'search_code'].includes(t.function.name))
          : [];
        const activeMcpServers = mcpServers.filter(
          (s) => s.enabled && s.status === 'connected' && s.tools.length > 0
        );
        const mcpOpenAiTools = activeMcpServers.flatMap((s) =>
          convertMcpToolsToOpenAi(s.tools, s.id)
        );
        const activeSkills = skills.filter((s) => s.enabled);
        const subagentSkillsPrompt =
          activeSkills.length > 0
            ? '--- HABILIDADES MODULARES ATIVAS (SKILLS) ---\n' +
              activeSkills.map((s) => `### Habilidade: ${s.name}\n${s.systemPrompt}`).join('\n\n')
            : undefined;

        const subagentTools = [
          WEB_SEARCH_TOOL,
          FETCH_URL_TOOL,
          PYTHON_TOOL,
          SEARCH_GITHUB_REPOS_TOOL,
          READ_GITHUB_FILE_TOOL,
          QUERY_CODE_GRAPH_TOOL,
          QUERY_ARCHITECTURE_GRAPH_TOOL,
          ...readOnlyRepoTools,
          ...mcpOpenAiTools,
        ];

        const subagentRes = await runSubagent({
          role: args.role,
          task: args.task,
          context: args.context,
          skillsPrompt: subagentSkillsPrompt,
          model: selectedModel,
          apiKeySecret: import.meta.env.VITE_API_SECRET || '',
          tools: subagentTools,
          onExecuteTool: async (subToolName, subToolArgs) => {
            const subExec = await executeGitHubTool(subToolName, subToolArgs, currentRepo);
            return subExec.result;
          },
        });

        return {
          result: JSON.stringify({
            status: subagentRes.success ? 'success' : 'error',
            role: subagentRes.role,
            task: subagentRes.task,
            report: subagentRes.report,
            reasoning: subagentRes.reasoning,
            durationMs: subagentRes.durationMs,
            error: subagentRes.error,
          }),
        };
      } catch (err: any) {
        return {
          result: JSON.stringify({
            status: 'error',
            role: args.role || 'Subagente',
            task: args.task || 'Indefinida',
            error: err?.message || 'Falha ao executar subagente.',
          }),
        };
      }
    }

    // Consulta ao Grafo de Arquitetura (Graphify / GraphRAG) — NÃO depende de repositório ativo
    if (name === 'query_code_graph' || name === 'query_architecture_graph') {
      try {
        const queryResult = queryGraphContext(projectGraph, {
          query: args.query,
          focusFile: args.focus_file,
          maxNodes: 10,
        });

        return {
          result: JSON.stringify({
            status: 'success',
            query: args.query || args.focus_file || 'geral',
            nodesFound: queryResult.matchedNodes.length,
            matchedNodes: queryResult.matchedNodes.map((n) => ({
              path: n.path,
              kind: n.kind,
              inDegree: n.inDegree,
              outDegree: n.outDegree,
            })),
            architectureSummary: queryResult.markdownContext,
          }),
        };
      } catch (err: any) {
        return {
          result: JSON.stringify({
            status: 'error',
            error: err?.message || 'Falha ao consultar o grafo de arquitetura.',
          }),
        };
      }
    }

    // Ferramentas remotas Model Context Protocol (MCP) — NÃO dependem de repositório ativo
    if (name.startsWith('mcp__')) {
      const parts = name.split('__');
      const serverId = parts[1];
      const toolName = parts.slice(2).join('__');
      const targetServer = mcpServers.find((s) => s.id === serverId);
      if (!targetServer) {
        return {
          result: JSON.stringify({
            error: `Servidor MCP '${serverId}' não encontrado ou inativo no Synap.`,
          }),
        };
      }
      try {
        const mcpResult = await executeMcpToolCall(targetServer, toolName, args);
        return { result: mcpResult };
      } catch (err: any) {
        return {
          result: JSON.stringify({
            error: `Erro na execução da ferramenta MCP (${toolName}): ${err?.message || 'Falha de comunicação'}`,
          }),
        };
      }
    }

    // ==================== Project Workspace tools (Sandpack / Live Preview) ====================
    if (name === 'create_project') {
      try {
        const projName = (args.name || '').trim();
        if (!projName) {
          return { result: JSON.stringify({ error: 'Parâmetro "name" é obrigatório.' }) };
        }
        const template = (args.template || 'react-ts') as any;
        const validTemplates = ['react-ts', 'react', 'vite-react-ts', 'vanilla-ts', 'vanilla', 'vue', 'static', 'node'];
        if (!validTemplates.includes(template)) {
          return { result: JSON.stringify({ error: `Template inválido: ${template}. Válidos: ${validTemplates.join(', ')}` }) };
        }
        const created = await createProject({
          name: projName,
          description: args.description?.trim() || undefined,
          template,
          files: args.files || undefined,
          conversationId: activeId || undefined,
        });
        await openProject(created.id);
        return {
          result: JSON.stringify({
            ok: true,
            projectId: created.id,
            name: created.name,
            template: created.template,
            fileCount: Object.keys(created.files || {}).length,
            message: `Projeto "${created.name}" criado e aberto no workspace. O usuário já pode ver o preview ao vivo.`,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Erro ao criar projeto.' }) };
      }
    }

    if (name === 'update_project_files') {
      try {
        const updates = Array.isArray(args.updates) ? args.updates : [];
        if (updates.length === 0) {
          return { result: JSON.stringify({ error: 'Nenhuma atualização fornecida.' }) };
        }
        if (args.projectId && args.projectId !== activeProject?.id) {
          await openProject(args.projectId);
        }
        if (!activeProject) {
          return { result: JSON.stringify({ error: 'Nenhum projeto ativo. Crie um projeto primeiro com create_project.' }) };
        }
        for (const u of updates) {
          if (!u.path || !u.action) {
            return { result: JSON.stringify({ error: 'Cada update precisa de "path" e "action".' }) };
          }
          if (u.action !== 'delete' && typeof u.content !== 'string') {
            return { result: JSON.stringify({ error: `Update em "${u.path}" precisa de "content" (string).` }) };
          }
        }
        await updateProjectFiles(updates);
        return {
          result: JSON.stringify({
            ok: true,
            projectId: activeProject.id,
            updatedCount: updates.length,
            message: `${updates.length} arquivo(s) atualizado(s) no projeto "${activeProject.name}". Preview recarregado ao vivo.`,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Erro ao atualizar arquivos.' }) };
      }
    }

    if (name === 'open_project') {
      try {
        const targetId = args.projectId || projectsIndex[0]?.id;
        if (!targetId) {
          return { result: JSON.stringify({ error: 'Nenhum projeto salvo. Use create_project primeiro.' }) };
        }
        const target = projectsIndex.find((p: any) => p.id === targetId);
        if (!target) {
          return { result: JSON.stringify({ error: `Projeto não encontrado: ${targetId}` }) };
        }
        await openProject(targetId);
        return {
          result: JSON.stringify({
            ok: true,
            projectId: target.id,
            name: target.name,
            template: target.template,
            message: `Projeto "${target.name}" aberto no workspace.`,
          }),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || 'Erro ao abrir projeto.' }) };
      }
    }

    // Se não houver repositório GitHub ativo mas houver activeProject aberto no Workspace/Preview:
    if (!currentRepo && activeProject) {
      if (name === 'patch_file') {
        const { path } = args;
        if (!path) {
          return { result: JSON.stringify({ error: 'Parâmetro path é obrigatório para patch_file.' }) };
        }
        const patches = normalizePatchArgs(args);
        const cleanPath = normalizeRepoPath(path);
        const filesMap = activeProject.files || {};
        const matched = filesMap[cleanPath] || filesMap['/' + cleanPath] || filesMap['./' + cleanPath];
        if (!matched) {
          return {
            result: JSON.stringify({
              error: `Arquivo '${path}' não encontrado no projeto ativo. Use read_file/list_files para verificar o caminho ou edit_file para criar um novo arquivo.`,
            }),
          };
        }
        const currentContent = typeof matched === 'string' ? matched : matched.content;
        const patchRes = applyFilePatches(currentContent, patches);
        if (!patchRes.success) {
          return { result: JSON.stringify({ error: patchRes.error }) };
        }
        await updateProjectFiles([
          {
            path,
            action: 'update',
            content: patchRes.content,
          },
        ]);
        const editedFile: MessageEditedFile = { path, type: 'modified' };
        return {
          result: JSON.stringify({
            success: true,
            appliedPatches: patchRes.appliedCount,
            message: `Patch cirúrgico aplicado com sucesso em '${path}' (${patchRes.appliedCount} bloco(s)) no projeto '${activeProject.name}'. Preview recarregado ao vivo.`,
          }),
          editedFile,
        };
      }

      if (name === 'edit_file') {
        const { path, content = '', type = 'modified' } = args;
        if (!path) {
          return { result: JSON.stringify({ error: 'Parâmetro path é obrigatório para edit_file.' }) };
        }
        await updateProjectFiles([{
          path,
          action: type === 'deleted' ? 'delete' : 'update',
          content: content || '',
        }]);
        const editedFile: MessageEditedFile = { path, type: (type as ChangeType) || 'modified' };
        return {
          result: JSON.stringify({
            success: true,
            message: `Arquivo '${path}' atualizado com sucesso no projeto '${activeProject.name}'. O preview foi recarregado ao vivo.`,
          }),
          editedFile,
        };
      }

      if (name === 'read_file') {
        const cleanPath = normalizeRepoPath(args.path || '');
        const filesMap = activeProject.files || {};
        const matched = filesMap[cleanPath] || filesMap['/' + cleanPath] || filesMap['./' + cleanPath];
        if (matched) {
          const content = typeof matched === 'string' ? matched : matched.content;
          return { result: content };
        }
        return { result: JSON.stringify({ error: `Arquivo '${args.path}' não encontrado no projeto ativo.` }) };
      }

      if (name === 'list_files') {
        const filesMap = activeProject.files || {};
        const fileList = Object.keys(filesMap).map((p) => ({
          name: p.split('/').pop() || p,
          path: p,
          type: 'file',
        }));
        return { result: JSON.stringify(fileList) };
      }

      if (name === 'search_code') {
        const query = (args.query || '').toLowerCase();
        const filesMap = activeProject.files || {};
        const results = Object.entries(filesMap)
          .filter(([p, entry]) => {
            const content = typeof entry === 'string' ? entry : entry.content;
            return p.toLowerCase().includes(query) || (typeof content === 'string' && content.toLowerCase().includes(query));
          })
          .map(([p]) => ({ path: p }));
        return { result: JSON.stringify(results) };
      }
    }

    if (!currentRepo) {
      return {
        result: JSON.stringify({
          error: 'Nenhum repositório GitHub ou projeto ativo nesta conversa. Abra um projeto ou selecione um repositório no menu superior.',
        }),
      };
    }

    const syncLiveChangeRef = (saved: PendingChange) => {
      const normTarget = normalizeRepoPath(saved.path);
      const prevList = liveChangesRef.current || [];
      const idx = prevList.findIndex(
        (c) => c.repo === saved.repo && c.branch === saved.branch && normalizeRepoPath(c.path) === normTarget
      );
      if (idx !== -1) {
        const copy = [...prevList];
        copy[idx] = saved;
        liveChangesRef.current = copy;
      } else {
        liveChangesRef.current = [...prevList, saved];
      }
    };

    if (name === 'patch_file') {
      const { path } = args;
      if (!path) {
        return {
          result: JSON.stringify({ error: 'Parâmetro path é obrigatório para patch_file.' }),
        };
      }

      const patches = normalizePatchArgs(args);
      const effective = resolveEffectiveFileContent(path, liveChangesRef.current, currentRepo.fullName);

      if (effective.status === 'deleted') {
        return {
          result: JSON.stringify({
            error: `O arquivo '${path}' está marcado como deletado no Source Control. Use edit_file se desejar recriá-lo.`,
          }),
        };
      }

      let currentContent = effective.content;
      let originalContent = effective.originalContent;

      if (effective.status === 'unchanged' || currentContent === undefined) {
        try {
          currentContent = await fetchFileContent(
            null,
            currentRepo.owner,
            currentRepo.repo,
            path,
            currentRepo.branch
          );
          originalContent = currentContent;
        } catch (err: any) {
          return {
            result: JSON.stringify({
              error: `Não foi possível ler o arquivo '${path}' no repositório (${err?.message || 'não encontrado'}). Verifique o caminho ou use edit_file para criar um arquivo novo.`,
            }),
          };
        }
      }

      const patchRes = applyFilePatches(currentContent, patches);
      if (!patchRes.success) {
        return {
          result: JSON.stringify({ error: patchRes.error }),
        };
      }

      const savedChange = await addChange({
        path,
        repo: currentRepo.fullName,
        branch: currentRepo.branch,
        type: 'modified',
        originalContent,
        newContent: patchRes.content,
      });
      syncLiveChangeRef(savedChange);

      if (activeProject && activeProject.sourceRepoFullName === currentRepo.fullName) {
        await updateProjectFiles([{ path, content: patchRes.content, action: 'update' }]);
      }

      const editedFile: MessageEditedFile = {
        path,
        type: 'modified',
      };

      let graphImpact = '';
      if (projectGraph && projectGraph.nodes && projectGraph.nodes.length > 0) {
        try {
          const gContext = queryGraphContext(projectGraph, { focusFile: path, maxNodes: 6 });
          if (gContext.matchedNodes.length > 0) {
            graphImpact = `\n\n[Conexões de Arquitetura no Grafo]:\n${gContext.markdownContext}`;
          }
        } catch {}
      }

      return {
        result: JSON.stringify({
          success: true,
          appliedPatches: patchRes.appliedCount,
          message: `Patch cirúrgico aplicado com sucesso em '${path}' (${patchRes.appliedCount} bloco(s) substituído(s)) e atualizado no Source Control local.${graphImpact}`,
        }),
        editedFile,
      };
    }

    if (name === 'edit_file') {
      const { path, content = '', type = 'modified' } = args;

      if (!path) {
        return {
          result: JSON.stringify({ error: 'Parâmetro path é obrigatório para edit_file.' }),
        };
      }

      const effective = resolveEffectiveFileContent(path, liveChangesRef.current, currentRepo.fullName);
      let originalContent: string | undefined = effective.originalContent;

      // Try fetching original file content if modifying or deleting and not already cached in pending changes
      if ((type === 'modified' || type === 'deleted') && originalContent === undefined && effective.status === 'unchanged') {
        try {
          originalContent = await fetchFileContent(
            null,
            currentRepo.owner,
            currentRepo.repo,
            path,
            currentRepo.branch
          );
        } catch {
          // New file or unable to read original
        }
      }

      const savedChange = await addChange({
        path,
        repo: currentRepo.fullName,
        branch: currentRepo.branch,
        type: (type as ChangeType) || 'modified',
        originalContent,
        newContent: content || '',
      });
      syncLiveChangeRef(savedChange);

      if (activeProject && activeProject.sourceRepoFullName === currentRepo.fullName) {
        await updateProjectFiles([
          {
            path,
            content: content || '',
            action: type === 'deleted' ? 'delete' : type === 'added' ? 'create' : 'update',
          },
        ]);
      }

      const editedFile: MessageEditedFile = {
        path,
        type: (type as ChangeType) || 'modified',
      };

      let graphImpact = '';
      if (projectGraph && projectGraph.nodes && projectGraph.nodes.length > 0) {
        try {
          const gContext = queryGraphContext(projectGraph, { focusFile: path, maxNodes: 6 });
          if (gContext.matchedNodes.length > 0) {
            graphImpact = `\n\n[Conexões de Arquitetura no Grafo]:\n${gContext.markdownContext}`;
          }
        } catch {}
      }

      return {
        result: JSON.stringify({
          success: true,
          message: `Arquivo '${path}' alterado com sucesso e salvo no Source Control local para revisão do usuário.${graphImpact}`,
        }),
        editedFile,
      };
    }

    if (name === 'batch_edit_files') {
      const summary = args.summary || 'Refatoração multi-arquivo';
      const files = Array.isArray(args.files) ? args.files : [];

      if (files.length === 0) {
        return {
          result: JSON.stringify({ error: 'Nenhum arquivo fornecido para refatoração em lote.' }),
        };
      }

      const processedFiles: MessageEditedFile[] = [];
      const previewUpdates: Array<{ path: string; content: string; action: 'create' | 'update' | 'delete' }> = [];

      for (const item of files) {
        if (!item.path) continue;
        const itemType = (item.type as ChangeType) || 'modified';
        const effective = resolveEffectiveFileContent(item.path, liveChangesRef.current, currentRepo.fullName);
        let originalContent: string | undefined = effective.originalContent;

        if ((itemType === 'modified' || itemType === 'deleted') && originalContent === undefined && effective.status === 'unchanged') {
          try {
            originalContent = await fetchFileContent(
              null,
              currentRepo.owner,
              currentRepo.repo,
              item.path,
              currentRepo.branch
            );
          } catch {
            // New file or unable to read original
          }
        }

        const savedChange = await addChange({
          path: item.path,
          repo: currentRepo.fullName,
          branch: currentRepo.branch,
          type: itemType,
          originalContent,
          newContent: item.content || '',
        });
        syncLiveChangeRef(savedChange);

        previewUpdates.push({
          path: item.path,
          content: item.content || '',
          action: itemType === 'deleted' ? 'delete' : itemType === 'added' ? 'create' : 'update',
        });

        processedFiles.push({
          path: item.path,
          type: itemType,
        });
      }

      if (activeProject && activeProject.sourceRepoFullName === currentRepo.fullName && previewUpdates.length > 0) {
        await updateProjectFiles(previewUpdates);
      }

      let graphBatchImpact = '';
      if (projectGraph && projectGraph.nodes && projectGraph.nodes.length > 0 && processedFiles.length > 0) {
        try {
          const gContext = queryGraphContext(projectGraph, { focusFile: processedFiles[0].path, maxNodes: 6 });
          if (gContext.matchedNodes.length > 0) {
            graphBatchImpact = `\n\n[Conexões de Arquitetura no Grafo]:\n${gContext.markdownContext}`;
          }
        } catch {}
      }

      return {
        result: JSON.stringify({
          success: true,
          summary,
          filesCount: processedFiles.length,
          files: processedFiles.map((f) => f.path),
          message: `Refatoração multi-arquivo concluída com sucesso (${processedFiles.length} arquivos preparados para revisão no Source Control).${graphBatchImpact}`,
        }),
        editedFiles: processedFiles,
        batchRefactor: {
          summary,
          files: processedFiles,
        },
      };
    }

    if (name === 'read_file') {
      try {
        const effective = resolveEffectiveFileContent(args.path, liveChangesRef.current, currentRepo.fullName);
        if (effective.status === 'deleted') {
          return {
            result: JSON.stringify({
              error: `O arquivo '${args.path}' foi marcado como deletado nas alterações pendentes do Source Control.`,
            }),
          };
        }
        if (effective.status === 'modified' && effective.content !== undefined) {
          return { result: effective.content };
        }

        const fileContent = await fetchFileContent(
          null,
          currentRepo.owner,
          currentRepo.repo,
          args.path,
          args.branch || currentRepo.branch
        );
        return { result: fileContent };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao ler arquivo ${args.path}` }) };
      }
    }

    if (name === 'list_files') {
      try {
        const contents = await fetchRepoContents(
          null,
          currentRepo.owner,
          currentRepo.repo,
          args.path || '',
          args.branch || currentRepo.branch
        );
        return { result: JSON.stringify(contents.map((c) => ({ name: c.name, path: c.path, type: c.type }))) };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro ao listar diretório ${args.path}` }) };
      }
    }

    if (name === 'search_code') {
      try {
        const queryLower = (args.query || '').toLowerCase();
        const localMatches = (liveChangesRef.current || [])
          .filter((c) => (!c.repo || c.repo === currentRepo.fullName) && c.type !== 'deleted')
          .filter(
            (c) =>
              c.path.toLowerCase().includes(queryLower) ||
              (typeof c.newContent === 'string' && c.newContent.toLowerCase().includes(queryLower))
          )
          .map((c) => ({
            path: c.path,
            source: 'pending_change',
          }));

        const remoteItems = await searchCode(
          null,
          args.query,
          currentRepo.owner,
          currentRepo.repo,
          args.path,
          args.extension
        ).catch(() => []);

        const seenPaths = new Set(localMatches.map((m) => normalizeRepoPath(m.path)));
        const merged = [
          ...localMatches,
          ...(Array.isArray(remoteItems)
            ? remoteItems.filter((item: any) => !seenPaths.has(normalizeRepoPath(item.path || '')))
            : []),
        ];

        return {
          result: JSON.stringify(merged),
        };
      } catch (err: any) {
        return { result: JSON.stringify({ error: err?.message || `Erro na busca de código: ${args.query}` }) };
      }
    }

    return { result: JSON.stringify({ error: `Ferramenta desconhecida: ${name}` }) };
  };

  const handleExecuteTerminalCommand = useCallback(async (command: string) => {
    setIsTerminalRunning(true);
    try {
      const termData = await executeEmulatedCommand(command, {
        activeRepo,
        changes,
        cwd: terminalCwd,
        setCwd: setTerminalCwd,
        gitHubUser: null,
        onChangeBranch: (newBranch) => {
          if (activeRepo) {
            setActiveRepo({ ...activeRepo, branch: newBranch });
          }
        },
        onCommitChanges: async (msg) => {
          const repoFullName = activeRepo?.fullName || `${activeRepo?.owner}/${activeRepo?.repo}`;
          const repoChanges = changes.filter((c) => !c.repo || c.repo === repoFullName);
          if (!activeRepo || repoChanges.length === 0) return false;

          const res = await commitStagedChanges(
            null,
            activeRepo.owner,
            activeRepo.repo,
            activeRepo.branch,
            msg,
            repoChanges
          );
          await clearCommitted(repoChanges);
          return true;
        },
        onClearTerminal: () => setTerminalEntries([]),
      });

      const newEntry: TerminalEntry = {
        id: generateId(),
        command,
        stdout: termData.stdout || '',
        stderr: termData.stderr || '',
        exitCode: termData.exitCode,
        cwd: termData.cwd || terminalCwd,
        executionTimeMs: termData.executionTimeMs,
        timestamp: Date.now(),
      };
      setTerminalEntries((prev) => [...prev, newEntry]);
    } catch (err: any) {
      setTerminalEntries((prev) => [
        ...prev,
        {
          id: generateId(),
          command,
          stdout: '',
          stderr: err?.message || 'Erro ao executar comando no emulador.',
          exitCode: 1,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsTerminalRunning(false);
    }
  }, [activeRepo, changes, terminalCwd, clearCommitted]);

  const handleClearTerminal = useCallback(() => {
    setTerminalEntries([]);
  }, []);

  // Send Message with Tools support
  const handleSendMessage = useCallback(async (
    text: string,
    images: string[] = [],
    documents: AttachedDocument[] = [],
    overridePlanMode?: boolean
  ) => {
    if (!text && images.length === 0 && documents.length === 0 && selectedPreviewElements.length === 0) return;
    setErrorMessage(null);

    const lastAssistantMsg = activeConversation?.messages
      ? [...activeConversation.messages].reverse().find((m) => m.role === 'assistant')
      : undefined;
    const isDirectApprovalOfPreviousPlan =
      overridePlanMode === undefined &&
      isPlanMode &&
      Boolean(lastAssistantMsg?.isPlanMode) &&
      isPlanApprovalReply(text, true);

    const activePlan =
      overridePlanMode !== undefined
        ? overridePlanMode
        : isDirectApprovalOfPreviousPlan
        ? false
        : isPlanMode;

    let effectiveModel = selectedModel;
    if (images.length > 0 && !isVisionModel(selectedModel)) {
      // Auto-switch pra GLM-5.3 Flash quando usuário anexa imagem em modelo sem visão
      effectiveModel = 'z-ai/glm-5.3-flash';
      setSelectedModel('z-ai/glm-5.3-flash');
      localStorage.setItem(MODEL_STORAGE_KEY, 'z-ai/glm-5.3-flash');
    }

    let finalText = text;
    if (selectedPreviewElements.length > 0) {
      const activeFiles = previewProject?.files || activeProject?.files || null;
      const elementsPrompt = formatElementInspectorPrompt(selectedPreviewElements, activeFiles);
      const userInstruction = text.trim() || 'Modifique os componentes selecionados no preview conforme boas práticas.';
      finalText = `${userInstruction}\n\n${elementsPrompt}`;

      setSelectedPreviewElements([]);
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: finalText,
      images: images.length > 0 ? images : undefined,
      documents: documents.length > 0 ? documents : undefined,
      isPlanMode: activePlan,
      createdAt: Date.now(),
    };

    let currentConvId = activeId;
    let currentConv = activeConversation;

    if (!currentConvId || !currentConv) {
      const newId = generateId();
      const firstDocName = documents[0]?.name;
      const titleFallback = firstDocName
        ? `Arquivo: ${firstDocName}`
        : images.length > 0
        ? 'Imagem'
        : 'Nova conversa';
      const newTitle = generateTitleFromMessage(text || titleFallback);
      const newConv: Conversation = {
        id: newId,
        title: newTitle,
        messages: [userMessage],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: effectiveModel,
        reasoningEffort: reasoningEffort,
        isPlanMode: activePlan,
        activeRepo: activeRepo || null,
      };

      currentConvId = newId;
      currentConv = newConv;
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(newId);
    } else {
      const updatedMessages = [...currentConv.messages, userMessage];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId
            ? { ...c, messages: updatedMessages, isPlanMode: activePlan, updatedAt: Date.now() }
            : c
        )
      );
    }

    let preloadedWebSources: WebSourceItem[] = [];
    if (isWebSearchMode && text.trim()) {
      try {
        preloadedWebSources = await fetchLiveWebSources(text.trim(), { timeoutMs: 4000 });
      } catch (err) {
        console.warn('[Synap] Falha na pré-busca web ao vivo:', err);
      }
    }

    const assistantMessageId = generateId();
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      reasoning: '',
      reasoningEffort: reasoningEffort,
      isPlanMode: activePlan,
      isWebSearchMode: isWebSearchMode,
      webSources: preloadedWebSources.length > 0 ? preloadedWebSources : undefined,
      createdAt: Date.now(),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === currentConvId
          ? { ...c, messages: [...c.messages, assistantPlaceholder] }
          : c
      )
    );

    setIsStreaming(true);
    // Nova mensagem (voz ou digitada): a IA para de falar a resposta anterior
    stopLiveSpeech();
    // Se modo contínuo ativo, toca som de "entendi, pensando..."
    if (continuousVoiceActive) {
      playThinkingSound();
    }
    setTimeout(() => scrollToBottom(true, false), 50);

    // Injetar contexto de repositório apenas se vinculado a esta conversa
    const chatActiveRepo = activeRepo || (currentConv?.activeRepo ? currentConv.activeRepo : null);

    const isNoToolsModel = !isToolCapableModel(effectiveModel);

    // GraphRAG Passivo: injeta automaticamente o mapa cirúrgico de dependências (quem importa quem / hubs centrais)
    // baseado na pergunta do usuário, economizando tokens e evitando list_files/read_file cegos.
    const graphRagSummary =
      projectGraph.nodes.length > 0
        ? queryGraphContext(projectGraph, {
            query: userMessage.content.slice(0, 120),
            maxNodes: 8,
          }).markdownContext
        : '';

    const repoPrompt = isNoToolsModel
      ? undefined
      : chatActiveRepo
      ? `Você está conectado ao repositório GitHub ativo EXCLUSIVO DESTA CONVERSA: "${chatActiveRepo.fullName}" na branch "${chatActiveRepo.branch}".\n` +
        (activePlan
          ? `🛑 MODO PLANO OBRIGATÓRIO ATIVO (HARD-GATE DE ESCRITA): Você tem acesso às ferramentas de LEITURA E DIAGNÓSTICO (query_code_graph, query_architecture_graph, read_file, list_files, search_code) para o repositório "${chatActiveRepo.fullName}", mas as ferramentas de escrita (patch_file, edit_file, batch_edit_files) estão BLOQUEADAS até que o usuário aprove o seu plano.\n` +
            `Investigue o grafo e os arquivos reais primeiro e apresente o Plano de Implementação detalhado em Markdown aguardando o clique em "Aprovar e Executar Plano".\n\n` +
            graphRagSummary
          : `Você tem acesso às ferramentas de código: read_file, list_files, search_code, query_code_graph, query_architecture_graph, patch_file, edit_file e batch_edit_files APENAS para o repositório "${chatActiveRepo.fullName}".\n` +
            `Você NÃO tem permissão nem acesso a nenhum outro repositório do usuário. Cada conversa possui isolamento estrito de repositório.\n` +
            `REGRA OBRIGATÓRIA DE GRAFO (GRAPH-FIRST ARCHITECTURE - USO COMPULSÓRIO):\n` +
            `Antes de propor qualquer alteração de código (patch_file, edit_file ou batch_edit_files) ou leitura profunda de múltiplos arquivos, você DEVE OBRIGATORIAMENTE consultar o grafo de arquitetura do projeto via ferramenta query_code_graph (ou query_architecture_graph) passando o caminho do arquivo no parâmetro focus_file ou termo no query. Analise quem importa o arquivo, quem depende dele e quais são os impactos antes de alterar.\n` +
            `IMPORTANTE SOBRE O GRAPHIFY: No ambiente web do Éden, o grafo de conhecimento JÁ ESTÁ EXTRAÍDO E CARREGADO EM MEMÓRIA automaticamente. NUNCA tente rodar comandos de terminal como "graphify extract" ou "graphify update", e NUNCA escreva para o usuário que vai extrair o grafo em segundo plano — basta chamar diretamente a ferramenta query_code_graph.\n` +
            `REGRA SUPREMA DE EXECUÇÃO (ZERO PREÂMBULO): NUNCA anuncie ou prometa em texto puro que vai listar, buscar, ler, conferir ou alterar arquivos (ex: "Vou listar os arquivos...", "Preciso conferir o config:", "Agora deixa eu resolver...", "Vou aplicar tudo de uma vez:"). Se precisa consultar ou conferir um arquivo, chame list_files, read_file, search_code ou query_code_graph DIRETAMENTE via tool_call na mesma resposta! Se precisa criar, alterar ou remover código, chame patch_file ou edit_file DIRETAMENTE via tool_call na mesma resposta!\n` +
            `ECONOMIA DE TOKENS (GRAPHRAG & PATCH CIRÚRGICO): Use o mapa de dependências abaixo (e a ferramenta \`query_code_graph\`) para saber exatamente qual arquivo importa ou é usado por qual ANTES de chamar \`read_file\`. NUNCA saia lendo todos os arquivos do repositório às cegas.\n` +
            `EDIÇÃO CIRÚRGICA RÁPIDA (PREFIRA patch_file): Ao editar arquivos existentes, prefira SEMPRE \`patch_file\` (passando \`path\`, \`old_str\` e \`new_str\`, ou \`patches\`) para substituir apenas os trechos alterados com velocidade máxima e sem gastar tokens reescrevendo o arquivo inteiro. Use \`edit_file\` apenas para criar arquivos novos, deletar arquivos ou quando precisar reescrever o arquivo inteiro. ` +
            `Envie SEMPRE o código-fonte legível em texto claro (TypeScript, JSX, CSS, etc.). É ESTRITAMENTE PROIBIDO codificar arquivos em Base64, usar scripts Python para decodificação ou usar comandos Bash para criar arquivos. ` +
            `A alteração ficará salva localmente no Source Control (e já visível imediatamente para suas próximas chamadas de read_file/patch_file) para o usuário revisar o diff e commitar.\n\n` +
            graphRagSummary)
      : activeProject
      ? `Você está conectado ao PROJETO LOCAL ATIVO NO PREVIEW: "${activeProject.name}" (Template: ${activeProject.template}).\n` +
        `Arquivos atuais do projeto no workspace:\n` +
        `${Object.keys(activeProject.files || {}).map((f) => `- ${f}`).join('\n')}\n\n` +
        (activePlan
          ? `🛑 MODO PLANO OBRIGATÓRIO ATIVO (HARD-GATE DE ESCRITA): Use read_file, list_files e search_code para inspecionar os arquivos atuais do projeto e apresente o Plano de Implementação estruturado em Markdown. As ferramentas de alteração estão bloqueadas até o usuário clicar em "Aprovar e Executar Plano".`
          : `Você tem acesso total às ferramentas de código locais: patch_file, edit_file, read_file, list_files, search_code, update_project_files e create_project.\n` +
            `REGRA SUPREMA DE EXECUÇÃO (ZERO PREÂMBULO - FERRAMENTAS REAIS):\n` +
            `NUNCA prometa ou responda que vai alterar código em texto puro. Emita OBRIGATORIAMENTE a chamada da ferramenta \`patch_file\`, \`edit_file\` ou \`update_project_files\` na primeira resposta para atualizar o projeto do preview em tempo real!\n` +
            `Para edições pontuais em arquivos existentes, prefira \`patch_file\` (enviando \`path\`, \`old_str\` e \`new_str\`). Para criar arquivos novos ou reescrever por completo, use \`edit_file\`. A alteração recarregará o Live Preview instantaneamente.`)
      : 'ATENÇÃO: Nenhum repositório GitHub ou projeto local está selecionado nesta conversa. As ferramentas de código (read_file, patch_file, edit_file, list_files, search_code) NÃO estão disponíveis.\n' +
        'Portanto, NUNCA prometa ou diga que vai criar, editar ou salvar arquivos no repositório. Em vez disso, forneça o código completo formatado em Markdown diretamente na sua resposta para o usuário copiar manualmente, e informe que ele pode vincular um repositório no menu superior ou abrir um projeto no Preview.';

    // Obter ferramentas ativas de servidores MCP conectados
    const activeMcpServers = mcpServers.filter((s) => s.enabled && s.status === 'connected' && s.tools.length > 0);
    const mcpOpenAiTools = activeMcpServers.flatMap((s) => convertMcpToolsToOpenAi(s.tools, s.id));
    const baseTools = (chatActiveRepo || activeProject) ? ALL_CHAT_TOOLS : DEFAULT_CHAT_TOOLS;
    const planFilteredTools = filterToolsForPlanMode(baseTools, activePlan);
    const filteredBaseTools = selectContextualTools(planFilteredTools, {
      userText: finalText,
      hasActiveRepo: Boolean(chatActiveRepo),
      hasActiveProject: Boolean(activeProject),
    });
    const requestTools = isNoToolsModel ? [] : [...filteredBaseTools, ...mcpOpenAiTools];

    const basePrompt = isNoToolsModel
      ? 'Você é o assistente Éden operando com o modelo DeepSeek R1.\n' +
        buildTextToolProtocolPrompt(
          Boolean(chatActiveRepo || activeProject),
          chatActiveRepo?.fullName || activeProject?.name,
          chatActiveRepo?.branch,
          mcpOpenAiTools
        ) +
        (chatActiveRepo && graphRagSummary ? `\n\n${graphRagSummary}` : '')
      : 'Você é o assistente Éden com ferramentas avançadas integradas.\n' +
        'REGRA SUPREMA DE CAPACIDADES DO ÉDEN (PROIBIDO RECUSAR OU DIZER QUE NÃO TEM FERRAMENTAS):\n' +
        'Você É o assistente oficial do Éden e TEM TODAS as ferramentas reais integradas no chat: `control_browser` (Playwright / Browser-Use), `run_terminal_command` (com curl, ffprobe, ffmpeg e playwright), `run_python` (Python 3 com internet e bs4), `fetch_url`, `web_search`, `generate_document` e `save_memory`.\n' +
        'É TERMINANTEMENTE PROIBIDO responder dizendo que "minhas ferramentas são fixas", "não tenho acesso ao Éden", "não posso rodar curl/ffmpeg/playwright" ou mandar o usuário rodar externamente. Se o usuário pedir para inspecionar com curl, testar mídia com ffprobe/ffmpeg, navegar na web ou rodar script, EMITA A CHAMADA DE FERRAMENTA IMEDIATAMENTE NA SUA RESPOSTA!\n' +
        'REGRA DE EXECUÇÃO IMEDIATA (ZERO PREÂMBULO - FERRAMENTAS REAIS):\n' +
        'Se você precisar inspecionar, listar arquivos, ler código, alterar código, rodar comando no terminal, pesquisar na web ou rodar script, EMITA A TOOL_CALL IMEDIATAMENTE NA PRIMEIRA RESPOSTA.\n' +
        'É ESTRITAMENTE PROIBIDO responder apenas prometendo ou anunciando que vai agir (ex: "Vou criar o arquivo...", "Vou listar os arquivos...", "Vou localizar...", "Primeiro vou...", "Deixe-me verificar...", "Preciso conferir o config:"). Emita a chamada de ferramenta na mesma resposta!\n' +
        'Regras estritas para ferramentas:\n' +
        '1. Terminal do Éden (run_terminal_command): Você tem acesso à ferramenta `run_terminal_command` com utilitários reais integrados: `curl` (inspeção de cabeçalhos e requests HTTP), `ffprobe` e `ffmpeg` (inspeção de streams, codecs, duração e decodificação real na GPU/WASM), `playwright <url>` (renderização headless de URLs), além de `git` e comandos Unix (`ls`, `cat`, `grep`, `pwd`, `echo`). Use `run_terminal_command` sempre que o usuário pedir para inspecionar requisições, rodar curl, decodificar vídeo/áudio ou executar operações.\n' +
        '2. Navegação e Busca Web: Use `web_search` para encontrar fontes e links na internet. Use `fetch_url` para acessar e ler o conteúdo completo de artigos, tutoriais e documentações (suporta `render_js: true` para SPAs).\n' +
        '3. Execução de Python Real (run_python): Você tem a ferramenta `run_python` para executar código Python 3 real no navegador via WebAssembly (Pyodide). Ela possui ACESSO REAL À INTERNET via `urllib.request.urlopen` (com suporte a headers customizados) e instala pacotes automaticamente sob demanda (`bs4`/`BeautifulSoup`, `lxml`, `numpy`, `pandas`). Use para web scraping avançado, regex em HTML, cálculos matemáticos exatos e análise de dados.\n' +
        '4. Geração de Arquivos e Documentos: Você tem a ferramenta `generate_document` para compilar e disponibilizar arquivos reais para download nos formatos PDF, Excel (.xlsx), Word (.docx) ou PowerPoint (.pptx). Use-a sempre que o usuário pedir planilhas, relatórios em PDF, contratos em Word ou apresentações em slides.\n' +
        '5. Base de Conhecimento e Memória Persistente: Você tem as ferramentas `save_memory` e `forget_memory`. Sempre que o usuário mencionar preferências permanentes (ex: estilo de comunicação, diretrizes de código), stack do projeto (ex: Tailwind v4, Vercel Hobby, Node 24) ou regras permanentes, SALVE imediatamente com `save_memory`. Esses fatos são mantidos entre conversas no navegador do usuário.\n' +
        '6. Subagentes Autônomos: Você tem a ferramenta `dispatch_subagent(role, task, context)`. Sempre que uma tarefa for complexa, multifacetada ou exigir pesquisas e análises paralelas (ex: pesquisar docs técnicas no Context7, auditar código, inspecionar regras), DISPARE subagentes especializados em segundo plano. Consolide os relatórios retornados para entregar uma resposta final completa ao usuário.\n' +
        '7. Controle Autônomo de Navegador (Playwright / Browser-Use): Você tem a ferramenta `control_browser` para navegar e interagir autonomamente com páginas da web em um navegador real. Você pode abrir URLs (navigate), clicar em botões e links (click), preencher campos e pesquisar (type), rolar a tela (scroll) e capturar screenshots. Ao receber os elementos interativos numerados da página (ex: [1] <button>, [2] <input>), use os seletores fornecidos para prosseguir autonomamente passo a passo até atingir o objetivo solicitado pelo usuário.';

    const planPrompt = activePlan
      ? buildMandatoryPlanPrompt(Boolean(chatActiveRepo || activeProject))
      : undefined;

    // Injetar habilidades modulares ativas (Skills) filtradas por contexto para acelerar o Prefill
    const activeSkills = selectContextualSkills(skills, {
      userText: finalText,
      hasActiveRepo: Boolean(chatActiveRepo),
    });
    const skillsPrompt = activeSkills.length > 0
      ? '--- HABILIDADES MODULARES COMPULSÓRIAS (SKILLS ATIVAS) ---\n' +
        'REGRA OBRIGATÓRIA DE HABILIDADES: Você DEVE aplicar com rigor as habilidades ativas abaixo ao diagnosticar, planejar, revisar ou modificar código.\n' +
        'SEMPRE que você aplicar as diretrizes de uma habilidade em uma resposta ou alteração de arquivo, declare OBRIGATORIAMENTE na resposta qual habilidade foi aplicada utilizando o formato exato: [Habilidade: <Nome da Habilidade>].\n' +
        'Exemplo: "[Habilidade: Systematic Debugging]", "[Habilidade: Code Review & Segurança]", "[Habilidade: Conventional Commits]", "[Habilidade: Mobile-First Design & UX]".\n\n' +
        activeSkills
          .map((s) => `### Habilidade: ${s.name}\n${s.systemPrompt}`)
          .join('\n\n')
      : undefined;

    // Injetar Base de Conhecimento persistente (Memória de longo prazo)
    const memoriesPrompt = formatKnowledgePrompt(knowledgeFacts);

    const convForPayload: Conversation = currentConv
      ? { ...currentConv, messages: [...currentConv.messages, userMessage] }
      : {
          id: currentConvId,
          title: generateTitleFromMessage(userMessage.content),
          messages: [userMessage],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: effectiveModel,
          reasoningEffort,
          isPlanMode: activePlan,
          isWebSearchMode: isWebSearchMode,
          activeRepo: chatActiveRepo,
        };

    const liveWebPrompt = isWebSearchMode
      ? buildLiveWebPrompt(text.trim() || userMessage.content, preloadedWebSources)
      : undefined;

    const contextMessages = prepareMessagesForApi(convForPayload, {
      base: basePrompt,
      repo: repoPrompt,
      plan: planPrompt,
      skills: skillsPrompt,
      memories: memoriesPrompt,
      liveWeb: liveWebPrompt,
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;
    // Reset: novo envio, abort ainda não foi iniciado pelo usuário
    userInitiatedAbortRef.current = false;
    pendingResumeRef.current = null;

    try {
      const requestStartTime = Date.now(); // pra calcular "tempo até erro" no catch
      debugInfoRef.current = {
        requestStartTime,
        loopCount: 0,
        maxIterations: 45,
        toolCallsExecuted: 0,
      };
      let currentMessagesForApi = [...contextMessages];

      let hasToolCallsToProcess = true;
      const MAX_TOOL_ITERATIONS = 45;
      const MAX_CONSECUTIVE_AUTO_CONTINUES = 2;
      let consecutiveAutoContinues = 0;
      let loopCount = 0;
      const allEditedFiles: MessageEditedFile[] = [];
      const allToolCalls: MessageToolCall[] = [];
      let currentBatchRefactor: { summary: string; files: MessageEditedFile[] } | undefined = undefined;
      let accumulatedAssistantText = '';
      let accumulatedReasoningText = '';

      // ====== TRUNCAÇÃO INICIAL — ANTES da primeira request ======
      // Quando o usuário manda "continue" ou nova mensagem em chat longo,
      // o contextMessages vem com TODO o histórico acumulado (incluindo
      // tool calls de loops agentic anteriores). Se passar de 50K tokens
      // estimados, trunca AGRESSIVAMENTE pra evitar stream cancelled.
      const estimateTokensForTruncation = (msgs: any[]): number => {
        let total = 0;
        for (const m of msgs) {
          if (typeof m.content === 'string') total += m.content.length;
          else if (Array.isArray(m.content)) {
            for (const c of m.content) {
              if (typeof c?.text === 'string') total += c.text.length;
            }
          }
          if (m.tool_calls) {
            for (const tc of m.tool_calls) {
              if (tc?.function?.arguments) total += tc.function.arguments.length;
            }
          }
        }
        return Math.ceil(total / 4);
      };

      const INITIAL_TRUNCATE_THRESHOLD = 50000; // 50K tokens = ~40% do limite
      const INITIAL_KEEP_RECENT = 8; // mantém últimas 8 mensagens não-system

      const initialTokensEstimate = estimateTokensForTruncation(currentMessagesForApi);
      if (initialTokensEstimate > INITIAL_TRUNCATE_THRESHOLD) {
        const systemMsgs = currentMessagesForApi.filter(m => m.role === 'system');
        const nonSystemMsgs = currentMessagesForApi.filter(m => m.role !== 'system');
        const keptRecent = nonSystemMsgs.slice(-INITIAL_KEEP_RECENT);
        const omittedCount = nonSystemMsgs.length - keptRecent.length;
        const truncationMarker = {
          role: 'system' as const,
          content: `[CONTEXTO TRUNCADO — ${omittedCount} mensagens anteriores foram omitidas para evitar estouro de contexto. Continue de onde parou com base nas mensagens recentes abaixo.]`,
        };
        currentMessagesForApi = [...systemMsgs, truncationMarker, ...keptRecent];
        console.log(`[Synap] Truncagem inicial: ${initialTokensEstimate}K → ${estimateTokensForTruncation(currentMessagesForApi)}K tokens (${omittedCount} msgs omitidas)`);
      }
      // Inicializa refs de snapshot (usadas no catch pra salvar estado p/ retomar)
      streamingAccumulatedTextRef.current = '';
      streamingAccumulatedReasoningRef.current = '';
      currentAssistantMessageIdRef.current = assistantMessageId;
      currentConversationIdRef.current = currentConvId;
      // Variáveis de iteração (resetadas a cada loop)
      let iterationText = '';
      let iterationReasoning = '';
      let iterationFinishReason = '';
      let streamErrorMsg = '';

      while (hasToolCallsToProcess && loopCount < MAX_TOOL_ITERATIONS) {
        loopCount++;
        debugInfoRef.current.loopCount = loopCount;
        hasToolCallsToProcess = false;
        // Reset das variáveis de iteração (não acumular entre loops)
        iterationText = '';
        iterationReasoning = '';
        iterationFinishReason = '';
        streamErrorMsg = '';

        // ===== FETCH COM RETRY AUTOMÁTICO (resiliência de rede) =====
        // Se a rede cair (troca de aba, oscilação de DNS, etc), tenta de novo
        // em vez de desistir. Preserva o contexto da conversa.
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [1000, 3000, 8000]; // 1s, 3s, 8s
        let response: Response | null = null;
        let lastFetchError: any = null;

        for (let retryAttempt = 0; retryAttempt <= MAX_RETRIES; retryAttempt++) {
          try {
            response = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': import.meta.env.VITE_API_SECRET || ''
              },
              body: JSON.stringify({
                messages: currentMessagesForApi,
                model: effectiveModel,
                reasoning_effort: reasoningEffort,
                tools: requestTools.length > 0 ? requestTools : undefined,
              }),
              signal: controller.signal,
            });
            break; // Sucesso — sai do loop de retry
          } catch (fetchErr: any) {
            lastFetchError = fetchErr;
            // Se foi o usuário que cancelou (AbortController), não tenta de novo
            if (fetchErr?.name === 'AbortError') throw fetchErr;

            const isNetworkErr =
              fetchErr?.name === 'TypeError' ||
              fetchErr?.message?.includes('network') ||
              fetchErr?.message?.includes('fetch') ||
              fetchErr?.message?.includes('Failed to');

            if (isNetworkErr && retryAttempt < MAX_RETRIES) {
              console.log(`[Synap] Rede caiu (tentativa ${retryAttempt + 1}/${MAX_RETRIES}). Tentando de novo em ${RETRY_DELAYS[retryAttempt]}ms...`);

              // PRESERVA CONTEXTO: se a IA já gerou texto ou tool calls antes da queda,
              // inclui como mensagem assistant + instrução de continuação
              const partialText = iterationText || accumulatedAssistantText || '';
              const partialWork = partialText.trim().length > 0;

              if (partialWork) {
                // Adiciona o texto parcial como mensagem assistant no contexto
                const continuationMessages = [...currentMessagesForApi];

                if (partialText.trim()) {
                  continuationMessages.push({
                    role: 'assistant',
                    content: partialText.trim(),
                  });
                }

                // Adiciona instrução de continuação
                continuationMessages.push({
                  role: 'user',
                  content: '⚠️ Sua resposta anterior foi interrompida por uma queda de conexão. Continue EXATAMENTE de onde parou, sem repetir nada e sem introdução. Não refaça o que já fez.',
                });

                // Atualiza currentMessagesForApi pra próxima tentativa
                currentMessagesForApi = continuationMessages;
              }

              // Atualiza a mensagem da IA pra mostrar que tá reconectando
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id !== currentConvId) return c;
                  return {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            content: partialText + '\n\n⚠️ Conexão interrompida. Reconectando automaticamente...',
                          }
                        : m
                    ),
                  };
                })
              );
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryAttempt]));
              continue; // Tenta de novo com contexto preservado
            }
            throw fetchErr; // Não é erro de rede ou esgotou retries
          }
        }

        if (!response) throw lastFetchError || new Error('Falha ao conectar com o servidor após várias tentativas.');

        const finalResponse = response;

        if (!finalResponse.ok) {
          let rawText = '';
          let errMessage = `Erro HTTP ${finalResponse.status} na requisição ao servidor`;
          try {
            rawText = await finalResponse.text();
            try {
              const errData = JSON.parse(rawText);
              if (errData.error) errMessage = errData.error;
              else if (errData.message) errMessage = errData.message;
            } catch {
              if (rawText && rawText.trim()) {
                const trimmed = rawText.trim();
                if (trimmed.includes('FUNCTION_INVOCATION_FAILED')) {
                  errMessage = `Erro 500 Vercel (FUNCTION_INVOCATION_FAILED): A Serverless Function falhou na inicialização. Verifique se a variável NVIDIA_API_KEY foi adicionada nas Environment Variables da Vercel.`;
                } else if (trimmed.includes('FUNCTION_INVOCATION_TIMEOUT')) {
                  errMessage = `Erro 504 Vercel (FUNCTION_INVOCATION_TIMEOUT): A execução excedeu 60 segundos (limite do plano Hobby da Vercel). Alterne para o modelo z-ai/glm-5.3-flash ou reduza o nível de raciocínio nas configurações.`;
                } else if (trimmed.length < 500) {
                  errMessage = `Erro ${finalResponse.status}: ${trimmed}`;
                } else if (finalResponse.status === 500) {
                  errMessage = 'Erro interno do servidor (500). Verifique os logs da Vercel em vercel.com/dashboard.';
                } else if (finalResponse.status === 502) {
                  errMessage = 'Erro de gateway (502). A função serverless demorou demais ou caiu na Vercel.';
                }
              }
            }
          } catch {}

          const customErr: any = new Error(errMessage);
          customErr.status = finalResponse.status;
          customErr.rawResponse = rawText || errMessage;
          throw customErr;
        }

        if (!finalResponse.body) {
          throw new Error('Nenhuma resposta retornada pelo servidor.');
        }

        const fallbackType = finalResponse.headers.get('x-fallback');
        let fallbackWarning: string | undefined = undefined;
        if (fallbackType === 'no-reasoning') {
          fallbackWarning = 'O modelo negou o uso de raciocínio profundo para esta requisição (downgrade).';
        } else if (fallbackType === 'no-tools') {
          fallbackWarning = 'O modelo negou o uso de ferramentas nativas nesta requisição (downgrade).';
        } else if (fallbackType === 'no-reasoning-and-tools') {
          fallbackWarning = 'O modelo recusou raciocínio profundo e ferramentas (downgrade).';
        }

        const reader = finalResponse.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        const toolCallsAccumulator: Record<number, { id: string; name: string; arguments: string }> = {};
        let iterationTokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined = undefined;
        let streamDone = false;
        let lastUsefulPayloadAt = Date.now();
        const READ_CHUNK_TIMEOUT_MS = 40000; // 40s sem nenhum byte do servidor (keepalive é a cada 5s)
        const MAX_SILENT_KEEPALIVE_MS = 85000; // 85s recebendo apenas keepalive sem tokens reais

        try {
          while (!streamDone) {
            let readTimer: ReturnType<typeof setTimeout> | null = null;
            const readPromise = reader.read();
            const timeoutPromise = new Promise<{ done: true; value: undefined; timedOut: true }>((resolve) => {
              readTimer = setTimeout(() => {
                resolve({ done: true, value: undefined, timedOut: true });
              }, READ_CHUNK_TIMEOUT_MS);
            });

            const readResult = (await Promise.race([readPromise, timeoutPromise])) as {
              done: boolean;
              value?: Uint8Array;
              timedOut?: boolean;
            };
            if (readTimer) clearTimeout(readTimer);

            if (readResult.timedOut) {
              console.warn('[Synap] Client stream watchdog: 40s sem dados do servidor, encerrando leitura da rodada.');
              streamErrorMsg = 'Stream interrupted: A conexão ficou inativa por mais de 40s.';
              iterationFinishReason = 'interrupted';
              break;
            }

            const { done, value } = readResult;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;

              lastUsefulPayloadAt = Date.now();
              const dataStr = trimmed.replace(/^data:\s*/, '');
              if (dataStr === '[DONE]') {
                streamDone = true;
                break;
              }

              try {
                const parsed = JSON.parse(dataStr);
                if (parsed?.meta?.stage === 'connected') {
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== currentConvId) return c;
                      return {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.id === assistantMessageId ? { ...m, isConnected: true } : m
                        ),
                      };
                    })
                  );
                  continue;
                }
                if (parsed.error) {
                  // Erro enviado pelo servidor dentro do stream (ex.: NVIDIA sem resposta)
                  streamErrorMsg =
                    typeof parsed.error === 'string'
                      ? parsed.error
                      : parsed.error.message || JSON.stringify(parsed.error);
                }
                if (parsed.isInterruption) {
                  iterationFinishReason = 'interrupted';
                }
                const choice = parsed.choices?.[0];
                if (choice?.finish_reason) iterationFinishReason = choice.finish_reason;
                const delta = choice?.delta || choice?.message;

                if (parsed.usage) {
                  iterationTokenUsage = {
                    promptTokens: parsed.usage.prompt_tokens || 0,
                    completionTokens: parsed.usage.completion_tokens || 0,
                    totalTokens: parsed.usage.total_tokens || 0,
                  };
                }

                if (delta) {
                  if (delta.reasoning_content) {
                    iterationReasoning += delta.reasoning_content;
                  } else if (delta.reasoning) {
                    iterationReasoning += delta.reasoning;
                  }

                  if (delta.content) {
                    iterationText += delta.content;
                  }

                  // Accumulate tool calls (OpenAI standard format)
                  if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCallsAccumulator[idx]) {
                        toolCallsAccumulator[idx] = {
                          id: tc.id || `call_${Date.now()}_${idx}`,
                          name: tc.function?.name || '',
                          arguments: '',
                        };
                      }
                      if (tc.id) toolCallsAccumulator[idx].id = tc.id;
                      if (tc.function?.name) toolCallsAccumulator[idx].name = tc.function.name;
                      if (tc.function?.arguments) toolCallsAccumulator[idx].arguments += tc.function.arguments;
                    }
                  } else if (delta.function_call) {
                    // Legacy function_call fallback
                    if (!toolCallsAccumulator[0]) {
                      toolCallsAccumulator[0] = {
                        id: `call_${Date.now()}_0`,
                        name: delta.function_call.name || '',
                        arguments: '',
                      };
                    }
                    if (delta.function_call.name) toolCallsAccumulator[0].name = delta.function_call.name;
                    if (delta.function_call.arguments) toolCallsAccumulator[0].arguments += delta.function_call.arguments;
                  }

                  const currentCombinedText = accumulatedAssistantText
                    ? `${accumulatedAssistantText}\n\n${iterationText}`
                    : iterationText;

                  const currentCombinedReasoning = accumulatedReasoningText
                    ? `${accumulatedReasoningText}\n\n${iterationReasoning}`
                    : iterationReasoning;

                  // Throttle de renderização: atualiza UI no máximo a cada 50ms
                  // pra evitar jank visual com tokens muito rápidos
                  const now = Date.now();
                  if (!lastRenderRef.current || now - lastRenderRef.current > 50) {
                    lastRenderRef.current = now;
                    setConversations((prev) =>
                      prev.map((c) => {
                        if (c.id !== currentConvId) return c;
                        return {
                          ...c,
                          messages: c.messages.map((m) =>
                            m.id === assistantMessageId
                              ? {
                                  ...m,
                                  content: currentCombinedText,
                                  reasoning: currentCombinedReasoning || undefined,
                                  editedFiles: allEditedFiles.length > 0 ? allEditedFiles : undefined,
                                  toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
                                  tokenUsage: iterationTokenUsage,
                                  fallbackWarning,
                                }
                              : m
                          ),
                        };
                      })
                    );
                  }
                }
              } catch {}
            }

            if (!streamDone && Date.now() - lastUsefulPayloadAt > MAX_SILENT_KEEPALIVE_MS) {
              console.warn('[Synap] Client stream watchdog: 85s apenas com keepalives sem tokens reais.');
              streamErrorMsg = 'Stream interrupted: O modelo demorou mais de 85s sem enviar tokens.';
              iterationFinishReason = 'interrupted';
              break;
            }
          }
        } finally {
          try {
            await reader.cancel();
          } catch {}
        }

        let hadRecoverableStreamError = false;
        if (streamErrorMsg) {
          // Limpa do iterationText qualquer mensagem de erro injetada por sendErrorAndClose
          iterationText = iterationText.replace(/\n\n⚠️ \*\*Erro:\*\* .*/g, '').trim();

          hadRecoverableStreamError = isRecoverableStreamErrorMessage(streamErrorMsg);

          if (!iterationText.trim() && Object.keys(toolCallsAccumulator).length === 0 && !hadRecoverableStreamError) {
            // Sem texto e sem tool calls — erro real não recuperável, lança exceção
            throw new Error(streamErrorMsg);
          }

          if (hadRecoverableStreamError && consecutiveAutoContinues < MAX_CONSECUTIVE_AUTO_CONTINUES && loopCount < MAX_TOOL_ITERATIONS) {
            // Será tratado de forma unificada no bloco de continuação abaixo sem duplicar mensagens
            streamErrorMsg = '';
          } else if (!hadRecoverableStreamError) {
            iterationText += `\n\n⚠️ ${streamErrorMsg}`;
          }
        }

        // Process tool calls if any were returned (native or text-based fallback)
        let detectedCalls = Object.values(toolCallsAccumulator).filter((c) => c && c.name);
        if (detectedCalls.length === 0 && iterationText) {
          const extracted = extractTextToolCalls(iterationText);
          if (extracted.toolCalls.length > 0) {
            detectedCalls = extracted.toolCalls;
            iterationText = extracted.cleanedText;
          }
        }

        // Se o streaming não enviou usage nos chunks, calcular estimativa precisa baseada em caracteres/tokens
        if (!iterationTokenUsage) {
          const promptLength = currentMessagesForApi.reduce((acc, m) => {
            const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
            return acc + contentStr.length;
          }, 0);
          const promptTokens = Math.max(1, Math.round(promptLength / 3.8));
          const totalGeneratedLength =
            (accumulatedAssistantText?.length || iterationText.length) +
            (accumulatedReasoningText?.length || iterationReasoning.length);
          const completionTokens = Math.max(1, Math.round(totalGeneratedLength / 3.5));
          iterationTokenUsage = {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
          };
        }

        // Store accumulated content across iterations
        if (iterationText) {
          accumulatedAssistantText = accumulatedAssistantText
            ? `${accumulatedAssistantText}\n\n${iterationText}`
            : iterationText;
          streamingAccumulatedTextRef.current = accumulatedAssistantText;
        }
        if (iterationReasoning) {
          accumulatedReasoningText = accumulatedReasoningText
            ? `${accumulatedReasoningText}\n\n${iterationReasoning}`
            : iterationReasoning;
          streamingAccumulatedReasoningRef.current = accumulatedReasoningText;
        }

        const currentActiveSkills = skills.filter((s) => s.enabled);
        const currentUsedSkills = extractUsedSkills(
          accumulatedAssistantText,
          currentActiveSkills,
          allEditedFiles.length > 0
        );

        // Garante que a mensagem do assistente receba o texto limpo, habilidades usadas e o tokenUsage finalizado
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentConvId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: accumulatedAssistantText,
                      reasoning: accumulatedReasoningText || undefined,
                      tokenUsage: iterationTokenUsage,
                      isTruncated: iterationFinishReason === 'length',
                      streamError: streamErrorMsg || undefined,
                      usedSkills: currentUsedSkills.length > 0 ? currentUsedSkills : m.usedSkills,
                    }
                  : m
              ),
            };
          })
        );

        if (detectedCalls.length > 0) {
          hasToolCallsToProcess = true;
          consecutiveAutoContinues = 0;

          // Register tool calls in running state
          for (const tc of detectedCalls) {
            allToolCalls.push({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments,
              status: 'running',
            });
          }

          // Show running tool indicator immediately in chat
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== currentConvId) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        toolCalls: [...allToolCalls],
                      }
                    : m
                ),
              };
            })
          );

          const toolResultMessages: any[] = [];
          const assistantToolCallsPayload = detectedCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: {
              name: c.name,
              arguments: c.arguments,
            },
          }));

          for (const tc of detectedCalls) {
            let parsedArgs: any = {};
            try {
              parsedArgs = JSON.parse(tc.arguments || '{}');
            } catch {
              parsedArgs = {};
            }

            let result = '';
            let editedFile: MessageEditedFile | undefined = undefined;
            let execution: any = null;

            try {
              const planGate = checkPlanModeWriteGate(tc.name, activePlan);
              if (!planGate.allowed) {
                result = planGate.blockedResultJson!;
                const callEntry = allToolCalls.find((x) => x.id === tc.id);
                if (callEntry) {
                  callEntry.status = 'error';
                  callEntry.result = result;
                }
              } else if (tc.name.startsWith('mcp__')) {
                const targetServer = mcpServers.find((s) => tc.name.startsWith(`mcp__${s.id}__`));
                if (targetServer) {
                  result = await executeMcpToolCall(targetServer, tc.name, parsedArgs);
                } else {
                  result = JSON.stringify({ error: `Servidor MCP correspondente não encontrado para ${tc.name}` });
                }
                const callEntry = allToolCalls.find((x) => x.id === tc.id);
                if (callEntry) {
                  callEntry.status = 'completed';
                  callEntry.result = result;
                  debugInfoRef.current.toolCallsExecuted++;
                }
              } else {
                execution = await executeGitHubTool(tc.name, parsedArgs, chatActiveRepo);
                result = execution.result;
                editedFile = execution.editedFile;
                const callEntry = allToolCalls.find((x) => x.id === tc.id);
                if (callEntry) {
                  callEntry.status = 'completed';
                  callEntry.result = result;
                  debugInfoRef.current.toolCallsExecuted++;
                }
              }
            } catch (toolErr: any) {
              result = JSON.stringify({ error: toolErr?.message || 'Falha ao executar ferramenta.' });
              const callEntry = allToolCalls.find((x) => x.id === tc.id);
              if (callEntry) {
                callEntry.status = 'error';
                callEntry.result = result;
              }
            }

            if (editedFile) {
              allEditedFiles.push(editedFile);
            }
            if (execution?.editedFiles && execution.editedFiles.length > 0) {
              allEditedFiles.push(...execution.editedFiles);
            }
            if (execution?.batchRefactor) {
              currentBatchRefactor = execution.batchRefactor;
            }

            toolResultMessages.push({
              role: 'tool',
              content: result,
              tool_call_id: tc.id,
            });
          }

          // Update assistant message with completed tool calls & edited files
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== currentConvId) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        editedFiles: allEditedFiles.length > 0 ? allEditedFiles : undefined,
                        batchRefactor: currentBatchRefactor,
                        toolCalls: [...allToolCalls],
                        usedSkills: currentUsedSkills.length > 0 ? currentUsedSkills : m.usedSkills,
                      }
                    : m
                ),
              };
            })
          );

          // Prepare payload for next continuation request
          currentMessagesForApi = [
            ...currentMessagesForApi,
            {
              role: 'assistant',
              content: iterationText || '',
              tool_calls: assistantToolCallsPayload,
            },
            ...toolResultMessages,
          ];

          // ====== TRUNCAÇÃO INLINE DO currentMessagesForApi ======
          // Durante o agentic loop (até 45 iterações), o currentMessagesForApi
          // cresce sem parar: cada tool call adiciona 2 mensagens (assistant + tool).
          // Se passar de ~80K tokens estimados, a NVIDIA corta o stream.
          //
          // Solução: quando passa de 60K tokens (margem de segurança), trunca
          // as mensagens antigas preservando:
          //   - Mensagens system (sempre mantidas)
          //   - Últimas 10 mensagens (contexto recente)
          //   - Tool calls antigas viram texto "[N tool calls anteriores omitidas]"
          //
          // Estimativa simples: ~4 chars = 1 token
          const estimateTokensInline = (msgs: any[]): number => {
            let total = 0;
            for (const m of msgs) {
              if (typeof m.content === 'string') total += m.content.length;
              else if (Array.isArray(m.content)) {
                for (const c of m.content) {
                  if (typeof c?.text === 'string') total += c.text.length;
                }
              }
              if (m.tool_calls) {
                for (const tc of m.tool_calls) {
                  if (tc?.function?.arguments) total += tc.function.arguments.length;
                }
              }
            }
            return Math.ceil(total / 4);
          };

          const currentTokensEstimate = estimateTokensInline(currentMessagesForApi);
          const INLINE_TRUNCATE_THRESHOLD = 60000; // 60K tokens = margem segura
          const INLINE_KEEP_RECENT = 10; // mantém últimas 10 mensagens

          if (currentTokensEstimate > INLINE_TRUNCATE_THRESHOLD && currentMessagesForApi.length > INLINE_KEEP_RECENT + 2) {
            // Encontra índice onde começam as mensagens recentes (preserva system iniciais)
            const systemMessages = currentMessagesForApi.filter(m => m.role === 'system');
            const nonSystemMessages = currentMessagesForApi.filter(m => m.role !== 'system');
            const keptRecent = nonSystemMessages.slice(-INLINE_KEEP_RECENT);
            const omittedCount = nonSystemMessages.length - keptRecent.length;
            // Cria mensagem de sumário simples (não chama IA, só marca o corte)
            const truncationMarker = {
              role: 'system' as const,
              content: `[CONTEXTO TRUNCADO — ${omittedCount} mensagens anteriores (tool calls e respostas parciais) foram omitidas para evitar estouro de contexto. Continue trabalhando com base nas mensagens recentes abaixo.]`,
            };
            currentMessagesForApi = [...systemMessages, truncationMarker, ...keptRecent];
            console.log(`[Synap] Truncagem inline: ${currentTokensEstimate}K tokens → ${estimateTokensInline(currentMessagesForApi)}K tokens (${omittedCount} msgs omitidas)`);
          }
        } else if (
          iterationFinishReason === 'length' &&
          consecutiveAutoContinues < MAX_CONSECUTIVE_AUTO_CONTINUES &&
          loopCount < MAX_TOOL_ITERATIONS
        ) {
          consecutiveAutoContinues++;
          // Resposta cortada por limite de tokens (seja no raciocínio ou no texto)
          console.log('[Synap] finish_reason=length — continuando resposta/raciocínio automaticamente');
          const lastAssistantContent = iterationText.trim() || '[Raciocínio inicial concluído]';
          currentMessagesForApi = [
            ...currentMessagesForApi,
            { role: 'assistant', content: lastAssistantContent },
            {
              role: 'user',
              content: iterationText.trim()
                ? 'Sua resposta anterior foi cortada por limite de tamanho. Continue EXATAMENTE de onde parou, sem repetir nada e sem introdução.'
                : 'Seu raciocínio atingiu o limite de tokens antes de produzir a resposta. Por favor, apresente agora sua resposta e execute as ações necessárias.',
            },
          ];
          hasToolCallsToProcess = true;
        } else if (
          (hadRecoverableStreamError || iterationFinishReason === 'interrupted' || iterationFinishReason === 'error') &&
          consecutiveAutoContinues < MAX_CONSECUTIVE_AUTO_CONTINUES &&
          loopCount < MAX_TOOL_ITERATIONS
        ) {
          consecutiveAutoContinues++;
          console.log('[Synap] finish_reason=interrupted/error — auto-continuando execução');
          const cleanText = iterationText.trim();
          const hasCompletedReads = allToolCalls.some(
            (tc) => (tc.name === 'read_file' || tc.name === 'list_files') && tc.status === 'completed'
          );
          currentMessagesForApi = [
            ...currentMessagesForApi,
            { role: 'assistant', content: cleanText || '[Ação interrompida pelo servidor]' },
            {
              role: 'user',
              content: chatActiveRepo && !isNoToolsModel && !activePlan
                ? hasCompletedReads
                  ? 'Sua conexão foi interrompida momentaneamente pelo servidor. Como as leituras já foram concluídas, execute IMEDIATAMENTE a ferramenta (patch_file ou edit_file) para aplicar a alteração solicitada no repositório ativo.'
                  : 'Sua resposta anterior foi interrompida pelo servidor antes de concluir as alterações nos arquivos. Execute IMEDIATAMENTE a ferramenta (patch_file ou edit_file) agora no repositório ativo para concluir o que foi solicitado.'
                : 'Sua resposta anterior foi interrompida pelo servidor. Continue EXATAMENTE de onde parou sem introdução.',
            },
          ];
          hasToolCallsToProcess = true;
        } else if (
          !activePlan &&
          iterationText.trim() &&
          consecutiveAutoContinues < MAX_CONSECUTIVE_AUTO_CONTINUES &&
          loopCount < MAX_TOOL_ITERATIONS &&
          chatActiveRepo &&
          allEditedFiles.length === 0 &&
          detectedCalls.length === 0 &&
          looksLikeFileModificationPromise(iterationText)
        ) {
          consecutiveAutoContinues++;
          console.log('[Synap] IA prometeu alterar arquivos mas não disparou tool — forçando execução');
          currentMessagesForApi = [
            ...currentMessagesForApi,
            { role: 'assistant', content: iterationText },
            {
              role: 'user',
              content: isNoToolsModel
                ? 'Você descreveu alterações mas ainda não emitiu o bloco <synap_edit path="..." type="modified">. Emita IMEDIATAMENTE o bloco <synap_edit path="caminho/do/arquivo" type="modified"> com o código completo para aplicar as alterações solicitadas no repositório ativo.'
                : 'Você descreveu alterações mas ainda não executou a ferramenta (patch_file ou edit_file). ' +
                  'Execute IMEDIATAMENTE a ferramenta apropriada agora para aplicar as alterações solicitadas no repositório ativo.',
            },
          ];
          hasToolCallsToProcess = true;
        } else if (
          !activePlan &&
          iterationFinishReason === 'stop' &&
          iterationText.trim() &&
          consecutiveAutoContinues < MAX_CONSECUTIVE_AUTO_CONTINUES &&
          loopCount < MAX_TOOL_ITERATIONS &&
          // AGENTIC LOOP: detecta quando a IA indica que vai continuar trabalhando
          // mas parou a resposta antes de concluir. Auto-injeta um continuation prompt.
          looksLikeIncompleteWork(iterationText)
        ) {
          consecutiveAutoContinues++;
          console.log('[Synap] agentic loop detectado — continuando trabalho automaticamente');
          currentMessagesForApi = [
            ...currentMessagesForApi,
            { role: 'assistant', content: iterationText },
            {
              role: 'user',
              content:
                'Você encerrou sua resposta prometendo uma ação ou verificação (ex: terminando com dois-pontos ":"), mas não emitiu a chamada de ferramenta. ' +
                'Execute IMEDIATAMENTE a tool_call necessária (read_file, patch_file, edit_file ou search_code) agora, ou se já concluiu tudo, apresente apenas o resumo final sem prometer novas ações.',
            },
          ];
          hasToolCallsToProcess = true;
        }
      }

      // Aviso se atingiu o limite de segurança de iterações (45 rodadas automáticas)
      if (loopCount >= MAX_TOOL_ITERATIONS && hasToolCallsToProcess) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentConvId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content:
                        (m.content || '') +
                        '\n\n---\n⚠️ **Aviso de Segurança do Éden**: Atingi o limite máximo de 45 rodadas automáticas de ferramentas nesta resposta. Se ainda houver passos adicionais, envie uma mensagem para continuar.',
                    }
                  : m
              ),
            };
          })
        );
      }

      // Disparo assíncrono e não-bloqueante de Context Compaction (estilo Claude Code)
      setConversations((prev) => {
        const targetConv = prev.find((c) => c.id === currentConvId);
        if (targetConv && shouldCompact(targetConv)) {
          compactConversation(targetConv, import.meta.env.VITE_API_SECRET || '')
            .then((compaction) => {
              if (compaction) {
                setConversations((inner) =>
                  inner.map((c) =>
                    c.id === currentConvId
                      ? { ...c, contextCompaction: compaction }
                      : c
                  )
                );
              }
            })
            .catch((compactionErr) => {
              console.warn('[ContextCompaction] Falha silenciosa em background:', compactionErr);
            });
        }
        return prev;
      });
    } catch (err: any) {
      const errMsgStr = err?.message || '';
      const isAbort =
        err?.name === 'AbortError' ||
        errMsgStr.includes('aborted') ||
        errMsgStr.includes('The operation was aborted');

      // "Stream was cancelled" — servidor (NVIDIA/CF) cortou o streaming.
      // Diferente de abort: não foi o usuário nem o SO, foi o backend.
      // Tratamos igual ao "tela apagou": se tem texto parcial, salva pra retomar.
      const isStreamCancelled =
        errMsgStr.includes('Stream was cancelled') ||
        errMsgStr.includes('stream cancelled') ||
        errMsgStr.includes('Stream cancelled') ||
        errMsgStr.includes('connection reset') ||
        errMsgStr.includes('network error') && errMsgStr.includes('stream');

      if (isAbort) {
        // Abort pode ser de 3 fontes:
        // 1. Usuário clicou Stop (userInitiatedAbortRef = true)
        // 2. Tela apagou / SO suspendeu (userInitiatedAbortRef = false)
        // 3. Watchdog interno (já tratado em outro lugar)
        if (userInitiatedAbortRef.current) {
          console.log('[Synap] Geração interrompida pelo usuário.');
          // Adiciona nota no rodapé da mensagem se tiver texto parcial
          const partialText = streamingAccumulatedTextRef.current;
          if (partialText && partialText.trim().length > 30) {
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConversationIdRef.current) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentAssistantMessageIdRef.current
                      ? {
                          ...m,
                          content: m.content
                            ? `${m.content}\n\n---\n⏹️ Geração interrompida pelo usuário.`
                            : m.content,
                        }
                      : m
                  ),
                };
              })
            );
          }
        } else {
          // Tela apagou / SO suspendeu — salvar estado pra retomar quando voltar
          const partialText = streamingAccumulatedTextRef.current;
          const partialReasoning = streamingAccumulatedReasoningRef.current;
          console.log('[Synap] Abort por tela apagada/OS suspend — salvando estado pra retomar. Texto parcial:', partialText.length, 'chars');

          if (partialText && partialText.trim().length > 30) {
            pendingResumeRef.current = {
              conversationId: currentConversationIdRef.current,
              assistantMessageId: currentAssistantMessageIdRef.current,
              accumulatedText: partialText,
              accumulatedReasoning: partialReasoning,
              timestamp: Date.now(),
            };
            // Marca a mensagem com nota visual
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== currentConversationIdRef.current) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === currentAssistantMessageIdRef.current
                      ? {
                          ...m,
                          content: m.content
                            ? `${m.content}\n\n---\n⏸️ **Pausado (tela apagou)** — vou continuar de onde parei quando você voltar.`
                            : m.content,
                        }
                      : m
                  ),
                };
              })
            );
            // Não mostra erro — só loga silenciosamente
          } else {
            // Sem texto parcial — provavelmente estava esperando resposta inicial
            // Não mostra erro, só loga
            console.log('[Synap] Abort sem texto parcial — provavelmente TTFB interrompido por tela apagada.');
          }
        }
      } else if (isStreamCancelled) {
        // Stream cancelled pelo servidor (NVIDIA/CF cortou o streaming)
        // Mesma lógica de "tela apagou": se tem texto parcial, salva pra retomar.
        const partialText = streamingAccumulatedTextRef.current;
        const partialReasoning = streamingAccumulatedReasoningRef.current;
        console.log('[Synap] Stream cancelled pelo servidor — texto parcial:', partialText.length, 'chars');

        if (partialText && partialText.trim().length > 30) {
          pendingResumeRef.current = {
            conversationId: currentConversationIdRef.current,
            assistantMessageId: currentAssistantMessageIdRef.current,
            accumulatedText: partialText,
            accumulatedReasoning: partialReasoning,
            timestamp: Date.now(),
          };
          // Marca a mensagem visualmente
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== currentConversationIdRef.current) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === currentAssistantMessageIdRef.current
                    ? {
                        ...m,
                        content: m.content
                          ? `${m.content}\n\n---\n⏸️ **Streaming cortado pelo servidor** — vou continuar de onde parei automaticamente.`
                          : m.content,
                      }
                    : m
                ),
              };
            })
          );
          // Auto-retoma depois de 1.5s (dá tempo do servidor recuperar)
          setTimeout(() => {
            if (pendingResumeRef.current && pendingResumeRef.current.conversationId === currentConversationIdRef.current) {
              console.log('[Synap] Auto-retomando após stream cancelled...');
              const pending = pendingResumeRef.current;
              pendingResumeRef.current = null;
              // Só retoma se ainda tá na mesma conversa e não tem streaming em curso
              if (pending.conversationId === activeId && !isStreaming) {
                const continuationPrompt = chatActiveRepo
                  ? 'Sua resposta anterior foi interrompida pelo servidor antes de concluir as alterações nos arquivos. Execute IMEDIATAMENTE a ferramenta (edit_file ou create_file) agora no repositório ativo para aplicar as alterações solicitadas.'
                  : 'Continue exatamente de onde você parou. Não repita o que já fez. Apenas continue a resposta.';
                handleSendMessage(
                  continuationPrompt,
                  [],
                  []
                );
              }
            }
          }, 1500);
        } else {
          // Sem texto parcial — mostra erro amigável com debug info visível
          const elapsedMs = Date.now() - debugInfoRef.current.requestStartTime;
          const elapsedSec = (elapsedMs / 1000).toFixed(1);
          const debugInfo = [
            `Modelo: ${selectedModel}`,
            `Pensar: ${reasoningEffort}`,
            `Iteração do loop: ${debugInfoRef.current.loopCount} de ${debugInfoRef.current.maxIterations}`,
            `Tokens acumulados (chat): ${conversationTokens?.totalTokens?.toLocaleString() || '?'}`,
            `Tool calls executadas: ${debugInfoRef.current.toolCallsExecuted}`,
            `Tempo até erro: ${elapsedSec}s`,
          ].join('\n');
          setErrorMessage(
            '⚠️ Stream cancelled pelo servidor.\n\n' +
            'Prováveis causas:\n' +
            '• NVIDIA demorou mais que o limite de wall-clock do Cloudflare Worker\n' +
            '• GLM-5.3 com pensar alto demais (muda pra low/medium)\n' +
            '• Rate limit temporário\n\n' +
            'Dicas:\n' +
            '• Troca "pensar" pra low ou medium\n' +
            '• Troca modelo pra DeepSeek V4.1 Flash (mais rápido)\n' +
            '• Começa uma conversa nova (chat atual acumulou muito contexto)\n\n' +
            '── DEBUG INFO ──\n' + debugInfo
          );
        }
      } else {
        console.error('Chat generation error:', err);
        // Tratar erros de stream cortado / rede de forma mais amigável
        const errMsg = err?.message || '';
        const isNetworkError =
          errMsg.includes('network') ||
          errMsg.includes('fetch') ||
          errMsg.includes('stream') ||
          errMsg.includes('connection') ||
          err?.name === 'TypeError';

        if (isNetworkError) {
          setErrorMessage(
            'Conexão interrompida durante a geração. A IA pode ter sido cortada por timeout ou oscilação de rede. ' +
            'Tente novamente — se persistir, reduza o reasoning_effort pra "low" ou simplifique sua mensagem.'
          );
        } else if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
          setErrorMessage('Limite de requisições atingido. Aguarde 30 segundos e tente novamente.');
        } else if (errMsg.includes('401') || errMsg.includes('Unauthorized')) {
          setErrorMessage('Chave NVIDIA_API_KEY inválida ou expirada. Verifique nas Environment Variables da Vercel.');
        } else {
          setErrorMessage(errMsg || 'Falha ao processar resposta da IA.');
        }
        reportAppError('Erro na Geração de IA', errMsg || 'Falha ao processar resposta da IA', {
          status: err?.status || (errMsg.includes('500') ? 500 : errMsg.includes('504') ? 504 : undefined),
          endpoint: '/api/chat',
          rawResponse: err?.rawResponse || errMsg,
          stack: err?.stack,
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      // Limpa refs de snapshot (mas preserva pendingResumeRef se foi setado)
      streamingAccumulatedTextRef.current = '';
      streamingAccumulatedReasoningRef.current = '';
      currentAssistantMessageIdRef.current = '';
      currentConversationIdRef.current = '';
    }
  }, [isPlanMode, selectedModel, activeId, activeConversation, reasoningEffort, activeRepo, conversations, changes, skills, mcpServers, knowledgeFacts, selectedPreviewElements]);

  // ====== RESUME-AFTER-SCREEN-OFF: retoma quando a tela acender ======
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pendingResumeRef.current) {
        const pending = pendingResumeRef.current;
        pendingResumeRef.current = null;
        // Só retoma se foi há menos de 5 minutos (depois, contexto pode estar stale)
        const ageMs = Date.now() - pending.timestamp;
        if (ageMs > 5 * 60 * 1000) {
          console.log('[Synap] Resume descartado — pausa foi há mais de 5min');
          return;
        }
        // Só retoma se ainda tá na mesma conversa
        if (pending.conversationId !== activeId) {
          console.log('[Synap] Resume descartado — usuário trocou de conversa');
          return;
        }
        // Evita retomar se já tem outro streaming em andamento
        if (isStreaming) {
          console.log('[Synap] Resume descartado — já tem streaming em andamento');
          return;
        }
        console.log('[Synap] Tela voltou — retomando trabalho a partir de', pending.accumulatedText.length, 'chars');
        // Dispara um novo handleSendMessage com continuation prompt
        // usando o texto acumulado como se fosse a resposta anterior.
        handleSendMessage(
          'Continue exatamente de onde você parou. Não repita o que já fez, não inclua introdução. Apenas continue a resposta.',
          [],
          []
        );
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeId, isStreaming, handleSendMessage]);

  // Usuário começou a falar (texto parcial) enquanto a IA fala: interrompe NA HORA,
  // sem esperar ele terminar a frase. Ignora eco da própria voz da IA.
  const handleContinuousVoiceInterim = useCallback((text: string) => {
    if (!continuousVoiceActive || !liveIsSpeakingRef.current) return;
    if (text.trim().length < 3) return;
    if (looksLikeEcho(text, liveSpokenTextRef.current)) return;
    stopLiveSpeech();
  }, [continuousVoiceActive, stopLiveSpeech]);

  // Usuário terminou de falar no modo contínuo
  const handleContinuousVoiceTranscript = useCallback((text: string) => {
    if (!continuousVoiceActive) return;
    // A IA se ouvindo falar (eco): ignora, não envia como mensagem
    if (liveIsSpeakingRef.current && looksLikeEcho(text, liveSpokenTextRef.current)) return;
    continuousVoiceTranscriptRef.current = text;

    // Para a fala (áudio neural, fetch do TTS em andamento e Web Speech)
    stopLiveSpeech();
    // Para a geração de texto, se ainda estiver gerando
    if (isStreaming) {
      handleStopGeneration();
    }

    // Envia a mensagem
    if (text.trim()) {
      handleSendMessage(text);
    }
  }, [continuousVoiceActive, isStreaming, handleSendMessage, handleStopGeneration, stopLiveSpeech]);

  // Handler para correção de falhas de build na Cloudflare assistida por IA
  const handleFixBuildError = useCallback((errorSnippet: string) => {
    const shortSha = deployment?.commitHash?.slice(0, 7) || 'recente';
    const prompt = `O build de produção na Cloudflare Pages falhou no commit ${shortSha}.\n\n` +
      `Abaixo está o log de erro do terminal emitido durante a compilação:\n` +
      `\`\`\`\n${errorSnippet}\n\`\`\`\n\n` +
      `Por favor, diagnostique a causa raiz do erro, identifique o(s) arquivo(s) afetado(s) e utilize a ferramenta edit_file para corrigir o código e restabelecer o deploy.`;
    handleSendMessage(prompt);
  }, [deployment, handleSendMessage]);

  // Handler para aprovar e executar o plano em 1 clique (libera o Hard-Gate de escrita no turno de execução)
  const handleApprovePlan = useCallback(() => {
    if (isStreaming) return;
    handleSendMessage(
      '✅ Plano aprovado! Execute agora todas as alterações planejadas nos arquivos passo a passo usando `patch_file` ou `edit_file`.',
      [],
      [],
      false
    );
  }, [isStreaming, handleSendMessage]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  return (
    <div className="flex h-screen h-[100dvh] max-h-[100dvh] w-full bg-dark-bg text-[color:var(--c-fg-f3efe6)] overflow-hidden font-sans">
      {/* Offline Alert Bar */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#8c4a2f] text-[color:var(--c-on-strong)] text-xs py-1.5 px-4 flex items-center justify-center gap-2 shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Modo Offline — Você pode visualizar conversas salvas no histórico.</span>
        </div>
      )}


      {/* Sidebar with Chats, Repos, Source Control and Skills tabs */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onArchiveConversation={handleArchiveConversation}
        onUnarchiveConversation={handleUnarchiveConversation}
        onRenameConversation={handleRenameConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeRepo={activeRepo}
        sidebarTab={sidebarTab}
        onChangeTab={setSidebarTab}
        onSelectRepo={handleSelectRepo}
        onCloseRepo={handleCloseRepo}
        onChangeBranch={handleChangeBranch}
        pendingChangesCount={pendingChangesCount}
        skills={skills}
        onToggleSkill={handleToggleSkill}
        onAddSkill={handleAddSkill}
        onDeleteSkill={handleDeleteSkill}
        mcpServers={mcpServers}
        onAddMcpServer={handleAddMcpServer}
        onToggleMcpServer={handleToggleMcpServer}
        onDeleteMcpServer={handleDeleteMcpServer}
        onTestMcpServer={handleTestMcpServer}
        testingServerId={testingServerId}
        knowledgeFacts={knowledgeFacts}
        onAddKnowledgeFact={handleAddKnowledgeFact}
        onDeleteKnowledgeFact={handleDeleteKnowledgeFact}
        onClearKnowledgeFacts={handleClearKnowledgeFacts}
      />

      {/* Main Content Area — tabs no topo (Chat / Preview / Agentes) */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-dark-bg">
        {/* Header */}
        <ChatHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNewChat={handleNewChat}
          hasApiKey={hasApiKey}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeRepo={activeRepo}
          pendingChangesCount={pendingChangesCount}
          onOpenSourceControl={() => {
            setSidebarTab('source-control');
            setIsSidebarOpen(true);
          }}
          onOpenRepoList={() => {
            setSidebarTab('repos');
            setIsSidebarOpen(true);
          }}
          onCloseRepo={handleCloseRepo}
          onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
          isTerminalOpen={isTerminalOpen}
          isStudioMode={isStudioMode}
          onToggleStudioMode={setIsStudioMode}
          mainViewTab={mainViewTab}
          onChangeMainViewTab={(tab) => {
            setMainViewTab(tab);
            if (tab === 'chat') {
              setIsStudioMode(false);
            } else if (tab === 'preview') {
              if (!activeProject) {
                setSidebarTab('projects');
                setIsSidebarOpen(true);
                setMainViewTab('chat');
                return;
              }
              setIsStudioMode(false);
              setShowProjectWorkspace(true);
            } else if (tab === 'agentes') {
              setIsStudioMode(true);
            }
          }}
          activeProjectName={activeProject?.name ?? null}
          errorCount={errorHistory.length}
          onOpenErrors={() => setIsErrorModalOpen(true)}
          deployment={deployment}
          isLoadingDeployment={isLoadingDeployment}
          onOpenDeploymentLogs={() => setIsDeploymentLogsOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenGraph={() => handleOpenGraph()}
        />

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mx-3 sm:mx-6 mt-3 p-3 rounded-xl bg-[color:var(--c-bg-2e1d1a)] border border-[color:var(--c-bg-7a3429)] text-[color:var(--c-fg-f4ada3)] text-xs flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[color:var(--c-fg-d97757)] flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:text-[color:var(--c-on-strong)] text-[color:var(--c-fg-f4ada3)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Keep-Alive Preview Layer: mantém o iframe pré-compilado e montado em background para abrir em 0ms */}
        {previewProject && (
          <div
            className={
              mainViewTab === 'preview' && !isStudioMode && showProjectWorkspace
                ? 'flex-1 flex flex-col min-h-0 bg-[#09090b] overflow-hidden'
                : 'absolute -left-[9999px] top-0 w-[1280px] h-[800px] pointer-events-none opacity-0 overflow-hidden'
            }
            aria-hidden={mainViewTab !== 'preview'}
          >
            <ProjectWorkspace
              project={previewProject}
              selectedElementsCount={selectedPreviewElements.length}
              onSelectElement={handleSelectPreviewElement}
              onClose={() => {
                setMainViewTab('chat');
              }}
              onDelete={() => {
                removeProject(previewProject.id);
                setMainViewTab('chat');
              }}
              onRename={(newName) => renameProject(previewProject.id, newName)}
              onFileChange={(path, content) => updateFileContent(path, content)}
            />
          </div>
        )}

        {/* Conditional render based on mainViewTab */}
        {mainViewTab === 'agentes' || isStudioMode ? (
          <StudioPanel
            activeRepo={activeRepo}
            skills={skills}
            mcpServers={mcpServers}
            projectGraph={projectGraph}
            onOpenRepoSelector={() => {
              setSidebarTab('repos');
              setIsSidebarOpen(true);
            }}
            onOpenSourceControl={() => {
              setSidebarTab('source-control');
              setIsSidebarOpen(true);
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onBackToChat={() => {
              setIsStudioMode(false);
              setMainViewTab('chat');
            }}
          />
        ) : mainViewTab === 'preview' && !previewProject ? (
          /* Preview selecionado mas nenhum projeto ativo — mostra mensagem em vez de tela preta */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center bg-dark-bg">
            <div className="w-16 h-16 rounded-2xl bg-[#22201d] border border-[#3b3831] flex items-center justify-center">
              <Eye className="w-8 h-8 text-[#5e5a52]" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium text-[#f3efe6]">Nenhum projeto aberto</h3>
              <p className="text-xs text-[#8c867a] max-w-sm leading-relaxed">
                {activeRepo
                  ? `O repositório ${activeRepo.fullName} está vinculado a este chat, mas o preview ainda não foi carregado. Tente vincular novamente ou aguarde a sincronização.`
                  : 'Vincule um repositório ao chat (aba Repos) ou peça pra IA criar um projeto para ver o preview ao vivo.'}
              </p>
            </div>
            {activeRepo && (
              <button
                type="button"
                onClick={() => {
                  syncRepoToProject({
                    repoFullName: activeRepo.fullName,
                    owner: activeRepo.owner,
                    repo: activeRepo.repo,
                    branch: activeRepo.branch,
                    conversationId: activeId || undefined,
                  }).then((result) => {
                    if (!result.ok && result.reason === 'fetch_error') {
                      reportAppError(
                        'Falha ao sincronizar repositório',
                        `Não foi possível buscar os arquivos de ${activeRepo.fullName}.`,
                        { endpoint: activeRepo.fullName }
                      );
                    }
                  }).catch((err) => {
                    reportAppError(
                      'Erro ao sincronizar',
                      err?.message || 'Erro desconhecido',
                      { stack: err?.stack }
                    );
                  });
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#d97757] hover:bg-[#c4663f] text-white text-xs font-medium transition cursor-pointer shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                Sincronizar repositório agora
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSidebarTab('projects');
                setIsSidebarOpen(true);
              }}
              className="text-xs text-[#d97757] hover:underline"
            >
              Ver lista de projetos
            </button>
          </div>
        ) : null}

        {/* Chat Main View — mantido montado no DOM para preservar rolagem, renderização e input */}
        <div
          className={
            mainViewTab === 'chat' && !isStudioMode
              ? 'flex-1 flex flex-col min-h-0 relative'
              : 'hidden'
          }
        >
          {/* Messages or Empty State */}
          <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6 max-w-2xl mx-auto text-center py-4 sm:py-8 relative">
              <div className="mb-3 sm:mb-4 flex items-center justify-center">
                <ClaudeLogo className="w-14 h-14 sm:w-16 sm:h-16" />
              </div>

              <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-normal text-[color:var(--c-fg-f3efe6)] tracking-tight mb-2">
                {getGreeting()} Near, como posso ajudar?
              </h2>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {activeConversation.messages.map((msg, index) => {
                const prevMsg = index > 0 ? activeConversation.messages[index - 1] : null;
                const showCompactionMarker =
                  activeConversation.contextCompaction &&
                  prevMsg &&
                  prevMsg.id === activeConversation.contextCompaction.compactedUpToMessageId;

                return (
                  <React.Fragment key={msg.id}>
                    {showCompactionMarker && (
                      <CompactionMarker compaction={activeConversation.contextCompaction!} />
                    )}
                    <ChatMessage
                      message={msg}
                      isStreaming={isStreaming && index === activeConversation.messages.length - 1}
                      onViewDiff={handleViewDiffForPath}
                      onOpenTerminal={handleOpenTerminal}
                      onOpenSourceControl={() => {
                        setSidebarTab('source-control');
                        setIsSidebarOpen(true);
                      }}
                      onOpenGraph={handleOpenGraph}
                      onApprovePlan={handleApprovePlan}
                      onApproveRemoteAction={handleApproveRemoteAction}
                      onRejectRemoteAction={handleRejectRemoteAction}
                      onTogglePlanMode={handleTogglePlanMode}
                    />
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Cloudflare Pages Deployment Failure Alert */}
        {deployment?.status === 'failure' && dismissedDeploymentId !== deployment.id && (
          <div className="px-3 sm:px-6 max-w-4xl mx-auto w-full">
            <DeploymentErrorCard
              deployment={deployment}
              onViewLogs={() => setIsDeploymentLogsOpen(true)}
              onFixWithAi={handleFixBuildError}
              onDismiss={() => setDismissedDeploymentId(deployment.id)}
            />
          </div>
        )}

        {/* Chat Input Bar */}
        <ChatInput
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          isLoading={isStreaming}
          isFlashModel={selectedModel === 'z-ai/glm-5.3-flash' || selectedModel === 'google/gemma-4-31b-it' || selectedModel === 'deepseek-ai/deepseek-v4.1-flash' || selectedModel === 'nvidia/nemotron-3.5-super-vl-120b-a12b'}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          reasoningEffort={reasoningEffort}
          onSelectReasoningEffort={handleSelectReasoningEffort}
          isPlanMode={isPlanMode}
          onTogglePlanMode={handleTogglePlanMode}
          isWebSearchActive={isWebSearchMode}
          onToggleWebSearch={handleToggleWebSearchMode}
          conversationTokens={conversationTokens}
          onOpenTerminal={handleOpenTerminal}
          isContinuousVoiceActive={continuousVoiceActive}
          onToggleContinuousVoice={handleContinuousVoiceToggle}
          onContinuousVoiceTranscript={handleContinuousVoiceTranscript}
          onContinuousVoiceInterim={handleContinuousVoiceInterim}
          selectedElements={selectedPreviewElements}
          onRemoveSelectedElement={handleRemoveSelectedPreviewElement}
          onClearSelectedElements={() => setSelectedPreviewElements([])}
        />
        </div>

        {/* Terminal Drawer Panel (Hardware-accelerated smooth drawer) */}
        <TerminalPanel
          isOpen={isTerminalOpen}
          onClose={() => setIsTerminalOpen(false)}
          entries={terminalEntries}
          onExecuteCommand={handleExecuteTerminalCommand}
          onClear={handleClearTerminal}
          isRunning={isTerminalRunning}
        />
      </div>

      {/* Diff Viewer Modal triggered from chat or direct action */}
      {diffViewingChange && (
        <DiffViewer
          change={diffViewingChange}
          isOpen={true}
          onClose={() => setDiffViewingChange(null)}
          onStage={stageChange}
          onUnstage={unstageChange}
          onDiscard={discardChange}
          onUpdateContent={updateChangeContent}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        conversations={conversations}
        onClearHistory={handleClearHistory}
        hasApiKey={hasApiKey}
        hasGeminiKey={hasGeminiKey}
        hasGitHubToken={hasGitHubToken}
      />

      {/* Error Inspector Modal */}
      <ErrorModal
        error={activeError}
        errorHistory={errorHistory}
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        onClearHistory={() => setErrorHistory([])}
      />

      {/* Cloudflare Pages Deployment Logs Modal */}
      <DeploymentLogModal
        isOpen={isDeploymentLogsOpen}
        onClose={() => setIsDeploymentLogsOpen(false)}
        deployment={deployment}
        onFixWithAi={handleFixBuildError}
      />

      {/* Graphify Architecture Graph Modal */}
      <GraphModal
        isOpen={isGraphModalOpen}
        onClose={() => setIsGraphModalOpen(false)}
        graph={projectGraph}
        initialFocusNodeId={graphFocusNodeId}
        onSelectFile={handleViewDiffForPath}
      />
    </div>
  );
}
