import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

export default async function handler(_req: Request, envArg?: Env) {
  const env = getEnv(envArg);

  const rawKey = env.NVIDIA_API_KEY || '';
  const isPlaceholder = rawKey === 'sua_key_aqui' || rawKey === 'nvapi-your-key-here' || rawKey.trim() === '';

  const rawGemini = env.GEMINI_API_KEY || '';
  const isGeminiPlaceholder = rawGemini === 'MY_GEMINI_API_KEY' || rawGemini.trim() === '';

  const rawGitHub = env.GITHUB_TOKEN || env.GITHUB_PAT || '';
  const isGitHubPlaceholder =
    rawGitHub === 'ghp_your_github_token_here' || rawGitHub.trim() === '';

  // ====== DIAGNÓSTICO DAS VARS DA CLOUDFLARE (sem expor valores) ======
  // Retorna true/false para cada var — isso nos diz se o Worker está recebendo
  // o binding corretamente do dashboard do Pages.
  const hasCfAccountId = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID.trim());
  const hasCfApiToken = Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_API_TOKEN.trim());
  const hasSynapSecret = Boolean(env.SYNAP_API_SECRET && env.SYNAP_API_SECRET.trim());

  // Lista de TODAS as chaves presentes no objeto env (sem valores) — útil pra
  // debugar se o binding está chegando com outro nome ou se está vazio.
  const envKeys = Object.keys(env || {}).filter((k) => k !== 'ASSETS');

  return new Response(
    JSON.stringify({
      status: 'ok',
      hasApiKey: !isPlaceholder,
      hasGeminiKey: !isGeminiPlaceholder,
      hasGitHubToken: !isGitHubPlaceholder,
      hasEdgeTts: true,
      // ====== Debug Cloudflare ======
      hasCfAccountId,
      hasCfApiToken,
      hasSynapSecret,
      envKeys,
      envKeysCount: envKeys.length,
      // Indica se envArg foi recebido (true) ou se caiu pra process.env (false)
      usingBindings: Boolean(envArg && typeof envArg === 'object'),
    }, null, 2),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
