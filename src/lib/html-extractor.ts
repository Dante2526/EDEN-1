import * as cheerio from 'cheerio';

export interface ExtractedPageContent {
  title: string;
  content: string;
  length: number;
  truncated: boolean;
}

export function extractCleanContent(html: string, maxChars: number = 10000): ExtractedPageContent {
  const $ = cheerio.load(html);

  // 1. Extrair título da página
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Sem título';

  // 2. Remover tags indesejadas que poluem o contexto da IA
  $('script, style, noscript, svg, iframe, nav, footer, header, aside, form').remove();

  // 3. Priorizar elementos semânticos principais
  const mainCandidate = $('article, main, [role="main"], #content, .content, .main-content');
  const targetElement = mainCandidate.length > 0 ? mainCandidate.first() : $('body');

  // 4. Obter texto limpo e normalizar espaços em branco
  const rawText = targetElement.text() || $('body').text() || '';
  const cleanedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  // 5. Truncamento com salvaguarda
  if (cleanedText.length > maxChars) {
    const truncatedText =
      cleanedText.slice(0, maxChars) +
      '\n\n[... Conteúdo truncado para otimização de contexto ...]';
    return {
      title,
      content: truncatedText,
      length: truncatedText.length,
      truncated: true,
    };
  }

  return {
    title,
    content: cleanedText,
    length: cleanedText.length,
    truncated: false,
  };
}
