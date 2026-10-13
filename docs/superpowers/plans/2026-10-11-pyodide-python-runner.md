# Implementação do Executor Real de Código Python (Pyodide WASM)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos utilizam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Implementar execução real de scripts Python 3 no navegador via WebAssembly (Pyodide) em um Web Worker sem travar a interface, permitindo que a IA execute cálculos matemáticos, manipulação de dados e scripts com custo zero e sem API keys.

**Architecture:** Web Worker dedicado em background (`src/workers/pyodide-worker.ts`) que faz lazy-load do Pyodide via CDN, redireciona streams de `stdout`/`stderr` e comunica com um cliente singleton (`src/lib/pyodide-client.ts`) com timeout de 15s. No frontend (`src/App.tsx`), inclusão de `run_python` nos schemas de chat tools e exibição estilizada de terminal no `chat-message.tsx`.

**Tech Stack:** TypeScript, Web Workers, Pyodide v0.26.4 (WASM / CPython 3.12), React 19, Lucide Icons, Vite.

## Global Constraints
- Sem custo de API e sem necessidade de chaves de ambiente.
- Execução não-bloqueante (Web Worker) para nunca congelar a UI da aplicação.
- Lazy loading sob demanda: os binários WASM do Pyodide só são baixados na primeira execução.
- Timeout estrito de 15.000ms para evitar loops infinitos.
- Zero erros de tipos no TypeScript (`npm run lint` / `tsc --noEmit`).

---

### Task 1: Criação do Web Worker Pyodide (`src/workers/pyodide-worker.ts`)

**Files:**
- Create: `src/workers/pyodide-worker.ts`

**Interfaces:**
- Consumes: CDN Pyodide (`https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js`)
- Produces: Mensagens para a thread principal com formato `{ id, success, stdout, stderr, result, executionTimeMs, error }`

- [ ] **Step 1: Implementar o script do Web Worker**

Criar `src/workers/pyodide-worker.ts`:
```typescript
// Web Worker para execução segura e não-bloqueante de Python via Pyodide WASM

declare function importScripts(...urls: string[]): void;
declare function loadPyodide(config?: any): Promise<any>;

let pyodideInstance: any = null;
let isInitializing = false;
let initPromise: Promise<any> | null = null;

async function getPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (initPromise) return initPromise;

  isInitializing = true;
  initPromise = (async () => {
    // Carrega o script Pyodide via importScripts dentro do worker
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
    const pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });
    pyodideInstance = pyodide;
    isInitializing = false;
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
```

---

### Task 2: Cliente Singleton de Orquestração (`src/lib/pyodide-client.ts`) e Testes

**Files:**
- Create: `src/lib/pyodide-client.ts`
- Create: `src/lib/pyodide-client.test.ts`

**Interfaces:**
- Consumes: `src/workers/pyodide-worker.ts`
- Produces: `executePythonCode(code: string, timeoutMs?: number): Promise<PythonExecutionResult>`

- [ ] **Step 1: Criar teste unitário da interface do cliente**

Criar `src/lib/pyodide-client.test.ts`:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatPythonOutput, PythonExecutionResult } from './pyodide-client';

describe('formatPythonOutput', () => {
  it('deve formatar saída padrão quando stdout estiver presente', () => {
    const res: PythonExecutionResult = {
      success: true,
      stdout: 'Olá Mundo',
      stderr: '',
      executionTimeMs: 42,
    };
    const formatted = formatPythonOutput(res);
    assert.ok(formatted.includes('Olá Mundo'));
    assert.ok(formatted.includes('42ms'));
  });

  it('deve formatar erro de execução claramente', () => {
    const res: PythonExecutionResult = {
      success: false,
      stdout: '',
      stderr: '',
      error: 'NameError: name "x" is not defined',
      executionTimeMs: 15,
    };
    const formatted = formatPythonOutput(res);
    assert.ok(formatted.includes('Erro de Execução'));
    assert.ok(formatted.includes('NameError'));
  });

  it('deve incluir valor retornado se stdout for vazio', () => {
    const res: PythonExecutionResult = {
      success: true,
      stdout: '',
      stderr: '',
      result: '42',
      executionTimeMs: 10,
    };
    const formatted = formatPythonOutput(res);
    assert.ok(formatted.includes('Resultado: 42'));
  });
});
```

- [ ] **Step 2: Implementar `src/lib/pyodide-client.ts`**

Criar `src/lib/pyodide-client.ts`:
```typescript
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
let pendingRequests = new Map<
  string,
  {
    resolve: (val: PythonExecutionResult) => void;
    reject: (err: any) => void;
    timer: any;
  }
>();

function getWorker(): Worker {
  if (!workerInstance && typeof window !== 'undefined') {
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
      console.error('Erro no Worker Pyodide:', err);
    };
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
        error: `Tempo limite de execução esgotado (${timeoutMs / 1000}s). Possível loop infinito.`,
        executionTimeMs: timeoutMs,
      });
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject: resolve, timer });
    worker.postMessage({ id, code });
  });
}
```

- [ ] **Step 3: Validar teste unitário**
```bash
npx tsx --test src/lib/pyodide-client.test.ts
```

---

### Task 3: Integração da Tool `run_python` em `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `executePythonCode`, `formatPythonOutput` de `src/lib/pyodide-client.ts`
- Produces: `PYTHON_TOOL` adicionado aos catálogos de chat tools, execução integrada no `executeTool`

- [ ] **Step 1: Declarar a tool `PYTHON_TOOL` e registrar em `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`**

```typescript
const PYTHON_TOOL = {
  type: 'function',
  function: {
    name: 'run_python',
    description:
      'Executa código Python 3 real no navegador via WebAssembly (Pyodide). ' +
      'Use SEMPRE para cálculos matemáticos complexos, estatística, simulações, algoritmos, formatação de dados ou quando o usuário pedir para rodar código Python.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Código Python 3 completo e executável a ser rodado.',
        },
      },
      required: ['code'],
    },
  },
};
```

Atualizar:
```typescript
const DEFAULT_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, PYTHON_TOOL, IMAGE_GEN_TOOL, TERMINAL_TOOL];
const ALL_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, PYTHON_TOOL, IMAGE_GEN_TOOL, TERMINAL_TOOL, ...GITHUB_TOOLS];
```

- [ ] **Step 2: Despachar no `executeTool`**

```typescript
if (name === 'run_python') {
  try {
    const code = args.code || '';
    const execRes = await executePythonCode(code);
    const formatted = formatPythonOutput(execRes);
    return {
      result: JSON.stringify({
        code,
        success: execRes.success,
        stdout: execRes.stdout,
        stderr: execRes.stderr,
        result: execRes.result,
        executionTimeMs: execRes.executionTimeMs,
        output: formatted,
      }),
    };
  } catch (err: any) {
    return { result: JSON.stringify({ error: err?.message || 'Falha ao executar código Python' }) };
  }
}
```

- [ ] **Step 3: Atualizar System Prompt**

Incluir diretriz explícita:
`'4. Execução de Python: Você tem a ferramenta `run_python` para rodar scripts Python 3 reais no navegador via WebAssembly (Pyodide). Use-a sempre que precisar fazer contas exatas, simulações, testar algoritmos ou quando o usuário pedir para rodar Python.'`

---

### Task 4: Feedback Visual no Chat (`src/components/chat-message.tsx`)

**Files:**
- Modify: `src/components/chat-message.tsx`

**Interfaces:**
- Consumes: Chamadas de ferramenta `run_python`
- Produces: Card de terminal Python no chat com código executado, saída de console (`stdout`/`stderr`), tempo de execução e badge Python

- [ ] **Step 1: Suporte a `run_python` durante execução**
- `actionTitle`: "Executando Python (WASM)"
- `actionBadge`: "Interpretando script…"
- `actionDescription`: "Processando código no navegador via WebAssembly…"

- [ ] **Step 2: Card dedicado para `run_python` concluído**
- Visual estilo terminal com header cinza/âmbar e ícone `Terminal` / `FileCode`.
- Bloco com o código executado (syntax highlight / mono).
- Bloco de console preto com o `stdout` real, erros destacados em vermelho suave e tempo de execução (`ex: 154ms`).

---

### Task 5: Validação Completa, Testes e Verificação Estrita

**Files:**
- Test: `npx tsx --test src/lib/*.test.ts`
- Lint: `npm run lint`
- Build: `npm run build`

- [ ] **Step 1: Rodar suíte de testes unitários**
- [ ] **Step 2: Rodar verificação estrita de tipos (`tsc --noEmit`)**
- [ ] **Step 3: Compilar bundle de produção Vite (`dist/`)**
