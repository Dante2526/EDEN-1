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

    if (action === 'file_content') {
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

    return new Response(JSON.stringify({ error: 'Ação não suportada.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Erro GitHub API' }), {
      status: err?.status || 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
