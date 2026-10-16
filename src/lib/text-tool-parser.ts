export interface ExtractedTextToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface TextToolExtractionResult {
  toolCalls: ExtractedTextToolCall[];
  cleanedText: string;
}

/**
 * Remove cercas de código markdown externas (```lang ... ```) caso o modelo
 * envolva o conteúdo dentro de <synap_edit> ou <synap_tool>.
 */
function stripOuterCodeFence(rawContent: string): string {
  const trimmed = rawContent.trim();
  const fenceMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch) {
    return fenceMatch[1];
  }
  return rawContent.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

/**
 * Extrai chamadas de ferramentas estruturadas em texto para modelos que não possuem
 * Function Calling nativo no provedor (ex.: DeepSeek R1 Distill 32B na Cloudflare)
 * ou como fallback universal quando o modelo emite blocos estruturados.
 */
export function extractTextToolCalls(text: string): TextToolExtractionResult {
  if (!text || typeof text !== 'string') {
    return { toolCalls: [], cleanedText: text || '' };
  }

  const toolCalls: ExtractedTextToolCall[] = [];
  let cleanedText = text;
  let counter = 0;

  // 1. Extrair blocos <synap_edit path="..." [type="modified|added|deleted"]>...</synap_edit>
  const editRegex = /<synap_edit\s+([^>]+)>([\s\S]*?)<\/synap_edit>/gi;
  cleanedText = cleanedText.replace(editRegex, (_fullMatch, attrsStr: string, innerContent: string) => {
    const pathMatch = attrsStr.match(/path\s*=\s*["']([^"']+)["']/i);
    if (!pathMatch || !pathMatch[1]) {
      return _fullMatch;
    }
    const path = pathMatch[1].trim();
    const typeMatch = attrsStr.match(/type\s*=\s*["']([^"']+)["']/i);
    const rawType = typeMatch?.[1]?.trim().toLowerCase() || 'modified';
    const type =
      rawType === 'added' || rawType === 'create'
        ? 'added'
        : rawType === 'deleted' || rawType === 'delete'
        ? 'deleted'
        : 'modified';

    const cleanContent = stripOuterCodeFence(innerContent);
    counter++;
    toolCalls.push({
      id: `text_edit_${Date.now()}_${counter}`,
      name: 'edit_file',
      arguments: JSON.stringify({
        path,
        content: cleanContent,
        type,
      }),
    });

    return '';
  });

  // 2. Extrair blocos <synap_tool name="...">...JSON...</synap_tool>
  const toolRegex = /<synap_tool\s+([^>]+)>([\s\S]*?)<\/synap_tool>/gi;
  cleanedText = cleanedText.replace(toolRegex, (_fullMatch, attrsStr: string, innerJson: string) => {
    const nameMatch = attrsStr.match(/name\s*=\s*["']([^"']+)["']/i);
    if (!nameMatch || !nameMatch[1]) {
      return _fullMatch;
    }
    const name = nameMatch[1].trim();
    const rawArgs = stripOuterCodeFence(innerJson).trim();
    let normalizedArgs = '{}';
    if (rawArgs) {
      try {
        const parsed = JSON.parse(rawArgs);
        normalizedArgs = JSON.stringify(parsed);
      } catch {
        return _fullMatch;
      }
    }

    counter++;
    toolCalls.push({
      id: `text_tool_${Date.now()}_${counter}`,
      name,
      arguments: normalizedArgs,
    });

    return '';
  });

  // 3. Fallback: blocos markdown anotados explicitamente com path="src/..." (ex: ```tsx path="src/App.tsx")
  if (toolCalls.length === 0) {
    const fencedPathRegex = /```[a-zA-Z0-9_-]*\s+path\s*=\s*["']([^"']+)["'][^\n]*\n([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = fencedPathRegex.exec(text)) !== null) {
      const path = match[1].trim();
      const content = match[2].replace(/\r?\n$/, '');
      if (path) {
        counter++;
        toolCalls.push({
          id: `fenced_edit_${Date.now()}_${counter}`,
          name: 'edit_file',
          arguments: JSON.stringify({
            path,
            content,
            type: 'modified',
          }),
        });
      }
    }
  }

  if (toolCalls.length > 0) {
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n').trim();
  }

  return {
    toolCalls,
    cleanedText,
  };
}

/**
 * Gera a instrução do protocolo de ferramentas via tags XML para modelos que operam
 * sem suporte a `tools` nativo no payload OpenAI da nuvem (ex.: DeepSeek R1 Distill 32B).
 */
export function buildTextToolProtocolPrompt(
  hasActiveRepo: boolean,
  repoFullName?: string,
  branch?: string,
  mcpTools?: any[]
): string {
  const repoSection =
    hasActiveRepo && repoFullName
      ? [
          `Você está conectado ao repositório GitHub ativo EXCLUSIVO DESTA CONVERSA: "${repoFullName}" (branch "${branch || 'main'}").`,
          'Você PODE ler, inspecionar e editar arquivos diretamente neste repositório emitindo tags estruturadas na sua resposta:',
          '',
          '1. Para CRIAR ou EDITAR um arquivo no repositório (vai direto para o Source Control):',
          '<synap_edit path="caminho/do/arquivo.tsx" type="modified">',
          '...conteúdo completo do arquivo aqui...',
          '</synap_edit>',
          '(Use type="added" para novos arquivos, type="modified" para editar existentes ou type="deleted" para remover).',
          '2. Para CONSULTAR O GRAFO DE ARQUITETURA (OBRIGATÓRIO antes de editar):',
          '<synap_tool name="query_code_graph">{"focus_file": "src/App.tsx"}</synap_tool>',
          '',
          '3. Para LER arquivos, LISTAR diretórios ou BUSCAR código no repositório:',
          '<synap_tool name="read_file">{"path": "src/App.tsx"}</synap_tool>',
          '<synap_tool name="list_files">{"path": "src"}</synap_tool>',
          '<synap_tool name="search_code">{"query": "termo"}</synap_tool>',
          '<synap_tool name="run_terminal_command">{"command": "git status"}</synap_tool>',
        ].join('\n')
      : [
          'ATENÇÃO: Nenhum repositório GitHub está selecionado nesta conversa.',
          'Portanto, NÃO use <synap_edit>; forneça blocos de código em Markdown normal e informe que o usuário pode vincular um repositório no topo.',
        ].join('\n');

  const mcpList = Array.isArray(mcpTools)
    ? mcpTools
        .map((t) => {
          const fn = t?.function || t;
          if (!fn?.name) return null;
          const props = fn?.parameters?.properties
            ? Object.keys(fn.parameters.properties).join(', ')
            : '';
          return `- <synap_tool name="${fn.name}">{...}</synap_tool> — ${fn.description || 'Ferramenta MCP'}${props ? ` (parâmetros: ${props})` : ''}`;
        })
        .filter(Boolean)
    : [];

  const mcpSection =
    mcpList.length > 0
      ? [
          '',
          'FERRAMENTAS EXTERNAS MCP CONECTADAS (Model Context Protocol):',
          'Você também pode executar qualquer ferramenta MCP ativa abaixo emitindo <synap_tool name="mcp__..."> com argumentos JSON:',
          ...mcpList,
        ].join('\n')
      : '';

  const generalToolsSection = [
    'PROTOCOLO DE EXECUÇÃO DE FERRAMENTAS DO SYNAP:',
    'Sempre que precisar executar uma ferramenta geral (pesquisa web, leitura de URL, Python ou memória), emita a tag correspondente:',
    '- Pesquisa Web: <synap_tool name="web_search">{"query": "sua pesquisa"}</synap_tool>',
    '- Ler URL: <synap_tool name="fetch_url">{"url": "https://..."}</synap_tool>',
    '- Rodar Python: <synap_tool name="run_python">{"code": "print(2 + 2)"}</synap_tool>',
    '- Salvar Memória: <synap_tool name="save_memory">{"fact": "fato importante", "category": "preference"}</synap_tool>',
    mcpSection,
    '',
    'REGRA DE OURO: Quando o usuário pedir para alterar ou criar arquivos no repositório ativo, emita OBRIGATORIAMENTE o bloco <synap_edit path="..." type="..."> com o código completo em texto claro (JSX/TS/CSS). NUNCA envie código em Base64 e NUNCA tente usar o terminal para gravar arquivos.',
  ]
    .filter(Boolean)
    .join('\n');

  return `${repoSection}\n\n${generalToolsSection}`;
}

