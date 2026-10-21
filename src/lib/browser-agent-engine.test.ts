import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPuppeteerFunctionScript,
  parseInteractiveElementsFromHtml,
  formatBrowserToolResultForModel,
  BrowserActionResult,
  BrowserActionParams,
} from './browser-agent-engine';

describe('browser-agent-engine (Playwright/Puppeteer Browser Control)', () => {
  it('deve gerar script Puppeteer válido para ação de navegação (navigate)', () => {
    const params: BrowserActionParams = {
      action: 'navigate',
      url: 'https://example.com',
      waitMs: 1500,
    };
    const script = buildPuppeteerFunctionScript(params);

    assert.ok(script.includes('page.goto'));
    assert.ok(script.includes('https://example.com'));
    assert.ok(script.includes('page.screenshot'));
    assert.ok(script.includes('module.exports = async'));
  });

  it('deve gerar script Puppeteer para ação de clique (click) com seletor', () => {
    const params: BrowserActionParams = {
      action: 'click',
      selector: '#submit-btn',
      waitMs: 1000,
    };
    const script = buildPuppeteerFunctionScript(params);

    assert.ok(script.includes('page.click'));
    assert.ok(script.includes('#submit-btn'));
  });

  it('deve gerar script Puppeteer para ação de digitação (type) com limpeza prévia', () => {
    const params: BrowserActionParams = {
      action: 'type',
      selector: 'input[name="q"]',
      text: 'Pesquisa Éden',
    };
    const script = buildPuppeteerFunctionScript(params);

    assert.ok(script.includes('page.type'));
    assert.ok(script.includes('Pesquisa Éden'));
    assert.ok(script.includes('input[name="q"]'));
  });

  it('deve gerar script Puppeteer para rolagem de página (scroll)', () => {
    const params: BrowserActionParams = {
      action: 'scroll',
      scrollDirection: 'down',
      scrollAmount: 600,
    };
    const script = buildPuppeteerFunctionScript(params);

    assert.ok(script.includes('window.scrollBy'));
    assert.ok(script.includes('600'));
  });

  it('deve extrair elementos interativos estruturados de um HTML', () => {
    const sampleHtml = `
      <html>
        <body>
          <header>
            <a href="/login" class="nav-link">Entrar</a>
            <a href="/signup" id="signup-btn">Cadastrar</a>
          </header>
          <main>
            <form action="/search">
              <input type="text" name="query" placeholder="Buscar repositório..." id="search-input" />
              <button type="submit" class="btn primary">Pesquisar</button>
            </form>
          </main>
        </body>
      </html>
    `;

    const elements = parseInteractiveElementsFromHtml(sampleHtml);

    assert.ok(elements.length >= 4);
    assert.equal(elements[0].text, 'Entrar');
    assert.equal(elements[0].tag, 'a');
    assert.equal(elements[1].text, 'Cadastrar');
    assert.equal(elements[2].tag, 'input');
    assert.equal(elements[2].placeholder, 'Buscar repositório...');
    assert.equal(elements[3].tag, 'button');
    assert.equal(elements[3].text, 'Pesquisar');
  });

  it('deve formatar resultado do navegador para o modelo de IA com clareza e elementos numerados', () => {
    const mockResult: BrowserActionResult = {
      success: true,
      currentUrl: 'https://github.com/login',
      title: 'Sign in to GitHub',
      action: 'navigate',
      actionDescription: 'Navegou para https://github.com/login',
      screenshotBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      interactiveElements: [
        { index: 1, tag: 'input', selector: '#login_field', placeholder: 'Username or email', text: '' },
        { index: 2, tag: 'input', selector: '#password', placeholder: 'Password', text: '' },
        { index: 3, tag: 'button', selector: 'input[name="commit"]', text: 'Sign in' },
      ],
      extractedText: 'Sign in to GitHub to continue to repository...',
    };

    const formatted = formatBrowserToolResultForModel(mockResult);

    assert.ok(formatted.includes('🌐 Página Atual: Sign in to GitHub'));
    assert.ok(formatted.includes('https://github.com/login'));
    assert.ok(formatted.includes('Navegou para https://github.com/login'));
    assert.ok(formatted.includes('[1] <input> (#login_field)'));
    assert.ok(formatted.includes('[2] <input> (#password)'));
    assert.ok(formatted.includes('[3] <button> (input[name="commit"])'));
    assert.ok(formatted.includes('📸 Screenshot capturado'));
  });

  it('deve incluir listeners de console, pageerror e network no script Puppeteer', () => {
    const params: BrowserActionParams = {
      action: 'navigate',
      url: 'https://example.com',
    };
    const script = buildPuppeteerFunctionScript(params);

    assert.ok(script.includes("page.on('console'"));
    assert.ok(script.includes("page.on('pageerror'"));
    assert.ok(script.includes("page.on('response'"));
    assert.ok(script.includes('consoleLogs'));
    assert.ok(script.includes('networkErrors'));
  });

  it('deve formatar DevTools da página externa (console e falhas de rede) no Markdown para a IA', () => {
    const mockResult: BrowserActionResult = {
      success: true,
      currentUrl: 'https://blogger.com/video.g?token=xyz',
      title: 'Blogger Video Player',
      action: 'navigate',
      actionDescription: 'Navegou para o player',
      interactiveElements: [],
      consoleLogs: [
        { type: 'error', text: 'Uncaught Error: Access Denied / Invalid Token' },
        { type: 'warning', text: 'Deprecated API called' },
      ],
      networkErrors: [
        { url: 'https://blogger.com/get_video_info', status: 403, statusText: 'Forbidden' },
      ],
    };

    const formatted = formatBrowserToolResultForModel(mockResult);

    assert.ok(formatted.includes('🛠️ DevTools da Página (Console & Rede)'));
    assert.ok(formatted.includes('[Console Error] Uncaught Error: Access Denied / Invalid Token'));
    assert.ok(formatted.includes('[Network Error] 403 Forbidden: https://blogger.com/get_video_info'));
  });
});

