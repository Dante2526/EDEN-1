import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

interface SupabaseRepoRow {
  id: string;
  repo_full_name?: string | null;
  branch?: string | null;
  name: string;
  description?: string | null;
  template: string;
  files: Record<string, any>;
  dependencies?: Record<string, string> | null;
  conversation_id?: string | null;
  created_at: number;
  updated_at: number;
}

function getSupabaseCredentials(env: Env): { url: string; key: string } | null {
  const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function rowToSynapProject(row: SupabaseRepoRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    template: row.template || 'react-ts',
    files: row.files || {},
    dependencies: row.dependencies || undefined,
    conversationId: row.conversation_id || undefined,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
    sourceRepoFullName: row.repo_full_name || undefined,
    sourceRepoBranch: row.branch || undefined,
  };
}

function rowToIndexItem(row: SupabaseRepoRow) {
  const fileCount =
    row.files && typeof row.files === 'object' ? Object.keys(row.files).length : 0;
  return {
    id: row.id,
    name: row.name,
    template: row.template || 'react-ts',
    conversationId: row.conversation_id || undefined,
    updatedAt: Number(row.updated_at) || Date.now(),
    fileCount,
    sourceRepoFullName: row.repo_full_name || undefined,
    sourceRepoBranch: row.branch || undefined,
  };
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const securityResponse = await checkAuthAndRateLimit(req, env);
  if (securityResponse) return securityResponse;

  const creds = getSupabaseCredentials(env);
  if (!creds) {
    return new Response(
      JSON.stringify({
        configured: false,
        message: 'Supabase não configurado no ambiente (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes). Operando em fallback local.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || (req.method === 'POST' ? 'upsert' : 'list');
  const headers: Record<string, string> = {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET' && action === 'list') {
      const restUrl = `${creds.url}/rest/v1/synap_repositories?select=id,repo_full_name,branch,name,template,conversation_id,updated_at,files&order=updated_at.desc&limit=100`;
      const res = await fetch(restUrl, { headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rows = (await res.json()) as SupabaseRepoRow[];
      const items = Array.isArray(rows) ? rows.map(rowToIndexItem) : [];
      return new Response(JSON.stringify({ configured: true, ok: true, items }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'GET' && action === 'get') {
      const id = url.searchParams.get('id');
      const repoFullName = url.searchParams.get('repoFullName');
      const branch = url.searchParams.get('branch') || 'main';

      let query = '';
      if (repoFullName) {
        query = `repo_full_name=eq.${encodeURIComponent(repoFullName)}&branch=eq.${encodeURIComponent(branch)}&limit=1`;
      } else if (id) {
        query = `id=eq.${encodeURIComponent(id)}&limit=1`;
      } else {
        return new Response(JSON.stringify({ error: 'Informe id ou repoFullName.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const restUrl = `${creds.url}/rest/v1/synap_repositories?select=*&${query}`;
      const res = await fetch(restUrl, { headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rows = (await res.json()) as SupabaseRepoRow[];
      const project = Array.isArray(rows) && rows.length > 0 ? rowToSynapProject(rows[0]) : null;
      return new Response(JSON.stringify({ configured: true, ok: true, project }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST' && action === 'upsert') {
      const body = await req.json();
      const proj = body?.project || body;
      if (!proj || !proj.id || !proj.name) {
        return new Response(JSON.stringify({ error: 'Payload de projeto inválido.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const rowPayload: SupabaseRepoRow = {
        id: proj.id,
        repo_full_name: proj.sourceRepoFullName || null,
        branch: proj.sourceRepoBranch || 'main',
        name: proj.name,
        description: proj.description || null,
        template: proj.template || 'react-ts',
        files: proj.files || {},
        dependencies: proj.dependencies || null,
        conversation_id: proj.conversationId || null,
        created_at: proj.createdAt || Date.now(),
        updated_at: proj.updatedAt || Date.now(),
      };

      // Se possui sourceRepoFullName, fazemos deduplicação garantida por (repo_full_name, branch)
      const onConflict = rowPayload.repo_full_name ? 'repo_full_name,branch' : 'id';
      const restUrl = `${creds.url}/rest/v1/synap_repositories?on_conflict=${onConflict}`;
      const res = await fetch(restUrl, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rowPayload),
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const savedRows = (await res.json()) as SupabaseRepoRow[];
      const savedProject =
        Array.isArray(savedRows) && savedRows.length > 0 ? rowToSynapProject(savedRows[0]) : proj;

      return new Response(JSON.stringify({ configured: true, ok: true, project: savedProject }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'DELETE' || action === 'delete') {
      const id = url.searchParams.get('id');
      if (!id) {
        return new Response(JSON.stringify({ error: 'Parâmetro id é obrigatório.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const restUrl = `${creds.url}/rest/v1/synap_repositories?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(restUrl, { method: 'DELETE', headers });
      return new Response(JSON.stringify({ configured: true, ok: res.ok }), {
        status: res.ok ? 200 : res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ configured: true, ok: false, error: err?.message || 'Erro no banco Supabase' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
