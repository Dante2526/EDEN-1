import { get, set, del, keys } from 'idb-keyval';
import { SynapProject, ProjectFile } from './types';

const PROJECTS_KEY_PREFIX = 'synap_project_';
const PROJECTS_INDEX_KEY = 'synap_projects_index';
const ACTIVE_PROJECT_CACHE_KEY = 'synap_cached_active_project';
const INDEX_CACHE_KEY = 'synap_cached_projects_index';

export function getCachedActiveProject(): SynapProject | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_PROJECT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedActiveProject(project: SynapProject | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (project) {
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
    const idx = await get<ProjectIndexItem[]>(PROJECTS_INDEX_KEY);
    const sorted = (idx || []).sort((a, b) => b.updatedAt - a.updatedAt);
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
  const idx = await loadProjectIndex();
  const filtered = idx.filter((p) => p.id !== project.id);
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
  const idx = await loadProjectIndex();
  const updated = idx.filter((p) => p.id !== projectId);
  await set(PROJECTS_INDEX_KEY, updated);
  try {
    localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(updated.slice(0, 20)));
  } catch {}
}

export async function loadProject(id: string): Promise<SynapProject | null> {
  try {
    const proj = (await get<SynapProject>(`${PROJECTS_KEY_PREFIX}${id}`)) || null;
    if (proj) {
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
    setCachedActiveProject(project);
    await set(`${PROJECTS_KEY_PREFIX}${project.id}`, project);
    await updateProjectIndex(project);
  } catch (err) {
    console.error('Failed to save project:', err);
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await del(`${PROJECTS_KEY_PREFIX}${id}`);
    await removeFromIndex(id);
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
 * Sandpack espera um Record<string, string> onde a chave é o caminho e o valor é o conteúdo.
 * Opcionalmente pode prefixar com "/" para arquivos "main".
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
  template: SynapProject['template']
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
