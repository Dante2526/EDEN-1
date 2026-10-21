import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMp4Buffer,
  parseHlsManifest,
  inspectMpegTsSegment,
  extractEmbedsAndStreamsFromHtml,
} from './media-probe';

/**
 * Helper para construir um box MP4 (ISO BMFF) sintético: [4 bytes size BE][4 bytes type ASCII][payload...]
 */
function makeMp4Box(type: string, payload: Uint8Array): Uint8Array {
  const total = 8 + payload.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, total, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(payload, 8);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

describe('media-probe (Inspetor Nativo de Mídia e HTML Bruto)', () => {
  it('extrai codecs, resolução (width x height) e duração de um buffer binário MP4 (ftyp + moov)', () => {
    const ftypPayload = new TextEncoder().encode('isom\x00\x00\x02\x00isomiso2avc1mp41');
    const ftypBox = makeMp4Box('ftyp', ftypPayload);

    const mvhdPayload = new Uint8Array(100);
    const mvhdView = new DataView(mvhdPayload.buffer);
    mvhdView.setUint8(0, 0); // version 0
    mvhdView.setUint32(12, 1000, false); // timescale = 1000
    mvhdView.setUint32(16, 12500, false); // duration = 12500 -> 12.5s
    const mvhdBox = makeMp4Box('mvhd', mvhdPayload);

    const tkhdPayload = new Uint8Array(84);
    const tkhdView = new DataView(tkhdPayload.buffer);
    tkhdView.setUint8(0, 0); // version 0
    tkhdView.setUint32(76, 1920 << 16, false); // width = 1920
    tkhdView.setUint32(80, 1080 << 16, false); // height = 1080
    const tkhdBox = makeMp4Box('tkhd', tkhdPayload);

    const avc1Box = makeMp4Box('avc1', new Uint8Array(16));
    const mp4aBox = makeMp4Box('mp4a', new Uint8Array(16));
    const stsdHeader = new Uint8Array(8);
    const stsdBox = makeMp4Box('stsd', concatBytes(stsdHeader, avc1Box, mp4aBox));

    const moovBox = makeMp4Box('moov', concatBytes(mvhdBox, tkhdBox, stsdBox));
    const mp4Buffer = concatBytes(ftypBox, moovBox);

    const probe = parseMp4Buffer(mp4Buffer);
    assert.equal(probe.valid, true);
    assert.equal(probe.container, 'mp4');
    assert.equal(probe.brand, 'isom');
    assert.equal(probe.width, 1920);
    assert.equal(probe.height, 1080);
    assert.ok(Math.abs((probe.durationSeconds || 0) - 12.5) < 0.05);
    assert.ok(probe.codecs.includes('h264'));
    assert.ok(probe.codecs.includes('aac'));
  });

  it('analisa master e media playlists HLS (.m3u8) com variantes e segmentos .ts', () => {
    const masterM3u8 = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
      '720p/index.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
      'https://cdn.example.com/hls/1080p/index.m3u8',
    ].join('\n');

    const masterRes = parseHlsManifest(masterM3u8, 'https://cdn.example.com/hls/master.m3u8');
    assert.equal(masterRes.valid, true);
    assert.equal(masterRes.type, 'master');
    assert.equal(masterRes.variants.length, 2);
    assert.equal(masterRes.variants[0].resolution, '1280x720');
    assert.equal(masterRes.variants[0].url, 'https://cdn.example.com/hls/720p/index.m3u8');
    assert.equal(masterRes.variants[1].resolution, '1920x1080');

    const mediaM3u8 = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:6',
      '#EXTINF:5.005,',
      'seg-001.ts',
      '#EXTINF:5.005,',
      'seg-002.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const mediaRes = parseHlsManifest(mediaM3u8, 'https://cdn.example.com/hls/720p/index.m3u8');
    assert.equal(mediaRes.valid, true);
    assert.equal(mediaRes.type, 'media');
    assert.equal(mediaRes.segmentCount, 2);
    assert.ok(Math.abs((mediaRes.durationSeconds || 0) - 10.01) < 0.05);
    assert.equal(mediaRes.sampleSegmentUrls[0], 'https://cdn.example.com/hls/720p/seg-001.ts');
  });

  it('valida segmentos MPEG-TS (.ts) checando o sync byte 0x47 a cada 188 bytes', () => {
    const validTs = new Uint8Array(188 * 3);
    validTs[0] = 0x47;
    validTs[188] = 0x47;
    validTs[376] = 0x47;
    assert.equal(inspectMpegTsSegment(validTs).valid, true);

    const invalidTs = new TextEncoder().encode('<html>403 Forbidden</html>');
    assert.equal(inspectMpegTsSegment(invalidTs).valid, false);
  });

  it('extrai iframes, tags de vídeo e links ocultos (.mp4 / .m3u8 / get_video) do HTML bruto', () => {
    const sampleHtml = `
      <html>
        <head><title>Episódio 01 - Teste</title></head>
        <body>
          <iframe src="//streamtape.com/e/abc123xyz/" allowfullscreen></iframe>
          <video><source src="/videos/opening.mp4" type="video/mp4" /></video>
          <script>
            var streamUrl = "https://cdn.mxcontent.net/hls/stream_1080p.m3u8?token=999";
            document.getElementById('norobotlink').innerHTML = '//streamtape.com/get_video?id=abc123&expires=12345';
          </script>
        </body>
      </html>
    `;

    const extracted = extractEmbedsAndStreamsFromHtml(sampleHtml, 'https://animesonlinecc.to/ep1');
    assert.ok(extracted.iframes.includes('https://streamtape.com/e/abc123xyz/'));
    assert.ok(extracted.mediaUrls.includes('https://animesonlinecc.to/videos/opening.mp4'));
    assert.ok(extracted.mediaUrls.includes('https://cdn.mxcontent.net/hls/stream_1080p.m3u8?token=999'));
    assert.ok(extracted.mediaUrls.some((u) => u.includes('streamtape.com/get_video?id=abc123')));
  });
});
