import { McpServer, McpTool } from './types';

export interface McpRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, any>;
}

export function buildMcpRpcRequest(
  method: string,
  params: Record<string, any> = {},
  id: number | string = Date.now()
): McpRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

/**
 * Converte a lista de ferramentas de um servidor MCP para o formato
 * OpenAI Function Calling com namespace para evitar colisão de nomes.
 */
export function convertMcpToolsToOpenAi(tools: McpTool[], serverId: string): any[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: `mcp__${serverId}__${tool.name}`,
      description: tool.description || `Ferramenta MCP: ${tool.name}`,
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {},
      },
    },
  }));
}

/**
 * Extrai texto ou formata erro de uma resposta JSON-RPC do MCP.
 */
export function parseMcpToolResponse(response: any): string {
  if (!response) return 'Sem resposta do servidor MCP.';

  if (response.error) {
    return `Erro MCP (${response.error.code || 'UNKNOWN'}): ${response.error.message || JSON.stringify(response.error)}`;
  }

  const result = response.result;
  if (!result) return JSON.stringify(response);

  // Formato MCP padrão: { content: [{ type: 'text', text: '...' }] }
  if (Array.isArray(result.content)) {
    return result.content
      .map((item: any) => {
        if (item.type === 'text') return item.text || '';
        if (item.type === 'resource') return item.resource?.text || JSON.stringify(item);
        return JSON.stringify(item);
      })
      .join('\n');
  }

  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}

/**
 * Faz o parsing de uma resposta MCP, suportando tanto application/json puro quanto Server-Sent Events (SSE: data: {...})
 */
export async function parseMcpResponsePayload(res: Response): Promise<any> {
  const text = await res.text();
  const trimmed = text.trim();

  // Se for payload SSE (começa com ou contém data: {...})
  if (trimmed.includes('data:')) {
    const lines = trimmed.split('\n');
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith('data:')) {
        const jsonStr = cleanLine.replace(/^data:\s*/, '').trim();
        if (jsonStr && jsonStr !== '[DONE]') {
          try {
            return JSON.parse(jsonStr);
          } catch {
            // Continua procurando se houver mais de uma linha de data
          }
        }
      }
    }
  }

  // Fallback: tentar JSON.parse direto
  return JSON.parse(trimmed);
}

/**
 * Testa a conectividade com um servidor MCP e descobre suas ferramentas (`tools/list`).
 */
export async function testMcpConnection(server: McpServer): Promise<{
  success: boolean;
  tools: McpTool[];
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (server.apiKey) {
      headers['Authorization'] = `Bearer ${server.apiKey}`;
    }

    const payload = buildMcpRpcRequest('tools/list', {}, 1);

    const res = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        success: false,
        tools: [],
        error: `Servidor MCP retornou status HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await parseMcpResponsePayload(res);
    if (data.error) {
      return {
        success: false,
        tools: [],
        error: `Erro RPC do MCP: ${data.error.message || JSON.stringify(data.error)}`,
      };
    }

    const rawTools = data.result?.tools || [];
    const parsedTools: McpTool[] = Array.isArray(rawTools)
      ? rawTools.map((t: any) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
      : [];

    return {
      success: true,
      tools: parsedTools,
    };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      tools: [],
      error: isTimeout ? 'Timeout ao conectar com o servidor MCP (15s)' : err.message || 'Falha de conexão',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Executa uma chamada de ferramenta remota via JSON-RPC `tools/call`.
 */
export async function executeMcpToolCall(
  server: McpServer,
  rawToolName: string,
  args: Record<string, any>
): Promise<string> {
  // Remove o namespace `mcp__<serverId>__` se estiver presente
  const cleanToolName = rawToolName.replace(new RegExp(`^mcp__${server.id}__`), '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (server.apiKey) {
      headers['Authorization'] = `Bearer ${server.apiKey}`;
    }

    const payload = buildMcpRpcRequest(
      'tools/call',
      {
        name: cleanToolName,
        arguments: args,
      },
      Date.now()
    );

    const res = await fetch(server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      return `Erro na execução da ferramenta MCP (HTTP ${res.status}): ${res.statusText}`;
    }

    const data = await parseMcpResponsePayload(res);
    return parseMcpToolResponse(data);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return 'Timeout ao executar ferramenta MCP (20s limite atingido).';
    }
    return `Falha ao executar ferramenta MCP: ${err.message || 'Erro desconhecido'}`;
  } finally {
    clearTimeout(timeoutId);
  }
}
