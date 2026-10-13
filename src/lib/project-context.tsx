import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SynapProject, ProjectFile, ProjectTemplate } from './types';
import {
  loadProject,
  saveProject,
  deleteProject,
  loadProjectIndex,
} from './project-storage';

interface ProjectContextType {
  /** Projeto atualmente aberto no workspace (null = nenhum) */
  activeProject: SynapProject | null;
  /** Lista de projetos (index para sidebar) */
  projectsIndex: Array<{
    id: string;
    name: string;
    template: string;
    conversationId?: string;
    updatedAt: number;
    fileCount: number;
    sourceRepoFullName?: string;
    sourceRepoBranch?: string;
  }>;
  loading: boolean;
  /** Abre um projeto no workspace */
  openProject: (id: string) => Promise<void>;
  /** Fecha o workspace sem deletar o projeto */
  closeProject: () => void;
  /** Cria um novo projeto do zero */
  createProject: (params: {
    name: string;
    description?: string;
    template: ProjectTemplate;
    files?: Record<string, string>;
    conversationId?: string;
  }) => Promise<SynapProject>;
  /** Atualiza arquivos do projeto ativo (auto-salva) */
  updateProjectFiles: (
    updates: Array<{ path: string; content: string; action: 'create' | 'update' | 'delete' }>
  ) => Promise<void>;
  /** Atualiza o conteúdo de um único arquivo */
  updateFileContent: (path: string, content: string) => Promise<void>;
  /** Deleta um projeto (do storage e fecha se ativo) */
  removeProject: (id: string) => Promise<void>;
  /** Renomeia um projeto */
  renameProject: (id: string, newName: string) => Promise<void>;
  /** Recarrega o index de projetos */
  refreshIndex: () => Promise<void>;
  /**
   * Sincroniza um repo GitHub como projeto Sandpack.
   * - Busca arquivos do repo
   * - Detecta template (react-ts, react, static, vanilla)
   * - Se já existe projeto com sourceRepoFullName+branch, reutiliza
   * - Caso contrário, cria novo projeto com os arquivos web do repo
   * - Abre o projeto automaticamente no workspace
   *
   * @returns { ok: boolean; reason?: string; project?: SynapProject }
   *   ok=true: projeto criado/reutilizado e aberto
   *   ok=false reason='not_web': repo não tem package.json nem index.html
   *   ok=false reason='fetch_error': erro ao buscar arquivos
   */
  syncRepoToProject: (params: {
    repoFullName: string;
    owner: string;
    repo: string;
    branch: string;
    conversationId?: string;
  }) => Promise<{ ok: boolean; reason?: string; project?: SynapProject }>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

function generateProjectId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Templates defaults com arquivos mínimos pra cada tipo */
const TEMPLATE_STARTERS: Record<ProjectTemplate, Record<string, string>> = {
  'react-ts': {
    'src/App.tsx': `export default function App() {\n  return (\n    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>\n      <h1>Hello Synap</h1>\n      <p>Edit src/App.tsx and save to see changes.</p>\n    </div>\n  );\n}\n`,
    'src/main.tsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
    'index.html': `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n`,
  },
  react: {
    'src/App.js': `export default function App() {\n  return (\n    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>\n      <h1>Hello Synap</h1>\n      <p>Edit src/App.js and save.</p>\n    </div>\n  );\n}\n`,
    'src/main.js': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
    'index.html': `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n`,
  },
  'vite-react-ts': {
    'src/App.tsx': `export default function App() {\n  return (\n    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>\n      <h1>Hello Synap (Vite + React + TS)</h1>\n    </div>\n  );\n}\n`,
    'src/main.tsx': `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
    'index.html': `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
  },
  'vanilla-ts': {
    'src/index.ts': `console.log('Hello Synap');\n\nconst app = document.getElementById('app');\nif (app) {\n  app.innerHTML = '<h1>Hello Synap</h1><p>Edit src/index.ts</p>';\n}\n`,
    'index.html': `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/index.ts"></script>\n  </body>\n</html>\n`,
  },
  vanilla: {
    'src/index.js': `console.log('Hello Synap');\n\nconst app = document.getElementById('app');\nif (app) {\n  app.innerHTML = '<h1>Hello Synap</h1><p>Edit src/index.js</p>';\n}\n`,
    'index.html': `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/index.js"></script>\n  </body>\n</html>\n`,
  },
  vue: {
    'src/App.vue': `<template>\n  <div style="padding: 20px; font-family: sans-serif">\n    <h1>Hello Synap</h1>\n    <p>Edit src/App.vue</p>\n  </div>\n</template>\n\n<script>\nexport default { name: 'App' };\n</script>\n`,
    'src/main.js': `import { createApp } from 'vue';\nimport App from './App.vue';\n\ncreateApp(App).mount('#app');\n`,
    'index.html': `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.js"></script>\n  </body>\n</html>\n`,
  },
  static: {
    'index.html': `<!doctype html>\n<html lang="pt-br">\n<head>\n  <meta charset="UTF-8">\n  <title>Synap Project</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello Synap</h1>\n  <p>Edit index.html</p>\n  <script src="script.js"></script>\n</body>\n</html>\n`,
    'style.css': `body { font-family: sans-serif; padding: 20px; }\nh1 { color: #d97757; }\n`,
    'script.js': `console.log('Hello Synap');\n`,
  },
  node: {
    'index.js': `console.log('Hello Synap from Node');\n`,
    'package.json': `{\n  "name": "synap-node-project",\n  "version": "1.0.0",\n  "type": "module",\n  "main": "index.js"\n}\n`,
  },
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeProject, setActiveProject] = useState<SynapProject | null>(null);
  const [projectsIndex, setProjectsIndex] = useState<ProjectContextType['projectsIndex']>([]);
  const [loading, setLoading] = useState(true);

  const refreshIndex = useCallback(async () => {
    const idx = await loadProjectIndex();
    setProjectsIndex(idx);
  }, []);

  useEffect(() => {
    refreshIndex().finally(() => setLoading(false));
  }, [refreshIndex]);

  const openProject = useCallback(async (id: string) => {
    const project = await loadProject(id);
    if (project) {
      setActiveProject(project);
    }
  }, []);

  const closeProject = useCallback(() => {
    setActiveProject(null);
  }, []);

  const createProject = useCallback<ProjectContextType['createProject']>(
    async (params) => {
      const id = generateProjectId();
      const now = Date.now();

      // Mescla arquivos do template starter com os fornecidos
      const starterFiles = TEMPLATE_STARTERS[params.template] || {};
      const allFiles: Record<string, ProjectFile> = {};

      // Primeiro os arquivos do template
      for (const [path, content] of Object.entries(starterFiles)) {
        allFiles[path] = { path, content, active: path.includes('App') || path === 'index.html' };
      }

      // Depois os arquivos customizados (sobrescreve se existir)
      if (params.files) {
        for (const [path, content] of Object.entries(params.files)) {
          allFiles[path] = { path, content };
        }
      }

      const project: SynapProject = {
        id,
        name: params.name,
        description: params.description,
        template: params.template,
        files: allFiles,
        conversationId: params.conversationId,
        createdAt: now,
        updatedAt: now,
      };

      await saveProject(project);
      await refreshIndex();
      setActiveProject(project);
      return project;
    },
    [refreshIndex]
  );

  const updateProjectFiles = useCallback<ProjectContextType['updateProjectFiles']>(
    async (updates) => {
      if (!activeProject) return;
      const newFiles = { ...activeProject.files };
      for (const u of updates) {
        if (u.action === 'delete') {
          delete newFiles[u.path];
        } else {
          newFiles[u.path] = {
            ...newFiles[u.path],
            path: u.path,
            content: u.content,
          };
        }
      }
      const updated = { ...activeProject, files: newFiles };
      setActiveProject(updated);
      await saveProject(updated);
      await refreshIndex();
    },
    [activeProject, refreshIndex]
  );

  const updateFileContent = useCallback<ProjectContextType['updateFileContent']>(
    async (path, content) => {
      if (!activeProject) return;
      const newFiles = {
        ...activeProject.files,
        [path]: { ...activeProject.files[path], path, content },
      };
      const updated = { ...activeProject, files: newFiles };
      setActiveProject(updated);
      await saveProject(updated);
      // Não chamamos refreshIndex a cada digitação — só no save manual
    },
    [activeProject]
  );

  const removeProject = useCallback<ProjectContextType['removeProject']>(
    async (id) => {
      await deleteProject(id);
      await refreshIndex();
      if (activeProject?.id === id) {
        setActiveProject(null);
      }
    },
    [activeProject, refreshIndex]
  );

  const renameProject = useCallback<ProjectContextType['renameProject']>(
    async (id, newName) => {
      if (!newName.trim()) return;
      const project = await loadProject(id);
      if (!project) return;
      const updated = { ...project, name: newName.trim(), updatedAt: Date.now() };
      await saveProject(updated);
      await refreshIndex();
      if (activeProject?.id === id) {
        setActiveProject(updated);
      }
    },
    [activeProject, refreshIndex]
  );

  /**
   * Sincroniza um repo GitHub como projeto Sandpack.
   * Faz fetch dos arquivos via /api/github e cria um projeto.
   */
  const syncRepoToProject = useCallback<ProjectContextType['syncRepoToProject']>(
    async (params) => {
      try {
        // Importa dinamicamente pra evitar circular dep
        const { callGitHubApi } = await import('./github');

        // 1. Busca a árvore de arquivos do repo
        const treeData: any = await callGitHubApi('files', {
          owner: params.owner,
          repo: params.repo,
          branch: params.branch,
        });

        const allFiles = Array.isArray(treeData?.tree) ? treeData.tree : [];

        // 2. Detecta se é web: package.json OU index.html na raiz
        const hasPackageJson = allFiles.some(
          (f: any) => f.path === 'package.json' || f.path === '/package.json'
        );
        const hasIndexHtml = allFiles.some(
          (f: any) => f.path === 'index.html' || f.path === '/index.html'
        );

        if (!hasPackageJson && !hasIndexHtml) {
          return { ok: false, reason: 'not_web' };
        }

        // 3. Determina template
        let template: ProjectTemplate = 'static';
        let detectedTemplate: string = 'static';
        const hasTsx = allFiles.some(
          (f: any) =>
            f.path === 'src/App.tsx' ||
            f.path === '/src/App.tsx' ||
            f.path?.endsWith('App.tsx')
        );
        const hasJsx = allFiles.some(
          (f: any) =>
            f.path === 'src/App.js' ||
            f.path === '/src/App.js' ||
            f.path?.endsWith('App.js')
        );
        if (hasPackageJson && hasTsx) { template = 'react-ts'; detectedTemplate = 'react-ts'; }
        else if (hasPackageJson && hasJsx) { template = 'react'; detectedTemplate = 'react'; }
        else if (hasPackageJson) { template = 'vanilla'; detectedTemplate = 'vanilla'; }
        else if (hasIndexHtml) { template = 'static'; detectedTemplate = 'static'; }

        // 4. Filtra arquivos web relevantes (limite ~30 arquivos pra não estourar)
        const WEB_EXTENSIONS = [
          '.tsx', '.ts', '.jsx', '.js', '.html', '.css', '.scss',
          '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
          '.md',
        ];
        const SKIP_PATHS = [
          'node_modules/', 'dist/', 'build/', '.git/', '.next/',
          'coverage/', '.cache/', '.vscode/', '.idea/',
        ];
        const webFiles = allFiles
          .filter((f: any) => {
            if (f.type === 'tree') return false;
            const path = (f.path || '').replace(/^\//, '');
            if (SKIP_PATHS.some((s) => path.startsWith(s))) return false;
            return WEB_EXTENSIONS.some((ext) => path.endsWith(ext));
          })
          .slice(0, 40);

        // 5. Verifica se já existe projeto pra este repo+branch
        const existing = projectsIndex.find(
          (p: any) =>
            p.sourceRepoFullName === params.repoFullName &&
            p.sourceRepoBranch === params.branch
        );

        let projectId: string;
        let projectName: string;
        let projectFiles: Record<string, ProjectFile> = {};

        if (existing) {
          // Reutiliza o ID do projeto existente, mas sempre re-busca os arquivos
          // (pra corrigir projetos bugados de versões anteriores e pegar mudanças do repo)
          projectId = existing.id;
          projectName = existing.name;
        } else {
          projectId = generateProjectId();
          projectName = params.repo; // nome do repo
        }

        // 6. Busca conteúdo de cada arquivo (em paralelo, limite 5 por vez)
        // Decodifica base64 com suporte UTF-8 correto (acentos, emojis)
        const decodeBase64Utf8 = (b64: string): string => {
          try {
            const cleaned = b64.replace(/\n/g, '').replace(/\r/g, '');
            const binary = atob(cleaned);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
          } catch {
            return '';
          }
        };

        const fetchFileContent = async (filePath: string): Promise<string> => {
          try {
            const res: any = await callGitHubApi('file_content', {
              owner: params.owner,
              repo: params.repo,
              path: filePath,
              branch: params.branch,
            });
            // GitHub API retorna { content: base64, encoding: 'base64', size: number }
            // Pula arquivos muito grandes (>500KB) que podem crashar o Sandpack
            if (typeof res.size === 'number' && res.size > 500_000) {
              return '';
            }
            // GitHub API retorna { content: base64, encoding: 'base64' }
            if (res.content && res.encoding === 'base64') {
              return decodeBase64Utf8(res.content);
            }
            // Algumas respostas vêm como string direta
            if (typeof res.content === 'string' && !res.encoding) {
              return res.content;
            }
            return '';
          } catch {
            return '';
          }
        };

        // Processa em batches de 5 pra não estourar rate limit
        const batchSize = 5;
        const filePaths = webFiles
          .map((f: any) => (f.path || '').replace(/^\//, ''))
          // Pula arquivos muito grandes pelo size retornado pela tree
          .filter((p: string) => {
            const fileMeta = webFiles.find((f: any) => (f.path || '').replace(/^\//, '') === p);
            return !fileMeta || typeof fileMeta.size !== 'number' || fileMeta.size <= 500_000;
          });
        for (let i = 0; i < filePaths.length; i += batchSize) {
          const batch = filePaths.slice(i, i + batchSize);
          const contents = await Promise.all(batch.map(fetchFileContent));
          batch.forEach((path: string, idx: number) => {
            const content = contents[idx];
            if (content !== undefined && content !== '') {
              const isActive =
                path === 'src/App.tsx' ||
                path === 'src/App.js' ||
                path === 'index.html' ||
                path.endsWith('App.tsx') ||
                path.endsWith('App.js');
              projectFiles[path] = { path, content, active: isActive };
            }
          });
        }

        // Se não veio nenhum arquivo web, falha graciosamente
        if (Object.keys(projectFiles).length === 0) {
          return { ok: false, reason: 'not_web' };
        }

        // 6.5 Garante entry points mínimos pro Sandpack funcionar
        // Sandpack react-ts precisa de /index.html e /src/main.tsx (ou App.tsx)
        const isReactTemplate = detectedTemplate === 'react-ts' || detectedTemplate === 'react' || detectedTemplate === 'vite-react-ts';
        if (isReactTemplate) {
          const isTs = detectedTemplate === 'react-ts' || detectedTemplate === 'vite-react-ts';
          const mainPath = isTs ? 'src/main.tsx' : 'src/main.js';
          const appPath = isTs ? 'src/App.tsx' : 'src/App.js';

          // Se não tem index.html, cria um mínimo
          if (!projectFiles['index.html']) {
            projectFiles['index.html'] = {
              path: 'index.html',
              content: `<!doctype html>\n<html lang="pt-br">\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/${mainPath}"></script>\n  </body>\n</html>\n`,
            };
          } else {
            // Garante que o index.html tem a div#root e o script pro main
            const html = projectFiles['index.html'].content;
            if (!html.includes('id="root"') && !html.includes("id='root'")) {
              projectFiles['index.html'].content = html.replace(
                '<body>',
                '<body>\n    <div id="root"></div>'
              );
            }
            if (!html.includes(mainPath)) {
              projectFiles['index.html'].content = projectFiles['index.html'].content.replace(
                '</body>',
                `    <script type="module" src="/${mainPath}"></script>\n  </body>`
              );
            }
          }

          // Se não tem main.tsx/jsx, cria um mínimo que importa o App
          if (!projectFiles[mainPath]) {
            const importPath = `./${appPath.split('/').pop()?.replace(/\.(tsx|jsx?|js)$/, '') || 'App'}`;
            projectFiles[mainPath] = {
              path: mainPath,
              content: isTs
                ? `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from '${importPath}';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`
                : `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from '${importPath}';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
            };
          }

          // Se não tem App.tsx/jsx, cria um placeholder
          if (!projectFiles[appPath]) {
            projectFiles[appPath] = {
              path: appPath,
              content: isTs
                ? `export default function App() {\n  return (\n    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>\n      <h1>${projectName}</h1>\n      <p>Edit ${appPath} and save to see changes.</p>\n    </div>\n  );\n}\n`
                : `export default function App() {\n  return (\n    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>\n      <h1>${projectName}</h1>\n      <p>Edit ${appPath} and save.</p>\n    </div>\n  );\n}\n`,
              active: true,
            };
          }
        }

        // 7. Parseia package.json pra extrair dependencies (CRÍTICO pro Sandpack)
        let dependencies: Record<string, string> = {};
        const pkgJsonFile = projectFiles['package.json'];
        if (pkgJsonFile) {
          try {
            const pkg = JSON.parse(pkgJsonFile.content);
            dependencies = {
              ...(pkg.dependencies || {}),
              ...(pkg.devDependencies || {}),
            };
            // Remove dependencies que o Sandpack já inclui no template
            delete dependencies['react'];
            delete dependencies['react-dom'];
            delete dependencies['react-scripts'];
            // Remove test/dev tools que o Sandpack não precisa
            delete dependencies['@types/react'];
            delete dependencies['@types/react-dom'];
            delete dependencies['@types/node'];
            delete dependencies['typescript'];
            delete dependencies['vite'];
            delete dependencies['@vitejs/plugin-react'];
          } catch {
            // package.json inválido — deixa sem dependencies
          }
        }
        const finalDependencies = Object.keys(dependencies).length > 0 ? dependencies : undefined;

        // 8. Cria/atualiza o projeto
        const now = Date.now();
        const project: SynapProject = {
          id: projectId,
          conversationId: params.conversationId,
          name: projectName,
          description: `Sincronizado de ${params.repoFullName} (${params.branch})`,
          template,
          files: projectFiles,
          dependencies: finalDependencies,
          createdAt: now,
          updatedAt: now,
          sourceRepoFullName: params.repoFullName,
          sourceRepoBranch: params.branch,
        };

        await saveProject(project);
        await refreshIndex();
        await openProject(projectId);

        return { ok: true, project };
      } catch (err: any) {
        console.error('syncRepoToProject error:', err);
        return { ok: false, reason: 'fetch_error' };
      }
    },
    [projectsIndex, openProject, refreshIndex]
  );

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        projectsIndex,
        loading,
        openProject,
        closeProject,
        createProject,
        updateProjectFiles,
        updateFileContent,
        removeProject,
        renameProject,
        refreshIndex,
        syncRepoToProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export function useProjects() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
}
