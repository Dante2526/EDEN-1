import { checkAuthAndRateLimit } from './_security.js';

export const config = {
  runtime: 'nodejs',
};

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

function sanitizeSnippetForAi(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

async function searchDuckDuckGoHtml(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return [];

  const html = await res.text();
  const results: SearchResult[] = [];

  try {
    const resultBlocks = html.split('<div class="result ');
    for (let i = 1; i < resultBlocks.length && results.length < 5; i++) {
      const block = resultBlocks[i];
      const titleMatch = block.match(/<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (titleMatch) {
        let link = titleMatch[1];
        if (link.includes('uddg=')) {
          const match = link.match(/uddg=([^&]+)/);
          if (match) link = decodeURIComponent(match[1]);
        }
        const title = sanitizeSnippetForAi(titleMatch[2]);
        const snippet = snippetMatch ? sanitizeSnippetForAi(snippetMatch[1]) : '';

        if (title && link.startsWith('http')) {
          results.push({ title, snippet, link });
        }
      }
    }
  } catch (parseErr) {
    console.warn('Failed to parse DDG HTML:', parseErr);
  }
  return results;
}

export default async function handler(req: Request): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';

  if (!q.trim()) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const results = await searchDuckDuckGoHtml(q);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error: any) {
    console.error('Search error:', error);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
