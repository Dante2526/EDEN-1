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

  return new Response(
    JSON.stringify({
      status: 'ok',
      hasApiKey: !isPlaceholder,
      hasGeminiKey: !isGeminiPlaceholder,
      hasGitHubToken: !isGitHubPlaceholder,
      hasEdgeTts: true,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
