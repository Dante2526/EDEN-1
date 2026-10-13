import { GitHubRepo, GitHubFileItem } from './types';

export const GITHUB_PAT_KEY = 'synap_github_pat';

export function getGitHubPat(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GITHUB_PAT_KEY);
}

export function setGitHubPat(pat: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GITHUB_PAT_KEY, pat.trim());
}

export function removeGitHubPat(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GITHUB_PAT_KEY);
}

/**
 * Octokit removido - agora usamos fetch nativo via /api/github proxy.
 * Esta função é mantida apenas para compatibilidade mas não faz nada.
 */
export async function getLazyOctokit(_customPat?: string) {
  return null;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  html_url: string;
  source?: 'env' | 'client';
}

export function getClientAuthHeaders(customPat?: string): Record<string, string> {
  const pat = customPat || getGitHubPat();
  if (pat) {
    return { Authorization: `Bearer ${pat}` };
  }
  return {};
}

export async function callGitHubApi<T>(
  action: string,
  params: Record<string, string> = {},
  method: 'GET' | 'POST' = 'GET',
  body?: any,
  customPat?: string
): Promise<T> {
  const searchParams = new URLSearchParams({ action, ...params });
  const headers: Record<string, string> = {
    ...getClientAuthHeaders(customPat),
    'x-api-key': import.meta.env.VITE_API_SECRET || '',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  // Timeout de 90s (commit com múltiplos arquivos pode demorar)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch(`/api/github?${searchParams.toString()}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    // Tenta ler como texto primeiro, depois faz parse como JSON
    // Isso evita o erro "Unexpected token" quando a Vercel retorna HTML (página de erro)
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Resposta não é JSON — provavelmente é página de erro da Vercel
      const preview = text.substring(0, 200).replace(/\s+/g, ' ').trim();
      throw new Error(
        `Erro ${res.status}: o servidor retornou uma resposta inválida (não-JSON). ` +
        `Isso geralmente indica que a função serverless está com problema ou o build falhou. ` +
        `Verifique o painel da Vercel. Preview: "${preview}"`
      );
    }

    if (!res.ok) {
      throw new Error(data.error || `Erro na API GitHub (${res.status})`);
    }
    return data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido (90s). O GitHub pode estar lento ou o commit tem muitos arquivos. Tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyGitHubPat(customPat?: string): Promise<GitHubUser> {
  return callGitHubApi<GitHubUser>('user', {}, 'GET', undefined, customPat?.trim());
}

export async function fetchUserRepos(_unused?: any): Promise<GitHubRepo[]> {
  return callGitHubApi<GitHubRepo[]>('repos');
}

export async function fetchRepoBranches(
  _unused?: any,
  owner?: string,
  repo?: string
): Promise<string[]> {
  if (!owner || !repo) return [];
  return callGitHubApi<string[]>('branches', { owner, repo });
}

export async function fetchRepoContents(
  _unused?: any,
  owner?: string,
  repo?: string,
  path: string = '',
  branch?: string
): Promise<GitHubFileItem[]> {
  if (!owner || !repo) return [];
  const params: Record<string, string> = { owner, repo, path };
  if (branch) params.branch = branch;
  const items = await callGitHubApi<GitHubFileItem[]>('contents', params);
  return items.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function fetchFileContent(
  _unused?: any,
  owner?: string,
  repo?: string,
  path?: string,
  branch?: string
): Promise<string> {
  if (!owner || !repo || !path) throw new Error('Parâmetros inválidos');
  const params: Record<string, string> = { owner, repo, path };
  if (branch) params.branch = branch;
  const res = await callGitHubApi<{ content: string }>('file', params);
  return res.content;
}

export async function searchCode(
  _unused?: any,
  query?: string,
  owner?: string,
  repo?: string,
  path?: string,
  extension?: string
): Promise<Array<{ name: string; path: string; html_url: string; snippets?: string[] }>> {
  if (!query) return [];
  const params: Record<string, string> = { q: query.trim() };
  if (owner) params.owner = owner;
  if (repo) params.repo = repo;
  if (path) params.path = path;
  if (extension) params.extension = extension;
  return callGitHubApi<Array<{ name: string; path: string; html_url: string; snippets?: string[] }>>('search', params);
}

export async function createRepoBranch(
  customPat?: string,
  owner?: string,
  repo?: string,
  branch?: string,
  fromBranch?: string
): Promise<{ branch: string; ref: string; sha: string }> {
  if (!owner || !repo || !branch) throw new Error('Parâmetros obrigatórios ausentes.');
  return callGitHubApi<{ branch: string; ref: string; sha: string }>(
    'create_branch',
    {},
    'POST',
    { owner, repo, branch, fromBranch },
    customPat
  );
}

export async function fetchRepoCommits(
  customPat?: string,
  owner?: string,
  repo?: string,
  branch?: string,
  perPage: number = 25
): Promise<import('./types').GitHubCommitItem[]> {
  if (!owner || !repo) return [];
  const params: Record<string, string> = { owner, repo, per_page: String(perPage) };
  if (branch) params.branch = branch;
  return callGitHubApi<import('./types').GitHubCommitItem[]>('commits', params, 'GET', undefined, customPat);
}

/**
 * Cria um novo repositório do zero na conta do usuário autenticado.
 * Retorna o repo criado no formato GitHubRepo.
 */
export async function createRepo(
  params: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
  },
  customPat?: string
): Promise<GitHubRepo> {
  if (!params.name || !/^[a-zA-Z0-9._-]+$/.test(params.name)) {
    throw new Error('Nome inválido. Use apenas letras, números, ., _ e -');
  }
  return callGitHubApi<GitHubRepo>(
    'create_repo',
    {},
    'POST',
    {
      name: params.name.trim(),
      description: params.description?.trim() || '',
      private: !!params.private,
      autoInit: params.autoInit !== false,
    },
    customPat
  );
}
