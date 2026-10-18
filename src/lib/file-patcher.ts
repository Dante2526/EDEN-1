import type { PendingChange } from './types';

export interface PatchBlock {
  old_str: string;
  new_str: string;
  allow_multiple?: boolean;
}

export interface PatchResult {
  success: boolean;
  content: string;
  appliedCount: number;
  error?: string;
}

export interface EffectiveFileResolution {
  status: 'modified' | 'deleted' | 'unchanged';
  content?: string;
  originalContent?: string;
}

/**
 * Normaliza caminhos de arquivos removendo barras invertidas, './' ou '/' iniciais.
 */
export function normalizeRepoPath(rawPath: string): string {
  return (rawPath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

/**
 * Normaliza os argumentos recebidos pela tool `patch_file`, aceitando tanto
 * `patches: [{ old_str, new_str }]` quanto `old_str` e `new_str` direto no objeto raiz.
 */
export function normalizePatchArgs(args: any): PatchBlock[] {
  if (!args || typeof args !== 'object') return [];

  if (Array.isArray(args.patches) && args.patches.length > 0) {
    return args.patches
      .filter((p: any) => p && typeof p.old_str === 'string' && typeof p.new_str === 'string')
      .map((p: any) => ({
        old_str: p.old_str,
        new_str: p.new_str,
        allow_multiple: Boolean(p.allow_multiple),
      }));
  }

  const singleOld =
    typeof args.old_str === 'string'
      ? args.old_str
      : typeof args.target === 'string'
        ? args.target
        : typeof args.search === 'string'
          ? args.search
          : undefined;

  const singleNew =
    typeof args.new_str === 'string'
      ? args.new_str
      : typeof args.replacement === 'string'
        ? args.replacement
        : typeof args.replace === 'string'
          ? args.replace
          : undefined;

  if (singleOld !== undefined && singleNew !== undefined) {
    return [
      {
        old_str: singleOld,
        new_str: singleNew,
        allow_multiple: Boolean(args.allow_multiple),
      },
    ];
  }

  return [];
}

/**
 * Conta quantas vezes uma substring não-vazia ocorre dentro de `text`.
 */
function countOccurrences(text: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = text.indexOf(search, pos);
    if (idx === -1) break;
    count++;
    pos = idx + search.length;
  }
  return count;
}

/**
 * Aplica um ou mais blocos cirúrgicos de substituição (`old_str` -> `new_str`) em um arquivo.
 * Possui tolerância automática para diferenças entre CRLF (`\r\n`) e LF (`\n`).
 */
export function applyFilePatches(originalContent: string, patches: PatchBlock[]): PatchResult {
  if (!Array.isArray(patches) || patches.length === 0) {
    return {
      success: false,
      content: originalContent,
      appliedCount: 0,
      error: 'Nenhum bloco de patch válido (old_str / new_str) foi fornecido.',
    };
  }

  const usesCRLF = originalContent.includes('\r\n');
  let working = originalContent.replace(/\r\n/g, '\n');
  let appliedCount = 0;

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const normOld = (patch.old_str ?? '').replace(/\r\n/g, '\n');
    const normNew = (patch.new_str ?? '').replace(/\r\n/g, '\n');

    if (!normOld) {
      return {
        success: false,
        content: originalContent,
        appliedCount,
        error: `Bloco de patch #${i + 1} possui old_str vazio. Para criar um arquivo do zero, utilize edit_file.`,
      };
    }

    const occurrences = countOccurrences(working, normOld);

    if (occurrences === 0) {
      const preview = normOld.slice(0, 120).replace(/\n/g, '\\n');
      return {
        success: false,
        content: originalContent,
        appliedCount,
        error: `Trecho old_str do bloco #${i + 1} não foi encontrado no arquivo ("${preview}..."). Chame read_file para conferir o conteúdo exato atual antes de aplicar o patch.`,
      };
    }

    if (occurrences > 1 && !patch.allow_multiple) {
      return {
        success: false,
        content: originalContent,
        appliedCount,
        error: `Trecho old_str do bloco #${i + 1} possui múltiplas ocorrências (${occurrences} ocorrências encontradas). Inclua mais linhas de contexto ao redor em old_str para torná-lo único ou defina allow_multiple: true.`,
      };
    }

    if (patch.allow_multiple) {
      working = working.split(normOld).join(normNew);
    } else {
      const idx = working.indexOf(normOld);
      working = working.slice(0, idx) + normNew + working.slice(idx + normOld.length);
    }

    appliedCount++;
  }

  const finalContent = usesCRLF ? working.replace(/\n/g, '\r\n') : working;

  return {
    success: true,
    content: finalContent,
    appliedCount,
  };
}

/**
 * Resolve o conteúdo efetivo mais recente de um arquivo consultando primeiro
 * as alterações pendentes no Source Control (`PendingChange[]`).
 * Isso garante que, se o agente editar um arquivo várias vezes seguidas na mesma conversa,
 * ele sempre lerá e aplicará patches sobre a sua própria versão mais recente.
 */
export function resolveEffectiveFileContent(
  rawPath: string,
  changes: PendingChange[],
  activeRepoFullName?: string
): EffectiveFileResolution {
  const targetPath = normalizeRepoPath(rawPath);
  if (!targetPath || !Array.isArray(changes) || changes.length === 0) {
    return { status: 'unchanged' };
  }

  // Percorre de trás para frente caso haja múltiplas entradas, pegando a mais recente
  for (let i = changes.length - 1; i >= 0; i--) {
    const ch = changes[i];
    if (activeRepoFullName && ch.repo && ch.repo !== activeRepoFullName) {
      continue;
    }
    if (normalizeRepoPath(ch.path) === targetPath) {
      if (ch.type === 'deleted') {
        return {
          status: 'deleted',
          originalContent: ch.originalContent,
        };
      }
      return {
        status: 'modified',
        content: ch.newContent,
        originalContent: ch.originalContent,
      };
    }
  }

  return { status: 'unchanged' };
}
