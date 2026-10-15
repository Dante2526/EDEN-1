// ===========================================================================
// Synap — Environment Bindings (Cloudflare Pages + Node dev compat)
// ===========================================================================
//
// No Cloudflare Pages Advanced Mode, as variáveis de ambiente vêm como
// bindings do Worker (`env.X`), não via `process.env.X`. Esse arquivo:
//
//   1. Define a interface `Env` com todas as vars que o Synap usa.
//   2. Exporta `getEnv()` que recebe um objeto opcional `env` (CF bindings)
//      e devolve um snapshot tipado. Quando chamado sem argumento, cai pra
//      `process.env` (Node/Express dev local via `server.ts`).
//   3. Permite que os handlers escrevam `const env = getEnv(envArg)` uma vez
//      no topo e usem `env.NVIDIA_API_KEY` etc. — funciona nos dois mundos.
//
// Bindings especiais do CF Pages:
//   - `ASSETS`: fetch handler para servir static assets do diretório `dist/`
//     quando o _worker.ts precisa fazer fallback.
//
// Nota: NÃO usar `export const` aqui — o `lib/server/_security.ts` importa
// isso em runtime, e bindings podem ser undefined em dev. Tratamos com
// optional chaining em todo lugar.
// ===========================================================================

export interface Env {
  // ====== Provedor primário: NVIDIA NIM (GLM, Kimi, DeepSeek V4.1) ======
  NVIDIA_API_KEY?: string;

  // ====== Provedor secundário: Cloudflare Workers AI (R1 Distill etc.) ======
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // ====== TTS neural (Google Gemini) ======
  GEMINI_API_KEY?: string;

  // ====== GitHub (PAT para Source Control) ======
  GITHUB_TOKEN?: string;
  GITHUB_PAT?: string;

  // ====== Auth da API do Synap (header x-api-key) ======
  SYNAP_API_SECRET?: string;

  // ====== Rate limit global (Upstash Redis ou Vercel KV) ======
  // O CF Pages não tem KV nativo por padrão; Upstash continua funcionando
  // porque é acessível via REST HTTP.
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;

  // ====== Frontend (injetado em build time pelo Vite) ======
  // No CF Pages, configurar como build environment variable (não binding).
  // Incluído aqui só pra referência — NÃO é lido pelo Worker.
  VITE_API_SECRET?: string;

  // ====== CF Pages: binding especial p/ servir static assets ======
  ASSETS?: { fetch: (request: Request) => Promise<Response> };

  // ====== CF Pages: binding nativo Workers AI (env.AI) ======
  AI?: { run: (model: string, input: any) => Promise<any> };

  // ====== CF Pages: KV namespaces opcionais (futuro) ======
  // Ex: SYNAP_KV?: KVNamespace;
}

/**
 * Extrai um snapshot tipado de Env a partir de bindings do CF ou, na falta
 * deles, de `process.env` (Node/Express dev local).
 *
 * Uso típico num handler:
 *   export default async function handler(req: Request, envArg?: Env) {
 *     const env = getEnv(envArg);
 *     if (!env.NVIDIA_API_KEY) return new Response('...', { status: 401 });
 *     ...
 *   }
 */
export function getEnv(envArg?: Env): Env {
  if (envArg && typeof envArg === 'object') {
    return envArg;
  }
  // Dev local (Node/Express): puxa de process.env
  // No CF Worker, process.env NÃO existe — por isso só acessamos em try/catch.
  try {
    if (typeof process !== 'undefined' && process.env) {
      return {
        NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        GITHUB_PAT: process.env.GITHUB_PAT,
        SYNAP_API_SECRET: process.env.SYNAP_API_SECRET,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
        KV_REST_API_URL: process.env.KV_REST_API_URL,
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
        VITE_API_SECRET: process.env.VITE_API_SECRET,
      };
    }
  } catch {
    // process is undefined em CF Worker — ignore
  }
  return {};
}
