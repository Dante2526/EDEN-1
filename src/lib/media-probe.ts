export interface Mp4ProbeResult {
  valid: boolean;
  container: 'mp4' | 'unknown';
  brand?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  codecs: string[];
  rawCodecFourCCs: string[];
}

export interface HlsVariantInfo {
  bandwidth?: number;
  resolution?: string;
  codecs?: string;
  url: string;
}

export interface HlsProbeResult {
  valid: boolean;
  type: 'master' | 'media' | 'invalid';
  variants: HlsVariantInfo[];
  segmentCount: number;
  durationSeconds?: number;
  sampleSegmentUrls: string[];
}

export interface MpegTsProbeResult {
  valid: boolean;
  packetCountChecked: number;
  syncByteValid: boolean;
}

export interface ExtractedEmbedsAndStreams {
  iframes: string[];
  mediaUrls: string[];
}

const CONTAINER_BOXES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'edts',
  'dinf',
  'udta',
  'mvex',
  'moof',
  'traf',
]);

const CODEC_MAP: Record<string, string> = {
  avc1: 'h264',
  avc3: 'h264',
  hev1: 'hevc',
  hvc1: 'hevc',
  vp09: 'vp9',
  av01: 'av1',
  mp4v: 'mpeg4',
  mp4a: 'aac',
  'ac-3': 'ac3',
  'ec-3': 'eac3',
  Opus: 'opus',
  opus: 'opus',
  flac: 'flac',
  alac: 'alac',
};

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Inspeciona um buffer binário MP4/ISO-BMFF (ex.: primeiros 64KB–256KB via HTTP Range)
 * e extrai codec (h264, hevc, aac, etc.), resolução (width x height) e duração em segundos.
 */
export function parseMp4Buffer(buffer: Uint8Array): Mp4ProbeResult {
  const result: Mp4ProbeResult = {
    valid: false,
    container: 'unknown',
    codecs: [],
    rawCodecFourCCs: [],
  };

  if (!buffer || buffer.byteLength < 8) {
    return result;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const codecSet = new Set<string>();
  const rawFourCCSet = new Set<string>();

  function addCodecFourCC(fourcc: string) {
    const clean = fourcc.trim();
    if (!clean) return;
    rawFourCCSet.add(clean);
    const mapped = CODEC_MAP[clean] || CODEC_MAP[clean.toLowerCase()];
    if (mapped) {
      codecSet.add(mapped);
    }
  }

  function scanBoxes(startOffset: number, endOffset: number, depth = 0) {
    if (depth > 10) return;
    let offset = startOffset;
    const limit = Math.min(endOffset, buffer.byteLength);

    while (offset + 8 <= limit) {
      let boxSize = view.getUint32(offset, false);
      const boxType = readAscii(buffer, offset + 4, 4);
      let headerSize = 8;

      if (boxSize === 1) {
        if (offset + 16 > limit) break;
        const high = view.getUint32(offset + 8, false);
        const low = view.getUint32(offset + 12, false);
        boxSize = high * 4294967296 + low;
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = limit - offset;
      }

      if (boxSize < headerSize) break;

      const payloadStart = offset + headerSize;
      const boxEnd = Math.min(offset + boxSize, limit);

      if (boxType === 'ftyp' && payloadStart + 4 <= boxEnd) {
        result.valid = true;
        result.container = 'mp4';
        result.brand = readAscii(buffer, payloadStart, 4).trim();
        // Verifica compatible brands para codecs explícitos
        for (let b = payloadStart + 8; b + 4 <= boxEnd; b += 4) {
          const brandFourCC = readAscii(buffer, b, 4);
          if (CODEC_MAP[brandFourCC]) {
            addCodecFourCC(brandFourCC);
          }
        }
      } else if (boxType === 'moov' || boxType === 'mdat' || boxType === 'moof') {
        result.valid = true;
        result.container = 'mp4';
      }

      if (boxType === 'mvhd' && payloadStart + 20 <= boxEnd) {
        const version = view.getUint8(payloadStart);
        if (version === 0 && payloadStart + 20 <= boxEnd) {
          const timescale = view.getUint32(payloadStart + 12, false);
          const duration = view.getUint32(payloadStart + 16, false);
          if (timescale > 0 && duration > 0 && duration !== 0xffffffff) {
            result.durationSeconds = Number((duration / timescale).toFixed(3));
          }
        } else if (version === 1 && payloadStart + 32 <= boxEnd) {
          const timescale = view.getUint32(payloadStart + 20, false);
          const durHigh = view.getUint32(payloadStart + 24, false);
          const durLow = view.getUint32(payloadStart + 28, false);
          const duration = durHigh * 4294967296 + durLow;
          if (timescale > 0 && duration > 0) {
            result.durationSeconds = Number((duration / timescale).toFixed(3));
          }
        }
      } else if (boxType === 'tkhd' && payloadStart + 84 <= boxEnd) {
        const version = view.getUint8(payloadStart);
        const widthOffset = version === 1 ? payloadStart + 88 : payloadStart + 76;
        const heightOffset = version === 1 ? payloadStart + 92 : payloadStart + 80;
        if (heightOffset + 4 <= boxEnd) {
          const wFixed = view.getUint32(widthOffset, false);
          const hFixed = view.getUint32(heightOffset, false);
          const w = wFixed >>> 16;
          const h = hFixed >>> 16;
          if (w > 0 && h > 0) {
            result.width = w;
            result.height = h;
          }
        }
      } else if (boxType === 'stsd' && payloadStart + 8 <= boxEnd) {
        // stsd tem 4 bytes version/flags + 4 bytes entry_count, seguido das sample entries (avc1, mp4a, etc.)
        let entryOffset = payloadStart + 8;
        while (entryOffset + 8 <= boxEnd) {
          const entrySize = view.getUint32(entryOffset, false);
          const entryType = readAscii(buffer, entryOffset + 4, 4);
          if (entrySize < 8) break;
          addCodecFourCC(entryType);
          entryOffset += entrySize;
        }
      }

      if (CONTAINER_BOXES.has(boxType)) {
        scanBoxes(payloadStart, boxEnd, depth + 1);
      }

      offset += boxSize;
    }
  }

  scanBoxes(0, buffer.byteLength, 0);

  // Fallback: varredura rápida por FourCCs conhecidos caso moov esteja truncado
  const rawAscii = readAscii(buffer, 0, Math.min(buffer.byteLength, 65536));
  for (const fourcc of Object.keys(CODEC_MAP)) {
    if (rawAscii.includes(fourcc)) {
      addCodecFourCC(fourcc);
    }
  }

  result.codecs = Array.from(codecSet);
  result.rawCodecFourCCs = Array.from(rawFourCCSet);
  return result;
}

function resolveRelativeUrl(target: string, baseUrl?: string): string {
  const trimmed = target.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (baseUrl) {
    try {
      return new URL(trimmed, baseUrl).href;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Analisa playlists HLS (.m3u8) tanto Master (variantes/resoluções) quanto Media (segmentos .ts/.m4s).
 */
export function parseHlsManifest(content: string, baseUrl?: string): HlsProbeResult {
  const result: HlsProbeResult = {
    valid: false,
    type: 'invalid',
    variants: [],
    segmentCount: 0,
    sampleSegmentUrls: [],
  };

  if (!content || typeof content !== 'string') return result;
  const trimmed = content.trim();
  if (!trimmed.startsWith('#EXTM3U')) {
    return result;
  }

  result.valid = true;
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let totalDuration = 0;
  let pendingStreamInf: Partial<HlsVariantInfo> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
      const bwMatch = attrs.match(/BANDWIDTH=(\d+)/i);
      const resMatch = attrs.match(/RESOLUTION=(\d+x\d+)/i);
      const codecsMatch = attrs.match(/CODECS="([^"]+)"/i);

      pendingStreamInf = {
        bandwidth: bwMatch ? Number(bwMatch[1]) : undefined,
        resolution: resMatch ? resMatch[1] : undefined,
        codecs: codecsMatch ? codecsMatch[1] : undefined,
      };
      continue;
    }

    if (pendingStreamInf && !line.startsWith('#')) {
      result.variants.push({
        ...pendingStreamInf,
        url: resolveRelativeUrl(line, baseUrl),
      });
      pendingStreamInf = null;
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const durMatch = line.match(/^#EXTINF:([\d.]+)/);
      if (durMatch) {
        totalDuration += parseFloat(durMatch[1]) || 0;
      }
      continue;
    }

    if (!line.startsWith('#')) {
      result.segmentCount++;
      if (result.sampleSegmentUrls.length < 5) {
        result.sampleSegmentUrls.push(resolveRelativeUrl(line, baseUrl));
      }
    }
  }

  if (result.variants.length > 0) {
    result.type = 'master';
  } else {
    result.type = 'media';
    if (totalDuration > 0) {
      result.durationSeconds = Number(totalDuration.toFixed(3));
    }
  }

  return result;
}

/**
 * Valida se um buffer corresponde a um segmento de vídeo MPEG-TS real
 * checando o byte de sincronismo 0x47 a cada 188 bytes.
 */
export function inspectMpegTsSegment(buffer: Uint8Array): MpegTsProbeResult {
  if (!buffer || buffer.byteLength < 188) {
    return {
      valid: false,
      packetCountChecked: 0,
      syncByteValid: false,
    };
  }

  const packetsToCheck = Math.min(5, Math.floor(buffer.byteLength / 188));
  let validPackets = 0;

  for (let i = 0; i < packetsToCheck; i++) {
    if (buffer[i * 188] === 0x47) {
      validPackets++;
    }
  }

  const syncByteValid = validPackets === packetsToCheck && packetsToCheck > 0;
  return {
    valid: syncByteValid,
    packetCountChecked: packetsToCheck,
    syncByteValid,
  };
}

/**
 * Extrai URLs de players embutidos (<iframe src>) e streams de vídeo (.mp4, .m3u8, <video>, <source>, get_video)
 * diretamente do HTML bruto antes de qualquer sanitização.
 */
export function extractEmbedsAndStreamsFromHtml(
  rawHtml: string,
  baseUrl?: string,
): ExtractedEmbedsAndStreams {
  const iframeSet = new Set<string>();
  const mediaSet = new Set<string>();

  if (!rawHtml || typeof rawHtml !== 'string') {
    return { iframes: [], mediaUrls: [] };
  }

  // 1. Extrair <iframe ... src="...">
  const iframeRegex = /<iframe\b[^>]*?\b(?:data-)?src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = iframeRegex.exec(rawHtml)) !== null) {
    const url = resolveRelativeUrl(match[1], baseUrl);
    if (url && !url.startsWith('javascript:') && !url.startsWith('about:')) {
      iframeSet.add(url);
    }
  }

  // 2. Extrair <video src="..."> e <source src="...">
  const sourceRegex = /<(?:video|source)\b[^>]*?\b(?:data-)?src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceRegex.exec(rawHtml)) !== null) {
    const url = resolveRelativeUrl(match[1], baseUrl);
    if (url && !url.startsWith('javascript:') && !url.startsWith('blob:')) {
      mediaSet.add(url);
    }
  }

  // 3. Extrair links diretos .mp4, .m3u8, .webm ou endpoints de player (get_video) em scripts/JSON inline
  const rawStreamRegex =
    /(?:https?:\/\/|\/\/)[a-zA-Z0-9._~:/?#[\]@!$&()*+,;=%-]+\.(?:mp4|m3u8|webm|mpd)(?:\?[a-zA-Z0-9._~:/?#[\]@!$&()*+,;=%-]*)?/gi;
  while ((match = rawStreamRegex.exec(rawHtml)) !== null) {
    const cleaned = match[0].replace(/\\+/g, '');
    mediaSet.add(resolveRelativeUrl(cleaned, baseUrl));
  }

  // 4. Endpoints clássicos de resolução de stream (ex.: StreamTape get_video?id=...)
  const getVideoRegex =
    /(?:https?:\/\/|\/\/)[a-zA-Z0-9.-]+\/get_video\?[a-zA-Z0-9._~:/?#[\]@!$&()*+,;=%-]+/gi;
  while ((match = getVideoRegex.exec(rawHtml)) !== null) {
    const cleaned = match[0].replace(/\\+/g, '');
    mediaSet.add(resolveRelativeUrl(cleaned, baseUrl));
  }

  return {
    iframes: Array.from(iframeSet),
    mediaUrls: Array.from(mediaSet),
  };
}
