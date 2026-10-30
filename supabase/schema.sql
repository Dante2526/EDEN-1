-- ============================================================================
-- Éden / Synap — Schema Oficial do Banco de Dados Supabase (PostgreSQL)
-- ============================================================================
-- Execute este script no SQL Editor do seu projeto Supabase para criar a
-- tabela de repositórios e projetos sincronizados com deduplicação automática.

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

-- Índice único para garantir que o mesmo repositório (owner/repo + branch)
-- NUNCA seja salvo duplicado no banco de dados e possa ser reaproveitado
-- instantaneamente em qualquer chat via UPSERT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_synap_repositories_repo_branch
  ON public.synap_repositories (repo_full_name, branch)
  WHERE repo_full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_synap_repositories_updated_at
  ON public.synap_repositories (updated_at DESC);
