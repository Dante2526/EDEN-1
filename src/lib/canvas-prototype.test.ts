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
    assert.equal(isCanvasPrototypingIntent('crie um vídeo teaser para o produto com HyperFrames'), true);
    assert.equal(isCanvasPrototypingIntent('faça uma animação com GSAP para o lançamento'), true);
    assert.equal(isCanvasPrototypingIntent('crie vídeos promocionais para a campanha'), true);
    assert.equal(isCanvasPrototypingIntent('faça animações fluidas para o app'), true);
    assert.equal(isCanvasPrototypingIntent('desenhe modais responsivos'), true);
    assert.equal(isCanvasPrototypingIntent('gere painéis de controle modernos'), true);
    assert.equal(isCanvasPrototypingIntent('crie teasers cinematográficos'), true);
    assert.equal(isCanvasPrototypingIntent('corrija o erro de null pointer no arquivo auth.ts'), false);
    assert.equal(isCanvasPrototypingIntent('rode npm test no terminal'), false);
  });

  it('deve injetar a biblioteca GSAP 3 no fragmento para suportar animações HyperFrames', () => {
    const rawHtml = '<div class="scene-1 bg-black text-white p-4"><h1>Teaser</h1></div>';
    const output = sanitizePrototypeHtml(rawHtml);
    assert.ok(output.includes('gsap@3.12.5/dist/gsap.min.js'), 'Deve injetar o script CDN do GSAP 3');
  });

  it('deve injetar GSAP 3 no head de documento completo quando ausente', () => {
    const completeHtml = `<!DOCTYPE html><html><head><title>Vídeo Teaser</title><script src="https://cdn.tailwindcss.com"></script></head><body><div id="scene">Cena 1</div></body></html>`;
    const output = sanitizePrototypeHtml(completeHtml);
    assert.ok(output.includes('gsap@3.12.5/dist/gsap.min.js'), 'Deve injetar GSAP no head existente');
    const occurrences = (output.match(/gsap\.min\.js/g) || []).length;
    assert.equal(occurrences, 1, 'Não deve duplicar a injeção de GSAP');
  });

  it('não deve duplicar GSAP em documento completo que já o possui mesmo sem Tailwind', () => {
    const docWithGsap = `<!DOCTYPE html><html><head><title>Vídeo Existente</title><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script></head><body><p>Animação</p></body></html>`;
    const output = sanitizePrototypeHtml(docWithGsap);
    assert.ok(output.includes('cdn.tailwindcss.com'), 'Deve injetar Tailwind');
    const occurrences = (output.match(/gsap\.min\.js/g) || []).length;
    assert.equal(occurrences, 1, 'Deve manter exatamente 1 script do GSAP sem duplicar');
  });

  it('deve injetar CDN do GSAP mesmo quando o código inline já menciona gsap.timeline() sem tag script externa', () => {
    const docWithInlineGsapOnly = `<!DOCTYPE html><html><head><title>Teaser</title><script src="https://cdn.tailwindcss.com"></script></head><body><div id="scene-1">Cena</div><button id="btn-play">Play</button><script>const tl = gsap.timeline({ paused: true }); tl.to('#scene-1', { opacity: 1 });</script></body></html>`;
    const output = sanitizePrototypeHtml(docWithInlineGsapOnly);
    assert.ok(
      /<script[^>]+src=["'][^"']*gsap\.min\.js["']/i.test(output),
      'Deve injetar a tag <script src="...gsap.min.js"> mesmo havendo gsap.timeline() no script inline'
    );
  });

  it('deve injetar o runtime helper de estabilização HyperFrames (auto-healer do botão Play e CSS transitions)', () => {
    const rawHtml = '<div class="scene"><button id="btn-play">▶ Play</button></div><script>const tl = gsap.timeline({ paused: true });</script>';
    const output = sanitizePrototypeHtml(rawHtml);
    assert.ok(output.includes('data-eden-hyperframes-helper'), 'Deve injetar o script data-eden-hyperframes-helper');
    assert.ok(output.includes('__edenTimeline'), 'Deve registrar a timeline global __edenTimeline para auto-healing do Play');
  });
});
