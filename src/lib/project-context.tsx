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
