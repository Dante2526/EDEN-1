import { SelectedPreviewElement } from './types';

export interface ElementSourceLocation {
  filePath: string;
  lineNumber?: number;
  codeSnippet?: string;
  confidence: 'high' | 'medium' | 'low';
}

function normalizePath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Localiza cirurgicamente no código-fonte do projeto o arquivo e a linha
 * de um elemento HTML inspecionado e selecionado no Preview.
 */
export function locateElementInProjectFiles(
  element: SelectedPreviewElement,
  files: Record<string, string | { content: string }> | null | undefined
): ElementSourceLocation | null {
  if (!files || Object.keys(files).length === 0 || !element) {
    return null;
  }

  // Extrai o ID exclusivo do elemento alvo (e NÃO de ancestrais como #root)
  let elementId: string | null = null;
  if (element.outerHtmlSnippet) {
    const idFromSnippet = element.outerHtmlSnippet.match(/^<[a-zA-Z0-9_\-]+\b[^>]*\bid=["']([^"']+)["']/i);
    if (idFromSnippet) {
      elementId = idFromSnippet[1];
    }
  }
  if (!elementId && element.selector) {
    const segments = element.selector.trim().split(/\s*>\s*|\s+/);
    const lastSegment = segments[segments.length - 1] || '';
    const idMatch = lastSegment.match(/#([a-zA-Z0-9_\-]+)/);
    if (idMatch) {
      elementId = idMatch[1];
    }
  }

  const rawText = (element.textContent || '').trim();
  const searchClassTokens = (element.className || '')
    .trim()
    .split(/\s+/)
    .filter((c) => c.length > 2 && !c.includes(':') && !c.includes('['));

  const targetTag = (element.tagName || '').toLowerCase();

  interface MatchCandidate {
    path: string;
    lineIndex: number;
    score: number;
    snippet: string;
  }

  const candidates: MatchCandidate[] = [];

  for (const [rawPath, entry] of Object.entries(files)) {
    const cleanPath = normalizePath(rawPath);

    // Ignora arquivos que não são fontes de UI
    if (
      cleanPath.endsWith('.d.ts') ||
      cleanPath.includes('.test.') ||
      cleanPath.includes('.spec.') ||
      cleanPath.includes('node_modules') ||
      cleanPath.includes('dist/') ||
      cleanPath.endsWith('.json') ||
      cleanPath.endsWith('.lock') ||
      cleanPath.endsWith('.map')
    ) {
      continue;
    }

    const content = typeof entry === 'string' ? entry : entry?.content;
    if (typeof content !== 'string' || content.length === 0) continue;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let score = 0;

      // 1. Match por ID único do elemento (alta relevância)
      if (elementId && (line.includes(`id="${elementId}"`) || line.includes(`id='${elementId}'`))) {
        score += 40;
      }

      // 2. Match por textContent visível (muito alta relevância se >= 2 caracteres)
      if (rawText && rawText.length >= 2 && line.includes(rawText)) {
        score += 30;
      }

      // 3. Match por classes CSS específicas da tag
      if (searchClassTokens.length > 0) {
        let matchedClasses = 0;
        for (const token of searchClassTokens) {
          if (line.includes(token)) {
            matchedClasses++;
          }
        }
        if (matchedClasses > 0) {
          score += matchedClasses * 4;
        }
      }

      // 4. Bônus se a tag estiver na mesma linha
      if (targetTag && line.toLowerCase().includes(`<${targetTag}`)) {
        score += 5;
      }

      // Requer pontuação mínima significativa para evitar falsos positivos
      if (score >= 20) {
        const start = Math.max(0, i - 1);
        const end = Math.min(lines.length - 1, i + 2);
        const snippetLines: string[] = [];
        for (let l = start; l <= end; l++) {
          const prefix = l === i ? '👉 ' : '   ';
          snippetLines.push(`${prefix}${l + 1}: ${lines[l].trimEnd()}`);
        }

        candidates.push({
          path: cleanPath,
          lineIndex: i,
          score,
          snippet: snippetLines.join('\n'),
        });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Ordena pelo maior score e prioriza componentes UI (.tsx > .jsx > .vue > .html > .ts > .js)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const extA = a.path.split('.').pop() || '';
    const extB = b.path.split('.').pop() || '';
    const priority = ['tsx', 'jsx', 'vue', 'html', 'ts', 'js'];
    const idxA = priority.indexOf(extA);
    const idxB = priority.indexOf(extB);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  const best = candidates[0];
  const confidence = best.score >= 35 ? 'high' : best.score >= 25 ? 'medium' : 'low';

  return {
    filePath: best.path,
    lineNumber: best.lineIndex + 1,
    codeSnippet: best.snippet,
    confidence,
  };
}

/**
 * Formata um bloco de contexto descritivo para enriquecer o prompt da IA
 */
export function formatElementInspectorPrompt(
  elements: SelectedPreviewElement[],
  projectFiles?: Record<string, string | { content: string }> | null
): string {
  if (!elements || elements.length === 0) return '';

  const formattedItems = elements.map((el, idx) => {
    const loc = locateElementInProjectFiles(el, projectFiles);

    const parts = [
      `Componente #${idx + 1}: <${el.tagName}>`,
      el.className ? `Classes CSS: ${el.className}` : null,
      el.selector ? `Seletor CSS no DOM: ${el.selector}` : null,
      el.textContent ? `Texto Visível: "${el.textContent}"` : null,
      el.outerHtmlSnippet ? `Snippet HTML Renderizado: \`${el.outerHtmlSnippet.trim()}\`` : null,
      loc
        ? `📍 Localização Exata no Código-Fonte:\n     - Arquivo: \`${loc.filePath}\` (Linha ${loc.lineNumber || '?'})\n     - Confiança: ${loc.confidence === 'high' ? 'Alta (Match direto)' : 'Média'}\n     - Trecho no código:\n\`\`\`tsx\n${loc.codeSnippet}\n\`\`\``
        : `📍 Arquivo-Fonte: Inspecione os arquivos do projeto para localizar as classes ou tag deste componente.`,
    ]
      .filter(Boolean)
      .join('\n  ');

    return `[Elemento ${idx + 1}]\n  ${parts}`;
  });

  return (
    `### [Componentes Selecionados no Preview para Edição Cirúrgica]\n` +
    `O usuário ativou o modo de seleção visual e clicou no(s) seguinte(s) elemento(s) no Preview:\n\n` +
    formattedItems.join('\n\n') +
    `\n\n🎯 DIRETRIZ CIRÚRGICA PARA A IA:\n` +
    `Aplique as modificações solicitadas focando EXATAMENTE nos arquivos e linhas indicados acima.\n` +
    `Utilize imediatamente a ferramenta correspondente (\`edit_file\` ou \`update_project_files\`) para realizar a alteração sem pedir confirmação prévia.`
  );
}
