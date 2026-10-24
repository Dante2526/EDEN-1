import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOpenCutTimeline,
  buildOpenCutUrl,
  buildOpenCutTranslatedUrl,
  formatOpenCutToolResult,
  parseScriptToOpenCutTimeline,
} from './opencut-integration';
import { OpenCutTimeline } from './types';

describe('OpenCut Integration (Engine Lógica de Vídeo e Timeline)', () => {
  it('deve validar uma timeline correta com sucesso', () => {
    const timeline: OpenCutTimeline = {
      title: 'Vídeo Promocional Éden',
      aspectRatio: '9:16',
      duration: 15,
      tracks: [
        {
          id: 'track-v1',
          name: 'Vídeo Principal',
          type: 'video',
          clips: [
            {
              id: 'c1',
              name: 'Intro',
              start: 0,
              duration: 5,
              type: 'video',
            },
            {
              id: 'c2',
              name: 'Demonstração',
              start: 5,
              duration: 10,
              type: 'video',
            },
          ],
        },
        {
          id: 'track-t1',
          name: 'Legendas',
          type: 'text',
          clips: [
            {
              id: 't1',
              text: 'Conheça o Éden',
              start: 0,
              duration: 3,
              type: 'text',
            },
          ],
        },
      ],
    };

    const res = validateOpenCutTimeline(timeline);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it('deve rejeitar timeline sem título ou com duração negativa', () => {
    const invalidTimeline = {
      title: '   ',
      duration: -5,
      tracks: [],
    };

    const res = validateOpenCutTimeline(invalidTimeline as any);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('título')));
    assert.ok(res.errors.some((e) => e.includes('duração')));
  });

  it('deve detectar clipes com tempos de início ou durações inválidas', () => {
    const timeline: OpenCutTimeline = {
      title: 'Reels Inválido',
      aspectRatio: '9:16',
      duration: 10,
      tracks: [
        {
          id: 'tr1',
          name: 'Track',
          type: 'video',
          clips: [
            {
              id: 'bad-clip',
              start: -1,
              duration: 0,
              type: 'video',
            },
          ],
        },
      ],
    };

    const res = validateOpenCutTimeline(timeline);
    assert.equal(res.valid, false);
    assert.ok(res.errors.length >= 2);
  });

  it('deve gerar URL do OpenCut Web com parâmetros codificados', () => {
    const defaultUrl = buildOpenCutUrl({ language: 'en' });
    assert.equal(defaultUrl, 'https://opencut.app/projects');

    const customUrl = buildOpenCutUrl({
      projectTitle: 'Vídeo do Éden #1',
      aspectRatio: '9:16',
      remoteMcpUrl: 'https://mcp.exemplo.com',
      language: 'en',
    });

    assert.ok(customUrl.startsWith('https://opencut.app/projects'));
    assert.ok(customUrl.includes('title=V%C3%ADdeo+do+%C3%89den+%231') || customUrl.includes('title=V%C3%ADdeo%20do%20%C3%89den%20%231'));
    assert.ok(customUrl.includes('aspect=9%3A16'));
    assert.ok(customUrl.includes('mcp=https%3A%2F%2Fmcp.exemplo.com'));
  });

  it('deve gerar URL do OpenCut traduzida em Português do Brasil (PT-BR)', () => {
    const ptUrl = buildOpenCutUrl({ language: 'pt' });
    assert.equal(ptUrl, '/api/opencut-proxy/projects');





    const ptCustomUrl = buildOpenCutTranslatedUrl({
      projectTitle: 'Vídeo Éden PT',
      aspectRatio: '9:16',
    });
    assert.ok(ptCustomUrl.startsWith('/api/opencut-proxy/projects'));
    assert.ok(ptCustomUrl.includes('title=V%C3%ADdeo+do+%C3%89den+PT') || ptCustomUrl.includes('title=V%C3%ADdeo%20%C3%89den%20PT') || ptCustomUrl.includes('title=V%C3%ADdeo+%C3%89den+PT'));
    assert.ok(ptCustomUrl.includes('aspect=9%3A16'));


  });

  it('deve formatar resultado da tool OpenCut para a IA e UI', () => {
    const timeline: OpenCutTimeline = {
      title: 'Review Rápido',
      aspectRatio: '16:9',
      duration: 30,
      tracks: [
        { id: '1', name: 'Vídeo', type: 'video', clips: [{ id: 'c1', start: 0, duration: 15, type: 'video' }] },
        { id: '2', name: 'Áudio', type: 'audio', clips: [{ id: 'a1', start: 0, duration: 30, type: 'audio' }] },
      ],
    };

    const formatted = formatOpenCutToolResult(timeline);
    assert.ok(formatted.includes('Review Rápido'));
    assert.ok(formatted.includes('16:9'));
    assert.ok(formatted.includes('30s') || formatted.includes('30 seg'));
    assert.ok(formatted.includes('2 faixas'));
  });

  it('deve converter roteiro em texto estruturado para OpenCutTimeline', () => {
    const script = `
[00:00 - 00:04] Gancho inicial: O novo editor de vídeo chegou
[00:04 - 00:12] Demonstração das ferramentas de corte
[00:12 - 00:20] Encerramento com chamada para ação
    `.trim();

    const timeline = parseScriptToOpenCutTimeline(script, 'TikTok Éden', '9:16');
    assert.equal(timeline.title, 'TikTok Éden');
    assert.equal(timeline.aspectRatio, '9:16');
    assert.equal(timeline.duration, 20);
    assert.equal(timeline.tracks.length, 2); // Vídeo e Texto/Legendas

    const textTrack = timeline.tracks.find((t) => t.type === 'text');
    assert.ok(textTrack);
    assert.equal(textTrack?.clips.length, 3);
    assert.equal(textTrack?.clips[0].text, 'Gancho inicial: O novo editor de vídeo chegou');
    assert.equal(textTrack?.clips[0].start, 0);
    assert.equal(textTrack?.clips[0].duration, 4);
  });
});
