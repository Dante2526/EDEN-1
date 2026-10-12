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

// DuckDuckGo Instant Answer API - oficial, estável, sem bloqueio
async function searchDuckDuckGoApi(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=synap`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SynapAI/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const data = await res.json();

    // 1. Abstract principal
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText,
        link: data.AbstractURL,
      });
    }

    // 2. Related Topics (Topicos relacionados)
    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (results.length >= 6) break;
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 80),
            snippet: topic.Text,
            link: topic.FirstURL,
          });
        }
        // Sub-topics (categorias)
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const sub of topic.Topics.slice(0, 2)) {
            if (results.length >= 6) break;
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.split(' - ')[0] || sub.Text.substring(0, 80),
                snippet: sub.Text,
                link: sub.FirstURL,
              });
            }
          }
        }
      }
    }

    // 3. Results (se houver)
    if (Array.isArray(data.Results)) {
      for (const r of data.Results.slice(0, 3)) {
        if (results.length >= 6) break;
        if (r.Text && r.FirstURL) {
          results.push({
            title: r.Text.substring(0, 80),
            snippet: r.Text,
            link: r.FirstURL,
          });
        }
      }
    }
  } catch (err) {
    console.warn('DDG API error:', err);
  }

  return results;
}

// Wikipedia OpenSearch - segundo fallback, muito estável
async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const url = `https://pt.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SynapAI/1.0' },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const titles: string[] = data[1] || [];
    const snippets: string[] = data[2] || [];
    const links: string[] = data[3] || [];

    for (let i = 0; i < titles.length && results.length < 5; i++) {
      if (titles[i] && links[i]) {
        results.push({
          title: titles[i],
          snippet: snippets[i] || '',
          link: links[i],
        });
      }
    }
  } catch (err) {
    console.warn('Wikipedia search error:', err);
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
    // 1. Tenta DuckDuckGo Instant Answer API
    let results = await searchDuckDuckGoApi(q);

    // 2. Se DDG não achou nada, tenta Wikipedia
    if (results.length === 0) {
      const wikiResults = await searchWikipedia(q);
      results = wikiResults;
    }

    // 3. Se ainda não achou nada, retorna link de busca direto
    if (results.length === 0) {
      return new Response(JSON.stringify([
        {
          title: `Buscar: ${q}`,
          snippet: `Não encontrei resultados estruturados. Acesse a busca completa em:`,
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
        snippet: `Ocorreu um erro. Acesse diretamente:`,
        link: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
      }
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
