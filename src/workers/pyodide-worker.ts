// Web Worker para execução segura e não-bloqueante de Python via Pyodide WASM
// Inclui ponte de rede síncrona (urllib.request via XMLHttpRequest -> /api/fetch-url)
// e instalação sob demanda de pacotes via micropip (ex.: beautifulsoup4, lxml, requests).

let pyodideInstance: any = null;
let initPromise: Promise<any> | null = null;
let bridgeConfigured = false;
const installedPackages = new Set<string>();

const PIP_PACKAGE_MAP: Record<string, string> = {
  bs4: 'beautifulsoup4',
  beautifulsoup4: 'beautifulsoup4',
  lxml: 'lxml',
  html5lib: 'html5lib',
  soupsieve: 'soupsieve',
};

const STDLIB_MODULES = new Set([
  'sys',
  'os',
  're',
  'json',
  'math',
  'time',
  'datetime',
  'urllib',
  'http',
  'html',
  'collections',
  'itertools',
  'functools',
  'pathlib',
  'io',
  'base64',
  'hashlib',
  'hmac',
  'random',
  'statistics',
  'string',
  'struct',
  'textwrap',
  'typing',
  'unittest',
  'uuid',
  'xml',
  'csv',
  'gzip',
  'zlib',
  'asyncio',
  'decimal',
  'fractions',
]);

function extractExternalPackages(code: string): string[] {
  const packages = new Set<string>();
  const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    const mod = match[1];
    if (STDLIB_MODULES.has(mod)) continue;
    const mapped = PIP_PACKAGE_MAP[mod];
    if (mapped && !installedPackages.has(mapped)) {
      packages.add(mapped);
    }
  }
  return Array.from(packages);
}

/**
 * Executa requisição HTTP de forma síncrona dentro do Web Worker
 * usando XMLHttpRequest (suportado nativamente em Web Workers) apontando para /api/fetch-url.
 */
function syncFetchBridge(url: string, headersJson: string, method: string): string {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/fetch-url', false); // false = síncrono no Worker
    xhr.setRequestHeader('Content-Type', 'application/json');

    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(headersJson || '{}');
    } catch {
      parsedHeaders = {};
    }

    const payload = JSON.stringify({
      url,
      method: method || 'GET',
      headers: parsedHeaders,
      raw: true,
    });

    xhr.send(payload);
    return xhr.responseText || JSON.stringify({ error: `Status HTTP ${xhr.status}`, status: xhr.status });
  } catch (err: any) {
    return JSON.stringify({ error: err?.message || String(err), status: 500 });
  }
}

const PYTHON_NETWORK_BRIDGE_SETUP = `
import urllib.request
import json
import io
from email.message import Message
import js

class _EdenHTTPResponse(io.BytesIO):
    def __init__(self, body_bytes, status=200, url="", headers_dict=None):
        super().__init__(body_bytes)
        self.status = status
        self.code = status
        self.url = url
        self._headers_dict = headers_dict or {}
        msg = Message()
        for k, v in self._headers_dict.items():
            msg[str(k)] = str(v)
        self.headers = msg

    def getcode(self):
        return self.status

    def geturl(self):
        return self.url

    def info(self):
        return self.headers

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

_orig_urlopen = urllib.request.urlopen

def _eden_urlopen(url, data=None, timeout=None, **kwargs):
    headers = {}
    method = "GET"
    if isinstance(url, urllib.request.Request):
        target_url = url.full_url
        for k, v in url.header_items():
            headers[k] = v
        if url.get_method():
            method = url.get_method()
    else:
        target_url = str(url)

    raw_res = str(js.__eden_sync_fetch(target_url, json.dumps(headers), method))
    try:
        parsed = json.loads(raw_res)
    except Exception:
        parsed = {"content": raw_res, "status": 200}

    content_str = parsed.get("rawHtml") or parsed.get("content") or ""
    if not content_str and "error" in parsed:
        content_str = json.dumps(parsed)

    status_code = int(parsed.get("status") or 200)
    final_url = str(parsed.get("finalUrl") or target_url)
    resp_headers = parsed.get("headers") or {}

    return _EdenHTTPResponse(
        content_str.encode("utf-8"),
        status=status_code,
        url=final_url,
        headers_dict=resp_headers,
    )

urllib.request.urlopen = _eden_urlopen
`;

async function getPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Carrega o módulo Pyodide via import() dinâmico compatível com Web Workers ESM (type: 'module')
    // @ts-ignore
    const { loadPyodide } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs');
    const pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });

    // Registra ponte síncrona no escopo global do Worker para acesso via módulo `js` do Pyodide
    (self as any).__eden_sync_fetch = syncFetchBridge;
    if (!bridgeConfigured) {
      await pyodide.runPythonAsync(PYTHON_NETWORK_BRIDGE_SETUP);
      bridgeConfigured = true;
    }

    pyodideInstance = pyodide;
    return pyodide;
  })();

  return initPromise;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, code } = event.data || {};
  if (!id || typeof code !== 'string') return;

  const startTime = performance.now();

  try {
    const pyodide = await getPyodide();

    // Auto-instala pacotes via micropip se detectados no código (ex.: bs4 / beautifulsoup4, lxml)
    const packagesToInstall = extractExternalPackages(code);
    if (packagesToInstall.length > 0) {
      await pyodide.loadPackage('micropip');
      const micropip = pyodide.pyimport('micropip');
      for (const pkg of packagesToInstall) {
        await micropip.install(pkg);
        installedPackages.add(pkg);
      }
      micropip.destroy?.();
    }

    // Também carrega pacotes embutidos no Pyodide automaticamente (ex.: numpy, pandas, regex)
    if (typeof pyodide.loadPackagesFromImports === 'function') {
      try {
        await pyodide.loadPackagesFromImports(code);
      } catch {
        // Ignora pacotes não reconhecidos no repositório padrão Pyodide
      }
    }

    let stdoutBuffer = '';
    let stderrBuffer = '';

    // Configura captura de streams de saída padrão
    pyodide.setStdout({
      batched: (text: string) => {
        stdoutBuffer += text + '\n';
      },
    });

    pyodide.setStderr({
      batched: (text: string) => {
        stderrBuffer += text + '\n';
      },
    });

    // Executa o script assincronamente
    const rawResult = await pyodide.runPythonAsync(code);
    const executionTimeMs = Math.round(performance.now() - startTime);

    let formattedResult: string | undefined = undefined;
    if (rawResult !== undefined && rawResult !== null) {
      formattedResult = typeof rawResult.toString === 'function' ? rawResult.toString() : String(rawResult);
    }

    self.postMessage({
      id,
      success: true,
      stdout: stdoutBuffer.trimEnd(),
      stderr: stderrBuffer.trimEnd(),
      result: formattedResult,
      executionTimeMs,
    });
  } catch (err: any) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    self.postMessage({
      id,
      success: false,
      stdout: '',
      stderr: '',
      error: err?.message || String(err),
      executionTimeMs,
    });
  }
};
