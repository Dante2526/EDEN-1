import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';
import { AppSettings, Skill, McpServer, KnowledgeFact } from '../src/lib/types';

export const config = {
  runtime: 'edge',
};

interface SupabaseUserStateRow {
  id: string;
  settings: Record<string, any>;
  skills: any[];
  mcp_servers: any[];
  knowledge_facts: any[];
  updated_at: number;
}

function getSupabaseCredentials(env: Env): { url: string; key: string } | null {
  const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
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
        message: 'Supabase não configurado. Operando em fallback local.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || (req.method === 'POST' ? 'upsert' : 'get');
  const headers: Record<string, string> = {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. OBTER ESTADO COMPLETO DO USUÁRIO
    if (req.method === 'GET' && action === 'get') {
      const restUrl = `${creds.url}/rest/v1/synap_user_state?id=eq.default&limit=1`;
      const res = await fetch(restUrl, { headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rows = (await res.json()) as SupabaseUserStateRow[];
      if (!rows || rows.length === 0) {
        return new Response(
          JSON.stringify({
            configured: true,
            ok: true,
            state: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const row = rows[0];
      return new Response(
        JSON.stringify({
          configured: true,
          ok: true,
          state: {
            settings: row.settings || {},
            skills: Array.isArray(row.skills) ? row.skills : [],
            mcpServers: Array.isArray(row.mcp_servers) ? row.mcp_servers : [],
            knowledgeFacts: Array.isArray(row.knowledge_facts) ? row.knowledge_facts : [],
            updatedAt: Number(row.updated_at) || Date.now(),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. ATUALIZAR / SALVAR ESTADO (UPSERT COM RESOLUÇÃO DE CONFLITOS)
    if (req.method === 'POST' && action === 'upsert') {
      const body = await req.json();
      const clientUpdatedAt = Number(body?.updatedAt) || Date.now();

      // Checa se há estado preexistente no banco
      const checkRes = await fetch(
        `${creds.url}/rest/v1/synap_user_state?id=eq.default&select=*&limit=1`,
        { headers }
      );
      let existingRow: SupabaseUserStateRow | null = null;
      if (checkRes.ok) {
        const rows = (await checkRes.json()) as SupabaseUserStateRow[];
        if (rows && rows.length > 0) existingRow = rows[0];
      }

      // Merge inteligente preservando o que for mais recente
      const nextSettings = body.settings !== undefined ? body.settings : (existingRow?.settings || {});
      const nextSkills = Array.isArray(body.skills) ? body.skills : (existingRow?.skills || []);
      const nextMcpServers = Array.isArray(body.mcpServers) ? body.mcpServers : (existingRow?.mcp_servers || []);
      const nextKnowledgeFacts = Array.isArray(body.knowledgeFacts) ? body.knowledgeFacts : (existingRow?.knowledge_facts || []);

      const rowPayload: SupabaseUserStateRow = {
        id: 'default',
        settings: nextSettings,
        skills: nextSkills,
        mcp_servers: nextMcpServers,
        knowledge_facts: nextKnowledgeFacts,
        updated_at: clientUpdatedAt,
      };

      const restUrl = `${creds.url}/rest/v1/synap_user_state?on_conflict=id`;
      const upRes = await fetch(restUrl, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rowPayload),
      });

      if (!upRes.ok) {
        const errText = await upRes.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: upRes.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const returnedRows = (await upRes.json()) as SupabaseUserStateRow[];
      const savedRow = returnedRows && returnedRows.length > 0 ? returnedRows[0] : rowPayload;

      return new Response(
        JSON.stringify({
          configured: true,
          ok: true,
          state: {
            settings: savedRow.settings,
            skills: savedRow.skills,
            mcpServers: savedRow.mcp_servers,
            knowledgeFacts: savedRow.knowledge_facts,
            updatedAt: Number(savedRow.updated_at),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: `Ação ou método não suportado: ${req.method} ${action}` }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ configured: true, ok: false, error: err?.message || 'Erro interno no banco.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
