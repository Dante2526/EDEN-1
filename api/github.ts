// api/github.ts — 100% fetch nativo (sem @octokit/rest, funciona em Edge)
export const config = { runtime: 'edge' };

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
  const token = getEffectiveToken(req);
  if (!token) return new Response(JSON.stringify({ error: 'Token do GitHub não configurado.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';

  try {
    if (action === 'user' || action === 'verify') {
      const data = await ghFetch('/user', token);
      return new Response(JSON.stringify({ login: data.login, avatar_url: data.avatar_url, name: data.name ?? null, html_url: data.html_url, source: Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT) ? 'env' : 'client' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'repos') {
      const data = await ghFetch('/user/repos?sort=updated&per_page=100&direction=desc', token);
      const repos = data.map((r: any) => ({ id: r.id, name: r.name, full_name: r.full_name, owner: { login: r.owner.login, avatar_url: r.owner.avatar_url }, description: r.description, default_branch: r.default_branch, language: r.language, stargazers_count: r.stargazers_count, updated_at: r.updated_at, private: r.private }));
      return new Response(JSON.stringify(repos), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'branches') {
      const owner = url.searchParams.get('owner') || '';
      const repo = url.searchParams.get('repo') || '';
      if (!owner || !repo) return new Response(JSON.stringify({ error: 'owner e repo obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const data = await ghFetch(`/repos/${owner}/${repo}/branches?per_page=50`, token);
      return new Response(JSON.stringify(data.map((b: any) => b.name)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'contents') {
      const owner = url.searchParams.get('owner') || '';
      const repo = url.searchParams.get('repo') || '';
      const path = url.searchParams.get('path') || '';
      const branch = url.searchParams.get('branch') || undefined;
      if (!owner || !repo) return new Response(JSON.stringify({ error: 'owner e repo obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const ref = branch ? `?ref=${branch}` : '';
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}${ref}`, token);
      if (Array.isArray(data)) {
        const items = data.map((item: any) => ({ name: item.name, path: item.path, sha: item.sha, size: item.size, type: item.type === 'dir' ? 'dir' : 'file' }));
        return new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'file') {
      const owner = url.searchParams.get('owner') || '';
      const repo = url.searchParams.get('repo') || '';
      const path = url.searchParams.get('path') || '';
      const branch = url.searchParams.get('branch') || undefined;
      if (!owner || !repo || !path) return new Response(JSON.stringify({ error: 'owner, repo e path obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const ref = branch ? `?ref=${branch}` : '';
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}${ref}`, token);
      if (!Array.isArray(data) && data.content) {
        // GitHub retorna base64, precisamos decodificar. Em Edge, usamos atob.
        const decoded = atob(data.content.replace(/\n/g, ''));
        return new Response(JSON.stringify({ content: decoded }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ content: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'search') {
      const q = url.searchParams.get('q') || '';
      if (!q) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      const data = await ghFetch(`/search/code?q=${encodeURIComponent(q)}&per_page=15`, token);
      const items = data.items.map((i: any) => ({ name: i.name, path: i.path, html_url: i.html_url }));
      return new Response(JSON.stringify(items), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (action === 'commits') {
      const owner = url.searchParams.get('owner') || '';
      const repo = url.searchParams.get('repo') || '';
      const branch = url.searchParams.get('branch') || '';
      if (!owner || !repo) return new Response(JSON.stringify({ error: 'owner e repo obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const sha = branch ? `?sha=${branch}&per_page=20` : '?per_page=20';
      const data = await ghFetch(`/repos/${owner}/${repo}/commits${sha}`, token);
      const commits = data.map((c: any) => ({ sha: c.sha, commit: { author: { name: c.commit.author?.name || 'Unknown', email: c.commit.author?.email || '', date: c.commit.author?.date || '' }, message: c.commit.message }, html_url: c.html_url }));
      return new Response(JSON.stringify(commits), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

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

    if (action === 'create_branch' && req.method.toUpperCase() === 'POST') {
      const body = await req.json();
      const { owner, repo, branch, fromBranch } = body;
      if (!owner || !repo || !branch) return new Response(JSON.stringify({ error: 'owner, repo e branch obrigatórios.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const ref = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch || 'main'}`, token);
      const newRef = await ghFetch(`/repos/${owner}/${repo}/git/refs`, token, 'POST', { ref: `refs/heads/${branch}`, sha: ref.object.sha });
      return new Response(JSON.stringify({ branch: branch, sha: newRef.object.sha }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Ação '${action}' desconhecida.` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('GitHub API Proxy error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erro ao comunicar com a API do GitHub.' }), { status: err?.status || 500, headers: { 'Content-Type': 'application/json' } });
  }
}
