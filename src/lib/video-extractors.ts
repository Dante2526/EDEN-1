/**
 * Universal Video & Audio Extractors
 * -----------------------------------
 * Suporta YouTube (Innertube + Piped), TikTok (TikWM), Twitter/X (VxTwitter/FxTwitter),
 * Reddit, e páginas Web via metadados OpenGraph / HTML5.
 */

export interface ExtractedMediaItem {
  type: 'video' | 'audio' | 'photo';
  url: string;
  thumb?: string;
  filename: string;
  quality?: string;
  format?: string;
  metadata?: { title?: string; duration?: string; author?: string };
}

export interface ExtractedMediaResult {
  ok: boolean;
  platform: string;
  title?: string;
  thumbnail?: string;
  url?: string;
  picker?: ExtractedMediaItem[];
  filename?: string;
  error?: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();

  // 1. Encurtador youtu.be/<id>
  const shortMatch = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_\-]{11})/i);
  if (shortMatch) return shortMatch[1];

  // 2. YouTube Shorts youtube.com/shorts/<id>
  const shortsMatch = cleanUrl.match(/\/shorts\/([a-zA-Z0-9_\-]{11})/i);
  if (shortsMatch) return shortsMatch[1];

  // 3. YouTube Embed ou v/ youtube.com/embed/<id>
  const embedMatch = cleanUrl.match(/\/(?:embed|v)\/([a-zA-Z0-9_\-]{11})/i);
  if (embedMatch) return embedMatch[1];

  // 4. Parâmetro v=<id> em youtube.com ou music.youtube.com
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.hostname.toLowerCase().includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_\-]{11}$/.test(v)) {
        return v;
      }
    }
  } catch {
    /* ignore invalid url */
  }

  // Fallback regex geral
  const generalMatch = cleanUrl.match(/(?:v=|\/)([a-zA-Z0-9_\-]{11})(?:[&?]|$)/);
  if (generalMatch && cleanUrl.includes('youtu')) {
    return generalMatch[1];
  }

  return null;
}

export function detectMediaPlatform(url: string): string {
  if (!url) return 'Web';
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter/X';
  if (lower.includes('reddit.com') || lower.includes('redd.it')) return 'Reddit';
  if (lower.includes('soundcloud.com')) return 'SoundCloud';
  if (lower.includes('pinterest.') || lower.includes('pin.it')) return 'Pinterest';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
  if (lower.includes('twitch.tv')) return 'Twitch';
  if (lower.includes('vimeo.com')) return 'Vimeo';
  if (lower.includes('bilibili.com') || lower.includes('b23.tv')) return 'Bilibili';
  if (lower.includes('dailymotion.com')) return 'Dailymotion';
  if (lower.includes('snapchat.com')) return 'Snapchat';
  return 'Web';
}

export function sanitizeFilename(name: string, ext = 'mp4'): string {
  if (!name || !name.trim()) {
    return `media-${Date.now()}.${ext.replace(/^\./, '')}`;
  }

  // Remove acentos para compatibilidade máxima com sistemas de arquivos e downloads HTTP
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Substitui caracteres inválidos por underscore
  let safe = normalized
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanExt = ext.replace(/^\./, '');
  if (!safe.toLowerCase().endsWith(`.${cleanExt.toLowerCase()}`)) {
    safe = `${safe}.${cleanExt}`;
  }

  return safe;
}

export function parseYouTubeInnertubeResponse(
  data: any,
  audioOnly = false
): ExtractedMediaResult {
  if (data?.playabilityStatus?.status !== 'OK') {
    return {
      ok: false,
      platform: 'YouTube',
      error:
        data?.playabilityStatus?.reason ||
        'Vídeo não reproduzível ou restrito pelo YouTube.',
    };
  }

  const details = data?.videoDetails || {};
  const rawTitle = details.title || 'YouTube Video';
  const author = details.author || '';
  const duration = details.lengthSeconds ? `${details.lengthSeconds}s` : undefined;
  const thumbnails = details.thumbnail?.thumbnails || [];
  const thumbnail = thumbnails[thumbnails.length - 1]?.url;

  const formats = data?.streamingData?.formats || [];
  const adaptiveFormats = data?.streamingData?.adaptiveFormats || [];

  const picker: ExtractedMediaItem[] = [];

  // 1. Muxed Formats (Vídeo + Áudio embutidos)
  for (const f of formats) {
    if (f.url) {
      const q = f.qualityLabel || '360p';
      picker.push({
        type: 'video',
        url: f.url,
        thumb: thumbnail,
        quality: q,
        format: 'mp4',
        filename: sanitizeFilename(`${rawTitle} - ${q}`, 'mp4'),
        metadata: { title: `${rawTitle} (${q})`, duration, author },
      });
    }
  }

  // 2. Audio Adaptive Formats (M4A / WebM de alta qualidade)
  const audioFormats = adaptiveFormats.filter((f: any) =>
    (f.mimeType || '').startsWith('audio/')
  );

  for (const a of audioFormats) {
    if (a.url) {
      const isM4a = (a.mimeType || '').includes('mp4');
      const ext = isM4a ? 'm4a' : 'webm';
      const bitrateKbps = a.bitrate ? `${Math.round(a.bitrate / 1000)}kbps` : 'audio';
      picker.push({
        type: 'audio',
        url: a.url,
        thumb: thumbnail,
        quality: bitrateKbps,
        format: ext,
        filename: sanitizeFilename(`${rawTitle} - ${bitrateKbps}`, ext),
        metadata: { title: `${rawTitle} [Áudio ${bitrateKbps}]`, duration, author },
      });
    }
  }

  if (picker.length === 0) {
    return {
      ok: false,
      platform: 'YouTube',
      error: 'Nenhum stream direto disponível para este vídeo.',
    };
  }

  // Reordenação: se audioOnly, coloca áudios no topo
  if (audioOnly) {
    picker.sort((a, b) => (a.type === 'audio' ? -1 : 1));
  }

  const primaryItem = picker[0];

  return {
    ok: true,
    platform: 'YouTube',
    title: rawTitle,
    thumbnail,
    url: primaryItem.url,
    filename: primaryItem.filename,
    picker,
  };
}

export function parseTikWmResponse(data: any, audioOnly = false): ExtractedMediaResult {
  if (data?.code !== 0 || !data?.data) {
    return {
      ok: false,
      platform: 'TikTok',
      error: data?.msg || 'Falha ao extrair vídeo do TikTok.',
    };
  }

  const d = data.data;
  const rawTitle = d.title || 'TikTok Video';
  const author = d.author?.nickname || d.author?.unique_id || 'TikTok';
  const duration = d.duration ? `${d.duration}s` : undefined;
  const thumb = d.cover || d.origin_cover;

  const videoUrl = d.hdplay || d.play;
  const audioUrl = d.music;

  const picker: ExtractedMediaItem[] = [];

  if (videoUrl) {
    picker.push({
      type: 'video',
      url: videoUrl,
      thumb,
      quality: d.hdplay ? 'HD' : 'SD',
      format: 'mp4',
      filename: sanitizeFilename(`${rawTitle} (Sem Marca)`, 'mp4'),
      metadata: { title: `${rawTitle} (HD Sem Marca)`, duration, author },
    });
  }

  if (audioUrl) {
    picker.push({
      type: 'audio',
      url: audioUrl,
      thumb,
      quality: 'Original',
      format: 'mp3',
      filename: sanitizeFilename(`${rawTitle} (Áudio)`, 'mp3'),
      metadata: { title: `${rawTitle} [Áudio MP3]`, duration, author },
    });
  }

  if (picker.length === 0) {
    return {
      ok: false,
      platform: 'TikTok',
      error: 'Nenhuma mídia encontrada no TikTok.',
    };
  }

  if (audioOnly) {
    picker.sort((a, b) => (a.type === 'audio' ? -1 : 1));
  }

  return {
    ok: true,
    platform: 'TikTok',
    title: rawTitle,
    thumbnail: thumb,
    url: picker[0].url,
    filename: picker[0].filename,
    picker,
  };
}

export function parseVxTwitterResponse(data: any): ExtractedMediaResult {
  const mediaList = data?.media_extended || [];
  const rawTitle = data?.text?.slice(0, 80) || 'Twitter Media';
  const author = data?.user_name || 'Twitter/X';

  const picker: ExtractedMediaItem[] = [];

  for (let i = 0; i < mediaList.length; i++) {
    const m = mediaList[i];
    if (m.type === 'video' || m.type === 'gif') {
      picker.push({
        type: 'video',
        url: m.url,
        thumb: m.thumbnail_url,
        format: 'mp4',
        filename: sanitizeFilename(`${rawTitle} - Video ${i + 1}`, 'mp4'),
        metadata: { title: rawTitle, author },
      });
    } else if (m.type === 'image') {
      picker.push({
        type: 'photo',
        url: m.url,
        thumb: m.url,
        format: 'jpg',
        filename: sanitizeFilename(`${rawTitle} - Foto ${i + 1}`, 'jpg'),
        metadata: { title: rawTitle, author },
      });
    }
  }

  if (picker.length === 0) {
    return {
      ok: false,
      platform: 'Twitter/X',
      error: 'Nenhum vídeo ou foto encontrado neste post do Twitter/X.',
    };
  }

  return {
    ok: true,
    platform: 'Twitter/X',
    title: rawTitle,
    thumbnail: picker[0].thumb,
    url: picker[0].url,
    filename: picker[0].filename,
    picker,
  };
}

export function parseRedditJsonResponse(data: any): ExtractedMediaResult {
  try {
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) {
      return { ok: false, platform: 'Reddit', error: 'Post do Reddit não encontrado.' };
    }

    const rawTitle = post.title || 'Reddit Video';
    const author = post.author || 'Reddit';
    const videoData =
      post.secure_media?.reddit_video ||
      post.media?.reddit_video ||
      post.preview?.reddit_video_preview;

    if (!videoData?.fallback_url) {
      return {
        ok: false,
        platform: 'Reddit',
        error: 'Nenhum vídeo reproduzível encontrado neste post do Reddit.',
      };
    }

    const videoUrl = videoData.fallback_url;
    const duration = videoData.duration ? `${videoData.duration}s` : undefined;
    const thumbnail = post.thumbnail?.startsWith('http') ? post.thumbnail : undefined;

    const item: ExtractedMediaItem = {
      type: 'video',
      url: videoUrl,
      thumb: thumbnail,
      format: 'mp4',
      filename: sanitizeFilename(rawTitle, 'mp4'),
      metadata: { title: rawTitle, duration, author },
    };

    return {
      ok: true,
      platform: 'Reddit',
      title: rawTitle,
      thumbnail,
      url: videoUrl,
      filename: item.filename,
      picker: [item],
    };
  } catch (err: any) {
    return {
      ok: false,
      platform: 'Reddit',
      error: err?.message || 'Falha ao processar resposta do Reddit.',
    };
  }
}

export function parseOpenGraphHtml(html: string, pageUrl: string): ExtractedMediaResult {
  if (!html) {
    return { ok: false, platform: 'Web', error: 'Conteúdo HTML vazio.' };
  }

  // 1. Title
  const titleMatch =
    html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Web Media';

  // 2. Video URL (og:video, og:video:secure_url, twitter:player:stream, <video src="...">)
  const videoMatch =
    html.match(/<meta\s+property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+name=["']twitter:player:stream["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<video[^>]+src=["']([^"']+)["']/i);

  // 3. Thumbnail (og:image)
  const imageMatch =
    html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
  const thumbnail = imageMatch ? imageMatch[1].trim() : undefined;

  if (videoMatch && videoMatch[1]) {
    let videoUrl = videoMatch[1].trim();
    if (videoUrl.startsWith('//')) {
      videoUrl = 'https:' + videoUrl;
    } else if (videoUrl.startsWith('/')) {
      try {
        const base = new URL(pageUrl);
        videoUrl = `${base.protocol}//${base.host}${videoUrl}`;
      } catch {
        /* ignore */
      }
    }

    const item: ExtractedMediaItem = {
      type: 'video',
      url: videoUrl,
      thumb: thumbnail,
      format: 'mp4',
      filename: sanitizeFilename(title, 'mp4'),
      metadata: { title },
    };

    return {
      ok: true,
      platform: detectMediaPlatform(pageUrl),
      title,
      thumbnail,
      url: videoUrl,
      filename: item.filename,
      picker: [item],
    };
  }

  return {
    ok: false,
    platform: detectMediaPlatform(pageUrl),
    error: 'Nenhum vídeo ou mídia detectada nos metadados desta página.',
  };
}

/**
 * Motor Principal de Extração: Cascade de Provedores Nativos
 */
export async function extractMediaFromUrl(
  url: string,
  options: { audioOnly?: boolean } = {}
): Promise<ExtractedMediaResult> {
  const platform = detectMediaPlatform(url);

  // Direct Audio / Video file URLs
  const cleanUrl = url.trim();
  const lowerUrl = cleanUrl.toLowerCase().split('?')[0];
  if (
    lowerUrl.endsWith('.mp4') ||
    lowerUrl.endsWith('.webm') ||
    lowerUrl.endsWith('.m4v') ||
    lowerUrl.endsWith('.mov')
  ) {
    const filename = cleanUrl.split('/').pop()?.split('?')[0] || 'video.mp4';
    return {
      ok: true,
      platform,
      title: filename,
      url: cleanUrl,
      filename: sanitizeFilename(filename, 'mp4'),
      picker: [
        {
          type: 'video',
          url: cleanUrl,
          filename: sanitizeFilename(filename, 'mp4'),
          format: 'mp4',
        },
      ],
    };
  }
  if (lowerUrl.endsWith('.mp3') || lowerUrl.endsWith('.m4a') || lowerUrl.endsWith('.wav') || lowerUrl.endsWith('.ogg')) {
    const filename = cleanUrl.split('/').pop()?.split('?')[0] || 'audio.mp3';
    return {
      ok: true,
      platform,
      title: filename,
      url: cleanUrl,
      filename: sanitizeFilename(filename, 'mp3'),
      picker: [
        {
          type: 'audio',
          url: cleanUrl,
          filename: sanitizeFilename(filename, 'mp3'),
          format: 'mp3',
        },
      ],
    };
  }

  // 1. YouTube & YouTube Shorts
  if (platform === 'YouTube') {
    const videoId = extractYouTubeVideoId(cleanUrl);
    if (!videoId) {
      return { ok: false, platform: 'YouTube', error: 'ID de vídeo do YouTube inválido.' };
    }

    // Camada 1A: YouTube Innertube API (Cliente Android 20.03.32)
    try {
      const innertubeBody = {
        videoId,
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.03.32',
            androidSdkVersion: 34,
            osName: 'Android',
            osVersion: '14',
            hl: 'pt',
            gl: 'BR',
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      };

      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'com.google.android.youtube/20.03.32 (Linux; U; Android 14) gzip',
        },
        body: JSON.stringify(innertubeBody),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = parseYouTubeInnertubeResponse(data, options.audioOnly);
        if (parsed.ok && parsed.picker && parsed.picker.length > 0) {
          return parsed;
        }
      }
    } catch {
      /* Fallback para Piped */
    }

    // Camada 1B: Cascade Piped API
    const pipedInstances = [
      'https://api.piped.private.coffee',
      'https://pipedapi.ducks.party',
      'https://pipedapi.kavin.rocks',
    ];

    for (const host of pipedInstances) {
      try {
        const pRes = await fetch(`${host}/streams/${videoId}`, {
          signal: AbortSignal.timeout(6000),
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          const videoStreams = (pData.videoStreams || []).filter(
            (s: any) => s.url && !s.videoOnly
          );
          const audioStreams = pData.audioStreams || [];

          const picker: ExtractedMediaItem[] = [];
          for (const vs of videoStreams) {
            picker.push({
              type: 'video',
              url: vs.url,
              thumb: pData.thumbnailUrl,
              quality: vs.quality || '360p',
              format: 'mp4',
              filename: sanitizeFilename(`${pData.title} - ${vs.quality || 'video'}`, 'mp4'),
              metadata: { title: pData.title, author: pData.uploader },
            });
          }

          for (const as of audioStreams) {
            picker.push({
              type: 'audio',
              url: as.url,
              thumb: pData.thumbnailUrl,
              quality: as.quality || 'audio',
              format: as.format === 'M4A' ? 'm4a' : 'mp3',
              filename: sanitizeFilename(`${pData.title} - Áudio`, 'mp3'),
              metadata: { title: pData.title, author: pData.uploader },
            });
          }

          if (picker.length > 0) {
            if (options.audioOnly) {
              picker.sort((a, b) => (a.type === 'audio' ? -1 : 1));
            }
            return {
              ok: true,
              platform: 'YouTube',
              title: pData.title,
              thumbnail: pData.thumbnailUrl,
              url: picker[0].url,
              filename: picker[0].filename,
              picker,
            };
          }
        }
      } catch {
        continue;
      }
    }

    return {
      ok: false,
      platform: 'YouTube',
      error: 'Não foi possível extrair os streams do vídeo do YouTube no momento.',
    };
  }

  // 2. TikTok
  if (platform === 'TikTok') {
    try {
      const tikRes = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        body: new URLSearchParams({ url: cleanUrl, hd: '1' }),
        signal: AbortSignal.timeout(10000),
      });

      if (tikRes.ok) {
        const tikData = await tikRes.json();
        const parsed = parseTikWmResponse(tikData, options.audioOnly);
        if (parsed.ok) return parsed;
      }
    } catch {
      /* fallback para opengraph */
    }
  }

  // 3. Twitter / X
  if (platform === 'Twitter/X') {
    try {
      // Converte URL para vxtwitter API endpoint: x.com/user/status/123 -> api.vxtwitter.com/user/status/123
      const parsedUrl = new URL(cleanUrl);
      const vxUrl = `https://api.vxtwitter.com${parsedUrl.pathname}`;
      const vxRes = await fetch(vxUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (vxRes.ok) {
        const vxData = await vxRes.json();
        const parsed = parseVxTwitterResponse(vxData);
        if (parsed.ok) return parsed;
      }
    } catch {
      /* fallback para opengraph */
    }
  }

  // 4. Reddit
  if (platform === 'Reddit') {
    try {
      const parsedUrl = new URL(cleanUrl);
      const jsonUrl = `https://www.reddit.com${parsedUrl.pathname.replace(/\/$/, '')}.json`;
      const redRes = await fetch(jsonUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(8000),
      });
      if (redRes.ok) {
        const redData = await redRes.json();
        const parsed = parseRedditJsonResponse(redData);
        if (parsed.ok) return parsed;
      }
    } catch {
      /* fallback para opengraph */
    }
  }

  // 5. OpenGraph HTML Extractor (Instagram, Facebook, Vimeo, Pinterest e Web)
  try {
    const pageRes = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0; +https://telegram.org/bot)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(9000),
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const parsed = parseOpenGraphHtml(html, cleanUrl);
      if (parsed.ok) return parsed;
    }
  } catch (err: any) {
    return {
      ok: false,
      platform,
      error: `Não foi possível extrair mídia da URL fornecida: ${err?.message || 'timeout'}`,
    };
  }

  return {
    ok: false,
    platform,
    error: 'Nenhum vídeo ou mídia compatível foi detectado nesta URL.',
  };
}
