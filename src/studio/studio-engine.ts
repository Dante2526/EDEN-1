// src/studio/studio-engine.ts
import { ActiveRepoState, Skill, McpServer, PendingChange } from '../lib/types';
import { StudioAgent, StudioStep, StudioReview } from './studio-types';
import { generateId } from '../lib/utils';
import { getClientAuthHeaders, searchCode } from '../lib/github';
import { isToolCapableModel } from '../lib/models';
import { extractTextToolCalls } from '../lib/text-tool-parser';
import { convertMcpToolsToOpenAi, executeMcpToolCall } from '../lib/mcp-client';
import {
  applyFilePatches,
  normalizePatchArgs,
  normalizeRepoPath,
  resolveEffectiveFileContent,
} from '../lib/file-patcher';
import { buildGraphFromFiles, queryGraphContext } from '../lib/graphify-engine';

export interface StudioRuntimeContext {
  skills?: Skill[];
  mcpServers?: McpServer[];
  pendingChanges?: PendingChange[];
}

interface CachedFileEntry {
  content: string;
  originalContent?: string;
  deleted?: boolean;
}

function buildStudioSkillsSection(skills?: Skill[]): string {
  const activeSkills = (skills || []).filter((s) => s.enabled);
  if (activeSkills.length === 0) return '';
  return (
    '\n\n--- HABILIDADES MODULARES ATIVAS (SKILLS) ---\n' +
    activeSkills.map((s) => `### Habilidade: ${s.name}\n${s.systemPrompt}`).join('\n\n')
  );
}

function buildStudioMcpTools(mcpServers?: McpServer[]): any[] {
  const activeServers = (mcpServers || []).filter(
    (s) => s.enabled && s.status === 'connected' && s.tools.length > 0
  );
  return activeServers.flatMap((s) => convertMcpToolsToOpenAi(s.tools, s.id));
}

// Tools definitions no formato OpenAI/NVIDIA
const READ_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo atualizado de um arquivo do repositório ativo (incluindo alterações já feitas nesta sessão)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: 'Lista arquivos de um diretório do repositório ativo',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do diretório (vazio = raiz)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_code',
      description: 'Busca ocorrências de texto, funções ou classes no repositório ativo',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo de busca, função ou símbolo' },
          path: { type: 'string', description: 'Pasta opcional para filtrar (ex: src/)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_code_graph',
      description: 'Consulta o Grafo de Arquitetura do projeto (Graphify) para mapear dependências e impacto entre módulos',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termo ou símbolo para buscar no grafo' },
          focus_file: { type: 'string', description: 'Arquivo alvo para inspecionar quem importa ou depende dele' },
        },
      },
    },
  },
];

const SUBMIT_PLAN_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_plan',
    description: 'Envia o plano final. Chame APENAS quando terminar de analisar o repo.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              targetFile: { type: 'string' },
              action: { type: 'string', enum: ['create', 'modify', 'delete', 'read', 'analyze'] },
            },
            required: ['description', 'action'],
          },
        },
      },
      required: ['steps'],
    },
  },
};

const SUBMIT_REVIEW_TOOL = {
  type: 'function' as const,
  function: {
    name: 'submit_review',
    description: 'Envia a revisão final do plano.',
    parameters: {
      type: 'object',
      properties: {
        approved: { type: 'boolean' },
        summary: { type: 'string' },
        observations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['warning', 'suggestion', 'risk', 'approval'] },
              step: { type: 'number' },
              message: { type: 'string' },
            },
            required: ['type', 'message'],
          },
        },
      },
      required: ['approved', 'summary'],
    },
  },
};

// Helper: chama /api/chat com streaming SSE, retorna texto final + tool_calls
async function callChat(
  messages: any[],
  agent: StudioAgent,
  tools: any[]
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const supportsNativeTools = isToolCapableModel(agent.model);
  const payloadMessages = supportsNativeTools
    ? messages
    : messages.map((m, idx) => {
        if (idx === 0 && m.role === 'system') {
          const toolNames = tools.map((t) => t?.function?.name).filter(Boolean).join(', ');
          return {
            ...m,
            content:
              `${m.content}\n\n` +
              `PROTOCOLO DE FERRAMENTAS EM TEXTO (obrigatório para este modelo):\n` +
              `- Para invocar qualquer ferramenta (${toolNames}), emita: <synap_tool name="NOME_DA_FERRAMENTA">{...json...}</synap_tool>\n` +
              `- Para edição cirúrgica rápida com patch_file, você pode emitir:\n` +
              `<synap_patch path="caminho/do/arquivo"><old>...trecho atual...</old><new>...novo trecho...</new></synap_patch>\n` +
              `- Para editar ou criar um arquivo inteiro com edit_file, emita:\n` +
              `<synap_edit path="caminho/do/arquivo" type="modified">\n...conteúdo completo...\n</synap_edit>`,
          };
        }
        return m;
      });

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_SECRET || '',
    },
    body: JSON.stringify({
      messages: payloadMessages,
      model: agent.model,
      reasoning_effort: agent.reasoningEffort,
      tools: supportsNativeTools ? tools : undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `API Error ${response.status}`);
  }

  if (!response.body) throw new Error('No response body');

  // Lê o stream SSE
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.replace(/^data:\s*/, '');
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta;
        if (delta) {
          if (delta.content) content += delta.content;
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsMap[idx]) {
                toolCallsMap[idx] = {
                  id: tc.id || `call_${Date.now()}_${idx}`,
                  name: '',
                  arguments: '',
                };
              }
              if (tc.id) toolCallsMap[idx].id = tc.id;
              if (tc.function?.name) toolCallsMap[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
            }
          }
        }
      } catch {}
    }
  }

  let finalToolCalls = Object.values(toolCallsMap).filter((tc) => tc && tc.name);
  let finalContent = content;
  if (finalToolCalls.length === 0 && content) {
    const extracted = extractTextToolCalls(content);
    if (extracted.toolCalls.length > 0) {
      finalToolCalls = extracted.toolCalls;
      finalContent = extracted.cleanedText;
    }
  }

  return {
    content: finalContent,
    toolCalls: finalToolCalls,
  };
}

// Helper: executa uma tool (read_file, list_files, search_code, query_code_graph, patch_file, edit_file, mcp__*) localmente
async function executeTool(
  name: string,
  args: any,
  activeRepo: ActiveRepoState,
  onEditFile?: (
    path: string,
    content: string,
    type: 'create' | 'modify' | 'delete',
    originalContent?: string
  ) => Promise<void>,
  runtime?: StudioRuntimeContext,
  fileStateCache?: Map<string, CachedFileEntry>
): Promise<string> {
  if (name.startsWith('mcp__')) {
    const targetServer = (runtime?.mcpServers || []).find((s) => name.startsWith(`mcp__${s.id}__`));
    if (!targetServer) {
      return `Erro: Servidor MCP correspondente a ${name} não encontrado ou inativo.`;
    }
    return executeMcpToolCall(targetServer, name, args || {});
  }

  const githubHeaders = {
    ...getClientAuthHeaders(),
    'x-api-key': import.meta.env.VITE_API_SECRET || '',
  };

  const readCurrentFileWithCache = async (rawPath: string): Promise<{ ok: boolean; content: string; originalContent?: string; error?: string }> => {
    const normPath = normalizeRepoPath(rawPath);
    if (fileStateCache?.has(normPath)) {
      const cached = fileStateCache.get(normPath)!;
      if (cached.deleted) {
        return { ok: false, content: '', originalContent: cached.originalContent, error: `Arquivo ${rawPath} foi marcado como deletado.` };
      }
      return { ok: true, content: cached.content, originalContent: cached.originalContent };
    }

    if (runtime?.pendingChanges && runtime.pendingChanges.length > 0) {
      const effective = resolveEffectiveFileContent(normPath, runtime.pendingChanges, activeRepo.fullName);
      if (effective.status === 'deleted') {
        return { ok: false, content: '', originalContent: effective.originalContent, error: `Arquivo ${rawPath} está deletado no Source Control.` };
      }
      if (effective.status === 'modified' && effective.content !== undefined) {
        fileStateCache?.set(normPath, {
          content: effective.content,
          originalContent: effective.originalContent,
        });
        return { ok: true, content: effective.content, originalContent: effective.originalContent };
      }
    }

    const res = await fetch(
      `/api/github?action=file&owner=${activeRepo.owner}&repo=${activeRepo.repo}&path=${encodeURIComponent(
        normPath
      )}&branch=${activeRepo.branch}`,
      { headers: githubHeaders }
    );
    if (!res.ok) {
      return { ok: false, content: '', error: `Erro: arquivo ${rawPath} não encontrado` };
    }
    const data = await res.json();
    const fetchedContent = data.content || '';
    fileStateCache?.set(normPath, {
      content: fetchedContent,
      originalContent: fetchedContent,
    });
    return { ok: true, content: fetchedContent, originalContent: fetchedContent };
  };

  if (name === 'read_file') {
    const fileRes = await readCurrentFileWithCache(args.path || '');
    if (!fileRes.ok) return fileRes.error || `Erro: arquivo ${args.path} não encontrado`;
    return fileRes.content;
  }

  if (name === 'list_files') {
    const path = args.path || '';
    const res = await fetch(
      `/api/github?action=contents&owner=${activeRepo.owner}&repo=${activeRepo.repo}&path=${encodeURIComponent(
        path
      )}&branch=${activeRepo.branch}`,
      { headers: githubHeaders }
    );
    if (!res.ok) return `Erro: diretório ${path} não encontrado`;
    const items = await res.json();
    return JSON.stringify(
      items.map((i: any) => ({ name: i.name, type: i.type, path: i.path }))
    );
  }

  if (name === 'search_code') {
    try {
      const items = await searchCode(
        null,
        args.query || '',
        activeRepo.owner,
        activeRepo.repo,
        args.path
      );
      return JSON.stringify(items);
    } catch (err: any) {
      return `Erro na busca de código: ${err?.message || args.query}`;
    }
  }

  if (name === 'query_code_graph' || name === 'query_architecture_graph') {
    const filesForGraph: Array<{ path: string; content: string }> = [];
    if (fileStateCache) {
      for (const [p, entry] of fileStateCache.entries()) {
        if (!entry.deleted) {
          filesForGraph.push({ path: p, content: entry.content });
        }
      }
    }
    if (runtime?.pendingChanges) {
      for (const ch of runtime.pendingChanges) {
        const normP = normalizeRepoPath(ch.path);
        if (!fileStateCache?.has(normP) && ch.type !== 'deleted') {
          filesForGraph.push({ path: normP, content: ch.newContent });
        }
      }
    }
    const graph = buildGraphFromFiles(filesForGraph);
    const qRes = queryGraphContext(graph, {
      query: args.query,
      focusFile: args.focus_file,
      maxNodes: 10,
    });
    return qRes.markdownContext || 'Grafo consultado (leia arquivos adicionais se precisar expandir os nós em memória).';
  }

  if (name === 'patch_file' && onEditFile) {
    const normPath = normalizeRepoPath(args.path || '');
    if (!normPath) return 'Erro: parâmetro path é obrigatório para patch_file.';
    const patches = normalizePatchArgs(args);
    const currentFile = await readCurrentFileWithCache(normPath);
    if (!currentFile.ok) {
      return currentFile.error || `Erro: não foi possível ler ${normPath} para aplicar patch.`;
    }
    const patchRes = applyFilePatches(currentFile.content, patches);
    if (!patchRes.success) {
      return `Erro ao aplicar patch_file em ${normPath}: ${patchRes.error}`;
    }
    fileStateCache?.set(normPath, {
      content: patchRes.content,
      originalContent: currentFile.originalContent,
    });
    await onEditFile(normPath, patchRes.content, 'modify', currentFile.originalContent);
    return `Patch cirúrgico aplicado com sucesso em ${normPath} (${patchRes.appliedCount} bloco(s)) e salvo no Source Control.`;
  }

  if (name === 'edit_file' && onEditFile) {
    const normPath = normalizeRepoPath(args.path || '');
    const type = args.type === 'create' ? 'create' : args.type === 'delete' ? 'delete' : 'modify';
    let originalContent: string | undefined = undefined;
    if (type !== 'create') {
      const existing = await readCurrentFileWithCache(normPath);
      if (existing.ok) {
        originalContent = existing.originalContent ?? existing.content;
      }
    }
    fileStateCache?.set(normPath, {
      content: args.content || '',
      originalContent,
      deleted: type === 'delete',
    });
    await onEditFile(normPath, args.content || '', type, originalContent);
    return `Arquivo ${normPath} atualizado no Source Control`;
  }

  return `Tool ${name} não suportada`;
}

// ============ 1. PLANNER ============
export async function runPlanner(
  task: string,
  activeRepo: ActiveRepoState,
  agent: StudioAgent,
  feedback?: string,
  runtime?: StudioRuntimeContext
): Promise<StudioStep[]> {
  const skillsSection = buildStudioSkillsSection(runtime?.skills);
  const mcpTools = buildStudioMcpTools(runtime?.mcpServers);
  const fileStateCache = new Map<string, CachedFileEntry>();

  const systemPrompt = `Você é um Arquiteto de Software Sênior. Analise o repositório ativo (${activeRepo.owner}/${activeRepo.repo}, branch ${activeRepo.branch}) e a tarefa do usuário.

REGRAS:
1. Use as ferramentas read_file, list_files, search_code, query_code_graph e ferramentas MCP conectadas livremente para entender o repo antes de planejar
2. Quando terminar a análise, chame a ferramenta submit_plan com o plano completo
3. Máximo 8 passos. Cada passo deve ser concreto e executável
4. Para cada passo, especifique o arquivo alvo (targetFile) e a ação (create/modify/delete/read/analyze)
5. Considere dependências entre passos

${
  feedback
    ? `FEEDBACK DA REVISÃO ANTERIOR (incorpore no novo plano):\n${feedback}`
    : ''
}

TAREFA DO USUÁRIO: ${task}${skillsSection}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Tarefa: ${task}` },
  ];

  // Loop de tool calls até chamar submit_plan (máx 12 iterações)
  let currentMessages = [...messages];
  for (let i = 0; i < 12; i++) {
    const result = await callChat(currentMessages, agent, [...READ_TOOLS, ...mcpTools, SUBMIT_PLAN_TOOL]);

    if (result.toolCalls.length === 0) {
      // IA não chamou tools — tenta forçar de novo
      currentMessages.push({ role: 'assistant', content: result.content });
      currentMessages.push({
        role: 'user',
        content: 'Chame a ferramenta submit_plan com o plano completo em JSON.',
      });
      continue;
    }

    // Processa tool calls
    const assistantMsg: any = {
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    currentMessages.push(assistantMsg);

    let planSubmitted = false;
    let submittedSteps: any[] = [];

    for (const tc of result.toolCalls) {
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(tc.arguments || '{}');
      } catch {}

      if (tc.name === 'submit_plan') {
        planSubmitted = true;
        submittedSteps = parsedArgs.steps || [];
      } else {
        // Executa read_file, list_files, search_code, query_code_graph ou mcp__*
        const toolResult = await executeTool(tc.name, parsedArgs, activeRepo, undefined, runtime, fileStateCache);
        currentMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: tc.id,
        });
      }
    }

    if (planSubmitted) {
      // Mapeia pra StudioStep[]
      return submittedSteps.map((s: any, idx: number) => ({
        id: generateId(),
        index: idx + 1,
        description: s.description || `Passo ${idx + 1}`,
        targetFile: s.targetFile,
        action: s.action || 'modify',
        status: 'pending' as const,
      }));
    }
  }

  throw new Error('Planner não chamou submit_plan após 12 iterações');
}

// ============ 2. REVIEWER ============
export async function runReviewer(
  plan: StudioStep[],
  task: string,
  activeRepo: ActiveRepoState,
  agent: StudioAgent,
  runtime?: StudioRuntimeContext
): Promise<StudioReview> {
  const skillsSection = buildStudioSkillsSection(runtime?.skills);
  const mcpTools = buildStudioMcpTools(runtime?.mcpServers);
  const fileStateCache = new Map<string, CachedFileEntry>();

  const planJson = JSON.stringify(
    plan.map((s) => ({
      step: s.index,
      description: s.description,
      targetFile: s.targetFile,
      action: s.action,
    })),
    null,
    2
  );

  const systemPrompt = `Você é um Code Reviewer Sênior. Analise o plano abaixo e identifique riscos, sugestões e aprovações.

REGRAS:
1. Use read_file, search_code, query_code_graph e ferramentas MCP conectadas para validar arquivos citados no plano (se necessário)
2. Seja crítico mas construtivo
3. Marque approved=false se algum passo tem risco grave
4. Quando terminar, chame submit_review com o parecer

TAREFA ORIGINAL: ${task}

PLANO PARA REVISAR:
${planJson}${skillsSection}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Revise o plano acima e chame submit_review.' },
  ];

  let currentMessages = [...messages];
  for (let i = 0; i < 12; i++) {
    const result = await callChat(currentMessages, agent, [...READ_TOOLS, ...mcpTools, SUBMIT_REVIEW_TOOL]);

    if (result.toolCalls.length === 0) {
      currentMessages.push({ role: 'assistant', content: result.content });
      currentMessages.push({
        role: 'user',
        content: 'Chame submit_review com seu parecer.',
      });
      continue;
    }

    const assistantMsg: any = {
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    currentMessages.push(assistantMsg);

    let reviewSubmitted = false;
    let submittedReview: any = null;

    for (const tc of result.toolCalls) {
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(tc.arguments || '{}');
      } catch {}

      if (tc.name === 'submit_review') {
        reviewSubmitted = true;
        submittedReview = parsedArgs;
      } else {
        const toolResult = await executeTool(tc.name, parsedArgs, activeRepo, undefined, runtime, fileStateCache);
        currentMessages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: tc.id,
        });
      }
    }

    if (reviewSubmitted) {
      return {
        approved: Boolean(submittedReview.approved),
        summary: submittedReview.summary || '',
        observations: (submittedReview.observations || []).map((o: any) => ({
          type: o.type || 'suggestion',
          step: o.step,
          message: o.message || '',
        })),
      };
    }
  }

  throw new Error('Reviewer não chamou submit_review após 12 iterações');
}

// ============ 3. IMPLEMENTER ============
export async function runImplementer(
  plan: StudioStep[],
  activeRepo: ActiveRepoState,
  agent: StudioAgent,
  onProgress: (step: StudioStep) => void,
  onEditFile: (
    path: string,
    content: string,
    type: 'create' | 'modify' | 'delete',
    originalContent?: string
  ) => Promise<void>,
  runtime?: StudioRuntimeContext
): Promise<void> {
  const skillsSection = buildStudioSkillsSection(runtime?.skills);
  const mcpTools = buildStudioMcpTools(runtime?.mcpServers);
  const fileStateCache = new Map<string, CachedFileEntry>();

  const PATCH_TOOL = {
    type: 'function' as const,
    function: {
      name: 'patch_file',
      description:
        'Edita cirurgicamente trechos específicos de um arquivo existente (substituindo old_str por new_str) sem precisar reescrever o arquivo inteiro. Prefira sempre patch_file para modificar arquivos existentes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo' },
          old_str: { type: 'string', description: 'Trecho exato atual no arquivo a ser substituído' },
          new_str: { type: 'string', description: 'Novo trecho que substituirá old_str' },
          allow_multiple: { type: 'boolean' },
          patches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_str: { type: 'string' },
                new_str: { type: 'string' },
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

  const EDIT_TOOL = {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Cria um novo arquivo, deleta ou reescreve o arquivo inteiro no repositório. A alteração vai pro Source Control para revisão.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo' },
          content: { type: 'string', description: 'Novo conteúdo completo do arquivo' },
          type: { type: 'string', enum: ['create', 'modify', 'delete'] },
        },
        required: ['path', 'content', 'type'],
      },
    },
  };

  for (const step of plan) {
    onProgress({ ...step, status: 'in_progress' });

    try {
      const systemPrompt = `Você é um Engenheiro de Software Sênior. Execute o passo abaixo usando patch_file (recomendado para editar arquivos existentes) ou edit_file (para criar novos arquivos ou reescrever por completo).

PASSO ${step.index}: ${step.description}
${step.targetFile ? `ARQUIVO ALVO: ${step.targetFile}` : ''}
AÇÃO: ${step.action}

REGRAS:
- Se precisar ver o conteúdo atual, use read_file primeiro (ele já reflete quaisquer alterações feitas nos passos anteriores)
- Para modificar arquivos existentes, prefira patch_file (passando path, old_str e new_str) por ser mais rápido e seguro
- Use edit_file para criar arquivos novos ou reescrever arquivos pequenos
- Não tente commitar — o Éden salva tudo no Source Control

Após executar, responda com texto curto confirmando o que fez.${skillsSection}`;

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Execute o passo ${step.index}.` },
      ];

      let currentMessages = [...messages];
      let stepDone = false;

      for (let i = 0; i < 12 && !stepDone; i++) {
        const result = await callChat(currentMessages, agent, [
          ...READ_TOOLS,
          ...mcpTools,
          PATCH_TOOL,
          EDIT_TOOL,
        ]);

        if (result.toolCalls.length === 0) {
          const requiresEdit = step.action === 'create' || step.action === 'modify' || step.action === 'delete';
          if (requiresEdit && i < 3) {
            currentMessages.push({ role: 'assistant', content: result.content || '' });
            currentMessages.push({
              role: 'user',
              content: 'ATENÇÃO: Você respondeu com texto explicativo mas NÃO chamou `patch_file` nem `edit_file`. Execute `patch_file` ou `edit_file` agora para aplicar a alteração.',
            });
            continue;
          }
          // Se for ação apenas de leitura/análise ou se já tiver concluído
          stepDone = !requiresEdit;
          break;
        }

        const assistantMsg: any = {
          role: 'assistant',
          content: result.content || '',
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
        currentMessages.push(assistantMsg);

        for (const tc of result.toolCalls) {
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(tc.arguments || '{}');
          } catch {}

          const toolResult = await executeTool(
            tc.name,
            parsedArgs,
            activeRepo,
            onEditFile,
            runtime,
            fileStateCache
          );
          currentMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });

          if (
            (tc.name === 'edit_file' || tc.name === 'patch_file') &&
            !toolResult.startsWith('Erro')
          ) {
            stepDone = true;
          }
        }
      }

      if (!stepDone) {
        throw new Error('O modelo respondeu com texto mas não concluiu a alteração de arquivo (patch_file / edit_file).');
      }

      onProgress({
        ...step,
        status: 'completed',
        result: 'Arquivo modificado no Source Control',
      });
    } catch (err: any) {
      onProgress({
        ...step,
        status: 'failed',
        result: err?.message || 'Erro ao executar passo',
      });
      throw err;
    }
  }
}


