import { describe, it } from 'node:test';
import assert from 'node:assert';
import { locateElementInProjectFiles } from './preview-element-locator';
import { SelectedPreviewElement } from './types';

describe('Preview Element Source Locator (Localização de Componentes no Código-Fonte)', () => {
  const mockProjectFiles: Record<string, string> = {
    'src/App.tsx': `import React from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Header />
      <main className="p-8">
        <h1 className="text-3xl font-bold">Painel de Controle</h1>
        <button id="cta-start" className="px-6 py-2.5 bg-emerald-600 rounded-xl font-medium">
          Iniciar Sessão
        </button>
      </main>
      <Footer />
    </div>
  );
}`,
    'src/components/Header.tsx': `export function Header() {
  return (
    <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6">
      <div className="font-bold text-lg text-emerald-400">Éden Workspace</div>
      <nav className="flex gap-4">
        <a href="#home" className="text-sm text-slate-300 hover:text-white">Início</a>
        <button className="px-3 py-1 bg-slate-800 text-xs rounded-lg">Entrar</button>
      </nav>
    </header>
  );
}`,
    'index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <title>Meu App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  };

  it('deve localizar o arquivo, linha e snippet exatos através do textContent', () => {
    const element: SelectedPreviewElement = {
      id: 'elem_1',
      tagName: 'button',
      className: 'px-6 py-2.5 bg-emerald-600 rounded-xl font-medium',
      textContent: 'Iniciar Sessão',
      selector: 'div#root > div > main > button#cta-start',
      outerHtmlSnippet: '<button id="cta-start" class="px-6 py-2.5 bg-emerald-600 rounded-xl font-medium">Iniciar Sessão</button>',
    };

    const location = locateElementInProjectFiles(element, mockProjectFiles);
    assert.ok(location);
    assert.strictEqual(location?.filePath, 'src/App.tsx');
    assert.strictEqual(location?.lineNumber, 11);
    assert.match(location?.codeSnippet || '', /Iniciar Sessão/);
    assert.strictEqual(location?.confidence, 'high');
  });

  it('deve localizar componente em arquivo filho através de texto e classes específicas', () => {
    const element: SelectedPreviewElement = {
      id: 'elem_2',
      tagName: 'div',
      className: 'font-bold text-lg text-emerald-400',
      textContent: 'Éden Workspace',
      selector: 'div#root > div > header > div.font-bold',
      outerHtmlSnippet: '<div class="font-bold text-lg text-emerald-400">Éden Workspace</div>',
    };

    const location = locateElementInProjectFiles(element, mockProjectFiles);
    assert.ok(location);
    assert.strictEqual(location?.filePath, 'src/components/Header.tsx');
    assert.strictEqual(location?.lineNumber, 4);
    assert.strictEqual(location?.confidence, 'high');
  });

  it('deve localizar elemento por ID único quando o texto for dinâmico ou vazio', () => {
    const element: SelectedPreviewElement = {
      id: 'elem_3',
      tagName: 'button',
      className: 'px-6 py-2.5 bg-emerald-600',
      textContent: '',
      selector: 'button#cta-start',
      outerHtmlSnippet: '<button id="cta-start" class="px-6 py-2.5 bg-emerald-600"></button>',
    };

    const location = locateElementInProjectFiles(element, mockProjectFiles);
    assert.ok(location);
    assert.strictEqual(location?.filePath, 'src/App.tsx');
    assert.strictEqual(location?.lineNumber, 11);
  });

  it('deve formatar um resumo técnico estruturado para o prompt da IA', () => {
    const element: SelectedPreviewElement = {
      id: 'elem_4',
      tagName: 'h1',
      className: 'text-3xl font-bold',
      textContent: 'Painel de Controle',
      selector: 'div#root > div > main > h1.text-3xl',
      outerHtmlSnippet: '<h1 class="text-3xl font-bold">Painel de Controle</h1>',
    };

    const location = locateElementInProjectFiles(element, mockProjectFiles);
    assert.ok(location);
    assert.strictEqual(location?.filePath, 'src/App.tsx');
    assert.strictEqual(location?.lineNumber, 10);
  });

  it('deve retornar null graciosamente quando nenhum arquivo corresponder', () => {
    const element: SelectedPreviewElement = {
      id: 'elem_5',
      tagName: 'span',
      className: 'badge-desconhecida',
      textContent: 'Texto Que Não Existe',
      selector: 'span.badge-desconhecida',
      outerHtmlSnippet: '<span class="badge-desconhecida">Texto Que Não Existe</span>',
    };

    const location = locateElementInProjectFiles(element, mockProjectFiles);
    assert.strictEqual(location, null);
  });
});
