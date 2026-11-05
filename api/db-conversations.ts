import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';
import { Conversation, Message, ReasoningEffort, ActivePromptMode, ContextCompaction, ActiveRepoState } from '../src/lib/types';

export const config = {
  runtime: 'edge',
};

interface SupabaseConversationRow {
  id: string;
  title: string;
  model?: string | null;
  reasoning_effort?: string | null;
  messages: Message[];
  active_repo?: ActiveRepoState | null;
  is_plan_mode?: boolean | null;
  active_prompt_mode?: string | null;
  is_web_search_mode?: boolean | null;
  context_compaction?: ContextCompaction | null;
  is_archived?: boolean | null;
  created_at: number;
  updated_at: number;
}

export interface ConversationIndexItem {
  id: string;
  title: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  messageCount: number;
  isPlanMode: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

function getSupabaseCredentials(env: Env): { url: string; key: string } | null {
  const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

function rowToConversation(row: SupabaseConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model || 'auto',
    reasoningEffort: (row.reasoning_effort as ReasoningEffort) || 'high',
    messages: Array.isArray(row.messages) ? row.messages : [],
    activeRepo: row.active_repo || null,
    isPlanMode: !!row.is_plan_mode,
    activePromptMode: (row.active_prompt_mode as ActivePromptMode) || undefined,
    isWebSearchMode: !!row.is_web_search_mode,
    contextCompaction: row.context_compaction || undefined,
    isArchived: !!row.is_archived,
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  };
}

function conversationToRow(conv: Conversation): SupabaseConversationRow {
  return {
    id: conv.id,
    title: conv.title || 'Nova Conversa',
    model: conv.model || null,
    reasoning_effort: conv.reasoningEffort || 'high',
    messages: Array.isArray(conv.messages) ? conv.messages : [],
    active_repo: conv.activeRepo || null,
    is_plan_mode: !!conv.isPlanMode,
    active_prompt_mode: conv.activePromptMode || null,
    is_web_search_mode: !!conv.isWebSearchMode,
    context_compaction: conv.contextCompaction || null,
    is_archived: !!conv.isArchived,
    created_at: Number(conv.createdAt) || Date.now(),
    updated_at: Number(conv.updatedAt) || Date.now(),
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
        message: 'Supabase não configurado no ambiente. Operando em fallback local.',
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
    // 1. LISTAR CONVERSAS COM METADADOS
    if (req.method === 'GET' && action === 'list') {
      const rawLimit = Number(url.searchParams.get('limit'));
      const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;

      const restUrl = `${creds.url}/rest/v1/synap_conversations?select=id,title,model,reasoning_effort,messages,is_plan_mode,is_archived,created_at,updated_at&order=updated_at.desc&limit=${limit}`;
      const res = await fetch(restUrl, { headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rows = (await res.json()) as SupabaseConversationRow[];
      const items: ConversationIndexItem[] = Array.isArray(rows)
        ? rows.map((r) => ({
            id: r.id,
            title: r.title,
            model: r.model || 'auto',
            reasoningEffort: (r.reasoning_effort as ReasoningEffort) || 'high',
            messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
            isPlanMode: !!r.is_plan_mode,
            isArchived: !!r.is_archived,
            createdAt: Number(r.created_at) || Date.now(),
            updatedAt: Number(r.updated_at) || Date.now(),
          }))
        : [];

      return new Response(JSON.stringify({ configured: true, ok: true, items }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. BUSCAR CONVERSA COMPLETA POR ID
    if (req.method === 'GET' && action === 'get') {
      const id = url.searchParams.get('id');
      if (!id) {
        return new Response(JSON.stringify({ error: 'Informe o ID da conversa.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const restUrl = `${creds.url}/rest/v1/synap_conversations?id=eq.${encodeURIComponent(id)}&limit=1`;
      const res = await fetch(restUrl, { headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const rows = (await res.json()) as SupabaseConversationRow[];
      const conversation = rows && rows.length > 0 ? rowToConversation(rows[0]) : null;
      return new Response(JSON.stringify({ configured: true, ok: true, conversation }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. SALVAR OU ATUALIZAR CONVERSA (UPSERT COM PROTEÇÃO DE TIMESTAMP)
    if (req.method === 'POST' && action === 'upsert') {
      const body = await req.json();
      const conv = body?.conversation || body;
      if (!conv || !conv.id) {
        return new Response(JSON.stringify({ error: 'Payload de conversa inválido.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Checa se conversa existente no banco é mais recente antes de sobrescrever
      const checkRes = await fetch(
        `${creds.url}/rest/v1/synap_conversations?id=eq.${encodeURIComponent(conv.id)}&select=updated_at&limit=1`,
        { headers }
      );
      if (checkRes.ok) {
        const existing = (await checkRes.json()) as { updated_at: number }[];
        if (existing.length > 0 && Number(existing[0].updated_at) > Number(conv.updatedAt)) {
          // Versão no banco é mais recente: retorna a versão do banco sem sobrescrever
          const fullRes = await fetch(
            `${creds.url}/rest/v1/synap_conversations?id=eq.${encodeURIComponent(conv.id)}&limit=1`,
            { headers }
          );
          if (fullRes.ok) {
            const rows = (await fullRes.json()) as SupabaseConversationRow[];
            return new Response(
              JSON.stringify({
                configured: true,
                ok: true,
                conversation: rowToConversation(rows[0]),
                conflict: 'server_was_newer',
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
      }

      const rowPayload = conversationToRow(conv);
      const restUrl = `${creds.url}/rest/v1/synap_conversations?on_conflict=id`;
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

      const returnedRows = (await res.json()) as SupabaseConversationRow[];
      const savedConv =
        returnedRows && returnedRows.length > 0 ? rowToConversation(returnedRows[0]) : conv;
      return new Response(JSON.stringify({ configured: true, ok: true, conversation: savedConv }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. SINCRONIZAÇÃO EM LOTE INTELIGENTE (BATCH SYNC BIDIRECIONAL)
    if (req.method === 'POST' && action === 'batch_sync') {
      const body = await req.json();
      const localConvs: Conversation[] = Array.isArray(body?.conversations) ? body.conversations : [];

      // 1. Busca todas as conversas do servidor
      const listRes = await fetch(
        `${creds.url}/rest/v1/synap_conversations?select=*&order=updated_at.desc&limit=100`,
        { headers }
      );
      if (!listRes.ok) {
        const errText = await listRes.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: listRes.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const serverRows = (await listRes.json()) as SupabaseConversationRow[];
      const serverMap = new Map<string, SupabaseConversationRow>();
      for (const row of serverRows) {
        serverMap.set(row.id, row);
      }

      // 2. Determina quais locais precisam ser enviadas para o servidor (se local for mais recente)
      const toUpsert: SupabaseConversationRow[] = [];
      for (const local of localConvs) {
        const serverRow = serverMap.get(local.id);
        if (!serverRow || Number(local.updatedAt) > Number(serverRow.updated_at)) {
          toUpsert.push(conversationToRow(local));
        }
      }

      if (toUpsert.length > 0) {
        const upsertUrl = `${creds.url}/rest/v1/synap_conversations?on_conflict=id`;
        await fetch(upsertUrl, {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(toUpsert),
        });
      }

      // 3. Monta união final de todas as conversas
      const unifiedMap = new Map<string, Conversation>();
      // Primeiro aplica as do servidor
      for (const sRow of serverRows) {
        unifiedMap.set(sRow.id, rowToConversation(sRow));
      }
      // Depois mescla as locais atualizadas
      for (const lConv of localConvs) {
        const existing = unifiedMap.get(lConv.id);
        if (!existing || lConv.updatedAt > existing.updatedAt) {
          unifiedMap.set(lConv.id, lConv);
        }
      }

      const unifiedList = Array.from(unifiedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);

      return new Response(
        JSON.stringify({
          configured: true,
          ok: true,
          conversations: unifiedList,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. DELETAR UMA CONVERSA
    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
      const id = url.searchParams.get('id');
      if (!id) {
        return new Response(JSON.stringify({ error: 'Informe o ID para deletar.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const restUrl = `${creds.url}/rest/v1/synap_conversations?id=eq.${encodeURIComponent(id)}`;
      const res = await fetch(restUrl, { method: 'DELETE', headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ configured: true, ok: true, deletedId: id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 6. LIMPAR TODAS AS CONVERSAS (CLEAR ALL)
    if (req.method === 'POST' && action === 'clear_all') {
      const restUrl = `${creds.url}/rest/v1/synap_conversations?id=neq.placeholder_never_matches`;
      const res = await fetch(restUrl, { method: 'DELETE', headers });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(JSON.stringify({ configured: true, ok: false, error: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ configured: true, ok: true, cleared: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
