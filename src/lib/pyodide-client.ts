export interface PythonExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  result?: string;
  executionTimeMs: number;
  error?: string;
}

export function formatPythonOutput(res: PythonExecutionResult): string {
  const parts: string[] = [];

  if (res.error) {
    parts.push(`❌ Erro de Execução (em ${res.executionTimeMs}ms):\n${res.error}`);
    return parts.join('\n');
  }

  if (res.stdout) {
    parts.push(res.stdout);
  }

  if (res.result && (!res.stdout || !res.stdout.includes(res.result))) {
    parts.push(`Resultado: ${res.result}`);
  }

  if (res.stderr) {
    parts.push(`[stderr]\n${res.stderr}`);
  }

  if (parts.length === 0) {
    parts.push('(Código executado com sucesso sem saída)');
  }

  parts.push(`\n[Tempo de execução: ${res.executionTimeMs}ms]`);
  return parts.join('\n');
}

let workerInstance: Worker | null = null;
let isInitializing = false;
const pendingRequests = new Map<
  string,
  {
    resolve: (val: PythonExecutionResult) => void;
    reject: (err: any) => void;
    timer: any;
  }
>();

function getWorker(): Worker {
  if (!workerInstance && typeof window !== 'undefined' && !isInitializing) {
    isInitializing = true;
    try {
      workerInstance = new Worker(new URL('../workers/pyodide-worker.ts', import.meta.url), {
        type: 'module',
      });

      workerInstance.onmessage = (event: MessageEvent) => {
        const { id, ...data } = event.data || {};
        const pending = pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(id);
          pending.resolve(data as PythonExecutionResult);
        }
      };

      workerInstance.onerror = (err) => {
        console.error('[Pyodide] Worker erro:', err);
        // Rejeita todas as requisições pendentes
        for (const [id, pending] of pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error('Worker Pyodide crashou. Tente novamente.'));
          pendingRequests.delete(id);
        }
        // Marca worker como morto pra recriar na próxima chamada
        workerInstance = null;
      };
    } catch (err) {
      console.error('[Pyodide] Falha ao criar Worker:', err);
      workerInstance = null;
    } finally {
      isInitializing = false;
    }
  }
  return workerInstance!;
}

export function executePythonCode(
  code: string,
  timeoutMs: number = 15000
): Promise<PythonExecutionResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({
      success: false,
      stdout: '',
      stderr: '',
      error: 'Pyodide só pode ser executado em ambiente de navegador com suporte a Web Workers.',
      executionTimeMs: 0,
    });
  }

  const id = `py_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const worker = getWorker();

  if (!worker) {
    return Promise.resolve({
      success: false,
      stdout: '',
      stderr: '',
      error: 'Não foi possível inicializar o Web Worker do Pyodide. Recarregue a página e tente novamente.',
      executionTimeMs: 0,
    });
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      // Se der timeout, encerra o worker para matar possíveis loops infinitos e recria sob demanda
      if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
      }
      resolve({
        success: false,
        stdout: '',
        stderr: '',
        error: `Tempo limite de execução esgotado (${timeoutMs / 1000}s). Possível loop infinito. O worker foi reiniciado — tente novamente.`,
        executionTimeMs: timeoutMs,
      });
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject: resolve, timer });
    worker.postMessage({ id, code });
  });
}
