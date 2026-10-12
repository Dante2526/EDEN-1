export const config = {
  runtime: 'nodejs',
};

export default async function handler(_req: Request) {
  const rawKey = process.env.NVIDIA_API_KEY || '';
  const isPlaceholder = rawKey === 'sua_key_aqui' || rawKey === 'nvapi-your-key-here' || rawKey.trim() === '';

  const rawGemini = process.env.GEMINI_API_KEY || '';
  const isGeminiPlaceholder = rawGemini === 'MY_GEMINI_API_KEY' || rawGemini.trim() === '';

  const rawGitHub = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '';
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
