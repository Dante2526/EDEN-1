import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFfmpegCliArgs,
  formatFfmpegDecodeLog,
  evaluateVideoIntegrity,
  VideoDecodeResult,
} from './video-decoder-engine';

describe('Video Decoder Engine (Decodificação Real de Vídeo & FFmpeg)', () => {
  it('deve parsear argumentos clássicos de ffmpeg e ffprobe corretamente', () => {
    const cmd1 = 'ffmpeg -i https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4 -t 5 -f null -';
    const parsed1 = parseFfmpegCliArgs(cmd1);

    assert.equal(parsed1.inputUrl, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    assert.equal(parsed1.durationSec, 5);
    assert.equal(parsed1.isNullOutput, true);
    assert.equal(parsed1.isWasmRequested, false);

    const cmd2 = 'ffmpeg -i https://example.com/stream.m3u8 -ss 00:00:02 -vframes 1 thumb.jpg --wasm';
    const parsed2 = parseFfmpegCliArgs(cmd2);

    assert.equal(parsed2.inputUrl, 'https://example.com/stream.m3u8');
    assert.equal(parsed2.seekSec, 2);
    assert.equal(parsed2.outputFile, 'thumb.jpg');
    assert.equal(parsed2.isWasmRequested, true);
  });

  it('deve avaliar integridade correta baseada no playback real de frames', () => {
    const goodResult: Partial<VideoDecodeResult> = {
      decodedFrames: 150,
      droppedFrames: 1,
      durationSec: 5,
      actualFps: 30,
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
    };
    assert.equal(evaluateVideoIntegrity(goodResult), 'verified');

    const corruptedResult: Partial<VideoDecodeResult> = {
      decodedFrames: 0,
      droppedFrames: 0,
      durationSec: 5,
      actualFps: 0,
      hasVideo: true,
      error: 'MEDIA_ELEMENT_ERROR: Format error',
    };
    assert.equal(evaluateVideoIntegrity(corruptedResult), 'corrupted');

    const drmResult: Partial<VideoDecodeResult> = {
      decodedFrames: 0,
      droppedFrames: 0,
      durationSec: 5,
      actualFps: 0,
      hasVideo: true,
      error: 'EncryptedMediaError: Key system not supported',
    };
    assert.equal(evaluateVideoIntegrity(drmResult), 'drm_blocked');
  });

  it('deve formatar o log idêntico ao output de terminal do FFmpeg', () => {
    const result: VideoDecodeResult = {
      url: 'https://example.com/video.mp4',
      durationSec: 5,
      decodedFrames: 150,
      droppedFrames: 0,
      actualFps: 30,
      width: 1920,
      height: 1080,
      hasVideo: true,
      hasAudio: true,
      audioActive: true,
      audioRmsDb: -14.2,
      codec: 'h264',
      integrity: 'verified',
      capturedFrameBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      ttfbMs: 120,
    };

    const log = formatFfmpegDecodeLog(result);

    assert.ok(log.includes("Input #0"));
    assert.ok(log.includes("Stream #0:0"));
    assert.ok(log.includes("1920x1080"));
    assert.ok(log.includes("frame=  150"));
    assert.ok(log.includes("fps= 30.0"));
    assert.ok(log.includes("Decodificação Real"));
    assert.ok(log.includes("Áudio: OK"));
    assert.ok(log.includes("Frame capturado"));
  });
});
