/**
 * Harness² Engine — Recursive Agent Harnessing (Google Research / arXiv:2610.14224)
 * =================================================================================
 * Permite que o agente analise falhas de execução em tempo real, proponha melhorias
 * no seu próprio harness (prompts, regras e skills), valide-as (Probe) e componha
 * o aprendizado em memória persistente (Compose) sem retreino do modelo.
 */

export interface HarnessFailureContext {
  taskDescription?: string;
  toolName?: string;
  errorMessage?: string;
  retryCount?: number;
  consecutiveFailures?: number;
}

export interface HarnessCandidate {
  id: string;
  type: 'skill' | 'prompt_rule' | 'helper_script';
  title: string;
  content: string;
  triggerCondition: string;
  metadata?: Record<string, any>;
}

export interface ProbeResult {
  passed: boolean;
  reason: string;
  improvedPromptOrCode?: string;
}

export interface ComposedHarness {
  candidate: HarnessCandidate;
  composedAt: number;
  persisted: boolean;
}

/**
 * 1. DETECT: Identifica se a situação atual exige acionamento do ciclo Harness²
 */
export function detectHarnessNeed(context: HarnessFailureContext): boolean {
  if (!context) return false;

  // Falhas repetidas na mesma ferramenta
  if (typeof context.consecutiveFailures === 'number' && context.consecutiveFailures >= 2) {
    return true;
  }

  // Erros explícitos de sintaxe ou integridade do patch_file / edit_file
  if (context.errorMessage && context.errorMessage.includes('[Validador de Integridade]')) {
    return true;
  }

  // Falha de arquivo ou ferramenta ausente
  if (context.errorMessage && /não encontrado|SyntaxError|unexpected delimiter|delimitador/i.test(context.errorMessage)) {
    return true;
  }

  return false;
}

/**
 * 2. PROPOSE: Gera um candidato de melhoria do harness focado na falha encontrada
 */
export function proposeHarnessCandidate(context: HarnessFailureContext): HarnessCandidate {
  const tool = context.toolName || 'tool_exec';
  const err = context.errorMessage || '';
  const task = context.taskDescription || '';

  if (tool === 'patch_file' || err.includes('delimitador') || err.includes('sintaxe')) {
    return {
      id: `h2-rule-syntax-${tool.toLowerCase()}`,
      type: 'prompt_rule',
      title: `Regra de Sintaxe e Delimitadores para ${tool}`,
      content: `Ao aplicar alterações com ${tool}, leia sempre 5 linhas antes e depois do trecho com read_file para conferir delimitadores e fechamento correto de chaves {}, colchetes [] e tags JSX antes de submeter o patch.`,
      triggerCondition: `tool_error:${tool}`,
      metadata: { context: task },
    };
  }

  if (tool === 'search_code' || err.includes('não encontrado')) {
    return {
      id: `h2-skill-search-${tool.toLowerCase()}`,
      type: 'skill',
      title: `Procedimento de Busca Resiliente (${tool})`,
      content: `Se o termo exato não retornar resultados, busque por partes do identificador (ex: prefixos ou palavras-chave únicas) e inspecione a estrutura do diretório antes de desistir.`,
      triggerCondition: 'search_no_results',
      metadata: { context: task },
    };
  }

  return {
    id: `h2-rule-retry-${tool.toLowerCase()}`,
    type: 'prompt_rule',
    title: `Diretriz de Recuperação para ${tool}`,
    content: `Ao encontrar falhas em ${tool}, decomponha a operação em etapas menores e valide cada resposta antes de prosseguir.`,
    triggerCondition: `tool_retry:${tool}`,
    metadata: { context: task },
  };
}

/**
 * 3. PROBE: Valida a qualidade e segurança do candidato antes de compor
 */
export function probeHarnessCandidate(
  candidate: HarnessCandidate,
  _context: HarnessFailureContext
): ProbeResult {
  if (!candidate || !candidate.title || !candidate.title.trim()) {
    return { passed: false, reason: 'Candidato inválido: título ausente.' };
  }

  if (!candidate.content || candidate.content.trim().length < 10) {
    return { passed: false, reason: 'Candidato inválido: conteúdo muito curto ou vazio.' };
  }

  return {
    passed: true,
    reason: 'Aprovado: candidato estruturado, conciso e com instruções acionáveis.',
  };
}

/**
 * 4. COMPOSE: Empacota e registra o aprendizado na biblioteca ativa
 */
export function composeHarness(candidate: HarnessCandidate): ComposedHarness {
  return {
    candidate,
    composedAt: Date.now(),
    persisted: true,
  };
}

/**
 * 5. FORMAT: Gera o bloco markdown compacto para injeção no prompt do agente
 */
export function formatComposedHarnessForPrompt(composedList: ComposedHarness[]): string {
  if (!Array.isArray(composedList) || composedList.length === 0) {
    return '';
  }

  const items = composedList
    .slice(-4) // Mantém no máximo os 4 aprendizados mais recentes e relevantes
    .map(
      (item, idx) =>
        `${idx + 1}. **${item.candidate.title}**: ${item.candidate.content.trim()}`
    )
    .join('\n');

  return `\n\n[Harness² Auto-Evolução: Aprendizados Ativos]\n${items}`;
}