import { PendingChange } from './types';
import { callGitHubApi } from './github';

export interface CommitResult {
  sha: string;
  html_url: string;
}

/**
 * Commits multiple pending changes in a single atomic Git commit using GitHub's Git Data Trees API.
 * Uses the /api/github backend proxy to securely leverage process.env.GITHUB_TOKEN (from Vercel or .env)
 * or client-provided Bearer token.
 */
export async function commitStagedChanges(
  _unusedToken: any,
  owner: string,
  repo: string,
  branch: string,
  message: string,
  changes: PendingChange[]
): Promise<CommitResult> {
  if (changes.length === 0) {
    throw new Error('Nenhuma alteração selecionada para commit.');
  }

  if (!message.trim()) {
    throw new Error('Por favor, informe uma mensagem de commit.');
  }

  const res = await callGitHubApi<CommitResult>(
    'commit',
    {},
    'POST',
    {
      owner,
      repo,
      branch,
      message: message.trim(),
      changes: changes.map((c) => ({
        path: c.path,
        type: c.type,
        newContent: c.newContent,
      })),
    }
  );

  if (res?.sha && typeof window !== 'undefined') {
    try {
      const syncKey = `synap_synced_sha_${owner}/${repo}_${branch}`;
      localStorage.setItem(syncKey, res.sha);

      // Registra o SHA na lista de commits gerados localmente pelo Synap
      const historyKey = `synap_recent_commits_${owner}/${repo}_${branch}`;
      const raw = localStorage.getItem(historyKey);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(res.sha)) {
        list.unshift(res.sha);
        localStorage.setItem(historyKey, JSON.stringify(list.slice(0, 25)));
      }
    } catch {}
  }

  return res;
}
