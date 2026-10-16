// ============================================================================
// Agentic Patterns & Stream Resiliência — Synap
// ============================================================================
//
// Utilitários para detectar:
// 1. Trabalho inacabado na resposta da IA (auto-continuação / agentic loop)
// 2. Promessas em texto de alterar/remover/criar arquivos sem chamar tool
// 3. Erros recuperáveis de stream (ex: conexão abortada pelo backend/NVIDIA)
// ============================================================================

export const INCOMPLETE_PATTERNS: RegExp[] = [
  // "vou verificar X", "deixa eu checar Y", "vou listar arquivos", "vou ler o código"
  /(?:vou|vou agora|deixa eu|deixe-me|deixa-me|vamos|irei)\s+(?:verificar|checar|analisar|examinar|investigar|procurar|ver|tentar|listar|ler|abrir|buscar|localizar|consultar|confirmar|achar)\b/i,

  // "preciso verificar X", "preciso analisar Y", "preciso remover Z"
  /preciso\s+(?:verificar|checar|analisar|examinar|investigar|listar|ler|abrir|buscar|procurar|localizar|consultar|confirmar|achar|remover|deletar|apagar|excluir|de\s+mais\s+coisas)\b/i,

  // "para resolver isso, preciso...", "para remover esse ícone, preciso..."
  /(?:para|pra)\s+(?:resolver|remover|deletar|apagar|excluir|alterar|modificar|editar|fazer|consertar)\s+(?:isso|este|esse|o|a|os|as)?\s*.*?(?:preciso|vou|tenho\s+que|vamos)\b/i,

  // "próximo passo", "em seguida", "agora vou"
  /(?:pr[oó]ximo\s+passo|em\s+seguida|agora\s+vou)\b/i,

  // "aguarde um momento", "espere um pouco"
  /(?:aguarde|espere)\s+(?:um\s+momento|um\s+pouco|instante)\b/i,

  // "continue...", "deixe-me continuar"
  /(?:continue|deixe-me\s+continuar|deixa\s+eu\s+continuar)\b/i,

  // "vou começar", "primeiro vou", "primeiro, vou", "primeiro, preciso"
  /(?:vou\s+começar|primeiro[,\s]+(?:vou|vamos|deixa\s+eu|deixe-me|irei|preciso)|deixa\s+eu\s+começar)\b/i,

  // "ainda preciso", "ainda falta", "falta ainda"
  /(?:ainda\s+preciso|ainda\s+falta|falta\s+ainda)\b/i,

  // "vou criar", "vou alterar", "vou modificar", "vou remover", "vou deletar"
  /(?:vou|vou\s+agora|deixa\s+eu|deixe-me|deixa-me|vamos|irei)\s+(?:criar|gerar|implementar|fazer|escrever|alterar|modificar|adicionar|configurar|atualizar|ajustar|inserir|colocar|remover|deletar|apagar|excluir|retirar|limpar)\b/i,

  // "estou criando", "estou alterando", "estou implementando", "estou removendo"
  /(?:estou|estamos)\s+(?:criando|gerando|implementando|fazendo|escrevendo|alterando|modificando|adicionando|configurando|atualizando|removendo|deletando|apagando|excluindo|retirando|limpando)\b/i,

  // Padrões diretos de inspeção/localização
  /(?:vou|vou\s+agora|deixa\s+eu|deixe-me)\s+listar\s+(?:os\s+)?arquivos\b/i,
  /(?:vou|vou\s+agora|deixa\s+eu|deixe-me)\s+localizar\s+(?:o\s+|os\s+)?(?:arquivo|componente|código)\b/i,
];

export function looksLikeIncompleteWork(text: string): boolean {
  if (!text || text.length < 20) return false;
  // Checa tanto a cauda (últimos 450 chars) quanto o texto inteiro se for curto
  const sample = text.length <= 500 ? text.toLowerCase() : text.slice(-450).toLowerCase();
  for (const pattern of INCOMPLETE_PATTERNS) {
    if (pattern.test(sample)) {
      return true;
    }
  }
  return false;
}

export function looksLikeFileModificationPromise(text: string): boolean {
  if (!text || text.length < 20) return false;
  const sample = text.length <= 600 ? text.toLowerCase() : text.slice(-500).toLowerCase();
  const fileActionPatterns = [
    // "vou criar", "vamos alterar", "vou remover", "vou deletar esse símbolo", "vou editar o arquivo"
    /(?:vou|vamos|irei|vou\s+agora|deixa\s+eu|deixe-me)\s+(?:criar|adicionar|implementar|fazer|alterar|modificar|inserir|colocar|atualizar|configurar|remover|deletar|apagar|excluir|retirar|editar|limpar)\b/i,

    // "preciso editar o arquivo", "preciso alterar", "preciso remover esse ícone"
    /preciso\s+(?:editar|alterar|modificar|atualizar|ajustar|criar|remover|deletar|apagar|excluir|limpar)\s+(?:o\s+arquivo|o\s+componente|o\s+código|esse|este|essa|esta|um|uma)\b/i,

    // "vou ... e remover", "vou ... e deletar", "vou ... e alterar", "vou listar ... para achar ... e deletar"
    /(?:vou|vamos|irei|deixa\s+eu)\s+.*?\b(?:e\s+)?(?:remover|deletar|apagar|excluir|alterar|modificar|editar|limpar)\b/i,

    // "estou criando", "estamos alterando", "estou removendo"
    /(?:estou|estamos)\s+(?:criando|adicionando|implementando|fazendo|alterando|modificando|inserindo|colocando|atualizando|configurando|removendo|deletando|apagando|excluindo|retirando|editando|limpando)\b/i,

    // "criando o arquivo", "removendo o componente"
    /(?:criando|alterando|modificando|adicionando|atualizando|removendo|deletando|apagando|excluindo|retirando|editando)\s+(?:o\s+arquivo|o\s+componente|em|no|na)\b/i,

    // "aqui está o código", "arquivo atualizado", "alterações feitas"
    /(?:aqui\s+está\s+o\s+código|alterações\s+feitas|arquivo\s+atualizado|arquivo\s+modificado|código\s+atualizado)\b/i,
  ];
  for (const p of fileActionPatterns) {
    if (p.test(sample)) {
      return true;
    }
  }
  return false;
}

/**
 * Identifica se uma mensagem de erro de stream pode ser recuperada automaticamente
 * reiniciando ou continuando a execução a partir do ponto salvo.
 */
export function isRecoverableStreamErrorMessage(errorMsg: string): boolean {
  if (!errorMsg || typeof errorMsg !== 'string') return false;
  const lower = errorMsg.toLowerCase();
  return (
    lower.includes('não enviou dados a tempo') ||
    lower.includes('não respondeu a tempo') ||
    lower.includes('stream interrupted') ||
    lower.includes('stream was cancelled') ||
    lower.includes('stream cancelled') ||
    lower.includes('connection reset') ||
    lower.includes('network error') ||
    lower.includes('the operation was aborted') ||
    lower.includes('operation was aborted') ||
    lower.includes('aborterror') ||
    lower.includes('aborted') ||
    lower.includes('fetch failed')
  );
}
