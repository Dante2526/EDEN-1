/**
 * Motor de Hard-Gate do Modo Plano Obrigatório (Plan Mode Gate).
 * Quando o botão "Plano ON" está ativado pelo usuário:
 * 1. Todas as ferramentas de leitura e diagnóstico (query_code_graph, read_file, list_files, search_code, etc.) permanecem 100% liberadas.
 * 2. Todas as ferramentas de escrita/mutação de código (patch_file, edit_file, batch_edit_files, update_project_files, create_project)
 *    são bloqueadas até que o usuário aprove o plano clicando em "Aprovar e Executar Plano".
 */

export const WRITE_TOOL_NAMES = new Set<string>([
  'patch_file',
  'edit_file',
  'batch_edit_files',
  'update_project_files',
  'create_project',
]);

/**
 * Verifica se o nome da ferramenta corresponde a uma operação de escrita/mutação de arquivos.
 */
export function isWriteToolName(toolName: string): boolean {
  if (!toolName) return false;
  return WRITE_TOOL_NAMES.has(toolName.trim());
}

/**
 * Filtra a lista de ferramentas enviadas ao modelo.
 * Quando isPlanMode=true, remove as ferramentas de mutação de código para que o modelo
 * investigue os arquivos reais (via query_code_graph, read_file, search_code) e elabore o plano sem editar prematuramente.
 */
export function filterToolsForPlanMode<T extends { function?: { name?: string } }>(
  tools: T[],
  isPlanMode: boolean
): T[] {
  if (!isPlanMode || !Array.isArray(tools)) {
    return tools;
  }
  return tools.filter((tool) => {
    const name = tool?.function?.name || '';
    return !isWriteToolName(name);
  });
}

export interface PlanModeGateCheck {
  allowed: boolean;
  blockedResultJson?: string;
}

/**
 * Barreira de segurança (Hard-Gate) executada antes de qualquer tool call (nativa ou fallback textual <synap_edit>/<synap_patch>).
 */
export function checkPlanModeWriteGate(toolName: string, isPlanMode: boolean): PlanModeGateCheck {
  if (!isPlanMode || !isWriteToolName(toolName)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    blockedResultJson: JSON.stringify({
      error:
        `MODO PLANO ATIVO (HARD-GATE): A ferramenta '${toolName}' está bloqueada porque o usuário ativou o Modo Plano Obrigatório. ` +
        `Você NÃO pode modificar ou criar arquivos antes da aprovação. ` +
        `Conclua sua investigação com read_file / query_code_graph e apresente o PLANO DE IMPLEMENTAÇÃO estruturado em Markdown para o usuário clicar em "Aprovar e Executar Plano".`,
    }),
  };
}

/**
 * Gera o prompt de sistema do Modo Plano Obrigatório.
 */
export function buildMandatoryPlanPrompt(hasActiveRepoOrProject: boolean): string {
  if (hasActiveRepoOrProject) {
    return (
      '🛑 MODO PLANO OBRIGATÓRIO ATIVO (HARD-GATE DE ESCRITA — IGUAL AO FLUXO ANTIGRAVITY):\n' +
      'O usuário ativou o botão **Plano ON**. Você está ESTRITAMENTE PROIBIDO de alterar, criar ou deletar qualquer arquivo neste turno (`patch_file`, `edit_file`, `batch_edit_files` e tags `<synap_edit>` / `<synap_patch>` estão bloqueados até a aprovação).\n\n' +
      'SEU FLUXO OBRIGATÓRIO NESTA RESPOSTA:\n' +
      '1. **Investigação Real (Permitida e Obrigatória):** Use `query_code_graph`, `read_file`, `list_files` ou `search_code` agora mesmo para inspecionar os arquivos reais que serão afetados.\n' +
      '2. **Apresentação do Plano de Implementação:** Após ler o contexto necessário, escreva um plano claro, direto e escaneável em Markdown contendo:\n' +
      '   - 🎯 **Objetivo & Diagnóstico:** Causa raiz ou meta da funcionalidade.\n' +
      '   - 📂 **Arquivos que serão modificados/criados:** Lista exata dos caminhos (`path`) e o que mudará em cada um.\n' +
      '   - 🛠️ **Passos da Implementação:** Sequência lógica e cirúrgica das alterações propostas.\n' +
      '   - ✅ **Plano de Verificação:** Como validaremos que a mudança ficou perfeita.\n' +
      '3. **Parada Obrigatória:** Ao terminar o plano, PARE e aguarde o usuário clicar no botão **"Aprovar e Executar Plano"** (ou pedir ajustes).'
    );
  }

  return (
    'Você é um estrategista e arquiteto de planejamento sênior. O MODO PLANO (FUNÇÃO PLAN) está ATIVADO. Para a solicitação do usuário, crie OBRIGATORIAMENTE um PLANO DE AÇÃO COMPLETO, PRÁTICO E EXECUTÁVEL, formatado estritamente com os seguintes tópicos em Markdown:\n\n' +
    '🎯 1. OBJETIVO & RESULTADO ESPERADO (Definição clara da meta)\n' +
    '📋 2. PRÉ-REQUISITOS & RECURSOS (Ferramentas, materiais ou conhecimentos prévios)\n' +
    '🗓️ 3. FASES CRONOLÓGICAS PASSO A PASSO (Etapas divididas em Fases/Semanas com ações práticas numeradas)\n' +
    '⚠️ 4. RISCOS, DESAFIOS & CONTINGÊNCIAS (Possíveis obstáculos e soluções preventivas)\n' +
    '✅ 5. CRITÉRIOS DE SUCESSO & PRIMEIRO PASSO IMEDIATO (A primeira ação para começar hoje mesmo).\n\n' +
    'Ao finalizar o plano, aguarde o usuário clicar em "Aprovar e Executar Plano" ou solicitar ajustes.'
  );
}

/**
 * Detecta se a resposta curta do usuário (ex: "sim", "aprovado", "pode fazer") é uma aprovação direta
 * do plano recém-apresentado pelo assistente.
 */
export function isPlanApprovalReply(userText: string, previousAssistantWasPlan: boolean): boolean {
  if (!previousAssistantWasPlan || !userText) return false;
  const clean = userText.trim().toLowerCase();
  if (clean.length > 80) return false;
  return /^(?:✅\s*)?(?:sim|s|ok|okay|aprovado|aprovo|pode\s+(?:fazer|executar|implementar|ir|prosseguir|aplicar|mandar)|manda\s+bala|executa|execute|implemente|aplique|perfeito[,!\s]*pode|fechado|de\s+acordo|bora|vai\s+fundo|autorizado)(?:[!.,\s].*)?$/i.test(
    clean
  );
}
