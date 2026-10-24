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
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;

  // ====== Frontend (injetado em build time pelo Vite) ======
  VITE_API_SECRET?: string;

  // ====== CF Pages: binding especial p/ servir static assets ======
  ASSETS?: { fetch: (request: Request) => Promise<Response> };

  // ====== CF Pages: binding nativo Workers AI (env.AI) ======
  AI?: { run: (model: string, input: any) => Promise<any> };

  // ====== Navegador Remoto / Playwright (Browserless.io / Chromium Headless) ======
  BROWSERLESS_API_KEY?: string;
  BROWSER_ENDPOINT?: string;

  // ====== Banco de Dados Supabase (PostgreSQL + JSONB via PostgREST) ======
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function getEnv(envArg?: Env): Env {
  if (envArg && typeof envArg === 'object') {
    return envArg;
  }
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
        BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
        BROWSER_ENDPOINT: process.env.BROWSER_ENDPOINT,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      };
    }
  } catch {
    // process is undefined em CF Worker — ignore
  }
  return {};
}
