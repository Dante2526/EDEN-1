# Synap — Decisões Arquiteturais e Pegadinhas (LEIA ANTES DE MODIFICAR)

> **AVISO PARA AGENTES IA** (Cline, Cursor, Synap Studio, Claude Code, etc.):
> Este documento contém lições aprendidas em produção. LEIA antes de fazer
> qualquer alteração em `api/*.ts`, `vercel.json`, ou trocar `reasoning_effort`.
> Cada item abaixo tem uma "Lições" explicando o que NÃO fazer e por quê.

---

## 1. Runtime das Funções Serverless: SEMPRE `edge`, NUNCA `nodejs`

### O que aconteceu
Tentamos trocar `runtime: 'edge'` para `runtime: 'nodejs'` em todos os 6 arquivos
de `api/*.ts` para tentar resolver lentidão de streaming.

### Resultado
- Build passou localmente ✅
- TypeScript limpo ✅
- Deploy na Vercel falhou com `FUNCTION_INVOCATION_FAILED` (silencioso, sem log) ❌

### Causa raiz
O Node.js runtime da Vercel **não resolve imports relativos de TypeScript** como
`from '../lib/server/_security'` em arquivos `.ts`. A função simplesmente falha
ao carregar, sem dar chance de executar o código.

Edge runtime, por outro lado, faz bundling automático de tudo (similar ao Vite),
então resolve imports relativos de TS sem problema.

### Regra DE FERRO
```typescript
// ✅ CORRETO (funciona em produção Vercel)
export const config = {
  runtime: 'edge',
};

// ❌ ERRADO (causa FUNCTION_INVOCATION_FAILED em produção)
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};
```

**NUNCA troque `runtime: 'edge'` por `runtime: 'nodejs'` em `api/*.ts`.**

### Trade-off aceito
Edge runtime tem algum buffering de SSE (text/event-stream). O streaming pode
parecer "em lotes" em vez de palavra-por-palavra. Mas é preferível a NÃO funcionar.

---

## 2. `_security.ts` NÃO PODE estar em `api/`

### O que aconteceu
Originalmente, `api/_security.ts` só tinha `export function checkAuthAndRateLimit()`
(export nomeado), sem `export default`.

### Resultado
`FUNCTION_INVOCATION_FAILED` (silencioso). A Vercel trata TODO arquivo em `api/`
como função serverless e EXIGE `export default`. Sem ele, a função falha na
inicialização.

### Solução aplicada
Movido para `lib/server/_security.ts` (fora de `api/`). Agora é só um módulo
utilitário importado pelos handlers.

### Regra
- **Arquivos em `api/`**: DEVE ter `export default async function handler()`. Sem exceção.
- **Módulos utilitários**: devem ficar em `lib/`, `src/lib/`, ou qualquer lugar fora de `api/`.

---

## 3. Imports Relativos em `api/*.ts`: SEM extensão `.ts`

### O que aconteceu
Tentamos adicionar `.ts` nos imports (`from './_security.ts'`) achando que isso
ia resolver o `FUNCTION_INVOCATION_FAILED`. Piorou.

### Causa
Node.js runtime espera `.js` após compilação. Edge runtime resolve automaticamente.
Adicionar `.ts` confunde o bundler da Vercel.

### Regra
```typescript
// ✅ CORRETO
import { checkAuthAndRateLimit } from '../lib/server/_security';

// ❌ ERRADO (pode causar crash)
import { checkAuthAndRateLimit } from '../lib/server/_security.ts';

// ❌ ERRADO (Node espera .js)
import { checkAuthAndRateLimit } from '../lib/server/_security.js';
```

---

## 4. `maxDuration` no `vercel.json`: SINTAXE INVÁLIDA

### O que aconteceu
Tentamos adicionar isso no `vercel.json`:
```json
"functions": {
  "api/*.ts": {
    "runtime": "@vercel/node@20"
  }
}
```

### Resultado
Erro de build: `Function Runtimes must have a valid version, for example now-php@1.0.0`

### Causa
`@vercel/node@20` não é um runtime válido para `vercel.json`. A Vercel detecta
Node.js automaticamente quando há `export const config = { runtime: 'nodejs' }`
no arquivo.

### Regra
**NÃO adicione `functions` com `runtime` no `vercel.json`.** Deixe a Vercel
detectar automaticamente baseado no `export const config` de cada arquivo.

---

## 5. `maxDuration: 300` Excede o Plano Hobby da Vercel

### O que aconteceu
Tentamos `maxDuration: 300` (5 minutos) em `api/chat.ts` pra escapar do timeout.

### Resultado
Build falhou silenciosamente. Plano Hobby da Vercel só permite até 60s.

### Regra
```typescript
// ✅ CORRETO (dentro do limite Hobby)
export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

// ❌ ERRADO (excede plano Hobby, build falha)
export const config = {
  runtime: 'edge',
  maxDuration: 300,
};
```

Se precisar de mais de 60s, precisa fazer upgrade pro plano Pro.

---

## 6. Lentidão do Chat: NÃO é a Vercel, é o MODELO

### Sintoma
Usuário manda mensagem → demora 5-30 segundos pra começar a aparecer texto.

### Diagnóstico (com benchmarks reais de set/2026)
- `openbenchmarks.com`: GLM-5.3 Flash com streaming + reasoning low = latência 1-3s
- `mer.vin`: "GLM-5.3 reasoning_effort defaults to max if not set"

### Causa raiz
- GLM-5.3 **full** com `reasoning_effort: max` demora 5-30s pra gerar o PRIMEIRO token
- Depois que começa, streaming é rápido (~50 tokens/s)
- A "lentidão" era o modelo pensando, não a Vercel

### Solução aplicada
1. Default model trocado de `z-ai/glm-5.3` para `z-ai/glm-5.3-flash` (3x mais rápido)
2. `reasoning_effort` forçado pra `'low'` por padrão
3. Migração one-time: se user tinha `'max'` salvo no localStorage, reseta pra `'low'`

### Regra
**NÃO tente "resolver lentidão" trocando runtime ou adicionando TransformStream.**
A causa é o modelo. Soluções:
- Usar Flash como default ✅
- Forçar `reasoning_effort: 'low'` ✅
- Aceitar que GLM-5.3 full com `max` é lento por design ✅

### Quando usar cada modelo
| Cenário | Modelo | Reasoning |
|---|---|---|
| Chat casual, perguntas rápidas | GLM-5.3-Flash | low (default) |
| Código complexo, refactor | GLM-5.3 | high |
| Planejamento estratégico | GLM-5.3 | max |
| Análise de imagem | GLM-5.3-Flash (único com visão) | low |
| Contexto longo (docs grandes) | Kimi K3 | high |

---

## 7. IDs de Modelos na NVIDIA NIM

### Regra
IDs corretos para usar em `payload.model`:

```typescript
// ✅ CORRETO
'z-ai/glm-5.3'          // GLM-5.3 full
'z-ai/glm-5.3-flash'    // GLM-5.3 Flash (mais rápido, com visão)
'moonshotai/kimi-k3'    // Kimi K3 da Moonshot AI

// ❌ ERRADO (NÃO existem na NVIDIA)
'kimi-k3'               // Sem namespace
'Kimi K3'               // Nome de exibição, não ID
'z-ai/kimi-k3'          // Namespace errado (Kimi é da Moonshot, não Z.ai)
'glm-5.3'               // Sem namespace
```

### Referência
- GLM-5.3: https://build.nvidia.com/z-ai/glm-5-3
- GLM-5.3-Flash: https://build.nvidia.com/z-ai/glm-5-3-flash
- Kimi K3: https://build.nvidia.com/moonshotai/kimi-k3

---

## 8. Streaming SSE no Frontend: SEMPRE ler com `reader.read()`

### Padrão correto
```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder('utf-8');
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // mantém linha incompleta no buffer

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const dataStr = trimmed.replace(/^data:\s*/, '');
    if (dataStr === '[DONE]') continue;

    try {
      const parsed = JSON.parse(dataStr);
      // processa delta...
    } catch {}
  }
}
```

### Anti-padrões
- ❌ `await response.json()` — não funciona com SSE
- ❌ `await response.text()` — bufferiza tudo, perde o streaming
- ❌ Não tratar linha incompleta no buffer — perde chunks no meio

---

## 9. Throttle de Renderização no Streaming

### Problema
Cada token recebido = 1 `setConversations()` = 1 re-render do React.
Com 50 tokens/s, isso trava a UI.

### Solução aplicada
```typescript
const lastRenderRef = useRef<number>(0);

// No loop de streaming:
const now = Date.now();
if (!lastRenderRef.current || now - lastRenderRef.current > 50) {
  lastRenderRef.current = now;
  setConversations(prev => /* ... */);
}
```

### Regra
SEMPRE fazer throttle de 50ms (20fps) em atualizações de UI durante streaming.
O `setConversations` final (depois do loop) NÃO tem throttle (precisa atualizar).

---

## 10. GitHub API: SEMPRE com Timeout

### Problema
`callGitHubApi` não tinha timeout. Commit com múltiplos arquivos faz 6+ chamadas
encadeadas (getRef → getCommit → getTree → createBlob×N → createTree → createCommit
→ updateRef). Se uma trava, tudo trava eternamente.

### Solução aplicada
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s

try {
  const res = await fetch(`/api/github?...`, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeoutId);
}
```

### Regra
QUALQUER `fetch` pra `/api/*` deve ter `AbortController` + timeout. Sem exceção.

---

## 11. Tratamento de Resposta Não-JSON da Vercel

### Problema
Quando a Vercel tem erro de build ou função cai, ela retorna HTML (página de erro)
em vez de JSON. O frontend faz `await res.json()` e quebra com `Unexpected token 'A'`
(de "A server error...").

### Solução aplicada
```typescript
const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  // Resposta não é JSON — provavelmente é página de erro da Vercel
  throw new Error(`Erro ${res.status}: servidor retornou HTML (não-JSON). Build pode ter falhado.`);
}
```

### Regra
NUNCA faça `await res.json()` direto. Sempre leia como `text()` primeiro e faça
`JSON.parse()` com try-catch.

---

## 12. Variáveis de Ambiente na Vercel

### Obrigatórias
- `NVIDIA_API_KEY` — Key da NVIDIA NIM (obtida em https://build.nvidia.com)
- `GITHUB_TOKEN` — PAT fine-grained com "Contents: Read and write" (https://github.com/settings/tokens?type=beta)

### Opcionais
- `GEMINI_API_KEY` — Para TTS neural (sem ela, usa Edge TTS grátis)
- `SYNAP_API_SECRET` — Para ativar auth + rate limit (sem ela, uso pessoal sem limites)

### Regra
NUNCA commite `.env.local` no git. Sempre use `.env.example` como template.
NUNCA cole tokens em chat de IA — use variáveis de ambiente da Vercel.

---

## 13. Estrutura de Pastas

```
api/                    # Funções serverless (TODAS com export default)
  chat.ts               # Endpoint principal do chat com IA
  github.ts             # Proxy pra GitHub API (Octokit)
  image.ts              # Geração de imagem (Pollinations FLUX)
  search.ts             # Busca web (DuckDuckGo + Wikipedia)
  status.ts             # Health check
  tts.ts                # Text-to-Speech (Edge TTS + Gemini fallback)
  test.ts               # Endpoint de debug

lib/
  server/
    _security.ts        # Módulo utilitário (rate limit, auth, allowed models)

src/                    # Frontend React + TypeScript
  App.tsx               # Componente raiz
  components/           # Componentes UI
  lib/                  # Lógica do cliente
    github.ts           # Cliente GitHub (com timeout)
    github-commit.ts    # Trees API pra commit atômico
    pending-changes.tsx # Context pra Source Control
    git-terminal-emulator.ts # Emulador de terminal Git
    types.ts            # Types compartilhados
    storage.ts          # IndexedDB (idb-keyval)
    speech.ts           # TTS / STT
  studio/               # Studio (3 agentes: Planner → Reviewer → Implementer)

vercel.json             # Config da Vercel (SEM functions.runtime)
tsconfig.json           # TypeScript (moduleResolution: bundler)
```

### Regra
- Arquivos em `api/` = funções serverless (precisam `export default`)
- Arquivos em `lib/` = módulos utilitários (não são funções)
- Arquivos em `src/` = frontend (bundled by Vite)

---

## 14. Resumo: O que NÃO fazer

1. ❌ NUNCA trocar `runtime: 'edge'` por `runtime: 'nodejs'` em `api/*.ts`
2. ❌ NUNCA adicionar `.ts` ou `.js` em imports relativos
3. ❌ NUNCA adicionar `functions.runtime` no `vercel.json`
4. ❌ NUNCA usar `maxDuration` maior que 60 no plano Hobby
5. ❌ NUNCA colocar arquivo em `api/` sem `export default`
6. ❌ NUNCA usar `'kimi-k3'` ou `'z-ai/kimi-k3'` — use `'moonshotai/kimi-k3'`
7. ❌ NUNCA usar `signal: req.signal` no fetch pra NVIDIA (corta com oscilação)
8. ❌ NUNCA fazer `await res.json()` direto em resposta da Vercel
9. ❌ NUNCA fazer `fetch` pra `/api/*` sem `AbortController` + timeout
10. ❌ NUNCA tentar "resolver lentidão" trocando runtime — use Flash + reasoning low

---

## 15. Resumo: O que SEMPRE fazer

1. ✅ SEMPRE usar `runtime: 'edge'` em `api/*.ts`
2. ✅ SEMPRE imports relativos SEM extensão (`from '../lib/server/_security'`)
3. ✅ SEMPRE `export default async function handler()` em arquivos de `api/`
4. ✅ SEMPRE `maxDuration` ≤ 60 (plano Hobby)
5. ✅ SEMPRE modelo default = `z-ai/glm-5.3-flash` (rápido)
6. ✅ SEMPRE `reasoning_effort: 'low'` como default
7. ✅ SEMPRE ler SSE com `reader.read()` + buffer de linha
8. ✅ SEMPRE throttle de 50ms em `setConversations` durante streaming
9. ✅ SEMPRE `AbortController` + timeout em `fetch` pra `/api/*`
10. ✅ SEMPRE ler resposta como `text()` antes de `JSON.parse()`

---

## Histórico de Versões

- **2026-10-10**: Documento criado após 6+ iterações de debugging de
  `FUNCTION_INVOCATION_FAILED`. Causa raiz finalmente identificada: Node.js
  runtime não resolve imports TS relativos. Solução: manter Edge runtime.

---

> **Para agentes IA**: Se você for modificar qualquer arquivo em `api/` ou
> `vercel.json`, LEIA este documento primeiro. Cada regra acima foi paga com
> sangue (erro 500 em produção). Não repita os mesmos erros.
