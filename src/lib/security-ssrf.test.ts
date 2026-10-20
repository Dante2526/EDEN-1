import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalOrPrivateUrl, safeFetchWithRedirects } from '../../lib/server/_security.js';

describe('Blindagem Anti-SSRF (Metodologia Cloudflare SEC-02)', () => {
  it('deve bloquear acesso ao Instance Metadata Service da Nuvem (169.254.169.254 e range Link-Local)', () => {
    assert.equal(isLocalOrPrivateUrl('http://169.254.169.254/latest/meta-data/'), true);
    assert.equal(isLocalOrPrivateUrl('http://169.254.169.254/computeMetadata/v1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://169.254.1.1/'), true);
    assert.equal(isLocalOrPrivateUrl('https://169.254.200.200/secret'), true);
  });

  it('deve bloquear loopbacks em todo o range 127.0.0.0/8 e localhost', () => {
    assert.equal(isLocalOrPrivateUrl('http://localhost:3000/'), true);
    assert.equal(isLocalOrPrivateUrl('http://sub.localhost/'), true);
    assert.equal(isLocalOrPrivateUrl('http://127.0.0.1/admin'), true);
    assert.equal(isLocalOrPrivateUrl('http://127.0.0.2:8080/'), true);
    assert.equal(isLocalOrPrivateUrl('http://127.100.200.1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://0.0.0.0/'), true);
  });

  it('deve bloquear redes privadas RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
    assert.equal(isLocalOrPrivateUrl('http://10.0.0.1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://10.255.255.255/'), true);
    assert.equal(isLocalOrPrivateUrl('http://172.16.0.1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://172.31.255.255/'), true);
    assert.equal(isLocalOrPrivateUrl('http://192.168.1.1/router'), true);
    assert.equal(isLocalOrPrivateUrl('http://192.168.0.100:8080/'), true);
  });

  it('deve bloquear CGNAT (100.64.0.0/10) e domínios internos/locais/wildcard DNS', () => {
    assert.equal(isLocalOrPrivateUrl('http://100.64.0.1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://100.127.255.255/'), true);
    assert.equal(isLocalOrPrivateUrl('http://server.local/'), true);
    assert.equal(isLocalOrPrivateUrl('http://api.internal/'), true);
    assert.equal(isLocalOrPrivateUrl('http://intranet.lan/'), true);
    assert.equal(isLocalOrPrivateUrl('http://127.0.0.1.nip.io/'), true);
    assert.equal(isLocalOrPrivateUrl('http://169.254.169.254.sslip.io/'), true);
    assert.equal(isLocalOrPrivateUrl('http://test.localtest.me/'), true);
  });

  it('deve bloquear IPv6 locais, ULA (RFC 4193), Link-Local (RFC 4291) e IPv4-Mapped', () => {
    assert.equal(isLocalOrPrivateUrl('http://[::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[::]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[fe80::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[fe90::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[febf::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[fec0::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[fc00::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[fd00::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[fd12:3456:789a::1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[::ffff:127.0.0.1]/'), true);
    assert.equal(isLocalOrPrivateUrl('http://[::ffff:169.254.169.254]/'), true);
  });

  it('deve bloquear IPv4 Multicast (Classe D) e Reservadas (Classe E)', () => {
    assert.equal(isLocalOrPrivateUrl('http://224.0.0.1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://239.255.255.255/'), true);
    assert.equal(isLocalOrPrivateUrl('http://240.0.0.1/'), true);
    assert.equal(isLocalOrPrivateUrl('http://255.255.255.255/'), true);
  });

  it('deve bloquear bypasses numéricos decimais ou hexadecimais puros', () => {
    assert.equal(isLocalOrPrivateUrl('http://2130706433/'), true); // 127.0.0.1 em decimal
    assert.equal(isLocalOrPrivateUrl('http://0x7f000001/'), true); // 127.0.0.1 em hex
  });

  it('deve bloquear protocolos não-HTTP/HTTPS ou strings malformadas', () => {
    assert.equal(isLocalOrPrivateUrl('file:///etc/passwd'), true);
    assert.equal(isLocalOrPrivateUrl('ftp://example.com/'), true);
    assert.equal(isLocalOrPrivateUrl('javascript:alert(1)'), true);
    assert.equal(isLocalOrPrivateUrl(''), true);
    assert.equal(isLocalOrPrivateUrl('not-a-valid-url'), true);
  });

  it('deve permitir URLs públicas seguras da internet', () => {
    assert.equal(isLocalOrPrivateUrl('https://google.com/search?q=test'), false);
    assert.equal(isLocalOrPrivateUrl('https://api.github.com/repos'), false);
    assert.equal(isLocalOrPrivateUrl('https://cloudflare.com/'), false);
    assert.equal(isLocalOrPrivateUrl('http://example.com/'), false);
    assert.equal(isLocalOrPrivateUrl('https://142.250.190.46/'), false); // IP público do Google
    assert.equal(isLocalOrPrivateUrl('http://[2606:4700:4700::1111]/'), false); // IPv6 público Cloudflare
  });

  it('safeFetchWithRedirects deve bloquear SSRF inicial ou via redirecionamento HTTP 302', async () => {
    // 1. Bloqueio inicial imediato de URL privada
    await assert.rejects(
      async () => {
        await safeFetchWithRedirects('http://169.254.169.254/latest/meta-data/');
      },
      /SSRF Blocked/
    );

    // 2. Simulação de mock de redirecionamento malicioso para IMDS
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: any) => {
        const url = String(input);
        if (url === 'https://attacker.com/ssrf') {
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://169.254.169.254/latest/meta-data/credentials' },
          });
        }
        return originalFetch(input);
      };

      await assert.rejects(
        async () => {
          await safeFetchWithRedirects('https://attacker.com/ssrf');
        },
        /SSRF Blocked.*169\.254\.169\.254/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
