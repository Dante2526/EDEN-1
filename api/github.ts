import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

function getEffectiveToken(req: Request): string | null {
  const serverToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  if (serverToken && serverToken.trim() && serverToken !== 'ghp_your_github_token_here') return serverToken.trim();
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }
  return null;
}

async function ghFetch(endpoint: string, token: string, method: string = 'GET', body?: any) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, message: data.message || `GitHub API Error (${res.status})` };
  return data;
}

export default async function handler(req: Request): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  const token = getEffectiveToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Token do GitHub não fornecido.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'user';
  const owner = url.searchParams.get('owner') || '';
  const repo = url.searchParams.get('repo') || '';
  const path = url.searchParams.get('path') || '';
  const branch = url.searchParams.get('branch') || 'main';

  try {
    if (action === 'user') {
      const data = await ghFetch('/user', token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'repos') {
      const data = await ghFetch('/user/repos?sort=updated&per_page=50', token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'commits') {
      const data = await ghFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=20`, token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'branches') {
      const data = await ghFetch(`/repos/${owner}/${repo}/branches`, token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'files') {
      const data = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Lista arquivos de um diretório (path vazio = raiz). Retorna array de items.
    // GitHub API: GET /repos/{owner}/{repo}/contents/{path}?ref={branch}
    // Se path é diretório (ou vazio), retorna array. Se é arquivo, retorna objeto.
    if (action === 'contents') {
      const cleanPath = path.replace(/^\/+/, ''); // remove leading slashes
      const endpoint = cleanPath
        ? `/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`
        : `/repos/${owner}/${repo}/contents?ref=${branch}`;
      const data = await ghFetch(endpoint, token);
      // Garante que sempre retorna array (mesmo se a API retornar objeto único)
      const items = Array.isArray(data) ? data : [data];
      // Normaliza pro formato que o frontend espera
      const normalized = items.map((item: any) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size || 0,
        type: item.type === 'dir' ? 'dir' : 'file',
      }));
      return new Response(JSON.stringify(normalized), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Alias: 'file' = 'file_content' (busca conteúdo de um único arquivo)
    // Retorna { content: base64, encoding, name, path, sha, ... }
    if (action === 'file' || action === 'file_content') {
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Busca de código dentro de um repo (GitHub Code Search API)
    if (action === 'search') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      // Monta query: se owner/repo fornecidos, restringe ao repo
      let searchQuery = q.trim();
      if (owner && repo) searchQuery = `${searchQuery} repo:${owner}/${repo}`;
      const data = await ghFetch(`/search/code?q=${encodeURIComponent(searchQuery)}&per_page=20`, token);
      const items = (data.items || []).map((item: any) => ({
        name: item.name,
        path: item.path,
        html_url: item.html_url,
        snippets: (item.text_matches || []).map((m: any) => m.fragment || ''),
      }));
      return new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Buscar repositórios no GitHub por nome/descrição
    if (action === 'search_repos') {
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return new Response(JSON.stringify({ error: 'Query obrigatória.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const data = await ghFetch(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`, token);
      const repos = (data.items || []).map((r: any) => ({
        full_name: r.full_name,
        description: r.description || '',
        html_url: r.html_url,
        stargazers_count: r.stargazers_count,
        language: r.language || '',
        default_branch: r.default_branch,
      }));
      return new Response(JSON.stringify(repos), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Ler arquivo de QUALQUER repo (não só o ativo) — pra IA poder ler skills de outros repos
    if (action === 'read_any_file') {
      const anyOwner = url.searchParams.get('owner') || '';
      const anyRepo = url.searchParams.get('repo') || '';
      const anyPath = url.searchParams.get('path') || '';
      const anyBranch = url.searchParams.get('branch') || 'main';
      if (!anyOwner || !anyRepo || !anyPath) return new Response(JSON.stringify({ error: 'owner, repo e path obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const data = await ghFetch(`/repos/${anyOwner}/${anyRepo}/contents/${anyPath}?ref=${anyBranch}`, token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ==================== MUTAÇÕES (POST) ====================

    // Criar novo repositório do zero (do chat)
    if (action === 'create_repo' && req.method.toUpperCase() === 'POST') {
      const body = await req.json();
      const { name, description, private: isPrivate, autoInit } = body;
      if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(name) || name.length > 100) {
        return new Response(JSON.stringify({ error: 'Nome do repositório inválido. Use apenas letras, números, ., _ e - (máx 100 chars).' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const payload: any = {
        name,
        description: typeof description === 'string' ? description.slice(0, 350) : '',
        private: !!isPrivate,
        auto_init: autoInit !== false, // default true (cria README)
      };
      const data = await ghFetch('/user/repos', token, 'POST', payload);
      // Retorna o repo no mesmo formato que fetchUserRepos espera
      const repo = {
        id: data.id,
        name: data.name,
        full_name: data.full_name,
        owner: { login: data.owner.login, avatar_url: data.owner.avatar_url },
        description: data.description || '',
        default_branch: data.default_branch || 'main',
        language: data.language || null,
        stargazers_count: data.stargazers_count || 0,
        updated_at: data.updated_at,
        private: data.private,
        html_url: data.html_url,
      };
      return new Response(JSON.stringify(repo), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Commit atômico multi-arquivo usando Git Data Trees API
    if (action === 'commit' && req.method.toUpperCase() === 'POST') {
      const body = await req.json();
      const { owner, repo, branch, message, changes } = body;
      if (!owner || !repo || !branch || !message || !Array.isArray(changes)) return new Response(JSON.stringify({ error: 'Dados insuficientes.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
      const lastCommit = await ghFetch(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, token);
      const treeData = await ghFetch(`/repos/${owner}/${repo}/git/trees/${lastCommit.tree.sha}?recursive=true`, token);
      const currentItems = treeData.tree;

      const treeItems = await Promise.all(changes.map(async (change: any) => {
        const existingItem = currentItems.find((i: any) => i.path === change.path);
        const mode = (existingItem?.mode || '100644') as any;
        if (change.type === 'deleted') return { path: change.path, mode: '100644' as any, type: 'blob' as const, sha: null };
        const blob = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, token, 'POST', { content: change.newContent || '', encoding: 'utf-8' });
        return { path: change.path, mode, type: 'blob' as const, sha: blob.sha };
      }));

      const newTree = await ghFetch(`/repos/${owner}/${repo}/git/trees`, token, 'POST', { base_tree: lastCommit.tree.sha, tree: treeItems });
      const newCommit = await ghFetch(`/repos/${owner}/${repo}/git/commits`, token, 'POST', { message, tree: newTree.sha, parents: [ref.object.sha] });
      await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, 'PATCH', { sha: newCommit.sha });

      return new Response(JSON.stringify({ sha: newCommit.sha, html_url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Criar nova branch a partir de uma existente
    if (action === 'create_branch' && req.method.toUpperCase() === 'POST') {
      const body = await req.json();
      const { owner, repo, branch, fromBranch } = body;
      if (!owner || !repo || !branch) return new Response(JSON.stringify({ error: 'owner, repo e branch obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch || 'main'}`, token);
      const newRef = await ghFetch(`/repos/${owner}/${repo}/git/refs`, token, 'POST', { ref: `refs/heads/${branch}`, sha: ref.object.sha });
      return new Response(JSON.stringify({ branch: branch, ref: newRef.ref, sha: newRef.object.sha }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação não suportada.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Erro GitHub API' }), {
      status: err?.status || 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
