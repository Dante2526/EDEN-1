export type RemoteDeployProvider = 'vps_webhook' | 'github_workflow' | 'cloudflare_hook';

export type RemoteActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface PendingRemoteAction {
  id: string;
  provider: RemoteDeployProvider;
  targetHost: string;
  summary: string;
  filesOrCommand: string;
  status: RemoteActionStatus;
  createdAt: number;
  resultMessage?: string;
  payload: {
    endpoint?: string;
    filePath?: string;
    fileContent?: string;
    command?: string;
    workflowId?: string;
    branch?: string;
    owner?: string;
    repo?: string;
  };
}

const REMOTE_COMMANDS_REGEX = /^\s*(?:ssh|scp|sftp|rsync|paramiko|deploy)\b/i;

/**
 * Verifica se um comando de terminal tenta enviar arquivos ou comandos para uma VPS/servidor remoto,
 * exigindo o bloqueio Hard-Gate com autorização explícita do usuário no chat.
 */
export function isRemoteCommandRequiringApproval(rawCommand: string): boolean {
  if (!rawCommand || typeof rawCommand !== 'string') return false;
  return REMOTE_COMMANDS_REGEX.test(rawCommand.trim());
}

/**
 * Constrói uma ação remota bloqueada (status = 'pending') que só pode ser disparada
 * quando o usuário clicar no botão "Autorizar e Enviar" no card do chat.
 */
export function buildPendingRemoteAction(params: {
  provider: RemoteDeployProvider;
  targetHost: string;
  summary: string;
  filesOrCommand: string;
  payload: PendingRemoteAction['payload'];
}): PendingRemoteAction {
  return {
    id: `remote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    provider: params.provider,
    targetHost: params.targetHost.trim() || 'Servidor Remoto / VPS',
    summary: params.summary.trim() || 'Envio de atualização para servidor remoto',
    filesOrCommand: params.filesOrCommand.trim(),
    status: 'pending',
    createdAt: Date.now(),
    payload: params.payload || {},
  };
}

export interface ParsedPlaywrightCommand {
  valid: boolean;
  url: string;
  waitMs?: number;
  waitForSelector?: string;
}

/**
 * Analisa comandos `playwright <url> [--wait=ms] [--selector="css"]` digitados no terminal.
 */
export function parsePlaywrightCommand(rawCommand: string): ParsedPlaywrightCommand {
  const trimmed = (rawCommand || '').trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s"']+/i);
  if (!urlMatch) {
    return { valid: false, url: '' };
  }

  const waitMatch = trimmed.match(/--wait=(\d+)/i);
  const selectorMatch = trimmed.match(/--selector=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);

  return {
    valid: true,
    url: urlMatch[0],
    waitMs: waitMatch ? parseInt(waitMatch[1], 10) : undefined,
    waitForSelector: selectorMatch ? selectorMatch[1] || selectorMatch[2] || selectorMatch[3] : undefined,
  };
}

/**
 * Monta a requisição para renderização em Chromium Headless real gratuito (Jina Reader Engine)
 * sem precisar de VPS ou binário local pesado.
 */
export function buildHeadlessRenderUrl(
  targetUrl: string,
  options?: { waitForSelector?: string; timeoutSeconds?: number }
): { url: string; headers: Record<string, string> } {
  const cleanUrl = targetUrl.trim();
  const headers: Record<string, string> = {
    'X-Return-Format': 'html',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  };

  if (options?.waitForSelector) {
    headers['X-Wait-For-Selector'] = options.waitForSelector;
  }
  if (options?.timeoutSeconds) {
    headers['X-Timeout'] = String(options.timeoutSeconds);
  }

  return {
    url: `https://r.jina.ai/${cleanUrl}`,
    headers,
  };
}
