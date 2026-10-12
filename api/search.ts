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
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// DuckDuckGo HTML com POST (bypassa anti-bot melhor que GET)
async function searchDuckDuckGoPost(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Referer': 'https://duckduckgo.com/',
      },
      body: `q=${encodeURIComponent(query)}&b=&kl=br-pt`,
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const html = await res.text();

    // Pattern 1: result__a (padrão antigo)
    const regex1 = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    // Pattern 2: result-link (padrão novo)  
    const regex2 = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    // Pattern 3: qualquer link com uddg= (redirect do DDG)
    const regex3 = /<a[^>]+href="(https?:\/\/[^"]*uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    // Snippet patterns
    const snippetRegex1 = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex2 = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const snippets: string[] = [];
    let sm;
    while ((sm = snippetRegex1.exec(html)) !== null) snippets.push(stripHtml(sm[1]));
    while ((sm = snippetRegex2.exec(html)) !== null) snippets.push(stripHtml(sm[1]));

    const seen = new Set<string>();
    for (const regex of [regex1, regex2, regex3]) {
      let m;
      while ((m = regex.exec(html)) !== null && results.length < 6) {
        let link = m[1];
        if (link.includes('uddg=')) {
          const u = link.match(/uddg=([^&]+)/);
          if (u) link = decodeURIComponent(u[1]);
        }
        const title = stripHtml(m[2]);
        if (title && link.startsWith('http') && !seen.has(link)) {
          seen.add(link);
          results.push({ title, snippet: snippets[results.length] || '', link });
        }
      }
      if (results.length > 0) break;
    }
  } catch (err) {
    console.warn('DDG POST search error:', err);
  }
  return results;
}

// Bing scraping (mais permissivo que DDG)
async function searchBing(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=8`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];
    const html = await res.text();

    // Bing: resultados em <li class="b_algo">
    const blocks = html.split('<li class="b_algo');
    for (let i = 1; i < blocks.length && results.length < 6; i++) {
      const block = blocks[i];
      const linkMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (linkMatch) {
        const link = linkMatch[1];
        const title = stripHtml(linkMatch[2]);
        const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : '';
        if (title && link && !link.includes('bing.com') && !link.includes('microsoft.com')) {
          results.push({ title, snippet, link });
        }
      }
    }
  } catch (err) {
    console.warn('Bing search error:', err);
  }
  return results;
}

// DuckDuckGo Instant Answer API (para queries enciclopédicas)
async function searchDuckDuckGoApi(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=synap`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SynapAI/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    if (data.AbstractText && data.AbstractURL) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText, link: data.AbstractURL });
    }
    if (Array.isArray(data.RelatedTopics)) {
      for (const t of data.RelatedTopics.slice(0, 4)) {
        if (results.length >= 6) break;
        if (t.Text && t.FirstURL) {
          results.push({ title: t.Text.split(' - ')[0] || t.Text.substring(0, 80), snippet: t.Text, link: t.FirstURL });
        }
      }
    }
  } catch (err) { console.warn('DDG API error:', err); }
  return results;
}

export default async function handler(req: Request): Promise<Response> {
  const securityResponse = await checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';

  if (!q.trim()) {
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // 1. Tenta DDG com POST (mais permissivo)
    let results = await searchDuckDuckGoPost(q);

    // 2. Se DDG POST falhou, tenta Bing
    if (results.length === 0) {
      results = await searchBing(q);
    }

    // 3. Se Bing falhou, tenta DDG Instant Answer API (enciclopédico)
    if (results.length === 0) {
      results = await searchDuckDuckGoApi(q);
    }

    // 4. Último recurso: retorna links de busca diretos
    if (results.length === 0) {
      results = [
        { title: `Buscar no DuckDuckGo: ${q}`, snippet: 'Clique para ver resultados completos', link: `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
        { title: `Buscar no Bing: ${q}`, snippet: 'Clique para ver resultados completos', link: `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
        { title: `Buscar no GitHub: ${q}`, snippet: 'Repositórios relacionados', link: `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories` },
      ];
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error: any) {
    console.error('Search error:', error);
    return new Response(JSON.stringify([
      { title: `Erro na busca: ${q}`, snippet: 'Acesse diretamente:', link: `https://duckduckgo.com/?q=${encodeURIComponent(q)}` }
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}
