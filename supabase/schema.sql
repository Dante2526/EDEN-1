-- ============================================================================
-- Éden / Synap — Schema Oficial do Banco de Dados Supabase (PostgreSQL)
-- ============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para criar as
-- tabelas de repositórios, conversas e estado do usuário com RLS ativado.

-- 1. TABELA DE REPOSITÓRIOS E PROJETOS
CREATE TABLE IF NOT EXISTS public.synap_repositories (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT,
  branch TEXT NOT NULL DEFAULT 'main',
  name TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL DEFAULT 'react-ts',
  files JSONB NOT NULL DEFAULT '{}'::jsonb,
  dependencies JSONB,
  conversation_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_synap_repositories_repo_branch
  ON public.synap_repositories (repo_full_name, branch)
  WHERE repo_full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_synap_repositories_updated_at
  ON public.synap_repositories (updated_at DESC);

ALTER TABLE public.synap_repositories ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'synap_repositories' 
    AND policyname = 'Service role full access on synap_repositories'
  ) THEN
    CREATE POLICY "Service role full access on synap_repositories" 
    ON public.synap_repositories 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);
  END IF;
END $$;

-- 2. TABELA DE CONVERSAS DO CHAT (HISTÓRICO EM NUVEM)
CREATE TABLE IF NOT EXISTS public.synap_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  model TEXT,
  reasoning_effort TEXT DEFAULT 'high',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_repo JSONB,
  is_plan_mode BOOLEAN DEFAULT false,
  active_prompt_mode TEXT,
  is_web_search_mode BOOLEAN DEFAULT false,
  context_compaction JSONB,
  is_archived BOOLEAN DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_synap_conversations_updated_at 
  ON public.synap_conversations (updated_at DESC);

ALTER TABLE public.synap_conversations ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'synap_conversations' 
    AND policyname = 'Service role full access on synap_conversations'
  ) THEN
    CREATE POLICY "Service role full access on synap_conversations" 
    ON public.synap_conversations 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);
  END IF;
END $$;

-- 3. TABELA DE ESTADO UNIFICADO DO USUÁRIO (MEMÓRIA IA, SETTINGS, SKILLS, MCP)
CREATE TABLE IF NOT EXISTS public.synap_user_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  mcp_servers JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE public.synap_user_state ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'synap_user_state' 
    AND policyname = 'Service role full access on synap_user_state'
  ) THEN
    CREATE POLICY "Service role full access on synap_user_state" 
    ON public.synap_user_state 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);
  END IF;
END $$;
