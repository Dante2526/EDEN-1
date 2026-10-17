import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extractYouTubeVideoId,
  detectMediaPlatform,
  sanitizeFilename,
  parseYouTubeInnertubeResponse,
  parseTikWmResponse,
  parseVxTwitterResponse,
  parseRedditJsonResponse,
  parseOpenGraphHtml,
} from './video-extractors';

describe('Video Extractors Unit Tests', () => {
  describe('extractYouTubeVideoId', () => {
    it('deve extrair videoId de URL padrão do YouTube', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        'dQw4w9WgXcQ'
      );
    });

    it('deve extrair videoId com parâmetros extras na URL', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/watch?feature=share&v=jNQXAC9IVRw&t=15s'),
        'jNQXAC9IVRw'
      );
    });

    it('deve extrair videoId de youtu.be encurtado', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abcdef123'),
        'dQw4w9WgXcQ'
      );
    });

    it('deve extrair videoId de YouTube Shorts', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/shorts/5nv3EiI-Hqw'),
        '5nv3EiI-Hqw'
      );
    });

    it('deve extrair videoId de YouTube Music e Embed', () => {
      assert.strictEqual(
        extractYouTubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'),
        'dQw4w9WgXcQ'
      );
      assert.strictEqual(
        extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'),
        'dQw4w9WgXcQ'
      );
    });

    it('deve retornar null para URLs inválidas ou de outras plataformas', () => {
      assert.strictEqual(extractYouTubeVideoId('https://vimeo.com/12345'), null);
      assert.strictEqual(extractYouTubeVideoId('https://www.google.com'), null);
      assert.strictEqual(extractYouTubeVideoId('not-a-url'), null);
    });
  });

  describe('detectMediaPlatform', () => {
    it('deve detectar YouTube corretamente', () => {
      assert.strictEqual(detectMediaPlatform('https://www.youtube.com/watch?v=123'), 'YouTube');
      assert.strictEqual(detectMediaPlatform('https://youtu.be/123'), 'YouTube');
    });

    it('deve detectar TikTok, Twitter/X, Reddit e Instagram', () => {
      assert.strictEqual(detectMediaPlatform('https://www.tiktok.com/@user/video/123'), 'TikTok');
      assert.strictEqual(detectMediaPlatform('https://x.com/user/status/123'), 'Twitter/X');
      assert.strictEqual(detectMediaPlatform('https://twitter.com/user/status/123'), 'Twitter/X');
      assert.strictEqual(detectMediaPlatform('https://www.reddit.com/r/funny/comments/123/video/'), 'Reddit');
      assert.strictEqual(detectMediaPlatform('https://www.instagram.com/reel/123/'), 'Instagram');
    });

    it('deve retornar Web para links gerais', () => {
      assert.strictEqual(detectMediaPlatform('https://example.com/video.mp4'), 'Web');
    });
  });

  describe('sanitizeFilename', () => {
    it('deve remover caracteres inválidos em sistemas de arquivos', () => {
      const sanitized = sanitizeFilename('Vídeo: Legal / Incrível * Novo? <2026> | Top', 'mp4');
      assert.strictEqual(sanitized, 'Video_ Legal _ Incrivel _ Novo_ _2026_ _ Top.mp4');
    });

    it('deve garantir extensão correta e não duplicar', () => {
      assert.strictEqual(sanitizeFilename('meu-video.mp4', 'mp4'), 'meu-video.mp4');
      assert.strictEqual(sanitizeFilename('musica', 'mp3'), 'musica.mp3');
    });
  });

  describe('parseYouTubeInnertubeResponse', () => {
    it('deve extrair streams de vídeo muxed e streams de áudio', () => {
      const mockInnertube = {
        playabilityStatus: { status: 'OK' },
        videoDetails: {
          title: 'Meu Vídeo Incrível',
          lengthSeconds: '120',
          author: 'Canal Teste',
          thumbnail: {
            thumbnails: [{ url: 'https://i.ytimg.com/vi/123/hqdefault.jpg' }],
          },
        },
        streamingData: {
          formats: [
            {
              itag: 18,
              qualityLabel: '360p',
              mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
              url: 'https://rr1.googlevideo.com/videoplayback?itag=18',
            },
          ],
          adaptiveFormats: [
            {
              itag: 140,
              bitrate: 130000,
              mimeType: 'audio/mp4; codecs="mp4a.40.2"',
              url: 'https://rr1.googlevideo.com/videoplayback?itag=140',
            },
            {
              itag: 251,
              bitrate: 160000,
              mimeType: 'audio/webm; codecs="opus"',
              url: 'https://rr1.googlevideo.com/videoplayback?itag=251',
            },
          ],
        },
      };

      const result = parseYouTubeInnertubeResponse(mockInnertube, false);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.title, 'Meu Vídeo Incrível');
      assert.ok(result.picker && result.picker.length >= 2);
      assert.strictEqual(result.picker[0].type, 'video');
      assert.strictEqual(result.picker[0].quality, '360p');
      assert.strictEqual(result.picker[1].type, 'audio');
      assert.strictEqual(result.picker[1].format, 'm4a');
    });

    it('deve priorizar áudios quando audioOnly for true', () => {
      const mockInnertube = {
        playabilityStatus: { status: 'OK' },
        videoDetails: { title: 'Música Teste' },
        streamingData: {
          formats: [{ itag: 18, url: 'https://googlevideo.com/video' }],
          adaptiveFormats: [
            { itag: 140, mimeType: 'audio/mp4', url: 'https://googlevideo.com/audio' },
          ],
        },
      };
      const result = parseYouTubeInnertubeResponse(mockInnertube, true);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.picker?.[0]?.type, 'audio');
    });
  });

  describe('parseTikWmResponse', () => {
    it('deve extrair vídeo HD e música do TikWM', () => {
      const mockTikWm = {
        code: 0,
        data: {
          title: 'Dança Viral',
          cover: 'https://p16.tiktokcdn.com/cover.jpeg',
          play: 'https://www.tikwm.com/video/media/play.mp4',
          hdplay: 'https://www.tikwm.com/video/media/hdplay.mp4',
          music: 'https://www.tikwm.com/video/music/audio.mp3',
          duration: 15,
          author: { nickname: 'Criador' },
        },
      };

      const result = parseTikWmResponse(mockTikWm, false);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.title, 'Dança Viral');
      assert.strictEqual(result.url, 'https://www.tikwm.com/video/media/hdplay.mp4');
      assert.ok(result.picker && result.picker.length >= 2);
      assert.strictEqual(result.picker[0].type, 'video');
      assert.strictEqual(result.picker[1].type, 'audio');
    });
  });

  describe('parseVxTwitterResponse', () => {
    it('deve extrair vídeos de post do Twitter/X', () => {
      const mockVx = {
        text: 'Lançamento incrível!',
        user_name: 'NASA',
        media_extended: [
          {
            type: 'video',
            url: 'https://video.twimg.com/amplify_video/123/vid/1080x720/vid.mp4',
            thumbnail_url: 'https://pbs.twimg.com/media/thumb.jpg',
          },
        ],
      };

      const result = parseVxTwitterResponse(mockVx);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.url, 'https://video.twimg.com/amplify_video/123/vid/1080x720/vid.mp4');
      assert.strictEqual(result.picker?.[0]?.type, 'video');
    });
  });

  describe('parseRedditJsonResponse', () => {
    it('deve extrair fallback_url de vídeo do Reddit', () => {
      const mockReddit = [
        {
          data: {
            children: [
              {
                data: {
                  title: 'Gato Engraçado',
                  secure_media: {
                    reddit_video: {
                      fallback_url: 'https://v.redd.it/123/DASH_720.mp4?source=fallback',
                      duration: 10,
                    },
                  },
                },
              },
            ],
          },
        },
      ];

      const result = parseRedditJsonResponse(mockReddit);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.title, 'Gato Engraçado');
      assert.strictEqual(result.url, 'https://v.redd.it/123/DASH_720.mp4?source=fallback');
    });
  });

  describe('parseOpenGraphHtml', () => {
    it('deve extrair og:video de página HTML', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Vídeo Exemplo" />
            <meta property="og:video" content="https://cdn.example.com/video.mp4" />
            <meta property="og:image" content="https://cdn.example.com/thumb.jpg" />
          </head>
        </html>
      `;

      const result = parseOpenGraphHtml(html, 'https://example.com/watch');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.title, 'Vídeo Exemplo');
      assert.strictEqual(result.url, 'https://cdn.example.com/video.mp4');
      assert.strictEqual(result.thumbnail, 'https://cdn.example.com/thumb.jpg');
    });
  });
});
