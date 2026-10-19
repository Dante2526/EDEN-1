import { SynapProject } from './types';

let babelCache: any = null;
let babelLoadingPromise: Promise<any> | null = null;

export function isBabelLoaded(): boolean {
  if (babelCache) return true;
  if (typeof window !== 'undefined' && (window as any).Babel) {
    babelCache = (window as any).Babel;
    return true;
  }
  return false;
}

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
    .replace(/import\.meta/g, '({ env: window.__SYNAP_ENV__ || {} })')
    .replace(/\bimport\s*\(/g, 'window.__synapImport(');
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
  'typescript', 'eslint', 'prettier', 'typescript-eslint',
  '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin', '@typescript-eslint/utils',
  'eslint-plugin-react', 'eslint-plugin-react-hooks', 'eslint-plugin-react-refresh', '@eslint/js',
  '@testing-library/jest-dom', '@testing-library/react', '@testing-library/user-event', '@testing-library/dom',
  'jest', 'vitest', '@jest/globals', 'jsdom', 'happy-dom',
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
  if (basePkg === 'react') {
    const v = verTag || `@${reactVersion}`;
    return `https://esm.sh/${basePkg}${v}${subpath}`;
  }
  if (basePkg === 'react-dom') {
    const v = verTag || `@${reactVersion}`;
    return `https://esm.sh/${basePkg}${v}${subpath}?external=react`;
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

export function getInspectorScriptHtml(): string {
  return `
<script id="synap-element-inspector-script">
(function() {
  var isInspectMode = false;
  var hoveredEl = null;

  var box = document.createElement('div');
  box.id = 'synap-inspect-overlay-box';
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;border:2px solid #d97757;background:rgba(217,119,87,0.14);border-radius:6px;transition:top 35ms ease-out, left 35ms ease-out, width 35ms ease-out, height 35ms ease-out;display:none;box-shadow:0 0 0 1px rgba(0,0,0,0.5);';

  var tagBadge = document.createElement('div');
  tagBadge.id = 'synap-inspect-tag-badge';
  tagBadge.style.cssText = 'position:absolute;top:-24px;left:0;background:#d97757;color:#ffffff;font-size:10px;font-family:monospace;font-weight:600;padding:2px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:none;pointer-events:none;';
  box.appendChild(tagBadge);

  function ensureMounted() {
    if (document.body && !document.body.contains(box)) {
      document.body.appendChild(box);
    }
  }

  function getSelector(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + el.id;
    var path = [];
    var curr = el;
    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.body && curr !== document.documentElement) {
      var selector = curr.tagName.toLowerCase();
      if (curr.id) {
        selector += '#' + curr.id;
        path.unshift(selector);
        break;
      }
      if (curr.className && typeof curr.className === 'string') {
        var firstClass = curr.className.trim().split(/\\s+/)[0];
        if (firstClass && !firstClass.includes(':') && !firstClass.includes('[') && !firstClass.includes('/')) {
          selector += '.' + firstClass;
        }
      }
      var sibling = curr;
      var nth = 1;
      while (sibling = sibling.previousElementSibling) {
        if (sibling.tagName === curr.tagName) nth++;
      }
      if (nth > 1) selector += ':nth-of-type(' + nth + ')';
      path.unshift(selector);
      curr = curr.parentElement;
    }
    return path.join(' > ');
  }

  function highlight(el) {
    if (!el || el === document.body || el === document.documentElement || el === box || box.contains(el)) {
      box.style.display = 'none';
      tagBadge.style.display = 'none';
      return;
    }
    ensureMounted();
    var rect = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.top = rect.top + 'px';
    box.style.left = rect.left + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';

    var tagName = el.tagName ? el.tagName.toLowerCase() : '';
    var classes = (typeof el.className === 'string' && el.className.trim())
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    tagBadge.textContent = '<' + tagName + classes + '>';
    tagBadge.style.display = 'block';
    tagBadge.style.top = rect.top < 26 ? '2px' : '-24px';
  }

  function onMouseMove(e) {
    if (!isInspectMode) return;
    var target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target !== hoveredEl && target !== box && !box.contains(target)) {
      hoveredEl = target;
      highlight(hoveredEl);
    }
  }

  function onClick(e) {
    if (!isInspectMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var target = hoveredEl || e.target;
    if (!target || target === box || box.contains(target) || target === document.body) return;

    // Feedback visual animado de clique (pulso azul)
    box.style.borderColor = '#38bdf8';
    box.style.backgroundColor = 'rgba(56,189,248,0.35)';
    setTimeout(function() {
      box.style.borderColor = '#d97757';
      box.style.backgroundColor = 'rgba(217,119,87,0.14)';
    }, 200);

    var tagName = target.tagName ? target.tagName.toLowerCase() : '';
    var className = typeof target.className === 'string'
      ? target.className.trim()
      : (target.className && typeof target.className.baseVal === 'string' ? target.className.baseVal.trim() : '');
    var textContent = (target.innerText || target.textContent || '').trim().slice(0, 100);
    var selector = getSelector(target);
    var outerHtmlSnippet = (target.outerHTML || '').slice(0, 350);

    try {
      window.parent.postMessage({
        type: '__SYNAP_ELEMENT_SELECTED__',
        element: {
          id: 'elem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          tagName: tagName,
          className: className,
          textContent: textContent,
          selector: selector,
          outerHtmlSnippet: outerHtmlSnippet,
        }
      }, '*');
    } catch (err) {
      console.warn('[Synap Inspector] Erro ao emitir elemento:', err);
    }
  }

  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.type === '__SYNAP_SET_INSPECT_MODE__') {
      isInspectMode = Boolean(ev.data.active);
      if (isInspectMode) {
        document.documentElement.style.cursor = 'crosshair';
        if (document.body) document.body.style.cursor = 'crosshair';
        ensureMounted();
      } else {
        document.documentElement.style.cursor = '';
        if (document.body) document.body.style.cursor = '';
        box.style.display = 'none';
        tagBadge.style.display = 'none';
        hoveredEl = null;
      }
    }
  });

  window.addEventListener('mousemove', onMouseMove, { passive: true, capture: true });
  window.addEventListener('click', onClick, { capture: true });
})();
</script>`;
}

export function getDevToolsScriptHtml(): string {
  return `
<script id="synap-devtools-instrumentation-script">
(function() {
  if (window.__SYNAP_DEVTOOLS_INSTALLED__) return;
  window.__SYNAP_DEVTOOLS_INSTALLED__ = true;

  function safeSerialize(val) {
    if (typeof val === 'string') return val;
    if (val instanceof Error) return val.name + ': ' + val.message + (val.stack ? '\\n' + val.stack : '');
    try {
      return JSON.stringify(val);
    } catch (_) {
      return String(val);
    }
  }

  function emitLog(level, args, extra) {
    try {
      var messages = [];
      for (var i = 0; i < args.length; i++) {
        messages.push(safeSerialize(args[i]));
      }
      window.parent.postMessage({
        type: '__SYNAP_DEVTOOLS_LOG__',
        payload: {
          level: level,
          messages: messages,
          source: extra ? extra.source : undefined,
          line: extra ? extra.line : undefined,
          column: extra ? extra.column : undefined,
          stack: extra ? extra.stack : undefined,
          timestamp: Date.now()
        }
      }, '*');
    } catch (_) {}
  }

  var origLog = console.log;
  var origInfo = console.info;
  var origWarn = console.warn;
  var origError = console.error;

  console.log = function() {
    emitLog('log', arguments);
    if (origLog) origLog.apply(console, arguments);
  };
  console.info = function() {
    emitLog('info', arguments);
    if (origInfo) origInfo.apply(console, arguments);
  };
  console.warn = function() {
    emitLog('warn', arguments);
    if (origWarn) origWarn.apply(console, arguments);
  };
  console.error = function() {
    emitLog('error', arguments);
    if (origError) origError.apply(console, arguments);
  };

  window.addEventListener('error', function(e) {
    var stack = e.error && e.error.stack ? e.error.stack : '';
    emitLog('error', [e.message || 'Erro em tempo de execução'], {
      source: e.filename,
      line: e.lineno,
      column: e.colno,
      stack: stack
    });
  });

  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = (reason && (reason.message || reason.stack)) || safeSerialize(reason);
    emitLog('error', ['Promise Rejeitada: ' + msg], {
      stack: reason && reason.stack ? reason.stack : undefined
    });
  });

  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      var start = performance.now();
      var method = (init && init.method) || 'GET';
      var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

      return origFetch.apply(this, arguments).then(function(resp) {
        try {
          var dur = performance.now() - start;
          window.parent.postMessage({
            type: '__SYNAP_DEVTOOLS_NETWORK__',
            payload: {
              method: method.toUpperCase(),
              url: url,
              status: resp.status,
              statusText: resp.statusText || (resp.status >= 200 && resp.status < 300 ? 'OK' : 'Error'),
              durationMs: Math.round(dur),
              type: 'fetch',
              timestamp: Date.now()
            }
          }, '*');
        } catch (_) {}
        return resp;
      }).catch(function(err) {
        try {
          var dur = performance.now() - start;
          window.parent.postMessage({
            type: '__SYNAP_DEVTOOLS_NETWORK__',
            payload: {
              method: method.toUpperCase(),
              url: url,
              status: 0,
              statusText: 'Failed',
              durationMs: Math.round(dur),
              type: 'fetch',
              error: err && err.message ? err.message : String(err),
              timestamp: Date.now()
            }
          }, '*');
        } catch (_) {}
        throw err;
      });
    };
  }
})();
</script>`;
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
    const isExcluded =
      path.endsWith('.d.ts') ||
      path.includes('vite.config') ||
      path.includes('vitest.config') ||
      path.includes('jest.config') ||
      path.includes('eslint.config') ||
      path.includes('.test.') ||
      path.includes('.spec.') ||
      path.includes('setupTests') ||
      path.includes('setup-tests');

    if (/\.(tsx|ts|jsx|js)$/.test(path) && !isExcluded) {
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

  // 1. SUPORTE A PROJETOS ESTÁTICOS / HTML PURO (Google AI Studio HTML Apps)
  const isStaticProject = project.template === 'static' || (Object.keys(transpiledFiles).length === 0 && !!normalizedFiles['index.html']);

  if (isStaticProject && normalizedFiles['index.html']) {
    let rawHtml = normalizedFiles['index.html'].content;
    const antiFlashStyle = '<style>html, body { background-color: #09090b; }</style>';
    const tailwindCdn = '<script src="https://cdn.tailwindcss.com"></script>';
    const injectedStyles = cssContents.length > 0 ? `<style type="text/tailwindcss">\n${escapeScriptTags(cssContents.join('\n\n'))}\n</style>` : '';
    const errorScript = `
  <div id="synap-error-overlay" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(15,15,20,0.96);color:#f87171;font-family:monospace;padding:20px;overflow:auto;"></div>
  <script>
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
    requestAnimationFrame(() => {
      try { window.parent.postMessage({ type: '__SYNAP_PREVIEW_READY__' }, '*'); } catch {}
    });
  </script>`;

    if (!rawHtml.includes('cdn.tailwindcss.com')) {
      if (rawHtml.includes('</head>')) {
        rawHtml = rawHtml.replace('</head>', `${antiFlashStyle}\n${tailwindCdn}\n${injectedStyles}\n</head>`);
      } else {
        rawHtml = `${antiFlashStyle}\n${tailwindCdn}\n${injectedStyles}\n${rawHtml}`;
      }
    } else if (rawHtml.includes('</head>')) {
      rawHtml = rawHtml.replace('</head>', `${antiFlashStyle}\n${injectedStyles}\n</head>`);
    }

    const inspectorScript = getInspectorScriptHtml();
    const devToolsScript = getDevToolsScriptHtml();
    if (rawHtml.includes('</body>')) {
      rawHtml = rawHtml.replace('</body>', `${errorScript}\n${devToolsScript}\n${inspectorScript}\n</body>`);
    } else {
      rawHtml = `${rawHtml}\n${errorScript}\n${devToolsScript}\n${inspectorScript}`;
    }

    return rawHtml;
  }

  // 2. SUPORTE A PROJETOS REACT / VITE (LinkHub e similares)
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
      'react-dom/client': `https://esm.sh/react-dom@${reactVersion}/client?external=react`,
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
  const bodyMatch = rawIndexHtml.match(/<body([^>]*)>/i);
  const bodyAttrs = bodyMatch ? bodyMatch[1] : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${project.name || 'Synap Preview'}</title>
  <style>
    html, body { background-color: #09090b; margin: 0; }
    #synap-error-overlay {
      display: none; position: fixed; inset: 0; z-index: 99999;
      background: rgba(15, 15, 20, 0.96); color: #f87171;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      padding: 20px; overflow: auto;
    }
  </style>
  ${fontLinks}
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="importmap">
  ${escapeScriptTags(JSON.stringify(importMap, null, 2))}
  </script>
  <style type="text/tailwindcss">
  ${escapeScriptTags(cssContents.join('\n\n'))}
  </style>
</head>
<body${bodyAttrs}>
  <div id="root"></div>
  <div id="synap-error-overlay"></div>
  <script type="module">
    window.__SYNAP_ENV__ = {
      DEV: true,
      PROD: false,
      MODE: 'development',
      BASE_URL: '/',
      VITE_FIREBASE_API_KEY: 'synap-preview-key',
      VITE_FIREBASE_PROJECT_ID: 'synap-preview-project',
      VITE_API_KEY: 'synap-preview-key',
      VITE_GEMINI_API_KEY: 'synap-preview-key',
    };
    window.process = {
      env: {
        NODE_ENV: 'development',
        API_KEY: 'synap-preview-key',
        GEMINI_API_KEY: 'synap-preview-key',
        ...window.__SYNAP_ENV__
      }
    };
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
          console.warn('[Synap Preview] Pacote não encontrado no cache:', specifier);
          return new Proxy({}, { get: (_, prop) => prop === '__esModule' ? true : () => null });
        }
        const target = findTargetFile(localBase);
        if (!target) {
          console.warn('[Synap Preview] Arquivo local não encontrado:', specifier, 'em', currentFile);
          return {};
        }
        if (target.type === 'json') {
          try {
            return JSON.parse(jsonFiles[target.path]);
          } catch (err) {
            return {};
          }
        }
        const targetPath = target.path;
        if (moduleCache[targetPath]) { return moduleCache[targetPath].exports; }
        const moduleObj = { exports: {} };
        moduleCache[targetPath] = moduleObj;
        try {
          const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', 'React',
            transpiledFiles[targetPath] + '\\n//# sourceURL=' + targetPath);
          const dir = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
          const React = depCache['react']?.default || depCache['react'] || window.React;
          fn(createRequire(targetPath), moduleObj, moduleObj.exports, targetPath, dir, React);
        } catch (err) {
          delete moduleCache[targetPath];
          throw err;
        }
        return moduleObj.exports;
      };
    }

    // Intercepta dynamic imports como React.lazy(() => import('./components/...'))
    window.__synapImport = function(specifier) {
      return new Promise((resolve) => {
        try {
          const req = createRequire(entryFile || 'src/main.tsx');
          const res = req(specifier);
          resolve(res);
        } catch (err) {
          console.warn('[Synap Preview] Falha no dynamic import de:', specifier, err);
          resolve({ default: () => null });
        }
      });
    };

    try {
      const rootEl = document.getElementById('root') || document.body;
      const React = depCache['react']?.default || depCache['react'] || window.React;
      const ReactDOM = depCache['react-dom/client']?.default || depCache['react-dom/client'] || depCache['react-dom']?.default || depCache['react-dom'];

      let mounted = false;

      // 1. Se tem main.tsx / index.tsx, executa primeiro
      if (transpiledFiles['src/main.tsx'] || transpiledFiles['src/index.tsx'] || transpiledFiles['main.tsx']) {
        const mainFile = transpiledFiles['src/main.tsx'] ? 'src/main.tsx' : (transpiledFiles['src/index.tsx'] ? 'src/index.tsx' : 'main.tsx');
        try {
          const mainRequire = createRequire(mainFile);
          mainRequire('./' + mainFile.split('/').pop());
          if (rootEl && rootEl.children.length > 0) {
            mounted = true;
          }
        } catch (mainErr) {
          console.warn('[Synap Preview] Aviso ao executar main entrypoint:', mainErr);
        }
      }

      // 2. Se o root ainda estiver vazio, procura o componente App
      if (!mounted && rootEl && rootEl.children.length === 0) {
        const appFileCandidates = ['src/App.tsx', 'src/App.jsx', 'App.tsx', 'App.jsx', 'src/App.js', 'App.js'];
        const appFile = appFileCandidates.find(c => transpiledFiles[c]);
        if (appFile) {
          try {
            const appRequire = createRequire(appFile);
            const appExports = appRequire('./' + appFile.split('/').pop());
            const AppComponent = appExports.default || appExports.App || Object.values(appExports).find(v => typeof v === 'function');
            if (AppComponent && React && ReactDOM && ReactDOM.createRoot) {
              ReactDOM.createRoot(rootEl).render(React.createElement(AppComponent));
              mounted = true;
            }
          } catch (appErr) {
            console.warn('[Synap Preview] Erro ao montar App:', appErr);
          }
        }
      }

      // 3. Fallback: Se ainda estiver vazio, procura qualquer outro entrypoint
      if (!mounted && rootEl && rootEl.children.length === 0 && entryFile) {
        try {
          const rootRequire = createRequire(entryFile);
          const entryExports = rootRequire('./' + entryFile.split('/').pop());
          const Comp = entryExports.default || entryExports.App || Object.values(entryExports).find(v => typeof v === 'function');
          if (Comp && React && ReactDOM && ReactDOM.createRoot) {
            ReactDOM.createRoot(rootEl).render(React.createElement(Comp));
            mounted = true;
          }
        } catch (fallbackErr) {
          showError('Falha ao Montar Projeto', fallbackErr);
        }
      }
      requestAnimationFrame(() => {
        try { window.parent.postMessage({ type: '__SYNAP_PREVIEW_READY__' }, '*'); } catch {}
      });
    } catch (err) {
      showError('Falha ao Compilar / Executar Projeto', err);
      try { window.parent.postMessage({ type: '__SYNAP_PREVIEW_READY__' }, '*'); } catch {}
    }
  <\/script>
  ${getDevToolsScriptHtml()}
  ${getInspectorScriptHtml()}
</body>
</html>`;
}

export async function buildPreviewHtml(project: SynapProject): Promise<string> {
  await loadBabel();
  return buildPreviewHtmlPreTranspiled(project);
}

