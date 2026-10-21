// ============================================================================
// Web Search Engine — Pesquisa na Web ao Vivo & Citações Estilo Perplexity
// ============================================================================
//
// Fornece funções para extração de domínios, geração de favicons, mapeamento
// de fontes de pesquisa ao vivo e injeção contextual de fontes com citações
// no formato [1], [2] para os modelos de IA do Éden.
// ============================================================================

import { WebSourceItem } from './types';

/**
 * Extrai o domínio amigável (sem www e sem protocolo/paths) de uma URL.
 */
export function extractDomainFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return rawUrl;
  }
}

/**
 * Retorna a URL do favicon via serviço Google S2 Favicons em 32x32.
 */
export function getFaviconUrl(rawUrl: string): string {
  const domain = extractDomainFromUrl(rawUrl);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

/**
 * Mapeia e deduplica resultados brutos vindos de /api/search em WebSourceItem[].
 */
export function parseWebSourcesFromSearchResults(results: any[]): WebSourceItem[] {
  if (!Array.isArray(results)) return [];

  const seenLinks = new Set<string>();
  const sources: WebSourceItem[] = [];

  for (const item of results) {
    if (!item || !item.link || typeof item.link !== 'string') continue;

    const normalizedLink = item.link.trim();
    if (seenLinks.has(normalizedLink)) continue;
    seenLinks.add(normalizedLink);

    const title = (item.title || extractDomainFromUrl(normalizedLink)).trim();
    const snippet = (item.snippet || '').trim();
    const content = item.content ? String(item.content).trim() : undefined;
    const domain = extractDomainFromUrl(normalizedLink);

    sources.push({
      title,
      snippet,
      link: normalizedLink,
      content,
      domain,
    });
  }

  return sources;
}

/**
 * Constrói o bloco de prompt contextual da web ao vivo com instruções estritas
 * de síntese e citação de fontes numeradas estilo Perplexity ([1], [2]).
 * Se nenhuma fonte prévia estiver disponível, força a chamada compulsória de busca web.
 */
export function buildLiveWebPrompt(query: string, sources: WebSourceItem[] = []): string {
  const safeQuery = query ? query.trim() : 'a pergunta do usuário';

  if (!sources || sources.length === 0) {
    return [
      `[MODO WEB AO VIVO ATIVADO — PESQUISA COMPULSÓRIA OBRIGATÓRIA (REGRA SUPREMA)]`,
      `O usuário ativou o modo Web ao Vivo para esta pergunta: "${safeQuery}".`,
      `NENHUMA fonte web prévia foi retornada automaticamente a tempo.`,
      `DIRETRIZ INVIOLÁVEL:`,
      `1. Você É ESTRITAMENTE OBRIGADO a executar a ferramenta "web_search" (e/ou "fetch_url") IMEDIATAMENTE no seu primeiro turno antes de redigir qualquer resposta final.`,
      `2. É TERMINANTEMENTE PROIBIDO responder com base apenas em conhecimento pré-corte desatualizado da memória interna sem antes consultar a internet em tempo real.`,
      `3. Assim que obtiver os resultados da busca, fundamente sua resposta nos dados obtidos e inclua as citações numéricas [1], [2] nas afirmações correspondentes.`,
    ].join('\n');
  }

  const lines: string[] = [
    `[MODO WEB AO VIVO ATIVADO — USO COMPULSÓRIO DAS FONTES (REGRA SUPREMA)]`,
    `O usuário ativou a pesquisa na web em tempo real sobre: "${safeQuery}".`,
    `Você tem acesso às fontes reais e atualizadas extraídas da internet abaixo.`,
    `DIRETRIZ SUPREMA DE ATUALIDADE E PRECISÃO:`,
    `- É TERMINANTEMENTE PROIBIDO ignorar estas fontes ou responder apenas com conhecimento pré-corte desatualizado.`,
    `- Todas as afirmações, dados, estatísticas e acontecimentos recentes DEVEM ser respaldados por estas fontes.`,
    `- Caso necessite de dados adicionais não cobertos pelos trechos abaixo, invoque imediatamente a ferramenta "web_search" ou "fetch_url".\n`,
    `Fontes disponíveis em tempo real:`,
  ];

  sources.forEach((s, idx) => {
    const num = idx + 1;
    lines.push(`[${num}] "${s.title}" (${s.domain || extractDomainFromUrl(s.link)})`);
    lines.push(`  Link: ${s.link}`);
    if (s.snippet) {
      lines.push(`  Resumo: ${s.snippet}`);
    }
    if (s.content) {
      lines.push(`  Conteúdo extraído: ${s.content.slice(0, 1200)}`);
    }
    lines.push('');
  });

  lines.push(
    `INSTRUÇÕES COMPULSÓRIAS DE CITAÇÃO (ESTILO PERPLEXITY):`,
    `1. CITAÇÃO OBRIGATÓRIA: Insira marcadores numéricos [1], [2] diretamente ao final de cada frase, afirmação, número ou fato extraído da fonte correspondente.`,
    `2. FONTES MÚLTIPLAS: Se uma informação vier de múltiplas fontes, cite-as sequencialmente (ex: [1][2]).`,
    `3. SÍNTESE DIRETA: Seja claro, objetivo e aprofundado, priorizando os fatos mais recentes das fontes.`,
    `4. FIDELIDADE AOS LINKS: Não invente URLs nem altere os índices. Use estritamente [1], [2] correspondentes às fontes listadas acima.`
  );

  return lines.join('\n');
}

/**
 * Extrai todos os índices de citação numérica (ex: [1], [2], [1][2]) presentes no texto.
 */
export function extractCitationIndices(markdown: string): number[] {
  const regex = /\[(\d+)\]/g;
  const indices = new Set<number>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num > 0) {
      indices.add(num);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Transforma marcadores de texto [1], [2] em links markdown clicáveis para as fontes fornecidas.
 */
export function linkifyCitations(text: string, sources: WebSourceItem[]): string {
  if (!sources || sources.length === 0 || !text) return text;

  return text.replace(/(?<!\]\(|\[)\[(\d+)\](?!\()/g, (match, numStr) => {
    const num = parseInt(numStr, 10);
    if (num > 0 && num <= sources.length) {
      const source = sources[num - 1];
      return `[${num}](${source.link})`;
    }
    return match;
  });
}

/**
 * Executa a pré-busca ao vivo na API /api/search do Éden com timeout rápido.
 */
export async function fetchLiveWebSources(
  query: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<WebSourceItem[]> {
  const timeoutMs = options.timeoutMs || 4500;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'x-api-key': (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_SECRET) || '',
      },
      signal: options.signal || controller.signal,
    });

    if (!res.ok) {
      console.warn(`[WebSearchEngine] Falha HTTP na busca: ${res.status}`);
      return [];
    }

    const rawData = await res.json();
    return parseWebSourcesFromSearchResults(rawData);
  } catch (err: any) {
    console.warn(`[WebSearchEngine] Erro ou timeout na busca web: ${err?.message || err}`);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
