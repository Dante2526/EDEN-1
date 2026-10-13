import { get, set, del, keys } from 'idb-keyval';
import { SynapProject, ProjectFile } from './types';

const PROJECTS_KEY_PREFIX = 'synap_project_';
const PROJECTS_INDEX_KEY = 'synap_projects_index';

interface ProjectIndexItem {
  id: string;
  name: string;
  template: string;
  conversationId?: string;
  updatedAt: number;
  fileCount: number;
}

export async function loadProjectIndex(): Promise<ProjectIndexItem[]> {
  try {
    const idx = await get<ProjectIndexItem[]>(PROJECTS_INDEX_KEY);
    return (idx || []).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('Failed to load project index:', err);
    return [];
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
  });
  await set(PROJECTS_INDEX_KEY, filtered.slice(0, 100));
}

async function removeFromIndex(projectId: string): Promise<void> {
  const idx = await loadProjectIndex();
  await set(
    PROJECTS_INDEX_KEY,
    idx.filter((p) => p.id !== projectId)
  );
}

export async function loadProject(id: string): Promise<SynapProject | null> {
  try {
    return (await get<SynapProject>(`${PROJECTS_KEY_PREFIX}${id}`)) || null;
  } catch (err) {
    console.error('Failed to load project:', err);
    return null;
  }
}

export async function saveProject(project: SynapProject): Promise<void> {
  try {
    project.updatedAt = Date.now();
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
