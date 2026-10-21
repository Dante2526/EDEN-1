export interface PreviewConsoleLog {
  id: string;
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error';
  messages: string[];
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface PreviewNetworkRequest {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  type: 'fetch' | 'xhr' | 'script' | 'css' | 'image';
  error?: string;
}

export interface DevToolsEventData {
  type: '__SYNAP_DEVTOOLS_LOG__' | '__SYNAP_DEVTOOLS_NETWORK__';
  payload: any;
}

export function createConsoleLogItem(
  level: 'log' | 'info' | 'warn' | 'error',
  messages: any[],
  extra?: { source?: string; line?: number; column?: number; stack?: string }
): PreviewConsoleLog {
  const serializedMessages = (messages || []).map((m) => {
    if (typeof m === 'string') return m;
    if (m instanceof Error) return `${m.name}: ${m.message}`;
    try {
      return JSON.stringify(m);
    } catch {
      return String(m);
    }
  });

  return {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    level,
    messages: serializedMessages,
    source: extra?.source,
    line: extra?.line,
    column: extra?.column,
    stack: extra?.stack,
  };
}

export function createNetworkRequestItem(
  method: string,
  url: string,
  status: number,
  statusText: string,
  durationMs: number,
  type: 'fetch' | 'xhr' | 'script' | 'css' | 'image' = 'fetch',
  error?: string
): PreviewNetworkRequest {
  return {
    id: `net-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
    method: method ? method.toUpperCase() : 'GET',
    url,
    status,
    statusText: statusText || (status >= 200 && status < 300 ? 'OK' : 'Error'),
    durationMs: Math.max(0, Math.round(durationMs)),
    type,
    error,
  };
}

export interface DevToolsLogEvent {
  type: '__SYNAP_DEVTOOLS_LOG__';
  payload: PreviewConsoleLog;
}

export interface DevToolsNetworkEvent {
  type: '__SYNAP_DEVTOOLS_NETWORK__';
  payload: PreviewNetworkRequest;
}

export type DevToolsEvent = DevToolsLogEvent | DevToolsNetworkEvent;

export function parseDevToolsMessage(eventOrData: any): DevToolsEvent | null {
  const data = eventOrData && typeof eventOrData === 'object' && 'data' in eventOrData ? eventOrData.data : eventOrData;
  if (!data || typeof data !== 'object') return null;

  if (data.type === '__SYNAP_DEVTOOLS_LOG__' && data.payload) {
    return {
      type: '__SYNAP_DEVTOOLS_LOG__',
      payload: data.payload,
    };
  }
  if (data.type === '__SYNAP_DEVTOOLS_NETWORK__' && data.payload) {
    return {
      type: '__SYNAP_DEVTOOLS_NETWORK__',
      payload: data.payload,
    };
  }
  return null;
}

export function formatDevToolsErrorForAi(errorLog: PreviewConsoleLog): string {
  const fileLoc = errorLog.source
    ? `${errorLog.source}${errorLog.line ? `:${errorLog.line}` : ''}`
    : 'Localização desconhecida';

  const lines = [
    '⚠️ O Live Preview encontrou um erro no Console durante a execução:',
    `[Erro]: ${errorLog.messages.join(' ')}`,
    `Arquivo: ${fileLoc}`,
  ];

  if (errorLog.stack) {
    lines.push('Stack Trace:');
    lines.push('```');
    lines.push(errorLog.stack.trim());
    lines.push('```');
  }

  lines.push('');
  lines.push('Corrija o código do projeto para resolver este erro de execução.');
  return lines.join('\n');
}

export function formatDevToolsSummaryForAi(
  logs: PreviewConsoleLog[],
  requests: PreviewNetworkRequest[],
  errorsOnly?: boolean
): string {
  const parts: string[] = ['🛠️ Resumo de DevTools do Live Preview:'];

  const errors = logs.filter((l) => l.level === 'error');
  const warnings = logs.filter((l) => l.level === 'warn');
  const failedRequests = requests.filter((r) => r.status >= 400 || r.error);

  parts.push(`- Logs totais: ${logs.length} (${errors.length} erros, ${warnings.length} alertas)`);
  parts.push(`- Requisições de rede: ${requests.length} (${failedRequests.length} falhas)`);

  if (errors.length > 0) {
    parts.push('\n### Erros de Console Recentes:');
    errors.slice(-5).forEach((e, idx) => {
      const loc = e.source ? ` (${e.source}:${e.line || '?'})` : '';
      parts.push(`${idx + 1}. [ERROR] ${e.messages.join(' ')}${loc}`);
      if (e.stack) {
        parts.push(`   Stack: ${e.stack.split('\n')[0]}`);
      }
    });
  } else if (!errorsOnly && warnings.length > 0) {
    parts.push('\n### Avisos Recentes:');
    warnings.slice(-3).forEach((w, idx) => {
      parts.push(`${idx + 1}. [WARN] ${w.messages.join(' ')}`);
    });
  }

  if (failedRequests.length > 0) {
    parts.push('\n### Falhas de Rede Recentes:');
    failedRequests.slice(-5).forEach((r, idx) => {
      parts.push(`${idx + 1}. ${r.method} ${r.url} [${r.status} ${r.statusText}] (${r.durationMs}ms)`);
      if (r.error) parts.push(`   Erro: ${r.error}`);
    });
  } else if (!errorsOnly && requests.length > 0) {
    parts.push('\n### Requisições HTTP Recentes:');
    requests.slice(-3).forEach((r, idx) => {
      parts.push(`${idx + 1}. ${r.method} ${r.url} [${r.status}] (${r.durationMs}ms)`);
    });
  }

  return parts.join('\n');
}
