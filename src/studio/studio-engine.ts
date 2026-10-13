// src/studio/studio-engine.ts
import { ActiveRepoState } from '../lib/types';
import { StudioAgent, StudioStep, StudioReview } from './studio-types';
import { generateId } from '../lib/utils';
import { getClientAuthHeaders } from '../lib/github';

// Tools definitions no formato OpenAI/NVIDIA
const READ_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Lê o conteúdo de um arquivo do repositório ativo',
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
  // Injeta system prompt no início das messages (formato esperado por /api/chat)
  const payloadMessages = messages;

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_API_SECRET || '',
    },
    body: JSON.stringify({
      messages: payloadMessages,
      model: agent.model,
      reasoning_effort: agent.reasoningEffort, // ← snake_case (correto)
      tools,
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

  return {
    content,
    toolCalls: Object.values(toolCallsMap),
  };
}

// Helper: executa uma tool (read_file, list_files, edit_file) localmente
async function executeTool(
  name: string,
  args: any,
  activeRepo: ActiveRepoState,
  onEditFile?: (path: string, content: string, type: 'create' | 'modify' | 'delete') => Promise<void>
): Promise<string> {
  const githubHeaders = {
    ...getClientAuthHeaders(),
    'x-api-key': import.meta.env.VITE_API_SECRET || '',
  };

  if (name === 'read_file') {
    const res = await fetch(
      `/api/github?action=file&owner=${activeRepo.owner}&repo=${activeRepo.repo}&path=${encodeURIComponent(
        args.path
      )}&branch=${activeRepo.branch}`,
      { headers: githubHeaders }
    );
    if (!res.ok) return `Erro: arquivo ${args.path} não encontrado`;
    const data = await res.json();
    return data.content || '';
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

  if (name === 'edit_file' && onEditFile) {
    const type = args.type === 'create' ? 'create' : args.type === 'delete' ? 'delete' : 'modify';
    await onEditFile(args.path, args.content || '', type);
    return `Arquivo ${args.path} atualizado no Source Control`;
  }

  return `Tool ${name} não suportada`;
}

// ============ 1. PLANNER ============
export async function runPlanner(
  task: string,
  activeRepo: ActiveRepoState,
  agent: StudioAgent,
  feedback?: string
): Promise<StudioStep[]> {
  const systemPrompt = `Você é um Arquiteto de Software Sênior. Analise o repositório ativo (${activeRepo.owner}/${activeRepo.repo}, branch ${activeRepo.branch}) e a tarefa do usuário.

REGRAS:
1. Use as ferramentas read_file e list_files livremente para entender o repo antes de planejar
2. Quando terminar a análise, chame a ferramenta submit_plan com o plano completo
3. Máximo 8 passos. Cada passo deve ser concreto e executável
4. Para cada passo, especifique o arquivo alvo (targetFile) e a ação (create/modify/delete/read/analyze)
5. Considere dependências entre passos

${
  feedback
    ? `FEEDBACK DA REVISÃO ANTERIOR (incorpore no novo plano):\n${feedback}`
    : ''
}

TAREFA DO USUÁRIO: ${task}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Tarefa: ${task}` },
  ];

  // Loop de tool calls até chamar submit_plan (máx 10 iterações)
  let currentMessages = [...messages];
  for (let i = 0; i < 10; i++) {
    const result = await callChat(currentMessages, agent, [...READ_TOOLS, SUBMIT_PLAN_TOOL]);

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
        // Executa read_file ou list_files
        const toolResult = await executeTool(tc.name, parsedArgs, activeRepo);
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

  throw new Error('Planner não chamou submit_plan após 10 iterações');
}

// ============ 2. REVIEWER ============
export async function runReviewer(
  plan: StudioStep[],
  task: string,
  activeRepo: ActiveRepoState,
  agent: StudioAgent
): Promise<StudioReview> {
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
1. Use read_file para validar arquivos citados no plano (se necessário)
2. Seja crítico mas construtivo
3. Marque approved=false se algum passo tem risco grave
4. Quando terminar, chame submit_review com o parecer

TAREFA ORIGINAL: ${task}

PLANO PARA REVISAR:
${planJson}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Revise o plano acima e chame submit_review.' },
  ];

  let currentMessages = [...messages];
  for (let i = 0; i < 10; i++) {
    const result = await callChat(currentMessages, agent, [...READ_TOOLS, SUBMIT_REVIEW_TOOL]);

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
        const toolResult = await executeTool(tc.name, parsedArgs, activeRepo);
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

  throw new Error('Reviewer não chamou submit_review após 10 iterações');
}

// ============ 3. IMPLEMENTER ============
export async function runImplementer(
  plan: StudioStep[],
  activeRepo: ActiveRepoState,
  agent: StudioAgent,
  onProgress: (step: StudioStep) => void,
  onEditFile: (path: string, content: string, type: 'create' | 'modify' | 'delete') => Promise<void>
): Promise<void> {
  const EDIT_TOOL = {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edita ou cria um arquivo no repositório. A alteração vai pro Source Control para revisão.',
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
      const systemPrompt = `Você é um Engenheiro de Software. Execute o passo abaixo usando edit_file.

PASSO ${step.index}: ${step.description}
${step.targetFile ? `ARQUIVO ALVO: ${step.targetFile}` : ''}
AÇÃO: ${step.action}

REGRAS:
- Se precisar ver o conteúdo atual, use read_file primeiro
- Use edit_file para criar/modificar o arquivo
- Faça a alteração mínima necessária
- Não tente commitar — o Synap cuida disso

Após executar, responda com texto curto confirmando o que fez.`;

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Execute o passo ${step.index}.` },
      ];

      let currentMessages = [...messages];
      let stepDone = false;

      for (let i = 0; i < 5 && !stepDone; i++) {
        const result = await callChat(currentMessages, agent, [...READ_TOOLS, EDIT_TOOL]);

        if (result.toolCalls.length === 0) {
          // Sem tool calls, IA só respondeu com texto
          stepDone = true;
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

          const toolResult = await executeTool(tc.name, parsedArgs, activeRepo, onEditFile);
          currentMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });

          if (tc.name === 'edit_file') {
            stepDone = true;
          }
        }
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
