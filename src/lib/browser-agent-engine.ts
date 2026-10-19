/**
 * browser-agent-engine.ts
 * Motor de controle autônomo do navegador estilo Playwright / Browser-Use.
 * Gera scripts de automação para execução na nuvem (Browserless.io / Chromium Headless)
 * e formata os dados do DOM/Screenshot para o ciclo de decisão dos modelos de IA.
 */

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'press_key'
  | 'scroll'
  | 'wait'
  | 'screenshot'
  | 'extract';

export interface BrowserActionParams {
  action: BrowserActionType;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  scrollDirection?: 'up' | 'down';
  scrollAmount?: number;
  waitMs?: number;
  waitForSelector?: string;
}

export interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  text: string;
  selector: string;
  placeholder?: string;
  href?: string;
}

export interface BrowserActionResult {
  success: boolean;
  currentUrl: string;
  title: string;
  action: BrowserActionType;
  actionDescription: string;
  screenshotBase64?: string;
  interactiveElements: InteractiveElement[];
  extractedText?: string;
  error?: string;
}

/**
 * Constrói o script Puppeteer autoexecutável para ser enviado ao endpoint /function do Browserless.io
 * ou executado em ambiente Node/Chromium remoto.
 */
export function buildPuppeteerFunctionScript(params: BrowserActionParams): string {
  const safeUrl = (params.url || '').replace(/'/g, "\\'");
  const safeSelector = (params.selector || '').replace(/'/g, "\\'");
  const safeText = (params.text || '').replace(/'/g, "\\'");
  const safeKey = (params.key || 'Enter').replace(/'/g, "\\'");
  const waitMs = params.waitMs && params.waitMs > 0 ? params.waitMs : 1000;
  const scrollAmount = params.scrollAmount || 500;
  const scrollDir = params.scrollDirection === 'up' ? -scrollAmount : scrollAmount;

  return `
module.exports = async ({ page, context }) => {
  // Configurações de viewport e headers amigáveis
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  let actionDesc = '';
  try {
    const action = '${params.action}';
    if (action === 'navigate') {
      actionDesc = 'Navegou para ${safeUrl}';
      await page.goto('${safeUrl}', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(${waitMs});
    } else if (action === 'click') {
      actionDesc = 'Clicou no seletor ${safeSelector}';
      if ('${safeSelector}') {
        await page.waitForSelector('${safeSelector}', { timeout: 8000 });
        await page.click('${safeSelector}');
      }
      await page.waitForTimeout(${waitMs});
    } else if (action === 'type') {
      actionDesc = 'Digitou "${safeText}" no seletor ${safeSelector}';
      if ('${safeSelector}') {
        await page.waitForSelector('${safeSelector}', { timeout: 8000 });
        // Limpa antes de digitar
        await page.click('${safeSelector}', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('${safeSelector}', '${safeText}', { delay: 30 });
      }
      await page.waitForTimeout(${waitMs});
    } else if (action === 'press_key') {
      actionDesc = 'Pressionou a tecla ${safeKey}';
      await page.keyboard.press('${safeKey}');
      await page.waitForTimeout(${waitMs});
    } else if (action === 'scroll') {
      actionDesc = 'Rolou a página em ${scrollDir}px';
      await page.evaluate((amount) => {
        window.scrollBy({ top: amount, behavior: 'smooth' });
      }, ${scrollDir});
      await page.waitForTimeout(${waitMs});
    } else if (action === 'wait') {
      actionDesc = 'Aguardou ${waitMs}ms';
      await page.waitForTimeout(${waitMs});
    } else if (action === 'screenshot') {
      actionDesc = 'Capturou screenshot da tela';
    }

    const currentUrl = page.url();
    const title = await page.title();
    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    const screenshotBase64 = 'data:image/jpeg;base64,' + screenshotBuffer.toString('base64');
    const html = await page.content();

    return {
      success: true,
      currentUrl,
      title,
      action: '${params.action}',
      actionDescription: actionDesc,
      screenshotBase64,
      html,
    };
  } catch (err) {
    return {
      success: false,
      currentUrl: page.url() || '${safeUrl}',
      title: await page.title().catch(() => ''),
      action: '${params.action}',
      actionDescription: 'Falha: ' + err.message,
      error: err.message,
    };
  }
};
`.trim();
}

/**
 * Extrai elementos interativos do HTML para que a IA possa escolher ações
 * precisas por índice numérico (evita erros de seletor CSS alucinado).
 */
export function parseInteractiveElementsFromHtml(html: string): InteractiveElement[] {
  if (!html) return [];

  const elements: InteractiveElement[] = [];
  let indexCounter = 1;

  // Regex para links <a>
  const linkRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null && elements.length < 25) {
    const attrs = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, '').trim();
    const hrefMatch = attrs.match(/href=["']([^"']*)["']/i);
    const idMatch = attrs.match(/id=["']([^"']*)["']/i);
    const classMatch = attrs.match(/class=["']([^"']*)["']/i);

    if (innerText || hrefMatch) {
      const selector = idMatch ? `#${idMatch[1]}` : hrefMatch ? `a[href="${hrefMatch[1]}"]` : 'a';
      elements.push({
        index: indexCounter++,
        tag: 'a',
        text: innerText || 'Link sem texto',
        href: hrefMatch ? hrefMatch[1] : undefined,
        selector,
      });
    }
  }

  // Regex para inputs e textareas
  const inputRegex = /<(input|textarea)\b([^>]*)>/gi;
  while ((match = inputRegex.exec(html)) !== null && elements.length < 35) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const typeMatch = attrs.match(/type=["']([^"']*)["']/i);
    const nameMatch = attrs.match(/name=["']([^"']*)["']/i);
    const idMatch = attrs.match(/id=["']([^"']*)["']/i);
    const placeholderMatch = attrs.match(/placeholder=["']([^"']*)["']/i);

    const selector = idMatch
      ? `#${idMatch[1]}`
      : nameMatch
      ? `${tag}[name="${nameMatch[1]}"]`
      : tag;

    elements.push({
      index: indexCounter++,
      tag,
      type: typeMatch ? typeMatch[1] : 'text',
      text: '',
      placeholder: placeholderMatch ? placeholderMatch[1] : undefined,
      selector,
    });
  }

  // Regex para buttons
  const buttonRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  while ((match = buttonRegex.exec(html)) !== null && elements.length < 45) {
    const attrs = match[1];
    const innerText = match[2].replace(/<[^>]+>/g, '').trim();
    const idMatch = attrs.match(/id=["']([^"']*)["']/i);
    const typeMatch = attrs.match(/type=["']([^"']*)["']/i);
    const nameMatch = attrs.match(/name=["']([^"']*)["']/i);

    const selector = idMatch
      ? `#${idMatch[1]}`
      : nameMatch
      ? `button[name="${nameMatch[1]}"]`
      : typeMatch
      ? `button[type="${typeMatch[1]}"]`
      : 'button';

    elements.push({
      index: indexCounter++,
      tag: 'button',
      text: innerText || 'Botão',
      selector,
    });
  }

  return elements;
}

/**
 * Formata o resultado do navegador em Markdown conciso e estruturado para o modelo de IA.
 */
export function formatBrowserToolResultForModel(result: BrowserActionResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push(`🌐 Página Atual: ${result.title || 'Sem título'}`);
    lines.push(`🔗 URL: ${result.currentUrl}`);
    lines.push(`⚡ Ação Executada: ${result.actionDescription}`);
  } else {
    lines.push(`⚠️ Falha na Ação do Navegador: ${result.error || 'Erro desconhecido'}`);
    lines.push(`🔗 URL Atual: ${result.currentUrl}`);
  }

  if (result.screenshotBase64) {
    lines.push(`📸 Screenshot capturado com sucesso (disponível no card visual do usuário).`);
  }

  if (result.interactiveElements && result.interactiveElements.length > 0) {
    lines.push('\nElementos Interativos Disponíveis para Interação:');
    result.interactiveElements.slice(0, 20).forEach((el) => {
      let desc = `[${el.index}] <${el.tag}> (${el.selector})`;
      if (el.text) desc += ` — "${el.text}"`;
      if (el.placeholder) desc += ` [placeholder: "${el.placeholder}"]`;
      if (el.href) desc += ` [link: ${el.href}]`;
      lines.push(desc);
    });
  }

  if (result.extractedText) {
    const cleanSnippet = result.extractedText.slice(0, 800).trim();
    if (cleanSnippet) {
      lines.push(`\nResumo de Conteúdo da Página:\n${cleanSnippet}...`);
    }
  }

  lines.push('\nPróximo Passo do Modelo:');
  lines.push('Para continuar navegando, chame novamente "control_browser" com o seletor desejado (ex: click ou type) ou responda ao usuário se já atingiu o objetivo.');

  return lines.join('\n');
}
