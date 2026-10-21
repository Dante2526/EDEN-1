import { OpenCutTimeline, OpenCutTrack, OpenCutClip, VideoAspectRatio, OpenCutLanguage } from './types';

// URL base do OpenCut (original em inglês)
export const OPENCUT_BASE_URL = 'https://opencut.app/projects';

// URL do proxy traduzido PT-BR (roda dentro do Éden, mesmo origin, sem 429 do Google)
// Esse proxy faz fetch do opencut.app, injeta script com dicionário PT-BR, e serve.
// Resolve 2 problemas do proxy do Google Tradutor:
//   1. Rate limit 429 (Google bloqueia após poucos acessos)
//   2. Apps React não traduzem (só HTML estático é traduzido)
export const OPENCUT_TRANSLATED_BASE_URL = '/api/opencut-proxy/projects';

export interface OpenCutLaunchOptions {
  projectTitle?: string;
  aspectRatio?: VideoAspectRatio;
  remoteMcpUrl?: string;
  language?: OpenCutLanguage;
}

/**
 * Valida a consistência de um projeto/timeline do OpenCut
 */
export function validateOpenCutTimeline(timeline: Partial<OpenCutTimeline>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!timeline || typeof timeline !== 'object') {
    return { valid: false, errors: ['Timeline inválida ou vazia'] };
  }

  if (!timeline.title || !timeline.title.trim()) {
    errors.push('O título do projeto de vídeo é obrigatório.');
  }

  if (typeof timeline.duration === 'number' && timeline.duration < 0) {
    errors.push('A duração total do vídeo não pode ser negativa.');
  }

  if (Array.isArray(timeline.tracks)) {
    for (const track of timeline.tracks) {
      if (Array.isArray(track.clips)) {
        for (const clip of track.clips) {
          if (typeof clip.start !== 'number' || clip.start < 0) {
            errors.push(`O clipe "${clip.name || clip.id}" possui tempo de início inválido (${clip.start}s).`);
          }
          if (typeof clip.duration !== 'number' || clip.duration <= 0) {
            errors.push(`O clipe "${clip.name || clip.id}" possui duração inválida (${clip.duration}s).`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Monta a URL de acesso ao OpenCut Web Editor com parâmetros seguros.
 *
 * Modo 'pt' (padrão desde que migramos do Google Tradutor proxy):
 *   - Usa /api/opencut-proxy/projects (proxy próprio com dicionário PT-BR)
 *   - Mesmo origin do Éden → sem problema de same-origin policy
 *   - Sem 429 do Google Tradutor
 *   - Traduz textos dinâmicos do React via MutationObserver
 *
 * Modo 'en' (original):
 *   - Usa https://opencut.app/projects direto
 *   - Textos ficam em inglês
 */
export function buildOpenCutUrl(options?: OpenCutLaunchOptions): string {
  // Default agora é 'pt' (proxy traduzido). Antes era 'en'.
  const language = options?.language ?? 'pt';
  const baseUrl = language === 'pt' ? OPENCUT_TRANSLATED_BASE_URL : OPENCUT_BASE_URL;

  const params = new URLSearchParams();
  if (options?.projectTitle?.trim()) {
    params.set('title', options.projectTitle.trim());
  }
  if (options?.aspectRatio) {
    params.set('aspect', options.aspectRatio);
  }
  if (options?.remoteMcpUrl?.trim()) {
    params.set('mcp', options.remoteMcpUrl.trim());
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Monta a URL do OpenCut 100% traduzida em Português do Brasil (PT-BR)
 * Usa o proxy próprio do Éden (não depende mais do Google Tradutor).
 */
export function buildOpenCutTranslatedUrl(options?: Omit<OpenCutLaunchOptions, 'language'>): string {
  return buildOpenCutUrl({ ...options, language: 'pt' });
}

/**
 * Formata o resumo da timeline para exibição na IA e chat
 */
export function formatOpenCutToolResult(timeline: Partial<OpenCutTimeline>): string {
  const title = timeline.title?.trim() || 'Projeto de Vídeo';
  const aspect = timeline.aspectRatio || '16:9';
  const duration = typeof timeline.duration === 'number' ? `${timeline.duration}s` : 'Duração flexível';
  const tracksCount = Array.isArray(timeline.tracks) ? timeline.tracks.length : 0;

  return (
    `🎬 **OpenCut Video Studio Pronto**\n\n` +
    `- **Projeto:** ${title}\n` +
    `- **Formato:** ${aspect}\n` +
    `- **Duração Estimada:** ${duration}\n` +
    `- **Estrutura:** ${tracksCount} faixas organizadas (vídeo, áudio e texto)\n\n` +
    `O editor está pronto para edição no navegador (celular ou PC). Clique em "Abrir no OpenCut" para finalizar os cortes.`
  );
}

/**
 * Converte um roteiro textual ou timestamps [00:00 - 00:05] em uma timeline OpenCut
 */
export function parseScriptToOpenCutTimeline(
  scriptText: string,
  title = 'Novo Vídeo',
  aspectRatio: VideoAspectRatio = '9:16'
): OpenCutTimeline {
  const lines = scriptText.split('\n');
  const textClips: OpenCutClip[] = [];
  const videoClips: OpenCutClip[] = [];

  let maxTime = 0;
  const timeRegex = /\[(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\]\s*(.*)/;

  lines.forEach((line, idx) => {
    const match = line.trim().match(timeRegex);
    if (match) {
      const startMin = parseInt(match[1], 10);
      const startSec = parseInt(match[2], 10);
      const endMin = parseInt(match[3], 10);
      const endSec = parseInt(match[4], 10);
      const text = match[5]?.trim() || '';

      const startTime = startMin * 60 + startSec;
      const endTime = endMin * 60 + endSec;
      const duration = Math.max(endTime - startTime, 1);

      if (endTime > maxTime) {
        maxTime = endTime;
      }

      textClips.push({
        id: `text-${idx + 1}`,
        type: 'text',
        text,
        start: startTime,
        duration,
      });

      videoClips.push({
        id: `video-${idx + 1}`,
        type: 'video',
        name: `Cena ${idx + 1}`,
        start: startTime,
        duration,
      });
    }
  });

  const tracks: OpenCutTrack[] = [];

  if (videoClips.length > 0) {
    tracks.push({
      id: 'track-video',
      name: 'Vídeo Principal',
      type: 'video',
      clips: videoClips,
    });
  }

  if (textClips.length > 0) {
    tracks.push({
      id: 'track-text',
      name: 'Legendas e Textos',
      type: 'text',
      clips: textClips,
    });
  }

  return {
    title,
    aspectRatio,
    duration: maxTime,
    tracks,
  };
}
