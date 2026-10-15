import { checkAuthAndRateLimit } from '../lib/server/_security';
import { Env, getEnv } from '../lib/server/env';

export const config = {
  runtime: 'edge',
};

export type NormalizedDeploymentStatus = 'idle' | 'building' | 'success' | 'failure';

export function normalizeCloudflareStatus(stageStatus?: string, stages?: Array<{ name: string; status: string }>): NormalizedDeploymentStatus {
  if (!stageStatus) return 'idle';
  const s = stageStatus.toLowerCase();
  if (s === 'failure' || s === 'failed') return 'failure';
  if (s === 'success' || s === 'completed') {
    // Check if any stage failed
    if (stages && stages.some((st) => st.status?.toLowerCase() === 'failure' || st.status?.toLowerCase() === 'failed')) {
      return 'failure';
    }
    return 'success';
  }
  if (s === 'active' || s === 'running' || s === 'in_progress' || s === 'queued') {
    return 'building';
  }
  return 'idle';
}

export function extractErrorSnippet(lines: string[]): string {
  if (!lines || lines.length === 0) return '';
  
  // Procura por indicadores clássicos de falha de compilação
  const errorIndicators = [
    /error TS\d+:/i,
    /Failed to compile/i,
    /SyntaxError:/i,
    /TypeError:/i,
    /npm ERR!/i,
    /error:/i,
    /\[ERROR\]/i,
    /Build failed/i,
    /Command failed/i,
  ];

  const matchedIndices: number[] = [];
  lines.forEach((line, idx) => {
    if (errorIndicators.some((regex) => regex.test(line))) {
      matchedIndices.push(idx);
    }
  });

  if (matchedIndices.length > 0) {
    const firstMatch = matchedIndices[0];
    const lastMatch = matchedIndices[matchedIndices.length - 1];
    // Contexto: 3 linhas antes da primeira e 5 linhas após a última
    const start = Math.max(0, firstMatch - 3);
    const end = Math.min(lines.length, lastMatch + 6);
    return lines.slice(start, end).join('\n');
  }

  // Se nenhum indicador explícito for achado, pega as últimas 25 linhas
  return lines.slice(Math.max(0, lines.length - 25)).join('\n');
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const securityResponse = await checkAuthAndRateLimit(req, env);
  if (securityResponse) return securityResponse;

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'status';
  const projectName = url.searchParams.get('projectName') || 'synap';
  const deploymentId = url.searchParams.get('deploymentId') || '';
  const owner = url.searchParams.get('owner') || 'Dante2526';
  const repo = url.searchParams.get('repo') || 'Synap';
  const commitSha = url.searchParams.get('commitSha') || '';

  // Cloudflare credentials (podem vir de env ou header de override)
  const cfAccountId = req.headers.get('x-cloudflare-account-id') || env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfApiToken = req.headers.get('x-cloudflare-api-token') || env.CLOUDFLARE_API_TOKEN?.trim();

  // GitHub token (para fallback via Check Runs)
  const ghToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
    env.GITHUB_TOKEN?.trim() ||
    env.GITHUB_PAT?.trim();

  try {
    // =========================================================================
    // 1. ACTION: STATUS
    // =========================================================================
    if (action === 'status') {
      let cfError: string | null = null;

      // Tentativa 1: API oficial do Cloudflare Pages
      if (cfAccountId && cfApiToken) {
        try {
          const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects/${projectName}/deployments?per_page=5`;
          const cfRes = await fetch(cfUrl, {
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (cfRes.ok) {
            const data: any = await cfRes.json();
            if (data.success && Array.isArray(data.result) && data.result.length > 0) {
              const d = data.result[0];
              const normalizedStatus = normalizeCloudflareStatus(d.latest_stage?.status, d.stages);
              
              return new Response(
                JSON.stringify({
                  success: true,
                  source: 'cloudflare',
                  deployment: {
                    id: d.id,
                    shortId: d.short_id || (d.id || '').slice(0, 8),
                    projectName: d.project_name || projectName,
                    environment: d.environment || 'production',
                    url: d.url || null,
                    status: normalizedStatus,
                    latestStage: d.latest_stage?.name || 'build',
                    createdOn: d.created_on,
                    modifiedOn: d.modified_on,
                    commitHash: d.deployment_trigger?.metadata?.commit_hash || null,
                    commitMessage: d.deployment_trigger?.metadata?.commit_message || null,
                    branch: d.deployment_trigger?.metadata?.branch || 'main',
                  },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              );
            }
          } else {
            const errData: any = await cfRes.json().catch(() => ({}));
            cfError = errData?.errors?.[0]?.message || `Cloudflare API (${cfRes.status})`;
          }
        } catch (err: any) {
          cfError = err?.message || String(err);
        }
      }

      // Tentativa 2 (Fallback): GitHub Commit Check Runs API
      if (ghToken && owner && repo) {
        try {
          const ref = commitSha || 'main';
          const ghRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits/${ref}/check-runs`,
            {
              headers: {
                Authorization: `Bearer ${ghToken}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Synap-Deployment-Monitor',
              },
            }
          );

          if (ghRes.ok) {
            const ghData: any = await ghRes.json();
            const checkRuns = Array.isArray(ghData.check_runs) ? ghData.check_runs : [];
            const cfRun = checkRuns.find((cr: any) =>
              /cloudflare|pages/i.test(cr.name || '') || /cloudflare/i.test(cr.app?.name || '')
            ) || checkRuns[0];

            if (cfRun) {
              let status: NormalizedDeploymentStatus = 'idle';
              if (cfRun.status === 'in_progress' || cfRun.status === 'queued') status = 'building';
              else if (cfRun.conclusion === 'success') status = 'success';
              else if (cfRun.conclusion === 'failure' || cfRun.conclusion === 'timed_out') status = 'failure';

              return new Response(
                JSON.stringify({
                  success: true,
                  source: 'github_check_runs',
                  deployment: {
                    id: String(cfRun.id),
                    shortId: String(cfRun.id).slice(0, 8),
                    projectName,
                    environment: 'production',
                    url: cfRun.details_url || cfRun.html_url || null,
                    status,
                    latestStage: cfRun.name || 'Cloudflare Pages',
                    createdOn: cfRun.started_at,
                    modifiedOn: cfRun.completed_at || cfRun.started_at,
                    commitHash: cfRun.head_sha || commitSha,
                    commitMessage: cfRun.output?.title || null,
                    branch: 'main',
                    errorSnippet: cfRun.output?.summary || cfRun.output?.text || null,
                  },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        } catch (err: any) {
          console.warn('[deployments] Fallback GitHub falhou:', err?.message);
        }
      }

      // Se nenhum retornou resultado ativo
      return new Response(
        JSON.stringify({
          success: false,
          error: cfError || 'Nenhum deploy recente encontrado ou credenciais não configuradas.',
          hasCfCredentials: Boolean(cfAccountId && cfApiToken),
          hasGhCredentials: Boolean(ghToken),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // 2. ACTION: LOGS
    // =========================================================================
    if (action === 'logs') {
      if (!deploymentId) {
        return new Response(
          JSON.stringify({ error: 'deploymentId é obrigatório para consultar logs.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Tentativa 1: Cloudflare Pages history/logs API
      if (cfAccountId && cfApiToken) {
        try {
          const logsUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/pages/projects/${projectName}/deployments/${deploymentId}/history/logs`;
          const res = await fetch(logsUrl, {
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (res.ok) {
            const data: any = await res.json();
            const logEntries = Array.isArray(data.result?.data) ? data.result.data : [];
            const rawLines = logEntries.map((e: any) => (typeof e === 'string' ? e : e.message || ''));
            const errorSnippet = extractErrorSnippet(rawLines);

            return new Response(
              JSON.stringify({
                success: true,
                source: 'cloudflare',
                logs: rawLines.join('\n'),
                errorSnippet,
                totalLines: rawLines.length,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } catch (err: any) {
          console.warn('[deployments] Erro ao buscar logs na Cloudflare:', err?.message);
        }
      }

      // Tentativa 2: GitHub Check Run output se deploymentId for id do check run
      if (ghToken && owner && repo) {
        try {
          const ghRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/check-runs/${deploymentId}`,
            {
              headers: {
                Authorization: `Bearer ${ghToken}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Synap-Deployment-Monitor',
              },
            }
          );
          if (ghRes.ok) {
            const cr: any = await ghRes.json();
            const text = [cr.output?.title, cr.output?.summary, cr.output?.text].filter(Boolean).join('\n\n');
            const lines = text.split('\n');
            return new Response(
              JSON.stringify({
                success: true,
                source: 'github_check_runs',
                logs: text,
                errorSnippet: extractErrorSnippet(lines) || text,
                totalLines: lines.length,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        } catch (err: any) {
          console.warn('[deployments] Erro ao buscar logs no GitHub:', err?.message);
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Não foi possível carregar os logs do deploy selecionado.',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação não suportada: ${action}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[deployments] Erro interno:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Erro interno no endpoint de deployments.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
