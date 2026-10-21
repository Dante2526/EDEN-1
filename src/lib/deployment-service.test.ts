import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  normalizeDeploymentStatus,
  extractRelevantErrorSnippet,
  fetchLatestDeployment,
  fetchDeploymentLogs,
} from './deployment-service';

describe('Deployment Service', () => {
  it('deve normalizar status do Cloudflare Pages e GitHub Checks corretamente', () => {
    assert.strictEqual(normalizeDeploymentStatus('queued'), 'building');
    assert.strictEqual(normalizeDeploymentStatus('active'), 'building');
    assert.strictEqual(normalizeDeploymentStatus('in_progress'), 'building');
    assert.strictEqual(normalizeDeploymentStatus('success'), 'success');
    assert.strictEqual(normalizeDeploymentStatus('completed'), 'success');
    assert.strictEqual(normalizeDeploymentStatus('failure'), 'failure');
    assert.strictEqual(normalizeDeploymentStatus('failed'), 'failure');
    assert.strictEqual(normalizeDeploymentStatus('unknown_status'), 'idle');
    assert.strictEqual(normalizeDeploymentStatus(undefined), 'idle');
  });

  it('deve identificar falha se algum dos estágios individuais falhou mesmo com status final success', () => {
    const stages = [
      { name: 'clone_repo', status: 'success' },
      { name: 'build', status: 'failure' },
      { name: 'deploy', status: 'idle' },
    ];
    assert.strictEqual(normalizeDeploymentStatus('success', stages), 'failure');
  });

  it('deve extrair trecho de erro prioritário de linhas brutas de log', () => {
    const rawLogs = `
12:00:01 Cloned git repository
12:00:05 Running build command: npm run build
12:00:10 > synap@0.0.0 build
12:00:12 src/App.tsx:42:15 - error TS2304: Cannot find name 'unresolvedVariable'.
12:00:13 [ERROR] Build failed with 1 error:
12:00:14 npm ERR! code ELIFECYCLE
12:00:15 Finished with exit code 1
`;
    const snippet = extractRelevantErrorSnippet(rawLogs);
    assert.ok(snippet.includes('error TS2304'), 'Deve conter o erro de TypeScript');
    assert.ok(snippet.includes('Build failed with 1 error'), 'Deve conter a mensagem de build failed');
  });

  it('deve retornar as últimas linhas se nenhum marcador explícito de erro for detectado', () => {
    const rawLogs = Array.from({ length: 40 }, (_, i) => `Log line ${i + 1}`).join('\n');
    const snippet = extractRelevantErrorSnippet(rawLogs);
    assert.ok(snippet.includes('Log line 40'), 'Deve conter a última linha');
    assert.ok(!snippet.includes('Log line 1\n'), 'Não deve conter o início para logs longos');
  });

  it('deve consumir /api/deployments?action=status e retornar DeploymentInfo estruturado', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string) => {
        assert.ok(url.includes('/api/deployments?action=status'));
        return new Response(
          JSON.stringify({
            success: true,
            source: 'cloudflare',
            deployment: {
              id: 'dep-12345',
              shortId: 'dep-1234',
              projectName: 'synap',
              environment: 'production',
              url: 'https://synap.pages.dev',
              status: 'building',
              latestStage: 'build',
              createdOn: '2026-10-15T12:00:00Z',
              modifiedOn: '2026-10-15T12:01:00Z',
              commitHash: 'd6c6de53',
              commitMessage: 'feat: add deployment monitor',
              branch: 'main',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const info = await fetchLatestDeployment({ projectName: 'synap' });
      assert.ok(info !== null);
      assert.strictEqual(info.id, 'dep-12345');
      assert.strictEqual(info.status, 'building');
      assert.strictEqual(info.commitHash, 'd6c6de53');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve consumir /api/deployments?action=logs e retornar logs e snippet de erro', async () => {
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string) => {
        assert.ok(url.includes('/api/deployments?action=logs&deploymentId=dep-12345'));
        return new Response(
          JSON.stringify({
            success: true,
            source: 'cloudflare',
            logs: 'Error: Cannot find module',
            errorSnippet: 'Error: Cannot find module',
            totalLines: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await fetchDeploymentLogs('dep-12345');
      assert.strictEqual(result.logs, 'Error: Cannot find module');
      assert.strictEqual(result.errorSnippet, 'Error: Cannot find module');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
