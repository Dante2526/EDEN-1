import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePrototypeHtml,
  extractCanvasPrototypeFromText,
  formatCanvasToolResultForModel,
  isCanvasPrototypingIntent,
} from './canvas-prototype.js';

describe('Canvas Prototype Engine (Prototipagem Visual Antes de Código)', () => {
  it('deve envolver fragmentos HTML em documento HTML5 com meta viewport e Tailwind CDN', () => {
    const rawHtml = '<div class="p-4 bg-zinc-900 text-white"><button class="px-4 py-2 bg-blue-500 rounded">Entrar</button></div>';
    const output = sanitizePrototypeHtml(rawHtml);

    assert.ok(output.includes('<!DOCTYPE html>'), 'Deve conter doctype html');
    assert.ok(output.includes('<meta name="viewport"'), 'Deve conter meta viewport');
    assert.ok(output.includes('cdn.tailwindcss.com'), 'Deve injetar o Tailwind Play CDN');
    assert.ok(output.includes('Inter'), 'Deve injetar a fonte moderna Inter');
    assert.ok(output.includes('scrollbar-width'), 'Deve injetar reset anti-scrollbar branca do Windows');
    assert.ok(output.includes('Entrar'), 'Deve preservar o conteúdo HTML original');
  });

  it('deve preservar documento HTML completo sem duplicar tags html ou head', () => {
    const completeHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Teste</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-black text-white">
  <h1>Dashboard</h1>
</body>
</html>`;
    const output = sanitizePrototypeHtml(completeHtml);
    const htmlOccurrences = (output.match(/<html/gi) || []).length;
    assert.equal(htmlOccurrences, 1, 'Não deve duplicar a tag html');
    assert.ok(output.includes('Dashboard'));
  });

  it('deve injetar scrollbar e fonte Inter em documento completo mesmo com a palavra Interface no título', () => {
    const doc = '<!DOCTYPE html><html><head><title>Interface de Usuário</title><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Interface</h1></body></html>';
    const output = sanitizePrototypeHtml(doc);
    assert.ok(output.includes('scrollbar-width'), 'Deve conter estilos de scrollbar');
    assert.ok(output.includes('family=Inter'), 'Deve conter link da fonte Inter');
  });

  it('deve injetar Tailwind e viewport mesmo se o documento HTML completo não tiver tag head', () => {
    const htmlWithoutHead = '<!DOCTYPE html><html><body class="p-4 bg-zinc-900 text-white"><h1>Sem Head</h1></body></html>';
    const output = sanitizePrototypeHtml(htmlWithoutHead);

    assert.ok(output.includes('<head>'), 'Deve criar a tag head');
    assert.ok(output.includes('cdn.tailwindcss.com'), 'Deve injetar Tailwind');
    assert.ok(output.includes('<meta name="viewport"'), 'Deve injetar meta viewport');
    assert.ok(output.includes('Sem Head'));
  });

  it('deve extrair tag textual <eden_canvas> com atributos title e viewport', () => {
    const text = `Vou criar o protótipo visual da nova tela para você validar:
<eden_canvas title="Tela de Checkout Mobile" viewport="mobile">
<div class="p-4 bg-zinc-900 text-white">
  <h2 class="text-lg font-bold">Resumo do Pedido</h2>
  <button id="pay-btn" class="w-full py-3 bg-emerald-500 text-black font-semibold rounded-xl">Pagar Agora</button>
</div>
</eden_canvas>
O que achou da disposição dos botões?`;

    const extracted = extractCanvasPrototypeFromText(text);
    assert.ok(extracted, 'Deve extrair o protótipo');
    assert.equal(extracted?.title, 'Tela de Checkout Mobile');
    assert.equal(extracted?.viewport, 'mobile');
    assert.ok(extracted?.html.includes('Resumo do Pedido'));
    assert.ok(extracted?.html.includes('Pagar Agora'));
  });

  it('deve retornar null quando o texto não contém tag de canvas', () => {
    const text = 'Aqui está a explicação de como o componente funciona sem tag.';
    const extracted = extractCanvasPrototypeFromText(text);
    assert.equal(extracted, null);
  });

  it('deve formatar resultado da tool informando que o protótipo foi exibido e aguardando aprovação', () => {
    const result = formatCanvasToolResultForModel('Novo Dashboard', 'mobile');
    assert.ok(result.includes('Canvas de Prototipagem'));
    assert.ok(result.includes('Novo Dashboard'));
    assert.ok(result.includes('mobile'));
    assert.ok(result.includes('NÃO altere arquivos do repositório agora'));
  });

  it('deve identificar intenção de prototipagem em pedidos de criação de telas ou interfaces', () => {
    assert.equal(isCanvasPrototypingIntent('crie uma tela de login moderna com suporte mobile'), true);
    assert.equal(isCanvasPrototypingIntent('desenhe um modal de configurações de usuário'), true);
    assert.equal(isCanvasPrototypingIntent('faça uma nova interface para o painel de pedidos'), true);
    assert.equal(isCanvasPrototypingIntent('cria uma nova página de perfil'), true);
    assert.equal(isCanvasPrototypingIntent('corrija o erro de null pointer no arquivo auth.ts'), false);
    assert.equal(isCanvasPrototypingIntent('rode npm test no terminal'), false);
  });
});
