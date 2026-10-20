import { OpenCutTimeline, OpenCutTrack, OpenCutClip, VideoAspectRatio } from './types';

export interface OpenCutLaunchOptions {
  projectTitle?: string;
  aspectRatio?: VideoAspectRatio;
  remoteMcpUrl?: string;
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
 * Monta a URL de acesso ao OpenCut Web Editor com parâmetros seguros
 */
export function buildOpenCutUrl(options?: OpenCutLaunchOptions): string {
  const baseUrl = 'https://opencut.app';
  if (!options) return baseUrl;

  const params = new URLSearchParams();
  if (options.projectTitle?.trim()) {
    params.set('title', options.projectTitle.trim());
  }
  if (options.aspectRatio) {
    params.set('aspect', options.aspectRatio);
  }
  if (options.remoteMcpUrl?.trim()) {
    params.set('mcp', options.remoteMcpUrl.trim());
  }

  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
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
