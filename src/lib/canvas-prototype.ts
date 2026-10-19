import { CanvasPrototype } from './types.js';

export const CANVAS_PROTOTYPE_INTENT_REGEX =
  /\b(tela|p[aá]gina|interface|layout|view|modal|drawer|painel|dashboard|mockup|prot[oó]tip[ao]|design)\b/i;

/**
 * Verifica se a mensagem do usuário envolve criação ou redesign de interface visual.
 */
export function isCanvasPrototypingIntent(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') return false;
  const lower = prompt.toLowerCase();
  // Se for comando de terminal ou correção pura sem UI, não é intenção de tela
  if (lower.startsWith('rode ') || lower.startsWith('npm ') || lower.startsWith('git ')) return false;
  if (lower.includes('corrija o erro') && !lower.includes('tela') && !lower.includes('modal') && !lower.includes('layout')) {
    return false;
  }
  return CANVAS_PROTOTYPE_INTENT_REGEX.test(lower);
}

/**
 * Higieniza e prepara o código HTML do protótipo garantindo HTML5 válido,
 * meta viewport para responsividade mobile-first e script do Tailwind CSS CDN.
 */
export function sanitizePrototypeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return '<!DOCTYPE html><html><body></body></html>';
  }

  let html = rawHtml.trim();

  // Remove cercas markdown ```html ... ``` caso o modelo tenha envolvido
  html = html.replace(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/g, '$1').trim();

  const isFullDoc = /<!doctype\s+html>/i.test(html) || /<html[\s>]/i.test(html);

  const scrollbarAndFontStyles = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      -webkit-tap-highlight-color: transparent;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    }
    ::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>`;

  if (isFullDoc) {
    // Garante que o Tailwind, viewport, fontes e scrollbar estejam presentes no head
    if (!html.includes('cdn.tailwindcss.com')) {
      const headInjection = `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <script src="https://cdn.tailwindcss.com"></script>${scrollbarAndFontStyles}`;
      if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head[\s>]/i, `<head>\n  ${headInjection}`);
      } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html[\s>]/i, `<html>\n<head>\n  ${headInjection}\n</head>`);
      } else {
        html = `<head>\n  ${headInjection}\n</head>\n${html}`;
      }
    } else if (!html.includes('scrollbar-width')) {
      // Injeta os estilos de scrollbar e fonte no head existente se ainda não tiver
      if (/<head[\s>]/i.test(html)) {
        html = html.replace(/<head[\s>]/i, `<head>\n  ${scrollbarAndFontStyles}`);
      } else if (/<html[\s>]/i.test(html)) {
        html = html.replace(/<html[\s>]/i, `<html>\n<head>\n  ${scrollbarAndFontStyles}\n</head>`);
      }
    }
    return html;
  }

  // Fragmento de componente: monta um documento HTML5 completo e limpo
  return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: '#d97757',
            ocean: '#06b6d4',
          }
        }
      }
    }
  </script>
  ${scrollbarAndFontStyles}
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen p-0 sm:p-4 antialiased">
  ${html}
</body>
</html>`;
}

/**
 * Extrai bloco <eden_canvas title="..." viewport="...">...</eden_canvas> do texto.
 */
export function extractCanvasPrototypeFromText(text: string): CanvasPrototype | null {
  if (!text || typeof text !== 'string') return null;

  const canvasRegex = /<eden_canvas\s+([^>]*?)>([\s\S]*?)<\/eden_canvas>/i;
  const match = text.match(canvasRegex);
  if (!match) return null;

  const attrsStr = match[1] || '';
  const innerHtml = match[2] || '';

  const titleMatch = attrsStr.match(/title\s*=\s*["']([^"']+)["']/i);
  const title = titleMatch?.[1]?.trim() || 'Protótipo Visual';

  const viewportMatch = attrsStr.match(/viewport\s*=\s*["'](mobile|desktop)["']/i);
  const viewport = (viewportMatch?.[1]?.toLowerCase() as 'mobile' | 'desktop') || 'mobile';

  return {
    id: `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    html: sanitizePrototypeHtml(innerHtml),
    viewport,
    status: 'pending',
    createdAt: Date.now(),
  };
}

/**
 * Formata o resultado da ferramenta render_canvas_prototype para orientar a IA a aguardar a aprovação.
 */
export function formatCanvasToolResultForModel(title: string, viewport: string = 'mobile'): string {
  return (
    `✅ Protótipo visual exibido no Canvas de Prototipagem com sucesso!\n` +
    `- Título: "${title}"\n` +
    `- Viewport padrão: ${viewport} (com alternador Mobile 360px e Desktop disponível na interface)\n` +
    `- Status: O usuário está visualizando e interagindo com o protótipo no chat.\n\n` +
    `🚨 REGRA SUPREMA:\n` +
    `NÃO altere arquivos do repositório agora (não chame patch_file ou edit_file ainda).\n` +
    `Explique brevemente as decisões de design e ergonomia mobile adotadas e pergunte se o usuário aprova o layout ou deseja ajustes visuais.`
  );
}
