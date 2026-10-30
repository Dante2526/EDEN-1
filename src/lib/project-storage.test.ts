import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedRepoFile,
  setCachedRepoFile,
  getCachedRepoFileMap,
  populateRepoCacheFromProject,
  clearRepoMemoryCache,
} from './project-storage.js';
import type { SynapProject } from './types.js';

describe('Project Storage & Repository Deduplication Cache (0ms Access)', () => {
  beforeEach(() => {
    clearRepoMemoryCache();
  });

  it('deve armazenar e recuperar arquivos de um repositório em 0ms normalizando caminhos', () => {
    setCachedRepoFile('Dante2526/Synap', 'main', '/src/components/chat-header.tsx', 'export const Header = () => null;');

    const content1 = getCachedRepoFile('Dante2526/Synap', 'main', 'src/components/chat-header.tsx');
    const content2 = getCachedRepoFile('Dante2526/Synap', 'main', './src/components/chat-header.tsx');

    assert.equal(content1, 'export const Header = () => null;');
    assert.equal(content2, 'export const Header = () => null;');
  });

  it('deve popular o cache em memória a partir de um projeto sincronizado do banco de dados', () => {
    const mockProject: SynapProject = {
      id: 'proj_123',
      name: 'Synap',
      template: 'react-ts',
      sourceRepoFullName: 'Dante2526/Synap',
      sourceRepoBranch: 'main',
      createdAt: 1000,
      updatedAt: 2000,
      files: {
        'src/App.tsx': { path: 'src/App.tsx', content: 'function App() {}' },
        'src/components/Button.tsx': { path: 'src/components/Button.tsx', content: '<button>Click</button>' },
      },
    };

    populateRepoCacheFromProject(mockProject);

    assert.equal(getCachedRepoFile('Dante2526/Synap', 'main', 'src/App.tsx'), 'function App() {}');
    assert.equal(getCachedRepoFile('Dante2526/Synap', 'main', 'src/components/Button.tsx'), '<button>Click</button>');

    const fileMap = getCachedRepoFileMap('Dante2526/Synap', 'main');
    assert.ok(fileMap);
    assert.equal(Object.keys(fileMap!).length, 2);
  });
});
