import { describe, it } from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import {
  safeJson,
  cleanVersion,
  depToUrl,
  buildImportMap,
  buildPreviewHtml,
  buildPreviewHtmlFromProject,
  LOCAL_PREFIX,
} from './preview-html';
import type { SynapProject } from './types';

function makeProject(files: Record<string, string>): SynapProject {
  const mapped: Record<string, { path: string; content: string }> = {};
  for (const [path, content] of Object.entries(files)) mapped[path] = { path, content };
  return {
    id: 'proj_test',
    name: 'Teste',
    template: 'react-ts',
    files: mapped,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as SynapProject;
}

// Pega o conteúdo de todos os <script> inline (sem src)
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) out.push(m[1]);
  return out;
}

describe('safeJson', () => {
  it('escapa </script> e <!-- pra não quebrar a tag <script> que embute o JSON', () => {
    const json = safeJson({ code: 'const a = "</script><!-- x -->";' });
    assert.ok(!json.includes('</script>'));
    assert.ok(!json.includes('<!--'));
    assert.deepStrictEqual(JSON.parse(json), { code: 'const a = "</script><!-- x -->";' });
  });

  it('retorna "null" pra undefined', () => {
    assert.strictEqual(safeJson(undefined), 'null');
  });
});

describe('cleanVersion / depToUrl', () => {
  it('limpa ranges semver', () => {
    assert.strictEqual(cleanVersion('^18.2.0'), '18.2.0');
    assert.strictEqual(cleanVersion('~1.4'), '1.4');
    assert.strictEqual(cleanVersion('latest'), '');
    assert.strictEqual(cleanVersion('workspace:*'), '');
    assert.strictEqual(cleanVersion(undefined), '');
  });

  it('usa React externo e omite a versão quando não dá pra interpretar', () => {
    assert.strictEqual(
      depToUrl('lucide-react', '^0.263.1'),
      'https://esm.sh/lucide-react@0.263.1?external=react,react-dom',
    );
    assert.strictEqual(depToUrl('zustand', 'latest'), 'https://esm.sh/zustand?external=react,react-dom');
  });
});

describe('buildImportMap', () => {
  it('fixa o React, mantém react-dom na mesma instância e ignora @types/build tools', () => {
    const map = buildImportMap({
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      'lucide-react': '^0.400.0',
      '@types/react': '^19.0.0',
      vite: '^5.0.0',
      tailwindcss: '^4.0.0',
    });
    assert.strictEqual(map['react'], 'https://esm.sh/react@19.0.0');
    assert.strictEqual(map['react/jsx-runtime'], 'https://esm.sh/react@19.0.0/jsx-runtime');
    assert.strictEqual(map['react-dom/client'], 'https://esm.sh/react-dom@19.0.0/client?external=react');
    assert.ok(map['lucide-react'].startsWith('https://esm.sh/lucide-react@0.400.0'));
    assert.strictEqual(map['@types/react'], undefined);
    assert.strictEqual(map['vite'], undefined);
    assert.strictEqual(map['tailwindcss'], undefined);
  });
});

describe('buildPreviewHtml', () => {
  const project = makeProject({
    'package.json': JSON.stringify({ dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' } }),
    'index.html': '<html><head><link rel="stylesheet" href="/src/index.css"></head><body></body></html>',
    'src/main.tsx': "import './index.css';\nimport App from './App';\nconsole.log(App);",
    'src/App.tsx': 'export default function App() { return <div>oi</div>; }',
    'src/index.css': 'body { color: red; }',
  });

  it('gera scripts inline com JavaScript válido', () => {
    const scripts = inlineScripts(buildPreviewHtml(project));
    assert.strictEqual(scripts.length, 2); // bootstrap + build
    for (const code of scripts) {
      assert.doesNotThrow(() => new vm.Script(code));
    }
  });

  it('não quebra o HTML quando um arquivo do projeto contém </script>', () => {
    const evil = makeProject({
      'src/main.tsx': 'const html = "<script>alert(1)</script><!-- oi -->"; console.log(html);',
    });
    const html = buildPreviewHtml(evil);
    const scripts = inlineScripts(html);
    assert.strictEqual(scripts.length, 2);
    for (const code of scripts) assert.doesNotThrow(() => new vm.Script(code));
    // só os 3 </script> do próprio template (bootstrap, Babel, build)
    assert.strictEqual((html.match(/<\/script>/g) || []).length, 3);
  });

  it('embute os arquivos do projeto, o prefixo local e o entry', () => {
    const html = buildPreviewHtml(project);
    assert.ok(html.includes(`var SYNAP_PREFIX = "${LOCAL_PREFIX}"`));
    assert.ok(html.includes('var SYNAP_ENTRY = "src/main.tsx"'));
    assert.ok(html.includes('src/App.tsx'));
  });

  it('inlina o CSS local referenciado no index.html', () => {
    const html = buildPreviewHtml(project);
    assert.ok(html.includes('body { color: red; }'));
    assert.ok(!html.includes('href="/src/index.css"'));
  });

  it('preserva as barras invertidas das regex/strings no script do iframe (regressão do template literal)', () => {
    const html = buildPreviewHtml(project);
    // se alguém trocar String.raw por template literal comum, "\\." e "\\n" viram "." e quebra de linha
    assert.ok(html.includes('/\\.(css|scss|sass|less|png'), 'regex ASSET_RE intacta');
    assert.ok(html.includes("'ERRO NO PREVIEW:\\n\\n'"), 'escape \\n intacto');
    assert.ok(!html.includes('require(s*'), 'nenhuma regex de require() quebrada');
  });

  it('buildPreviewHtmlFromProject (usado pelo LocalPreview) gera o mesmo HTML', () => {
    assert.strictEqual(buildPreviewHtmlFromProject(project), buildPreviewHtml(project));
  });

  it('inclui detecção de bloqueio por CSP e timeout (nada de girar pra sempre)', () => {
    const html = buildPreviewHtml(project);
    assert.ok(html.includes('securitypolicyviolation'));
    assert.ok(html.includes('__synapBabelFailed'));
    assert.ok(html.includes('20000'));
  });
});
