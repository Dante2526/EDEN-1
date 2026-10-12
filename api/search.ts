import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>?/gm, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchDuckDuckGoHtml(query: string): Promise<SearchResult[]> {
  // Usa a interface lite do DuckDuckGo que é mais estável para scraping
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=br-pt`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];

  const html = await res.text();
  const results: SearchResult[] = [];

  try {
    // A lite interface do DDG usa uma tabela com classe .result-snippet
    // Os links estão em <a class="result-link" href="...">
    // E os snippets em <td class="result-snippet">
    
    // Regex mais robusta: pega qualquer <a> com href começando com http dentro de um <td>
    const linkRegex = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links: Array<{ link: string; title: string }> = [];
    const snippets: string[] = [];

    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      let link = linkMatch[1];
      // DDG lite às vezes coloca redirect
      if (link.includes('uddg=')) {
        const uddgMatch = link.match(/uddg=([^&]+)/);
        if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
      }
      const title = stripHtml(linkMatch[2]);
      if (title && link.startsWith('http')) {
        links.push({ link, title });
      }
    }

    let snippetMatch;
    while ((snippetMatch = snippetRegex.exec(html)) !== null) {
      snippets.push(stripHtml(snippetMatch[1]));
    }

    // Combina links com snippets
    for (let i = 0; i < Math.min(links.length, 6); i++) {
      results.push({
        title: links[i].title,
        snippet: snippets[i] || '',
        link: links[i].link,
      });
    }

    // Fallback: se a regex da lite não achou nada, tenta a interface HTML normal
    if (results.length === 0) {
      const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const htmlRes = await fetch(htmlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (htmlRes.ok) {
        const html2 = await htmlRes.text();
        // Tenta múltiplas regex patterns (DDG muda HTML frequentemente)
        const patterns = [
          /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
          /<a[^>]+class="result__url"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
          /<a[^>]+rel="ugc"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
        ];

        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(html2)) !== null && results.length < 5) {
            let link = match[1];
            if (link.includes('uddg=')) {
              const uddgMatch = link.match(/uddg=([^&]+)/);
              if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
            }
            const title = stripHtml(match[2]);
            if (title && link.startsWith('http')) {
              results.push({ title, snippet: '', link });
            }
          }
          if (results.length > 0) break;
        }
      }
    }
  } catch (parseErr) {
    console.warn('Failed to parse DDG results:', parseErr);
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
    
    // Se não achou nada, retorna um resultado placeholder explicando
    if (results.length === 0) {
      return new Response(JSON.stringify([
        {
          title: `Resultados para: ${q}`,
          snippet: `Não foi possível extrair resultados do DuckDuckGo. Tente acessar diretamente: https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
          link: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
        }
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      });
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error: any) {
    console.error('Search error:', error);
    return new Response(JSON.stringify([
      {
        title: `Erro na busca: ${q}`,
        snippet: `Ocorreu um erro ao buscar. Tente novamente ou acesse: https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
        link: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
      }
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
