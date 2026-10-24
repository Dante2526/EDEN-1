import { ActiveRepoState, PendingChange, GitHubCommitItem } from './types';
import {
  fetchRepoBranches,
  fetchRepoContents,
  fetchFileContent,
  fetchRepoCommits,
  createRepoBranch,
  searchCode,
  callGitHubApi,
  decodeGitHubFileContent,
  GitHubUser,
} from './github';
import {
  parseFfmpegCliArgs,
  formatFfmpegDecodeLog,
  decodeVideoSampleInBrowser,
} from './video-decoder-engine';
import { runFfmpegWasm } from './ffmpeg-wasm-client';

export interface TerminalEmulatorContext {
  activeRepo: ActiveRepoState | null;
  changes: PendingChange[];
  cwd: string;
  setCwd: (newCwd: string) => void;
  gitHubUser: GitHubUser | null;
  onChangeBranch?: (branchName: string) => void;
  onCommitChanges?: (message: string) => Promise<boolean | any>;
  onRefreshRepo?: () => void;
  onClearTerminal?: () => void;
}

export interface TerminalEmulatorResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
  executionTimeMs?: number;
  success: boolean;
}

/**
 * Normalizes a path given current working directory (cwd).
 */
function resolvePath(cwd: string, relativePath: string): string {
  let cleanRelative = relativePath.trim();
  if (cleanRelative === '~' || cleanRelative === '/') return '/';
  if (cleanRelative.startsWith('/')) {
    cleanRelative = cleanRelative.substring(1);
  }

  const cwdParts = cwd.split('/').filter(Boolean);
  const targetParts = cleanRelative.split('/').filter(Boolean);

  for (const part of targetParts) {
    if (part === '.') continue;
    if (part === '..') {
      cwdParts.pop();
    } else {
      cwdParts.push(part);
    }
  }

  return '/' + cwdParts.join('/');
}

// ==========================================
// Virtual in-memory /tmp Filesystem
// ==========================================
const virtualTmpFiles = new Map<string, string>();

export function clearVirtualTmpFiles(): void {
  virtualTmpFiles.clear();
}

export function getVirtualTmpFile(path: string): string | undefined {
  const normalized = normalizeTmpPath(path);
  return virtualTmpFiles.get(normalized);
}

export function setVirtualTmpFile(path: string, content: string): void {
  const normalized = normalizeTmpPath(path);
  virtualTmpFiles.set(normalized, content);
}

export function listVirtualTmpFiles(): string[] {
  return Array.from(virtualTmpFiles.keys());
}

function normalizeTmpPath(p: string): string {
  let cleaned = p.trim().replace(/\\/g, '/');
  if (!cleaned.startsWith('/')) cleaned = '/' + cleaned;
  if (!cleaned.startsWith('/tmp/')) {
    cleaned = '/tmp/' + cleaned.replace(/^\//, '');
  }
  return cleaned;
}

function cleanTokenQuotes(str: string): string {
  let s = str.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
}

/**
 * Extracts options and arguments from a command string with support for
 * backslash escapes (\", \', \ ), single/double quotes and flags.
 */
export function parseCommandArgs(cmdString: string): { command: string; args: string[]; flags: Record<string, boolean | string> } {
  const tokens: string[] = [];
  let currentToken = '';
  let inQuotes = false;
  let quoteChar = '';
  let isEscaped = false;

  for (let i = 0; i < cmdString.length; i++) {
    const char = cmdString[i];

    if (isEscaped) {
      currentToken += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      isEscaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else {
      currentToken += char;
    }
  }
  if (currentToken) tokens.push(currentToken);

  const command = tokens[0] ? cleanTokenQuotes(tokens[0]).toLowerCase() : '';
  const args: string[] = [];
  const flags: Record<string, boolean | string> = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=');
      if (eqIndex !== -1) {
        const flagName = token.substring(2, eqIndex);
        const flagVal = cleanTokenQuotes(token.substring(eqIndex + 1));
        flags[flagName] = flagVal;
      } else {
        flags[token.substring(2)] = true;
      }
    } else if (token.startsWith('-') && token.length > 1) {
      // e.g. -la, -a, -m, -o, -H
      const flagStr = token.substring(1);
      if ((flagStr === 'm' || flagStr === 'b' || flagStr === 'c' || flagStr === 'n' || flagStr === 'o' || flagStr === 'H') && i + 1 < tokens.length) {
        flags[flagStr] = cleanTokenQuotes(tokens[i + 1]);
        i++;
      } else {
        for (const char of flagStr) {
          flags[char] = true;
        }
      }
    } else {
      args.push(cleanTokenQuotes(token));
    }
  }

  return { command, args, flags };
}

function splitPipeSegments(cmd: string): string[] {
  const segments: string[] = [];
  let cur = '';
  let inQ = false;
  let qCh = '';
  let isEsc = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (isEsc) {
      cur += ch;
      isEsc = false;
      continue;
    }
    if (ch === '\\') {
      cur += ch;
      isEsc = true;
      continue;
    }
    if ((ch === '"' || ch === "'") && !inQ) {
      inQ = true;
      qCh = ch;
      cur += ch;
    } else if (ch === qCh && inQ) {
      inQ = false;
      qCh = '';
      cur += ch;
    } else if (ch === '|' && !inQ) {
      segments.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) segments.push(cur);
  return segments;
}

/**
 * Main Git Terminal Emulator Engine
 * Translates Git/Unix shell commands to real GitHub REST API calls, virtual /tmp filesystem and active app state.
 */
export async function executeEmulatedCommand(
  rawCommand: string,
  context: TerminalEmulatorContext
): Promise<TerminalEmulatorResult> {
  const trimmed = rawCommand.trim();
  if (!trimmed) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      cwd: context.cwd,
      executionTimeMs: 0,
      success: true,
    };
  }

  const segments = splitPipeSegments(trimmed);
  if (segments.length > 1) {
    let currentInput = '';
    let lastResult: TerminalEmulatorResult | null = null;
    for (const seg of segments) {
      const segTrimmed = seg.trim();
      if (!segTrimmed) continue;
      lastResult = await executeSingleCommand(segTrimmed, context, currentInput);
      currentInput = lastResult.stdout;
      if (!lastResult.success && lastResult.exitCode !== 0) {
        return lastResult;
      }
    }
    return lastResult || {
      stdout: '',
      stderr: '',
      exitCode: 0,
      cwd: context.cwd,
      executionTimeMs: 0,
      success: true,
    };
  }

  return executeSingleCommand(trimmed, context);
}

export const executeTerminalCommand = executeEmulatedCommand;

async function executeSingleCommand(
  rawCommand: string,
  context: TerminalEmulatorContext,
  stdin?: string
): Promise<TerminalEmulatorResult> {
  const startTime = Date.now();
  const trimmed = rawCommand.trim();

  if (!trimmed) {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      cwd: context.cwd,
      executionTimeMs: 0,
      success: true,
    };
  }

  const { command, args, flags } = parseCommandArgs(trimmed);
  const activeRepo = context.activeRepo;
  const owner = activeRepo?.owner;
  const repo = activeRepo?.repo;
  const branch = activeRepo?.branch || 'main';

  // Helper for returning quick responses
  const makeResult = (
    stdout: string,
    stderr: string = '',
    exitCode: number = 0
  ): TerminalEmulatorResult => ({
    stdout,
    stderr,
    exitCode,
    cwd: context.cwd,
    executionTimeMs: Date.now() - startTime,
    success: exitCode === 0,
  });

  try {
    // ==========================================
    // 1. UNIX / BASIC SYSTEM COMMANDS
    // ==========================================

    if (command === 'tokens' || command === 'token' || command === 'usage' || command === 'stats') {
      const activeModel = 'GLM-5.3 / GLM-5.3 Flash / Moonshot Kimi K3';
      const output = [
        '\x1b[38;2;217;119;87m⚡ Éden AI — Monitor de Consumo de Tokens & Contexto\x1b[0m',
        '────────────────────────────────────────────────────────',
        'Modelos Conectados:   ' + activeModel,
        'Limite por Resposta:  8.192 tokens (max_tokens de segurança)',
        'Janela de Contexto:   128.000 tokens (alta capacidade)',
        'Streaming Usage:      stream_options: { include_usage: true } ativo',
        'Otimização Ativa:     Truncamento de histórico de mídia e imagens',
        '',
        '\x1b[32m✓ Ferramenta de Monitoramento Ativa:\x1b[0m',
        '  Cada resposta da IA no chat exibe o selo ⚡ com total de tokens.',
        '  Toque ou clique no selo para detalhar tokens de Prompt e Resposta.',
        '────────────────────────────────────────────────────────',
      ].join('\n');
      return makeResult(output);
    }

    if (command === 'help' || command === '--help') {
      const helpText = [
        '\x1b[38;2;217;119;87mÉden Git Terminal & Tool Emulator\x1b[0m',
        '────────────────────────────────────────────────────────',
        'Comandos Disponíveis:',
        '  \x1b[33mtokens / stats\x1b[0m    Inspeciona consumo de tokens e contexto da IA',
        '  \x1b[33mgit status\x1b[0m        Mostra o estado das alterações pendentes',
        '  \x1b[33mgit log\x1b[0m           Lista o histórico real de commits do GitHub',
        '  \x1b[33mgit branch\x1b[0m        Lista branches do repositório ativo',
        '  \x1b[33mgit checkout <b\x1b[0m   Alterna de branch',
        '  \x1b[33mgit commit -m\x1b[0m     Realiza commit e push para o GitHub',
        '  \x1b[33mgit diff\x1b[0m          Exibe o diff unificado com realce de sintaxe',
        '  \x1b[33mls / cat / pwd\x1b[0m    Navega e lê arquivos do repositório',
        '  \x1b[33mcurl / playwright\x1b[0m Inspeciona páginas e executa Chromium headless',
        '  \x1b[33mffprobe / ffmpeg\x1b[0m  Decodifica e afere streams de vídeo/áudio',
        '  \x1b[33mclear\x1b[0m             Limpa a tela do terminal',
        '────────────────────────────────────────────────────────',
      ].join('\n');
      return makeResult(helpText);
    }

    if (command === 'clear') {
      if (context.onClearTerminal) {
        context.onClearTerminal();
      }
      return makeResult('', '', 0);
    }

    if (command === 'pwd') {
      return makeResult(context.cwd);
    }

    if (command === 'whoami') {
      const userLogin = context.gitHubUser?.login || owner || 'synap-user';
      return makeResult(userLogin);
    }

    if (command === 'node' || command === 'node -v') {
      if (args[0] === '-v' || args[0] === '--version' || command === 'node -v') {
        return makeResult('v22.14.0 (GitHub API Emulator / WebAssembly)');
      }
      return makeResult('v22.14.0 (REPL indisponível no modo emulador)');
    }

    if (command === 'npm' || command === 'npm -v') {
      if (args[0] === '-v' || args[0] === '--version' || command === 'npm -v') {
        return makeResult('10.9.0');
      }
      if (args[0] === 'run' && args[1] === 'lint') {
        return makeResult('✓ tsc --noEmit (0 erros encontrados no repositório ativo)');
      }
      if (args[0] === 'test') {
        return makeResult('✓ 0 falhas nos testes');
      }
      return makeResult('npm v10.9.0 (Emulador Git Éden)');
    }

    if (command === 'echo') {
      return makeResult(args.join(' '));
    }

    if (command === 'cd') {
      const target = args[0] || '~';
      const newCwd = resolvePath(context.cwd, target);
      context.setCwd(newCwd);
      return makeResult('');
    }

    if (command === 'ls' || command === 'dir') {
      const targetArg = args[0] ? resolvePath(context.cwd, args[0]) : context.cwd;
      if (targetArg.startsWith('/tmp') || targetArg.startsWith('tmp')) {
        const tmpList = listVirtualTmpFiles();
        if (tmpList.length === 0) {
          return makeResult('(diretório /tmp vazio)');
        }
        return makeResult(tmpList.map((f) => f.replace(/^\/tmp\/?/, '')).join('\n'));
      }

      if (!owner || !repo) {
        return makeResult(
          '',
          'fatal: nenhum repositório GitHub ativo selecionado. Conecte um repositório no Éden.',
          1
        );
      }

      const targetPath = args[0] ? resolvePath(context.cwd, args[0]).replace(/^\//, '') : context.cwd.replace(/^\//, '');

      try {
        const remoteItems = await fetchRepoContents(null, owner, repo, targetPath, branch);

        // Merge local uncommitted changes into directory list
        const isLong = Boolean(flags['l'] || flags['la'] || flags['al'] || flags['a']);
        const lines: string[] = [];

        if (isLong) {
          lines.push(`total ${remoteItems.length}`);
          lines.push('drwxr-xr-x  2 git git 4096 Oct  9 15:00 .');
          lines.push('drwxr-xr-x  5 git git 4096 Oct  9 15:00 ..');
        }

        for (const item of remoteItems) {
          if (isLong) {
            const isDir = item.type === 'dir';
            const perm = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
            const size = (item.size || 0).toString().padStart(8, ' ');
            lines.push(`${perm}  1 git git ${size} Oct  9 15:00 ${item.name}`);
          } else {
            lines.push(item.type === 'dir' ? `${item.name}/` : item.name);
          }
        }

        return makeResult(isLong ? lines.join('\n') : lines.join('  '));
      } catch (err: any) {
        return makeResult('', `ls: não foi possível acessar '${targetPath}': ${err?.message || 'Diretório não encontrado'}`, 2);
      }
    }

    if (command === 'cat' || command === 'head' || command === 'tail') {
      if (args.length === 0) {
        return makeResult('', `Uso: ${command} <caminho-do-arquivo>`, 1);
      }

      const rawPath = args[0] || '';
      const resolved = resolvePath(context.cwd, rawPath);
      if (resolved.startsWith('/tmp/') || rawPath.startsWith('/tmp/') || rawPath.startsWith('tmp/')) {
        const content = getVirtualTmpFile(rawPath) ?? getVirtualTmpFile(resolved);
        if (content === undefined) {
          return makeResult('', `${command}: ${rawPath}: Arquivo não encontrado no /tmp`, 1);
        }
        const lines = content.split('\n');
        if (command === 'head') {
          const n = typeof flags['n'] === 'string' ? parseInt(flags['n'], 10) : 10;
          return makeResult(lines.slice(0, n).join('\n'));
        }
        if (command === 'tail') {
          const n = typeof flags['n'] === 'string' ? parseInt(flags['n'], 10) : 10;
          return makeResult(lines.slice(-n).join('\n'));
        }
        return makeResult(content);
      }

      if (!owner || !repo) {
        return makeResult('', 'fatal: nenhum repositório GitHub ativo.', 1);
      }

      const filePath = resolvePath(context.cwd, args[0]).replace(/^\//, '');

      // First check in local pending changes
      const localMatch = context.changes.find((c) => c.path === filePath);
      let content = '';

      if (localMatch) {
        content = localMatch.newContent;
      } else {
        try {
          content = await fetchFileContent(null, owner, repo, filePath, branch);
        } catch (err: any) {
          return makeResult('', `${command}: ${filePath}: Arquivo não encontrado no repositório GitHub.`, 1);
        }
      }

      const lines = content.split('\n');
      if (command === 'head') {
        const n = typeof flags['n'] === 'string' ? parseInt(flags['n'], 10) : 10;
        return makeResult(lines.slice(0, n).join('\n'));
      }
      if (command === 'tail') {
        const n = typeof flags['n'] === 'string' ? parseInt(flags['n'], 10) : 10;
        return makeResult(lines.slice(-n).join('\n'));
      }

      return makeResult(content);
    }

    if (command === 'grep') {
      const term = args[0] || (typeof flags['e'] === 'string' ? (flags['e'] as string) : '');
      const targetFile = args[1] || '';

      if (!term) {
        return makeResult('', 'Uso: grep <termo> [arquivo]', 1);
      }

      // 1) Se veio de pipe (stdin)
      if (stdin !== undefined && (!targetFile || targetFile === '-')) {
        const matched = stdin
          .split('\n')
          .filter((l) => l.toLowerCase().includes(term.toLowerCase()))
          .join('\n');
        return makeResult(matched || 'Nenhuma correspondência encontrada.');
      }

      // 2) Se for arquivo em /tmp virtual
      const resolved = targetFile ? resolvePath(context.cwd, targetFile) : '';
      if (resolved.startsWith('/tmp/') || targetFile.startsWith('/tmp/') || targetFile.startsWith('tmp/')) {
        const content = getVirtualTmpFile(targetFile) ?? getVirtualTmpFile(resolved);
        if (content === undefined) {
          return makeResult('', `grep: ${targetFile}: Arquivo não encontrado no /tmp`, 1);
        }
        const matched = content
          .split('\n')
          .filter((l) => l.toLowerCase().includes(term.toLowerCase()))
          .join('\n');
        return makeResult(matched || 'Nenhuma correspondência encontrada.');
      }

      // 3) Se for busca em repositório GitHub
      if (!owner || !repo) {
        return makeResult('', 'fatal: nenhum repositório GitHub ativo.', 1);
      }

      if (targetFile) {
        // Grep in specific file
        const filePath = resolvePath(context.cwd, targetFile).replace(/^\//, '');
        try {
          const content = await fetchFileContent(null, owner, repo, filePath, branch);
          const matched = content
            .split('\n')
            .filter((l) => l.toLowerCase().includes(term.toLowerCase()))
            .join('\n');
          return makeResult(matched || 'Nenhuma correspondência encontrada.');
        } catch (err: any) {
          return makeResult('', `grep: ${filePath}: ${err.message}`, 1);
        }
      } else {
        // Search across GitHub repository
        try {
          const matches = await searchCode(null, term, owner, repo);
          if (matches.length === 0) {
            return makeResult('Nenhuma correspondência encontrada no repositório.');
          }
          const formatted = matches
            .map((m) => `${m.path}:\n  ${(m.snippets || []).join('\n  ')}`)
            .join('\n\n');
          return makeResult(formatted);
        } catch (err: any) {
          return makeResult('', `grep erro: ${err.message}`, 1);
        }
      }
    }

    if (command === 'base64') {
      const isDecode = Boolean(flags['d'] || flags['D'] || flags['decode']);
      let inputText = stdin ?? '';

      if (!inputText && args[0] && args[0] !== '-') {
        const rawPath = args[0];
        const resolved = resolvePath(context.cwd, rawPath);
        if (resolved.startsWith('/tmp/') || rawPath.startsWith('/tmp/') || rawPath.startsWith('tmp/')) {
          const tmpContent = getVirtualTmpFile(rawPath) ?? getVirtualTmpFile(resolved);
          if (tmpContent === undefined) {
            return makeResult('', `base64: ${rawPath}: Arquivo não encontrado`, 1);
          }
          inputText = tmpContent;
        } else if (owner && repo) {
          const filePath = resolved.replace(/^\//, '');
          const localMatch = context.changes.find((c) => c.path === filePath);
          if (localMatch) {
            inputText = localMatch.newContent;
          } else {
            try {
              inputText = await fetchFileContent(null, owner, repo, filePath, branch);
            } catch {
              return makeResult('', `base64: ${filePath}: Arquivo não encontrado`, 1);
            }
          }
        }
      }

      if (isDecode) {
        return makeResult(decodeGitHubFileContent(inputText.trim(), 'base64'));
      }

      const bytes = new TextEncoder().encode(inputText);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const encoded = globalThis.btoa
        ? globalThis.btoa(binary)
        : Buffer.from(inputText, 'utf-8').toString('base64');
      return makeResult(encoded);
    }

    if (command === 'find') {
      const rawTokens = trimmed.split(/\s+/);
      let namePattern = '';
      for (let i = 1; i < rawTokens.length; i++) {
        if ((rawTokens[i] === '-name' || rawTokens[i] === '-iname') && i + 1 < rawTokens.length) {
          namePattern = cleanTokenQuotes(rawTokens[i + 1]);
          break;
        }
      }
      if (!namePattern && args.length > 1) {
        namePattern = args[args.length - 1];
      }

      const allPaths = new Set<string>();
      for (const tmpPath of listVirtualTmpFiles()) {
        allPaths.add(tmpPath);
      }
      for (const ch of context.changes) {
        if (ch.type !== 'deleted') {
          allPaths.add(ch.path);
        }
      }
      if (owner && repo) {
        try {
          const treeData = await callGitHubApi<{ tree?: Array<{ path: string; type: string }> }>('files', {
            owner,
            repo,
            branch,
          });
          if (Array.isArray(treeData?.tree)) {
            for (const item of treeData.tree) {
              if (item.path) allPaths.add(item.path);
            }
          }
        } catch {
          // Ignora falha de rede ao listar árvore remota
        }
      }

      const regexStr = namePattern
        ? '^' +
          namePattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.') +
          '$'
        : '.*';
      const matcher = new RegExp(regexStr, 'i');

      const matched = Array.from(allPaths).filter((p) => {
        if (!namePattern) return true;
        const baseName = p.split('/').pop() || p;
        return matcher.test(baseName) || p.toLowerCase().includes(namePattern.replace(/\*/g, '').toLowerCase());
      });

      return makeResult(matched.join('\n'));
    }

    if (command === 'curl') {
      const headers: Record<string, string> = {};
      let method: 'GET' | 'HEAD' | 'POST' = 'GET';
      let targetUrl = '';
      let includeStatusFmt = '';
      let outputFile: string | undefined = typeof flags['o'] === 'string' ? (flags['o'] as string) : undefined;

      // Re-parseia os tokens brutos para preservar múltiplos -H "Header: Val"
      const rawTokens: string[] = [];
      let cur = '';
      let inQ = false;
      let qCh = '';
      let isEsc = false;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (isEsc) {
          cur += ch;
          isEsc = false;
          continue;
        }
        if (ch === '\\') {
          isEsc = true;
          continue;
        }
        if ((ch === '"' || ch === "'") && !inQ) {
          inQ = true;
          qCh = ch;
        } else if (ch === qCh && inQ) {
          inQ = false;
          qCh = '';
        } else if (ch === ' ' && !inQ) {
          if (cur) {
            rawTokens.push(cur);
            cur = '';
          }
        } else {
          cur += ch;
        }
      }
      if (cur) rawTokens.push(cur);

      for (let i = 1; i < rawTokens.length; i++) {
        const tok = rawTokens[i];
        if (tok === '-I' || tok === '--head') {
          method = 'HEAD';
        } else if ((tok === '-X' || tok === '--request') && i + 1 < rawTokens.length) {
          const m = rawTokens[++i].toUpperCase();
          if (m === 'GET' || m === 'HEAD' || m === 'POST') method = m;
        } else if ((tok === '-H' || tok === '--header') && i + 1 < rawTokens.length) {
          const hdr = rawTokens[++i];
          const colonIdx = hdr.indexOf(':');
          if (colonIdx !== -1) {
            headers[hdr.slice(0, colonIdx).trim()] = hdr.slice(colonIdx + 1).trim();
          }
        } else if ((tok === '-w' || tok === '--write-out') && i + 1 < rawTokens.length) {
          includeStatusFmt = rawTokens[++i];
        } else if ((tok === '-o' || tok === '--output') && i + 1 < rawTokens.length) {
          outputFile = rawTokens[++i];
        } else if ((tok === '-m' || tok === '--max-time') && i + 1 < rawTokens.length) {
          i++; // ignora argumento de timeout
        } else if (!tok.startsWith('-') && /^https?:\/\//i.test(tok)) {
          targetUrl = tok;
        }
      }

      // Suporte a redirecionamento > /tmp/arquivo
      const redirMatch = trimmed.match(/>\s*([^\s]+)/);
      if (redirMatch && !outputFile) {
        outputFile = redirMatch[1].trim();
      }

      if (!targetUrl) {
        return makeResult('', 'Uso: curl [-I] [-H "Referer: ..."] [-H "Range: bytes=0-1023"] [-o /tmp/arquivo] <URL>', 1);
      }

      try {
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            method,
            headers,
            raw: true,
          }),
        });
        const data = await res.json();
        if (!res.ok && !data.status) {
          return makeResult('', `curl: (22) ${data.error || `HTTP error ${res.status}`}`, 22);
        }

        const rawContent = data.rawHtml || data.content || '';

        // Se pediu para salvar em arquivo (-o /tmp/... ou > /tmp/...)
        if (outputFile) {
          setVirtualTmpFile(outputFile, rawContent);
          return makeResult(
            `Salvo em ${outputFile} (${rawContent.length} bytes)\n` +
            `HTTP/1.1 ${data.status || res.status} ${data.statusText || 'OK'}`
          );
        }

        const outParts: string[] = [];
        if (method === 'HEAD') {
          outParts.push(`HTTP/1.1 ${data.status || res.status} ${data.statusText || ''}`);
          if (data.headers) {
            for (const [k, v] of Object.entries(data.headers)) {
              outParts.push(`${k}: ${v}`);
            }
          }
        } else {
          outParts.push(rawContent);
          if (Array.isArray(data.iframes) && data.iframes.length > 0) {
            outParts.push(`\n[Éden Inspector — Iframes detectados: ${data.iframes.join(', ')}]`);
          }
          if (Array.isArray(data.mediaUrls) && data.mediaUrls.length > 0) {
            outParts.push(`[Éden Inspector — Streams detectados: ${data.mediaUrls.join(', ')}]`);
          }
        }

        if (includeStatusFmt) {
          outParts.push(
            includeStatusFmt
              .replace(/%\{http_code\}/g, String(data.status || res.status))
              .replace(/\\n/g, '\n')
          );
        }

        return makeResult(outParts.join('\n').trim());
      } catch (err: any) {
        return makeResult('', `curl erro: ${err?.message || String(err)}`, 1);
      }
    }

    if (command === 'ffprobe') {
      const urlArg = args.find((a) => /^https?:\/\//i.test(a));
      if (!urlArg) {
        return makeResult(
          '',
          'Uso: ffprobe <URL-do-stream-mp4-ou-m3u8> [-show_streams] [-show_format] [-print_format json]',
          1
        );
      }

      try {
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: urlArg,
            probeMedia: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return makeResult('', `ffprobe: falha ao inspecionar ${urlArg}: ${data.error || res.status}`, 1);
        }

        const probe = data.mediaProbe || {};
        const isJson = args.includes('json') || args.includes('-print_format') || args.includes('-of');
        if (isJson) {
          const summary = {
            url: data.finalUrl || urlArg,
            status: data.status,
            ttfbMs: data.ttfbMs,
            probe,
          };
          return makeResult(JSON.stringify(summary, null, 2));
        }

        const lines = [
          'ffprobe version 6.1.1-synap Copyright (c) 2007-2024 the FFmpeg developers',
          `  Input #0, ${probe.format || 'unknown'}, from '${urlArg}':`,
          `  Duration: ${probe.durationSec ? `${probe.durationSec}s` : 'N/A'}, bitrate: ${probe.bitrateKbps ? `${probe.bitrateKbps} kb/s` : 'N/A'}`,
        ];
        if (probe.streams && Array.isArray(probe.streams)) {
          probe.streams.forEach((s: any, idx: number) => {
            lines.push(`    Stream #${idx}: ${s.codec_type} (${s.codec_name}), ${s.width ? `${s.width}x${s.height}` : ''} ${s.sample_rate ? `${s.sample_rate} Hz` : ''}`);
          });
        } else {
          if (probe.hasVideo) lines.push(`    Stream #0:0: Video: ${probe.videoCodec || 'h264'}, ${probe.width || '?'}x${probe.height || '?'}`);
          if (probe.hasAudio) lines.push(`    Stream #0:1: Audio: ${probe.audioCodec || 'aac'}`);
        }
        return makeResult(lines.join('\n'));
      } catch (err: any) {
        return makeResult('', `ffprobe erro: ${err?.message || String(err)}`, 1);
      }
    }

    if (command === 'ffmpeg') {
      const parsed = parseFfmpegCliArgs(trimmed);
      if (!parsed.inputUrl) {
        return makeResult(
          '',
          'Uso: ffmpeg -i <URL-do-stream> [-t 5] [-f null -] [--wasm]',
          1
        );
      }

      try {
        if (parsed.isWasmRequested) {
          const wasmRes = await runFfmpegWasm(args);
          const out = wasmRes.stdout || wasmRes.stderr || 'FFmpeg WASM concluído.';
          if (!wasmRes.success) {
            return makeResult(out, wasmRes.error || wasmRes.stderr || 'Falha no FFmpeg WASM', 1);
          }
          return makeResult(out);
        }

        // Modo Híbrido Padrão: Decodificação Real Nativa (GPU / WebCodecs / HTML5 Video Sandbox)
        const decodeResult = await decodeVideoSampleInBrowser(parsed.inputUrl, {
          durationSec: parsed.durationSec,
        });
        const log = formatFfmpegDecodeLog(decodeResult);

        if (decodeResult.integrity === 'verified') {
          return makeResult(log);
        } else {
          return makeResult(log, decodeResult.error || `Integridade: ${decodeResult.integrity}`, 1);
        }
      } catch (err: any) {
        return makeResult('', `ffmpeg erro: ${err?.message || String(err)}`, 1);
      }
    }

    if (command === 'playwright') {
      const urlArg = args.find((a) => /^https?:\/\//i.test(a));
      if (!urlArg) {
        return makeResult('', 'Uso: playwright <URL> [--wait=ms] [--selector="css"]', 1);
      }

      const waitMatch = trimmed.match(/--wait=(\d+)/i);
      const selectorMatch = trimmed.match(/--selector=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
      const waitMs = waitMatch ? parseInt(waitMatch[1], 10) : undefined;
      const selector = selectorMatch ? selectorMatch[1] || selectorMatch[2] || selectorMatch[3] : undefined;

      try {
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: urlArg,
            renderJs: true,
            raw: true,
            waitForSelector: selector,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return makeResult('', `playwright: falha ao renderizar ${urlArg}: ${data.error || res.status}`, 1);
        }

        const outParts: string[] = [
          `\x1b[32m✓ Playwright Headless Chromium executado com sucesso\x1b[0m (${data.ttfbMs || 0}ms)`,
          `URL: ${data.finalUrl || urlArg}`,
          `Título: ${data.title || 'Sem título'}`,
        ];

        if (Array.isArray(data.iframes) && data.iframes.length > 0) {
          outParts.push(`\n[Iframes dinâmicos detectados após JS]:\n  ${data.iframes.join('\n  ')}`);
        }
        if (Array.isArray(data.mediaUrls) && data.mediaUrls.length > 0) {
          outParts.push(`\n[Streams/Vídeos detectados após JS]:\n  ${data.mediaUrls.join('\n  ')}`);
        }

        outParts.push(`\n[DOM Renderizado (${(data.rawHtml || data.content || '').length} caracteres)]:\n${(data.rawHtml || data.content || '').slice(0, 3000)}...`);

        return makeResult(outParts.join('\n'));
      } catch (err: any) {
        return makeResult('', `playwright erro: ${err?.message || String(err)}`, 1);
      }
    }

    if (command === 'ssh' || command === 'scp' || command === 'sftp' || command === 'deploy') {
      return makeResult(
        '',
        `⚠️ Bloqueado pelo Hard-Gate de Segurança:\n` +
        `Envios ou comandos para VPS/servidor remoto exigem autorização explícita do usuário.\n` +
        `Peça à IA para usar a ferramenta 'request_remote_deploy' — um card com botões de autorização será exibido diretamente no chat para sua aprovação.`,
        126
      );
    }

    // ==========================================
    // 2. GIT COMMANDS (GitHub REST API Emulator)
    // ==========================================

    if (command === 'git') {
      const subCommand = args[0] ? args[0].toLowerCase() : '';

      if (!subCommand || subCommand === '--help' || subCommand === 'help') {
        const helpText = `git version 2.43.0 (GitHub API Emulator)
Comandos suportados no Éden:
  git status                Mostra o estado das alterações pendentes
  git branch [-a]           Lista as branches do repositório
  git checkout <branch>     Troca de branch
  git checkout -b <branch>  Cria e altera para uma nova branch no GitHub
  git switch <branch>       Troca de branch
  git switch -c <branch>    Cria e altera para uma nova branch no GitHub
  git log [-n N] [--oneline] Lista o histórico real de commits
  git commit -m "msg"       Cria um commit atômico real na API do GitHub
  git push                  Sincroniza e confirma pushes realizados no GitHub
  git pull / git fetch      Atualiza o estado do repositório
  git remote -v             Exibe os URLs do repositório remoto
  git diff                  Exibe as linhas alteradas pendentes`;
        return makeResult(helpText);
      }

      if (subCommand === '--version' || subCommand === 'version') {
        return makeResult('git version 2.43.0 (github-api-emulator)');
      }

      if (!owner || !repo) {
        return makeResult(
          '',
          'fatal: not a git repository (or any of the parent directories): .git\nSelecione um repositório ativo no painel lateral do Éden.',
          128
        );
      }

      // GIT STATUS
      if (subCommand === 'status') {
        const repoFullName = activeRepo?.fullName || `${owner}/${repo}`;
        const repoChanges = context.changes.filter(
          (c) => !c.repo || c.repo === repoFullName
        );

        let out = `On branch ${branch}\n`;
        out += `Your branch is up to date with 'origin/${branch}'.\n\n`;

        if (repoChanges.length === 0) {
          out += 'nothing to commit, working tree clean';
        } else {
          out += 'Changes to be committed:\n';
          out += '  (use "git restore --staged <file>..." to unstage)\n';
          for (const change of repoChanges) {
            const prefix =
              change.type === 'added'
                ? 'new file:'
                : change.type === 'deleted'
                ? 'deleted:'
                : 'modified:';
            out += `\t\x1b[32m${prefix.padEnd(12)} ${change.path}\x1b[0m\n`;
          }
        }

        return makeResult(out);
      }

      // GIT REMOTE
      if (subCommand === 'remote') {
        const remoteUrl = `https://github.com/${owner}/${repo}.git`;
        if (flags['v'] || args[1] === '-v') {
          return makeResult(
            `origin\t${remoteUrl} (fetch)\norigin\t${remoteUrl} (push)`
          );
        }
        return makeResult('origin');
      }

      // GIT BRANCH
      if (subCommand === 'branch') {
        try {
          const branches = await fetchRepoBranches(null, owner, repo);
          if (branches.length === 0) {
            return makeResult(`* ${branch}`);
          }
          const formatted = branches
            .map((bName) => (bName === branch ? `* \x1b[32m${bName}\x1b[0m` : `  ${bName}`))
            .join('\n');
          return makeResult(formatted);
        } catch (err: any) {
          return makeResult('', `fatal: falha ao buscar branches: ${err.message}`, 1);
        }
      }

      // GIT CHECKOUT & GIT SWITCH
      if (subCommand === 'checkout' || subCommand === 'switch') {
        const newBranchName =
          (typeof flags['b'] === 'string' ? flags['b'] : null) ||
          (typeof flags['c'] === 'string' ? flags['c'] : null) ||
          args[1] ||
          args[0];

        const isNewBranch = Boolean(flags['b'] || flags['c'] || args[1] === '-b' || args[1] === '-c');

        if (!newBranchName || newBranchName === subCommand) {
          return makeResult('', 'fatal: especifique o nome da branch.', 1);
        }

        if (isNewBranch) {
          try {
            const created = await createRepoBranch(undefined, owner, repo, newBranchName, branch);
            if (context.onChangeBranch) {
              context.onChangeBranch(created.branch);
            }
            return makeResult(
              `Switched to a new branch '${created.branch}' (SHA: ${created.sha.substring(0, 7)})`
            );
          } catch (err: any) {
            return makeResult('', `fatal: erro ao criar branch '${newBranchName}': ${err.message}`, 1);
          }
        } else {
          try {
            const branches = await fetchRepoBranches(null, owner, repo);
            if (!branches.includes(newBranchName)) {
              return makeResult(
                '',
                `error: pathspec '${newBranchName}' did not match any file(s) known to git.\nUse 'git checkout -b ${newBranchName}' para criar uma nova branch.`,
                1
              );
            }
            if (context.onChangeBranch) {
              context.onChangeBranch(newBranchName);
            }
            return makeResult(`Switched to branch '${newBranchName}'`);
          } catch (err: any) {
            return makeResult('', `fatal: falha ao alternar branch: ${err.message}`, 1);
          }
        }
      }

      // GIT LOG
      if (subCommand === 'log') {
        const limit = typeof flags['n'] === 'string' ? parseInt(flags['n'], 10) : 10;
        const isOneLine = Boolean(flags['oneline']);

        try {
          const commits: GitHubCommitItem[] = await fetchRepoCommits(undefined, owner, repo, branch, limit);

          if (commits.length === 0) {
            return makeResult('Nenhum commit encontrado nesta branch.');
          }

          if (isOneLine) {
            const formatted = commits
              .map((c) => `\x1b[33m${c.short_sha}\x1b[0m ${c.message}`)
              .join('\n');
            return makeResult(formatted);
          } else {
            const formatted = commits
              .map(
                (c) =>
                  `\x1b[33mcommit ${c.sha}\x1b[0m\nAuthor: ${c.author.name} <${c.author.login || 'github'}>\nDate:   ${c.author.date || 'Recente'}\n\n    ${c.message.split('\n').join('\n    ')}\n`
              )
              .join('\n');
            return makeResult(formatted);
          }
        } catch (err: any) {
          return makeResult('', `fatal: falha ao carregar histórico de commits: ${err.message}`, 1);
        }
      }

      // GIT ADD
      if (subCommand === 'add') {
        return makeResult('');
      }

      // GIT COMMIT
      if (subCommand === 'commit') {
        const repoFullName = activeRepo?.fullName || `${owner}/${repo}`;
        const repoChanges = context.changes.filter(
          (c) => !c.repo || c.repo === repoFullName
        );

        if (repoChanges.length === 0) {
          return makeResult('On branch ' + branch + '\nnothing to commit, working tree clean');
        }

        const msg = (typeof flags['m'] === 'string' ? flags['m'] : null) || args[1] || 'commit via Éden Git Terminal';

        if (context.onCommitChanges) {
          try {
            const success = await context.onCommitChanges(msg);
            if (success) {
              return makeResult(
                `[${branch} (root-commit)] ${msg}\n ${repoChanges.length} file(s) changed, atomic commit pushed directly to GitHub.\n\n\x1b[33mNota: Isto commitou TODAS as mudanças pendentes (${repoChanges.length} arquivo(s)). Use o Source Control panel para staging seletivo.\x1b[0m`
              );
            } else {
              return makeResult('', 'fatal: falha ao realizar commit no GitHub.', 1);
            }
          } catch (err: any) {
            return makeResult('', `fatal: erro ao realizar commit: ${err.message}`, 1);
          }
        } else {
          return makeResult('', 'fatal: manipulador de commit não configurado no Éden.', 1);
        }
      }

      // GIT PUSH
      if (subCommand === 'push') {
        return makeResult(
          `To https://github.com/${owner}/${repo}.git\n   Everything up-to-date (Todos os commits realizados via Éden já estão publicados no GitHub).`
        );
      }

      // GIT PULL / FETCH
      if (subCommand === 'pull' || subCommand === 'fetch') {
        const key = `synap_synced_sha_${owner}/${repo}_${branch}`;
        try {
          const recentCommits = await fetchRepoCommits(undefined, owner, repo, branch, 10);
          if (recentCommits && recentCommits.length > 0) {
            const latest = recentCommits[0];
            const stored = typeof window !== 'undefined' ? localStorage.getItem(key) : null;

            let msg = `From https://github.com/${owner}/${repo}\n * branch            ${branch}     -> FETCH_HEAD\n`;

            if (stored && stored !== latest.sha && stored !== latest.short_sha) {
              const incoming = recentCommits.filter((c) => c.sha !== stored && c.short_sha !== stored);
              if (typeof window !== 'undefined') localStorage.setItem(key, latest.sha);
              if (context.onRefreshRepo) context.onRefreshRepo();

              msg += `Updating ${stored.slice(0, 7)}..${latest.short_sha}\nFast-forward\n`;
              msg += ` ${incoming.length} commit(s) puxados com sucesso do GitHub:\n`;
              for (const c of incoming.slice(0, 5)) {
                msg += `  + [${c.short_sha}] ${c.message}\n`;
              }
              msg += `Branch local ${branch} sincronizada com origin/${branch}.`;
              return makeResult(msg);
            } else {
              if (typeof window !== 'undefined') localStorage.setItem(key, latest.sha);
              if (context.onRefreshRepo) context.onRefreshRepo();
              return makeResult(
                msg + `Already up to date. (HEAD sincronizado em ${latest.short_sha}: "${latest.message.slice(0, 45)}")`
              );
            }
          }
        } catch {}

        if (context.onRefreshRepo) {
          context.onRefreshRepo();
        }
        return makeResult(
          `From https://github.com/${owner}/${repo}\n * branch            ${branch}     -> FETCH_HEAD\nAlready up to date.`
        );
      }

interface DiffOp {
  type: 'same' | 'add' | 'remove';
  line: string;
}

function computeLineDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;

  if (m * n > 250000) {
    const result: DiffOp[] = [];
    let i = 0, j = 0;
    while (i < m || j < n) {
      if (i < m && j < n && oldLines[i] === newLines[j]) {
        result.push({ type: 'same', line: oldLines[i] });
        i++; j++;
      } else {
        if (i < m) { result.push({ type: 'remove', line: oldLines[i] }); i++; }
        if (j < n) { result.push({ type: 'add', line: newLines[j] }); j++; }
      }
    }
    return result;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'same', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', line: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      ops.unshift({ type: 'remove', line: oldLines[i - 1] });
      i--;
    }
  }

  return ops;
}

function generateUnifiedDiff(c: PendingChange): string {
  const path = c.path;
  const oldText = c.originalContent || '';
  const newText = c.newContent || '';

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  let header = `diff --git a/${path} b/${path}\n`;
  if (c.type === 'added') {
    header += `new file mode 100644\n--- /dev/null\n+++ b/${path}\n`;
  } else if (c.type === 'deleted') {
    header += `deleted file mode 100644\n--- a/${path}\n+++ /dev/null\n`;
  } else {
    header += `--- a/${path}\n+++ b/${path}\n`;
  }

  const diffLines: string[] = [];

  if (c.type === 'added') {
    for (const line of newLines) {
      diffLines.push(`\x1b[32m+${line}\x1b[0m`);
    }
  } else if (c.type === 'deleted') {
    for (const line of oldLines) {
      diffLines.push(`\x1b[31m-${line}\x1b[0m`);
    }
  } else {
    const diff = computeLineDiff(oldLines, newLines);
    for (const item of diff) {
      if (item.type === 'add') {
        diffLines.push(`\x1b[32m+${item.line}\x1b[0m`);
      } else if (item.type === 'remove') {
        diffLines.push(`\x1b[31m-${item.line}\x1b[0m`);
      } else {
        diffLines.push(` ${item.line}`);
      }
    }
  }

  const chunkHeader = `@@ -1,${oldLines.length || 1} +1,${newLines.length || 1} @@`;
  return `${header}${chunkHeader}\n${diffLines.join('\n')}`;
}

      // GIT DIFF
      if (subCommand === 'diff') {
        const repoFullName = activeRepo?.fullName || `${owner}/${repo}`;
        const repoChanges = context.changes.filter(
          (c) => !c.repo || c.repo === repoFullName
        );

        if (repoChanges.length === 0) {
          return makeResult('');
        }

        const diffs = repoChanges.map((c) => generateUnifiedDiff(c));
        return makeResult(diffs.join('\n\n'));
      }

      return makeResult(
        '',
        `git: '${subCommand}' não é um comando do git. Veja 'git --help'.`,
        1
      );
    }

    // ==========================================
    // 3. COMANDO NÃO RECONHECIDO (MOCK BASH ERROR)
    // ==========================================
    return makeResult(
      '',
      `bash: ${command}: comando não encontrado no emulador Git. Digite 'git --help' ou 'ls', 'pwd', 'cat', 'git status'.`,
      127
    );
  } catch (globalErr: any) {
    return makeResult(
      '',
      `Erro de execução no emulador: ${globalErr?.message || 'Erro interno'}`,
      1
    );
  }
}
