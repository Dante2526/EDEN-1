import { get, set, del } from 'idb-keyval';
import { SynapProject, ProjectFile } from './types.js';
import { normalizeRepoPath } from './file-patcher.js';

const PROJECTS_KEY_PREFIX = 'synap_project_';
const PROJECTS_INDEX_KEY = 'synap_projects_index';
const ACTIVE_PROJECT_CACHE_KEY = 'synap_cached_active_project';
const INDEX_CACHE_KEY = 'synap_cached_projects_index';

// ============================================================================
// L0 In-Memory Cache para acesso instantâneo (0ms) pelo Agente nas tools
// read_file, patch_file, edit_file, list_files e search_code
// ============================================================================
const repoMemoryCache = new Map<string, Record<string, string>>();

function makeRepoCacheKey(repoFullName: string, branch: string = 'main'): string {
  return `${repoFullName.trim().toLowerCase()}@${(branch || 'main').trim()}`;
}

export function clearRepoMemoryCache(): void {
  repoMemoryCache.clear();
}

export function setCachedRepoFile(
  repoFullName: string,
  branch: string,
  path: string,
  content: string
): void {
  if (!repoFullName || !path) return;
  const key = makeRepoCacheKey(repoFullName, branch);
  const cleanPath = normalizeRepoPath(path);
  let map = repoMemoryCache.get(key);
  if (!map) {
    map = {};
    repoMemoryCache.set(key, map);
  }
  map[cleanPath] = content;
}

export function getCachedRepoFile(
  repoFullName: string,
  branch: string,
  path: string
): string | undefined {
  if (!repoFullName || !path) return undefined;
  const key = makeRepoCacheKey(repoFullName, branch);
  const map = repoMemoryCache.get(key);
  if (!map) return undefined;
  const cleanPath = normalizeRepoPath(path);
  return map[cleanPath];
}

export function getCachedRepoFileMap(
  repoFullName: string,
  branch: string
): Record<string, string> | undefined {
  if (!repoFullName) return undefined;
  const key = makeRepoCacheKey(repoFullName, branch);
  return repoMemoryCache.get(key);
}

export function populateRepoCacheFromProject(project: SynapProject | null | undefined): void {
  if (!project || !project.sourceRepoFullName || !project.files) return;
  const branch = project.sourceRepoBranch || 'main';
  const key = makeRepoCacheKey(project.sourceRepoFullName, branch);
  const map: Record<string, string> = repoMemoryCache.get(key) || {};
  for (const [rawPath, fileEntry] of Object.entries(project.files)) {
    const cleanPath = normalizeRepoPath(rawPath);
    const content = typeof fileEntry === 'string' ? fileEntry : fileEntry?.content;
    if (typeof content === 'string') {
      map[cleanPath] = content;
    }
  }
  repoMemoryCache.set(key, map);
}

// ============================================================================
// Cliente de Sincronização com o Banco de Dados Supabase (/api/db-projects)
// ============================================================================
function getApiHeaders(): Record<string, string> {
  const secret =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_API_SECRET || ''
      : '';
  return {
    'Content-Type': 'application/json',
    'x-api-key': secret,
  };
}

async function fetchFromSupabaseDb(params: Record<string, string>): Promise<any | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/db-projects?${qs}`, {
      method: 'GET',
      headers: getApiHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.configured || !data?.ok) return null;
    return data;
  } catch {
    return null;
  }
}

async function upsertToSupabaseDb(project: SynapProject): Promise<SynapProject | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/db-projects?action=upsert', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ project }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.configured && data?.ok && data?.project) {
      return data.project as SynapProject;
    }
    return null;
  } catch {
    return null;
  }
}

async function deleteFromSupabaseDb(id: string): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const qs = new URLSearchParams({ action: 'delete', id }).toString();
    await fetch(`/api/db-projects?${qs}`, {
      method: 'DELETE',
      headers: getApiHeaders(),
    });
  } catch {}
}

export function getCachedActiveProject(): SynapProject | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_PROJECT_CACHE_KEY);
    const proj = raw ? (JSON.parse(raw) as SynapProject) : null;
    if (proj) populateRepoCacheFromProject(proj);
    return proj;
  } catch {
    return null;
  }
}

export function setCachedActiveProject(project: SynapProject | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (project) {
      populateRepoCacheFromProject(project);
      localStorage.setItem(ACTIVE_PROJECT_CACHE_KEY, JSON.stringify(project));
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_CACHE_KEY);
    }
  } catch {}
}

export function getCachedProjectIndex(): ProjectIndexItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INDEX_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface ProjectIndexItem {
  id: string;
  name: string;
  template: string;
  conversationId?: string;
  updatedAt: number;
  fileCount: number;
  sourceRepoFullName?: string;
  sourceRepoBranch?: string;
}

export async function loadProjectIndex(): Promise<ProjectIndexItem[]> {
  try {
    const localIdx = (await get<ProjectIndexItem[]>(PROJECTS_INDEX_KEY)) || [];

    // Sincroniza lista com o banco de dados Supabase se configurado
    const remoteData = await fetchFromSupabaseDb({ action: 'list' });
    let merged = [...localIdx];

    if (remoteData && Array.isArray(remoteData.items)) {
      const byKey = new Map<string, ProjectIndexItem>();
      for (const item of [...remoteData.items, ...localIdx]) {
        const dedupKey = item.sourceRepoFullName
          ? `${item.sourceRepoFullName.toLowerCase()}@${item.sourceRepoBranch || 'main'}`
          : item.id;
        const existing = byKey.get(dedupKey);
        if (!existing || item.updatedAt > existing.updatedAt) {
          byKey.set(dedupKey, item);
        }
      }
      merged = Array.from(byKey.values());
      await set(PROJECTS_INDEX_KEY, merged.slice(0, 100));
    }

    const sorted = merged.sort((a, b) => b.updatedAt - a.updatedAt);
    try {
      localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(sorted.slice(0, 20)));
    } catch {}
    return sorted;
  } catch (err) {
    console.error('Failed to load project index:', err);
    return getCachedProjectIndex();
  }
}

async function updateProjectIndex(project: SynapProject): Promise<void> {
  const idx = (await get<ProjectIndexItem[]>(PROJECTS_INDEX_KEY)) || [];
  // Deduplica tanto por id quanto por (sourceRepoFullName + sourceRepoBranch)
  const filtered = idx.filter((p) => {
    if (p.id === project.id) return false;
    if (
      project.sourceRepoFullName &&
      p.sourceRepoFullName?.toLowerCase() === project.sourceRepoFullName.toLowerCase() &&
      (p.sourceRepoBranch || 'main') === (project.sourceRepoBranch || 'main')
    ) {
      return false;
    }
    return true;
  });
  filtered.unshift({
    id: project.id,
    name: project.name,
    template: project.template,
    conversationId: project.conversationId,
    updatedAt: project.updatedAt,
    fileCount: Object.keys(project.files).length,
    sourceRepoFullName: project.sourceRepoFullName,
    sourceRepoBranch: project.sourceRepoBranch,
  });
  await set(PROJECTS_INDEX_KEY, filtered.slice(0, 100));
  try {
    localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch {}
}

async function removeFromIndex(projectId: string): Promise<void> {
  const idx = (await get<ProjectIndexItem[]>(PROJECTS_INDEX_KEY)) || [];
  const updated = idx.filter((p) => p.id !== projectId);
  await set(PROJECTS_INDEX_KEY, updated);
  try {
    localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(updated.slice(0, 20)));
  } catch {}
}

/**
 * Busca um repositório já salvo no Banco de Dados (Supabase ou Cache L1)
 * por `repoFullName` + `branch` para reaproveitá-lo instantaneamente em
 * qualquer chat sem duplicar nem baixar tudo de novo do GitHub.
 */
export async function findProjectByRepo(
  repoFullName: string,
  branch: string = 'main'
): Promise<SynapProject | null> {
  if (!repoFullName) return null;
  const targetRepo = repoFullName.trim().toLowerCase();
  const targetBranch = (branch || 'main').trim();

  // 1. Verifica projeto ativo em memória/localStorage (0ms)
  const active = getCachedActiveProject();
  if (
    active &&
    active.sourceRepoFullName?.toLowerCase() === targetRepo &&
    (active.sourceRepoBranch || 'main') === targetBranch &&
    Object.keys(active.files || {}).length > 0
  ) {
    populateRepoCacheFromProject(active);
    return active;
  }

  // 2. Verifica no índice local L1 (IndexedDB)
  try {
    const localIdx = (await get<ProjectIndexItem[]>(PROJECTS_INDEX_KEY)) || [];
    const match = localIdx.find(
      (p) =>
        p.sourceRepoFullName?.toLowerCase() === targetRepo &&
        (p.sourceRepoBranch || 'main') === targetBranch
    );
    if (match) {
      const localProj = await get<SynapProject>(`${PROJECTS_KEY_PREFIX}${match.id}`);
      if (localProj && Object.keys(localProj.files || {}).length > 0) {
        populateRepoCacheFromProject(localProj);
        return localProj;
      }
    }
  } catch {}

  // 3. Consulta o Banco de Dados Supabase (compartilhado entre todos os chats e dispositivos)
  const remoteData = await fetchFromSupabaseDb({
    action: 'get',
    repoFullName: repoFullName.trim(),
    branch: targetBranch,
  });
  if (remoteData?.project && Object.keys(remoteData.project.files || {}).length > 0) {
    const proj = remoteData.project as SynapProject;
    populateRepoCacheFromProject(proj);
    try {
      await set(`${PROJECTS_KEY_PREFIX}${proj.id}`, proj);
      await updateProjectIndex(proj);
    } catch {}
    return proj;
  }

  return null;
}

export async function loadProject(id: string): Promise<SynapProject | null> {
  try {
    let proj = (await get<SynapProject>(`${PROJECTS_KEY_PREFIX}${id}`)) || null;
    if (!proj) {
      const remoteData = await fetchFromSupabaseDb({ action: 'get', id });
      if (remoteData?.project) {
        proj = remoteData.project as SynapProject;
        await set(`${PROJECTS_KEY_PREFIX}${proj.id}`, proj);
      }
    }
    if (proj) {
      populateRepoCacheFromProject(proj);
      setCachedActiveProject(proj);
    }
    return proj;
  } catch (err) {
    console.error('Failed to load project:', err);
    const cached = getCachedActiveProject();
    return cached && cached.id === id ? cached : null;
  }
}

export async function saveProject(project: SynapProject): Promise<void> {
  try {
    project.updatedAt = Date.now();
    populateRepoCacheFromProject(project);
    setCachedActiveProject(project);
    await set(`${PROJECTS_KEY_PREFIX}${project.id}`, project);
    await updateProjectIndex(project);
    // Persiste de forma assíncrona no Banco de Dados Supabase (UPSERT sem duplicar)
    void upsertToSupabaseDb(project);
  } catch (err) {
    console.error('Failed to save project:', err);
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await del(`${PROJECTS_KEY_PREFIX}${id}`);
    await removeFromIndex(id);
    void deleteFromSupabaseDb(id);
  } catch (err) {
    console.error('Failed to delete project:', err);
  }
}

export async function listProjectsForConversation(
  conversationId: string
): Promise<ProjectIndexItem[]> {
  const idx = await loadProjectIndex();
  return idx.filter((p) => p.conversationId === conversationId);
}

/**
 * Converte um SynapProject para o formato esperado pelo Sandpack.
 */
export function projectToSandpackFiles(
  project: SynapProject
): Record<string, { code: string; hidden?: boolean; active?: boolean }> {
  const result: Record<string, { code: string; hidden?: boolean; active?: boolean }> = {};
  for (const [path, file] of Object.entries(project.files)) {
    result[path] = {
      code: file.content,
      hidden: file.hidden,
      active: file.active,
    };
  }
  return result;
}

/**
 * Converte arquivos do Sandpack (string) para o formato interno (ProjectFile).
 */
export function filesToProject(
  files: Record<string, string | { code: string; hidden?: boolean; active?: boolean }>,
  _template: SynapProject['template']
): Record<string, ProjectFile> {
  const result: Record<string, ProjectFile> = {};
  for (const [path, value] of Object.entries(files)) {
    if (typeof value === 'string') {
      result[path] = { path, content: value };
    } else {
      result[path] = {
        path,
        content: value.code,
        hidden: value.hidden,
        active: value.active,
      };
    }
  }
  return result;
}
