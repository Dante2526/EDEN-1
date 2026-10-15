import { SynapProject } from './types';

let babelCache: any = null;
let babelLoadingPromise: Promise<any> | null = null;

export async function loadBabel(): Promise<any> {
  if (babelCache) return babelCache;
  if (babelLoadingPromise) return babelLoadingPromise;
  babelLoadingPromise = new Promise((resolve, reject) => {
    if ((window as any).Babel) {
      babelCache = (window as any).Babel;
      resolve(babelCache);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@babel/standalone@7.24.0/babel.min.js';
    script.async = true;
    script.onload = () => {
      babelCache = (window as any).Babel;
      resolve(babelCache);
    };
    script.onerror = () => {
      babelLoadingPromise = null;
      reject(new Error('Falha ao carregar @babel/standalone'));
    };
    document.head.appendChild(script);
  });
  return babelLoadingPromise;
}

export function transpileCode(code: string, filename: string): string {
  if (!babelCache) throw new Error('Babel ainda não foi carregado.');
  const sanitizedCode = code
    .replace(/import\.meta\.env/g, '(window.__SYNAP_ENV__ || {})')
    .replace(/import\.meta/g, '({ env: window.__SYNAP_ENV__ || {} })');
  const cleanFilename = filename.replace(/^\/+/, '');
  return babelCache.transform(sanitizedCode, {
    presets: [
      ['react', { runtime: 'classic' }],
      ['typescript', { isTSX: true, allExtensions: true }],
    ],
    plugins: ['transform-modules-commonjs'],
    filename: cleanFilename.endsWith('.ts') || cleanFilename.endsWith('.tsx') ? cleanFilename : `${cleanFilename}.tsx`,
  }).code;
}

const BROWSER_INCOMPATIBLE_DEPS = new Set([
  '@tailwindcss/vite', '@tailwindcss/postcss', '@tailwindcss/oxide',
  'tailwindcss', 'postcss', 'autoprefixer',
  'tsx', 'ts-node', 'tsx-cli',
  'express', 'fastify', 'koa', 'next', 'nuxt',
  '@vitejs/plugin-react', '@vitejs/plugin-react-swc', 'vite', 'webpack', 'rollup', 'esbuild',
  'typescript', 'eslint', 'prettier',
  'firebase-admin', 'firebase-functions',
  'mongoose', 'mysql2', 'pg', 'redis', 'ioredis', 'sqlite3', 'better-sqlite3',
  'fs', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'net', 'url', 'dotenv',
]);

export function normalizePath(p: string): string {
  return p.replace(/^\/+/, '').replace(/^\.\//, '');
}

export function getBasePackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

export function isBrowserIncompatible(specifier: string): boolean {
  const base = getBasePackageName(specifier.replace(/^node:/, ''));
  return BROWSER_INCOMPATIBLE_DEPS.has(base) || BROWSER_INCOMPATIBLE_DEPS.has(specifier);
}

export function depToUrl(specifier: string, version?: string, reactVersion = '18.3.1'): string {
  const cleanSpecifier = specifier.trim();
  const basePkg = getBasePackageName(cleanSpecifier);
  const subpath = cleanSpecifier.slice(basePkg.length);
  const rawVer = version ? version.replace(/[\^~>=<\s]/g, '') : '';
  const verTag = rawVer && !rawVer.includes('*') && !rawVer.includes('latest') ? `@${rawVer}` : '';
  if (basePkg === 'react' || basePkg === 'react-dom') {
    const v = verTag || `@${reactVersion}`;
    return `https://esm.sh/${basePkg}${v}${subpath}`;
  }
  return `https://esm.sh/${basePkg}${verTag}${subpath}?external=react,react-dom`;
}

export function extractDeps(
  files: Record<string, { content: string }>,
  fallbackDeps?: Record<string, string>
): Record<string, string> {
  const pkgFile = files['package.json'] || files['/package.json'];
  if (!pkgFile) return { ...(fallbackDeps || {}) };
  try {
    const pkg = JSON.parse(pkgFile.content);
    return { ...(fallbackDeps || {}), ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return { ...(fallbackDeps || {}) };
  }
}

export function resolveImportPath(importerPath: string, importPath: string): string | null {
  const cleanImporter = normalizePath(importerPath);
  if (importPath.startsWith('@/')) {
    return 'src/' + importPath.slice(2);
  }
  if (importPath.startsWith('/')) {
    return normalizePath(importPath);
  }
  if (!importPath.startsWith('.')) {
    return null;
  }
  const importerParts = cleanImporter.split('/');
  importerParts.pop();
  const importParts = importPath.split('/');
  for (const part of importParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      importerParts.pop();
    } else {
      importerParts.push(part);
    }
  }
  return importerParts.join('/');
}

export function findFile(files: Record<string, { content: string }>, basePath: string): string | null {
  const clean = normalizePath(basePath);
  const withoutSrc = clean.startsWith('src/') ? clean.slice(4) : clean;
  const bases = [clean, `src/${withoutSrc}`, withoutSrc];
  const exts = ['', '.tsx', '.ts', '.jsx', '.js', '.json', '.css', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  for (const b of bases) {
    for (const ext of exts) {
      const candidate = `${b}${ext}`;
      if (files[candidate]) return candidate;
      if (files[`/${candidate}`]) return `/${candidate}`;
    }
  }
  return null;
}

export function escapeScriptTags(code: string): string {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

function collectBareImports(transpiledMap: Record<string, string>): string[] {
  const bareImports = new Set<string>(['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']);
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const code of Object.values(transpiledMap)) {
    let match: RegExpExecArray | null;
    while ((match = requireRegex.exec(code)) !== null) {
      const spec = match[1];
      if (
        !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/') &&
        !spec.endsWith('.css') && !spec.endsWith('.svg') && !spec.endsWith('.png') && !spec.endsWith('.jpg') &&
        !isBrowserIncompatible(spec)
      ) {
        bareImports.add(spec);
      }
    }
  }
  return Array.from(bareImports);
}

export function buildPreviewHtmlPreTranspiled(
  project: SynapProject,
  preTranspiled?: Record<string, string>
): string {
  const normalizedFiles: Record<string, { content: string }> = {};
  for (const [rawPath, fileObj] of Object.entries(project.files || {})) {
    const clean = normalizePath(rawPath);
    normalizedFiles[clean] = { content: typeof fileObj === 'string' ? fileObj : fileObj.content };
  }

  const transpiledFiles: Record<string, string> = {};
  const cssContents: string[] = [];
  const jsonFiles: Record<string, string> = {};

  for (const [path, file] of Object.entries(normalizedFiles)) {
    if (path === 'package.json' || path === 'tsconfig.json' || path.startsWith('tsconfig.')) {
      if (path.endsWith('.json')) jsonFiles[path] = file.content;
      continue;
    }
    if (path.endsWith('.css')) {
      const cleanedCss = file.content
        .replace(/@import\s+['"]tailwindcss['"];?/g, '')
        .replace(/@tailwind\s+(base|components|utilities);?/g, '');
      cssContents.push(`/* ${path} */\n${cleanedCss}`);
      continue;
    }
    if (path.endsWith('.json')) {
      jsonFiles[path] = file.content;
      continue;
    }
    if (/\.(tsx|ts|jsx|js)$/.test(path) && !path.endsWith('.d.ts') && !path.includes('vite.config')) {
      if (preTranspiled && (preTranspiled[path] || preTranspiled[`/${path}`])) {
        transpiledFiles[path] = preTranspiled[path] || preTranspiled[`/${path}`];
      } else if (babelCache) {
        try {
          transpiledFiles[path] = transpileCode(file.content, path);
        } catch (err: any) {
          transpiledFiles[path] = `throw new Error(${JSON.stringify(`Erro de sintaxe em ${path}:${err?.message || err}`)});`;
        }
      }
    }
  }

  const pkgDeps = extractDeps(normalizedFiles, project.dependencies);
  const rawReactVer = (pkgDeps['react'] || '18.3.1').replace(/[\^~>=<\s]/g, '');
  const reactVersion = rawReactVer.startsWith('19') || rawReactVer.startsWith('18') ? rawReactVer : '18.3.1';
  const usedBareSpecs = collectBareImports(transpiledFiles);
  const depUrlMap: Record<string, string> = {};

  for (const spec of usedBareSpecs) {
    const basePkg = getBasePackageName(spec);
    const ver = pkgDeps[basePkg];
    depUrlMap[spec] = depToUrl(spec, ver, reactVersion);
  }

  const importMap = {
    imports: {
      'react': `https://esm.sh/react@${reactVersion}`,
      'react/': `https://esm.sh/react@${reactVersion}/`,
      'react-dom': `https://esm.sh/react-dom@${reactVersion}?external=react`,
      'react-dom/': `https://esm.sh/react-dom@${reactVersion}/?external=react`,
      ...depUrlMap,
    },
  };

  const entryCandidates = [
    'src/main.tsx', 'src/index.tsx', 'index.tsx', 'main.tsx',
    'src/main.jsx', 'src/index.jsx', 'index.jsx', 'main.jsx',
    'src/App.tsx', 'App.tsx', 'src/App.jsx', 'App.jsx',
  ];
  const entryFile = entryCandidates.find((c) => !!transpiledFiles[c]) || Object.keys(transpiledFiles)[0] || '';

  const rawIndexHtml = normalizedFiles['index.html']?.content || '';
  const fontLinks = (rawIndexHtml.match(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi) || []).join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${project.name || 'Synap Preview'}</title>
  ${fontLinks}
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="importmap">
  ${escapeScriptTags(JSON.stringify(importMap, null, 2))}
  </script>
  <style type="text/tailwindcss">
  ${escapeScriptTags(cssContents.join('\n\n'))}
  </style>
  <style>
    #synap-error-overlay {
      display: none; position: fixed; inset: 0; z-index: 99999;
      background: rgba(15, 15, 20, 0.96); color: #f87171;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 20px; overflow: auto;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="synap-error-overlay"></div>
  <script type="module">
    window.__SYNAP_ENV__ = { DEV: true, PROD: false, MODE: 'development', BASE_URL: '/' };
    window.process = { env: { NODE_ENV: 'development', ...window.__SYNAP_ENV__ } };
    window.global = window;

    const overlay = document.getElementById('synap-error-overlay');
    function showError(title, err) {
      console.error('[Synap Preview Error]', title, err);
      if (!overlay) return;
      overlay.style.display = 'block';
      const msg = err?.stack || err?.message || String(err);
      overlay.innerHTML = '<h3 style="color:#ef4444;font-size:16px;margin-bottom:10px;font-weight:bold;">' + title + '</h3>' +
        '<pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;color:#fca5a5;background:#1e1e24;padding:12px;border-radius:8px;border:1px solid #3f3f46;">' +
        msg.replace(/</g, '&lt;') + '</pre>';
    }
    window.addEventListener('error', (e) => showError('Erro em Tempo de Execução', e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => showError('Promise Rejeitada', e.reason));

    const transpiledFiles = ${escapeScriptTags(JSON.stringify(transpiledFiles))};
    const jsonFiles = ${escapeScriptTags(JSON.stringify(jsonFiles))};
    const depUrlMap = ${escapeScriptTags(JSON.stringify(depUrlMap))};
    const entryFile = ${JSON.stringify(entryFile)};
    const depCache = {};
    const moduleCache = {};

    const depEntries = Object.entries(depUrlMap);
    await Promise.all(
      depEntries.map(async ([spec, url]) => {
        try {
          const mod = await import(url);
          depCache[spec] = mod;
        } catch (err) {
          console.warn('[Synap Preview] Aviso ao importar pacote:', spec, url, err);
          depCache[spec] = new Proxy({}, { get: (_, prop) => prop === '__esModule' ? true : () => null });
        }
      })
    );

    if (depCache['react']) {
      window.React = depCache['react'].default || depCache['react'];
    }

    function normalizePath(p) { return p.replace(/^\\/+/, '').replace(/^\\.\\//, ''); }
    function resolveLocalImport(importerPath, importSpec) {
      if (importSpec.startsWith('@/')) { return 'src/' + importSpec.slice(2); }
      if (importSpec.startsWith('/')) { return normalizePath(importSpec); }
      if (!importSpec.startsWith('.')) { return null; }
      const parts = normalizePath(importerPath).split('/');
      parts.pop();
      for (const seg of importSpec.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') parts.pop();
        else parts.push(seg);
      }
      return parts.join('/');
    }
    function findTargetFile(resolvedBase) {
      const clean = normalizePath(resolvedBase);
      const withoutSrc = clean.startsWith('src/') ? clean.slice(4) : clean;
      const bases = [clean, 'src/' + withoutSrc, withoutSrc];
      const exts = ['', '.tsx', '.ts', '.jsx', '.js', '.json', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
      for (const b of bases) {
        for (const ext of exts) {
          const candidate = b + ext;
          if (transpiledFiles[candidate] !== undefined) return { type: 'code', path: candidate };
          if (jsonFiles[candidate] !== undefined) return { type: 'json', path: candidate };
        }
      }
      return null;
    }
    function createRequire(currentFile) {
      return function synapRequire(specifier) {
        if (specifier.endsWith('.css')) return {};
        if (/\\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(specifier)) { return specifier; }
        const localBase = resolveLocalImport(currentFile, specifier);
        if (localBase === null) {
          if (depCache[specifier]) {
            const mod = depCache[specifier];
            if (mod && mod.default !== undefined && typeof mod.default === 'object') {
              return Object.assign({}, mod.default, mod, { default: mod.default, __esModule: true });
            }
            return Object.assign({}, mod, { default: mod?.default ?? mod, __esModule: true });
          }
          throw new Error('Pacote "' + specifier + '" não encontrado no cache (importado por ' + currentFile + ')');
        }
        const target = findTargetFile(localBase);
        if (!target) {
          throw new Error('Arquivo local "' + specifier + '" não encontrado (importado em ' + currentFile + ')');
        }
        if (target.type === 'json') {
          try {
            return JSON.parse(jsonFiles[target.path]);
          } catch (err: any) {
            throw new Error('Erro de sintaxe no arquivo JSON "' + target.path + '": ' + (err?.message || String(err)));
          }
        }
        const targetPath = target.path;
        if (moduleCache[targetPath]) { return moduleCache[targetPath].exports; }
        const moduleObj = { exports: {} };
        moduleCache[targetPath] = moduleObj;
        try {
          const fn = new Function('require', 'module', 'exports', '__filename', '__dirname',
            transpiledFiles[targetPath] + '\\n//# sourceURL=' + targetPath);
          const dir = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
          fn(createRequire(targetPath), moduleObj, moduleObj.exports, targetPath, dir);
        } catch (err) {
          delete moduleCache[targetPath];
          throw err;
        }
        return moduleObj.exports;
      };
    }

    try {
      if (!entryFile) {
        throw new Error('Nenhum arquivo de entrada (.tsx/.jsx) encontrado no projeto.');
      }
      const rootRequire = createRequire(entryFile);
      const entryExports = rootRequire('./' + entryFile);
      const rootEl = document.getElementById('root');
      if (rootEl && rootEl.innerHTML.trim() === '' && entryExports && (typeof entryExports.default === 'function')) {
        const React = depCache['react']?.default || depCache['react'];
        const ReactDOM = depCache['react-dom/client']?.default || depCache['react-dom/client'];
        if (React && ReactDOM && ReactDOM.createRoot) {
          ReactDOM.createRoot(rootEl).render(React.createElement(entryExports.default));
        }
      }
    } catch (err) {
      showError('Falha ao Compilar / Executar Projeto', err);
    }
  <\/script>
</body>
</html>`;
}

export async function buildPreviewHtml(project: SynapProject): Promise<string> {
  await loadBabel();
  return buildPreviewHtmlPreTranspiled(project);
}
