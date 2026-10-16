// Web Worker para execução segura e não-bloqueante de Python via Pyodide WASM

let pyodideInstance: any = null;
let initPromise: Promise<any> | null = null;

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
