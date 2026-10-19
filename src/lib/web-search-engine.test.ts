import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomainFromUrl,
  getFaviconUrl,
  buildLiveWebPrompt,
  parseWebSourcesFromSearchResults,
  extractCitationIndices,
  linkifyCitations,
} from './web-search-engine';
import { WebSourceItem } from './types';

describe('web-search-engine (Perplexity Style Live Web Search & Citations)', () => {
  it('deve extrair o domínio limpo de URLs variadas', () => {
    assert.equal(extractDomainFromUrl('https://www.globo.com/noticias'), 'globo.com');
    assert.equal(extractDomainFromUrl('https://github.com/torvalds/linux?tab=readme'), 'github.com');
    assert.equal(extractDomainFromUrl('http://sub.domain.co.uk/path/file.html'), 'sub.domain.co.uk');
    assert.equal(extractDomainFromUrl('invalid-url'), 'invalid-url');
  });

  it('deve gerar URL do favicon via Google S2 Favicons com segurança', () => {
    const favicon = getFaviconUrl('https://techcrunch.com/2026/04/ai-news');
    assert.ok(favicon.includes('google.com/s2/favicons'));
    assert.ok(favicon.includes('techcrunch.com'));
  });

  it('deve converter resultados brutos de /api/search em WebSourceItem estruturado', () => {
    const rawApiResults = [
      {
        title: 'Lançamento do Modelo X',
        snippet: 'A empresa anunciou hoje o novo modelo...',
        link: 'https://news.ycombinator.com/item?id=123',
        content: 'Texto completo extraído da página com detalhes...',
      },
      {
        title: 'Repositório Oficial no GitHub',
        snippet: 'Código aberto disponível no GitHub',
        link: 'https://github.com/empresa/modelo-x',
      },
      // Duplicata proposital
      {
        title: 'Lançamento do Modelo X (Duplicado)',
        snippet: 'Mesmo link...',
        link: 'https://news.ycombinator.com/item?id=123',
      },
    ];

    const sources = parseWebSourcesFromSearchResults(rawApiResults);

    assert.equal(sources.length, 2);
    assert.equal(sources[0].domain, 'news.ycombinator.com');
    assert.equal(sources[1].domain, 'github.com');
    assert.equal(sources[0].title, 'Lançamento do Modelo X');
  });

  it('deve montar o prompt de injeção em tempo real com instruções compulsórias de citação [1], [2]', () => {
    const sources: WebSourceItem[] = [
      {
        title: 'OpenAI anuncia novo recurso',
        domain: 'theverge.com',
        link: 'https://theverge.com/openai',
        snippet: 'O recurso foi lançado hoje com suporte a...',
      },
      {
        title: 'Documentação Oficial',
        domain: 'platform.openai.com',
        link: 'https://platform.openai.com/docs',
        snippet: 'Guia de introdução rápida.',
      },
    ];

    const prompt = buildLiveWebPrompt('Quais as novidades da OpenAI hoje?', sources);

    assert.ok(prompt.includes('MODO WEB AO VIVO ATIVADO — USO COMPULSÓRIO'));
    assert.ok(prompt.includes('Quais as novidades da OpenAI hoje?'));
    assert.ok(prompt.includes('[1] "OpenAI anuncia novo recurso"'));
    assert.ok(prompt.includes('theverge.com'));
    assert.ok(prompt.includes('[2] "Documentação Oficial"'));
    assert.ok(prompt.includes('CITAÇÃO OBRIGATÓRIA'));
    assert.ok(prompt.includes('TERMINANTEMENTE PROIBIDO ignorar estas fontes'));
  });

  it('deve gerar prompt de busca obrigatória quando nenhuma fonte prévia foi carregada', () => {
    const prompt = buildLiveWebPrompt('Qual o resultado do jogo de ontem?', []);

    assert.ok(prompt.includes('PESQUISA COMPULSÓRIA OBRIGATÓRIA (REGRA SUPREMA)'));
    assert.ok(prompt.includes('web_search'));
    assert.ok(prompt.includes('Qual o resultado do jogo de ontem?'));
    assert.ok(prompt.includes('TERMINANTEMENTE PROIBIDO responder com base apenas em conhecimento pré-corte'));
  });

  it('deve extrair índices de citação numérica do texto gerado', () => {
    const text = 'De acordo com as notícias recentes [1], o novo modelo foi lançado mundialmente [2]. Detalhes em [1][2].';
    const indices = extractCitationIndices(text);

    assert.deepEqual(indices, [1, 2]);
  });

  it('deve transformar marcadores de citação [1] em links clicáveis para as fontes', () => {
    const sources: WebSourceItem[] = [
      { title: 'Notícia A', link: 'https://exemplo.com/a', snippet: '' },
      { title: 'Notícia B', link: 'https://exemplo.com/b', snippet: '' },
    ];
    const text = 'Texto com [1] e também [2], mas [99] não existe.';
    const linkified = linkifyCitations(text, sources);

    assert.equal(linkified, 'Texto com [1](https://exemplo.com/a) e também [2](https://exemplo.com/b), mas [99] não existe.');
  });
});
