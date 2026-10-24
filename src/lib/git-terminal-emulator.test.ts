import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommandArgs,
  executeTerminalCommand,
  clearVirtualTmpFiles,
  getVirtualTmpFile,
  setVirtualTmpFile,
  type TerminalEmulatorContext,
} from './git-terminal-emulator';

function createMockContext(cwd = '/'): TerminalEmulatorContext {
  return {
    cwd,
    setCwd: () => {},
    changes: [],
    activeRepo: null,
    gitHubUser: null,
  };
}

test('parseCommandArgs - Tratamento avançado de aspas e caracteres de escape', () => {
  // Teste 1: Termos com aspas escapadas via barra invertida
  const res1 = parseCommandArgs('grep \\"<iframe\\" /tmp/page.html');
  assert.equal(res1.command, 'grep');
  assert.equal(res1.args[0], '<iframe');
  assert.equal(res1.args[1], '/tmp/page.html');

  // Teste 2: Aspas simples normais com tags HTML
  const res2 = parseCommandArgs("grep '<iframe src=' /tmp/anime.html");
  assert.equal(res2.command, 'grep');
  assert.equal(res2.args[0], '<iframe src=');
  assert.equal(res2.args[1], '/tmp/anime.html');

  // Teste 3: Cabeçalho com aspas internas
  const res3 = parseCommandArgs('curl -H "Referer: https://animesonlinecc.to/" https://example.com');
  assert.equal(res3.command, 'curl');
  assert.equal(res3.flags['H'], 'Referer: https://animesonlinecc.to/');
  assert.ok(res3.args.includes('https://example.com'));

  // Teste 4: Espaços escapados
  const res4 = parseCommandArgs('echo hello\\ world');
  assert.equal(res4.command, 'echo');
  assert.equal(res4.args[0], 'hello world');
});

test('virtualTmpFiles - Gravação e leitura de arquivos em /tmp sem repositório GitHub', async () => {
  clearVirtualTmpFiles();

  // Grava arquivo virtualmente em /tmp
  setVirtualTmpFile('/tmp/anime_page.html', '<html><body>\n<iframe src="https://blogger.com/video.g?token=123"></iframe>\n<p>Outro texto</p>\n</body></html>');
  assert.ok(getVirtualTmpFile('/tmp/anime_page.html')?.includes('<iframe'));

  // Teste de cat /tmp/anime_page.html sem repo ativo
  const catRes = await executeTerminalCommand('cat /tmp/anime_page.html', createMockContext());
  assert.equal(catRes.exitCode, 0);
  assert.ok(catRes.stdout.includes('<iframe src='));

  // Teste de grep "<iframe" /tmp/anime_page.html sem repo ativo
  const grepRes = await executeTerminalCommand('grep "<iframe" /tmp/anime_page.html', createMockContext());
  assert.equal(grepRes.exitCode, 0);
  assert.ok(grepRes.stdout.includes('<iframe src="https://blogger.com/video.g?token=123"></iframe>'));
  assert.ok(!grepRes.stdout.includes('<p>Outro texto</p>'));

  // Teste de head e tail no /tmp
  const headRes = await executeTerminalCommand('head -n 2 /tmp/anime_page.html', createMockContext());
  assert.equal(headRes.exitCode, 0);
  assert.equal(headRes.stdout.split('\n').length, 2);
});

test('curl -o e redirecionamento para /tmp com grep posterior', async () => {
  clearVirtualTmpFiles();

  // Mock global de fetch para simular resposta do /api/fetch-url
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    return new Response(
      JSON.stringify({
        status: 200,
        rawHtml: '<html><body><iframe src="https://player.blogger.com/test"></iframe></body></html>',
        mediaUrls: [],
        iframes: ['https://player.blogger.com/test'],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const curlRes = await executeTerminalCommand(
      'curl -s -L "https://animesonlinecc.to/episodio/1" -o /tmp/ep1.html',
      createMockContext()
    );
    assert.equal(curlRes.exitCode, 0);
    assert.ok(curlRes.stdout.includes('Salvo em /tmp/ep1.html'));

    // Verifica se foi gravado no /tmp virtual
    const saved = getVirtualTmpFile('/tmp/ep1.html');
    assert.ok(saved?.includes('https://player.blogger.com/test'));

    // Executa grep no arquivo salvo
    const grepRes = await executeTerminalCommand('grep "iframe" /tmp/ep1.html', createMockContext());
    assert.equal(grepRes.exitCode, 0);
    assert.ok(grepRes.stdout.includes('iframe src="https://player.blogger.com/test"'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Pipe Unix básico: comando1 | grep <termo>', async () => {
  // Simula pipe de echo para grep
  const pipeRes = await executeTerminalCommand(
    'echo "primeira linha\nsegunda linha com chave secreta\nterceira linha" | grep "chave"',
    createMockContext()
  );
  assert.equal(pipeRes.exitCode, 0);
  assert.ok(pipeRes.stdout.includes('segunda linha com chave secreta'));
  assert.ok(!pipeRes.stdout.includes('primeira linha'));
});

test('Comando base64 (-d/--decode e encode) via pipe e arquivo', async () => {
  const encoded = Buffer.from('Olá Éden Vídeo', 'utf-8').toString('base64');
  const decodeRes = await executeTerminalCommand(`echo "${encoded}" | base64 -d`, createMockContext());
  assert.equal(decodeRes.exitCode, 0);
  assert.equal(decodeRes.stdout, 'Olá Éden Vídeo');

  const encodeRes = await executeTerminalCommand('echo "Synap" | base64', createMockContext());
  assert.equal(encodeRes.exitCode, 0);
  assert.equal(encodeRes.stdout, Buffer.from('Synap', 'utf-8').toString('base64'));
});

test('Comando find - busca de arquivos por padrão -name em /tmp e alterações locais', async () => {
  clearVirtualTmpFiles();
  setVirtualTmpFile('/tmp/App_decoded.tsx', 'export default function App() {}');
  const ctx: TerminalEmulatorContext = {
    ...createMockContext(),
    changes: [
      {
        id: '1',
        path: 'src/components/chat-header.tsx',
        repo: 'user/eden',
        branch: 'main',
        type: 'modified',
        newContent: '',
        createdAt: Date.now(),
        staged: false,
      },
    ],
  };

  const findRes = await executeTerminalCommand('find / -name "chat-header.tsx"', ctx);
  assert.equal(findRes.exitCode, 0);
  assert.ok(findRes.stdout.includes('src/components/chat-header.tsx'));
});
