import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRemoteCommandRequiringApproval,
  buildPendingRemoteAction,
  parsePlaywrightCommand,
  buildHeadlessRenderUrl,
} from './remote-gate';

describe('remote-gate (Hard-Gate de VPS/Deploy + Browser Headless)', () => {
  it('detecta comandos de envio para VPS ou deploy remoto que exigem autorização do usuário', () => {
    assert.equal(isRemoteCommandRequiringApproval('ssh ubuntu@147.15.57.146 "pm2 restart all"'), true);
    assert.equal(isRemoteCommandRequiringApproval('scp local.ts ubuntu@147.15.57.146:/home/ubuntu/server.ts'), true);
    assert.equal(isRemoteCommandRequiringApproval('sftp ubuntu@147.15.57.146'), true);
    assert.equal(isRemoteCommandRequiringApproval('deploy production --target=vps'), true);
    assert.equal(isRemoteCommandRequiringApproval('git status'), false);
    assert.equal(isRemoteCommandRequiringApproval('curl -I https://example.com'), false);
  });

  it('constrói objeto PendingRemoteAction com status pending (Hard-Gate bloqueado)', () => {
    const action = buildPendingRemoteAction({
      provider: 'vps_webhook',
      targetHost: '147.15.57.146',
      summary: 'Atualizar server.ts no servidor de produção',
      filesOrCommand: 'put local.ts -> /home/ubuntu/play-infinity/server.ts',
      payload: {
        endpoint: 'https://147.15.57.146:8443/deploy',
        filePath: '/home/ubuntu/play-infinity/server.ts',
      },
    });

    assert.equal(action.status, 'pending');
    assert.equal(action.provider, 'vps_webhook');
    assert.equal(action.targetHost, '147.15.57.146');
    assert.ok(action.id.startsWith('remote_'));
    assert.ok(action.summary.includes('server.ts'));
  });

  it('parseia comando playwright <url> e extrai URL e opções de espera/seletores', () => {
    const parsed = parsePlaywrightCommand('playwright https://animesonlinecc.to/ep1 --wait=3000 --selector="iframe"');
    assert.equal(parsed.valid, true);
    assert.equal(parsed.url, 'https://animesonlinecc.to/ep1');
    assert.equal(parsed.waitMs, 3000);
    assert.equal(parsed.waitForSelector, 'iframe');
  });

  it('gera URL e cabeçalhos para renderização Chromium Headless gratuita via Jina Reader', () => {
    const reqSpec = buildHeadlessRenderUrl('https://animesonlinecc.to/anime/hunter-x-hunter/', {
      waitForSelector: 'iframe',
    });
    assert.equal(reqSpec.url, 'https://r.jina.ai/https://animesonlinecc.to/anime/hunter-x-hunter/');
    assert.equal(reqSpec.headers['X-Return-Format'], 'html');
    assert.equal(reqSpec.headers['X-Wait-For-Selector'], 'iframe');
  });
});
