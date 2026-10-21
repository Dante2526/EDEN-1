import { useState, useEffect, useCallback, useRef } from 'react';
import { getGitHubPat } from './github';

export type DeploymentStatus = 'idle' | 'building' | 'success' | 'failure';

export interface DeploymentInfo {
  id: string;
  shortId: string;
  projectName: string;
  environment: string;
  url: string | null;
  status: DeploymentStatus;
  latestStage: string;
  createdOn: string;
  modifiedOn: string;
  commitHash: string | null;
  commitMessage: string | null;
  branch: string;
  errorSnippet?: string | null;
}

export interface DeploymentLogResponse {
  success: boolean;
  source?: string;
  logs: string;
  errorSnippet: string;
  totalLines: number;
  error?: string;
}

export function normalizeDeploymentStatus(
  stageStatus?: string,
  stages?: Array<{ name: string; status: string }>
): DeploymentStatus {
  if (!stageStatus) return 'idle';
  const s = stageStatus.toLowerCase().trim();
  if (s === 'failure' || s === 'failed' || s === 'error') return 'failure';
  if (s === 'success' || s === 'completed') {
    if (stages && stages.some((st) => {
      const stStatus = st.status?.toLowerCase().trim();
      return stStatus === 'failure' || stStatus === 'failed' || stStatus === 'error';
    })) {
      return 'failure';
    }
    return 'success';
  }
  if (s === 'active' || s === 'running' || s === 'in_progress' || s === 'queued') {
    return 'building';
  }
  return 'idle';
}

export function extractRelevantErrorSnippet(rawLogs: string): string {
  if (!rawLogs) return '';
  const lines = rawLogs.split('\n');
  if (lines.length === 0) return '';

  const errorIndicators = [
    /error TS\d+:/i,
    /Failed to compile/i,
    /SyntaxError:/i,
    /TypeError:/i,
    /npm ERR!/i,
    /\[ERROR\]/i,
    /Build failed/i,
    /Command failed/i,
    /error:/i,
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
    const start = Math.max(0, firstMatch - 3);
    const end = Math.min(lines.length, lastMatch + 6);
    return lines.slice(start, end).join('\n').trim();
  }

  // Se nenhum indicador explícito for detectado, retorna as últimas 20 linhas
  return lines.slice(Math.max(0, lines.length - 20)).join('\n').trim();
}

export async function fetchLatestDeployment(options?: {
  projectName?: string;
  owner?: string;
  repo?: string;
  commitSha?: string;
}): Promise<DeploymentInfo | null> {
  const params = new URLSearchParams({ action: 'status' });
  if (options?.projectName) params.set('projectName', options.projectName);
  if (options?.owner) params.set('owner', options.owner);
  if (options?.repo) params.set('repo', options.repo);
  if (options?.commitSha) params.set('commitSha', options.commitSha);

  const headers: Record<string, string> = {};
  const pat = getGitHubPat();
  if (pat) {
    headers['Authorization'] = `Bearer ${pat}`;
  }

  try {
    const res = await fetch(`/api/deployments?${params.toString()}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.success && data.deployment) {
      return data.deployment as DeploymentInfo;
    }
    return null;
  } catch (err) {
    console.warn('[deployment-service] Falha ao consultar deployment:', err);
    return null;
  }
}

export async function fetchDeploymentLogs(
  deploymentId: string,
  projectName?: string
): Promise<DeploymentLogResponse> {
  const params = new URLSearchParams({
    action: 'logs',
    deploymentId,
  });
  if (projectName) params.set('projectName', projectName);

  const headers: Record<string, string> = {};
  const pat = getGitHubPat();
  if (pat) {
    headers['Authorization'] = `Bearer ${pat}`;
  }

  try {
    const res = await fetch(`/api/deployments?${params.toString()}`, { headers });
    const data = await res.json();
    return {
      success: !!data.success,
      source: data.source,
      logs: data.logs || '',
      errorSnippet: data.errorSnippet || '',
      totalLines: data.totalLines || 0,
      error: data.error,
    };
  } catch (err: any) {
    return {
      success: false,
      logs: '',
      errorSnippet: '',
      totalLines: 0,
      error: err?.message || 'Falha ao buscar logs de deploy.',
    };
  }
}

/**
 * Hook para monitorar deploys com polling adaptativo
 */
export function useDeploymentMonitor(options?: {
  projectName?: string;
  owner?: string;
  repo?: string;
  activeCommitSha?: string;
  enabled?: boolean;
}) {
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const info = await fetchLatestDeployment({
        projectName: options?.projectName || 'synap',
        owner: options?.owner || 'Dante2526',
        repo: options?.repo || 'Synap',
        commitSha: options?.activeCommitSha,
      });
      if (info) {
        setDeployment(info);
      }
      setLastCheck(new Date());
      return info;
    } finally {
      setIsLoading(false);
    }
  }, [options?.projectName, options?.owner, options?.repo, options?.activeCommitSha]);

  useEffect(() => {
    if (options?.enabled === false) return;

    let isMounted = true;

    const runPoll = async () => {
      const current = await checkStatus();
      if (!isMounted) return;

      // Se estiver 'building', checa mais frequentemente (8s)
      // Se estiver 'success' ou 'failure', checa a cada 45s
      const delay = current?.status === 'building' ? 8000 : 45000;
      timerRef.current = setTimeout(runPoll, delay);
    };

    runPoll();

    return () => {
      isMounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkStatus, options?.enabled]);

  return {
    deployment,
    isLoading,
    lastCheck,
    refreshNow: checkStatus,
  };
}
