import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildPreviewHtmlPreTranspiled,
  depToUrl,
  getBasePackageName,
  normalizePath,
  resolveImportPath,
} from './preview-html';
import { SynapProject } from './types';

describe('Preview HTML Generator', () => {
  it('deve preservar o corpo e estilos de projeto estático com index.html puro', () => {
    const project: SynapProject = {
      id: 'static-proj',
      name: 'Site Estático',
      template: 'static',
      files: {
        'index.html': {
          path: 'index.html',
          content: '<!DOCTYPE html><html><head><title>Meu LinkHub</title></head><body class="bg-black text-white"><h1>Meus Links</h1></body></html>',
        },
        'style.css': {
          path: 'style.css',
          content: 'body { margin: 0; }',
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const html = buildPreviewHtmlPreTranspiled(project, {});
    assert.match(html, /<body class="bg-black text-white"/i);
    assert.match(html, /<h1>Meus Links<\/h1>/i);
    assert.match(html, /body \{ margin: 0; \}/);
  });

  it('deve unificar react e react-dom/client sem conflito de singleton', () => {
    const reactUrl = depToUrl('react', '^19.0.1', '19.0.1');
    const clientUrl = depToUrl('react-dom/client', '^19.0.1', '19.0.1');
    const domUrl = depToUrl('react-dom', '^19.0.1', '19.0.1');

    assert.ok(reactUrl.includes('react@19.0.1'));
    assert.ok(clientUrl.includes('react-dom@19.0.1/client'));
    assert.ok(domUrl.includes('react-dom@19.0.1'));
  });

  it('deve resolver caminhos relativos e aliases corretamente', () => {
    assert.strictEqual(resolveImportPath('src/main.tsx', './App.tsx'), 'src/App.tsx');
    assert.strictEqual(resolveImportPath('src/App.tsx', './components/Preview'), 'src/components/Preview');
    assert.strictEqual(resolveImportPath('src/components/Editor.tsx', '../types'), 'src/types');
    assert.strictEqual(resolveImportPath('src/App.tsx', '@/components/Login'), 'src/components/Login');
  });

  it('deve gerar bundle executável para projeto React com main.tsx e App.tsx', () => {
    const project: SynapProject = {
      id: 'react-proj',
      name: 'LinkHub',
      template: 'react-ts',
      files: {
        'package.json': {
          path: 'package.json',
          content: JSON.stringify({
            dependencies: {
              react: '^19.0.1',
              'react-dom': '^19.0.1',
              'lucide-react': '^0.546.0',
            },
          }),
        },
        'index.html': {
          path: 'index.html',
          content: '<!DOCTYPE html><html><body><div id="root"></div></body></html>',
        },
        'src/main.tsx': {
          path: 'src/main.tsx',
          content: "import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);",
        },
        'src/App.tsx': {
          path: 'src/App.tsx',
          content: "export default function App() { return <h1>LinkHub no Ar</h1>; }",
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const preTranspiled = {
      'src/main.tsx': 'var _client = require("react-dom/client"); var _App = require("./App"); (0, _client.createRoot)(document.getElementById("root")).render(React.createElement(_App.default));',
      'src/App.tsx': 'exports.default = function App() { return React.createElement("h1", null, "LinkHub no Ar"); };',
    };

    const html = buildPreviewHtmlPreTranspiled(project, preTranspiled);
    assert.match(html, /src\/main\.tsx/);
    assert.match(html, /src\/App\.tsx/);
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /synapRequire/);
  });

  it('deve injetar proteção anti-glitch branco no head e emitir evento __SYNAP_PREVIEW_READY__ após montar', () => {
    const project: SynapProject = {
      id: 'instant-proj',
      name: 'Instant App',
      template: 'react-ts',
      files: {
        'src/App.tsx': {
          path: 'src/App.tsx',
          content: 'export default function App() { return <div>Ok</div>; }',
        },
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const html = buildPreviewHtmlPreTranspiled(project, {
      'src/App.tsx': 'exports.default = function App() { return React.createElement("div", null, "Ok"); };',
    });

    assert.match(html, /background-color:\s*#09090b/);
    assert.match(html, /__SYNAP_PREVIEW_READY__/);
  });
});
