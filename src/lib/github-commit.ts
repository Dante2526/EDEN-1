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

  return callGitHubApi<CommitResult>(
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
}
