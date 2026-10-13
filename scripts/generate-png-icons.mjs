import fs from 'fs';
import zlib from 'zlib';

function createPNG(width, height) {
  // Simple uncompressed or deflate PNG generator
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // deflate
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data: height scanlines, each starting with filter byte 0
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.42;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background gradient: dark zinc to deep purple
      let red = 15;
      let green = 15;
      let blue = 20;

      // Outer glow and circle
      if (dist < r) {
        // Purple gradient
        const t = (y / height);
        red = Math.round(168 * (1 - t * 0.3));
        green = Math.round(85 * (1 - t * 0.3));
        blue = Math.round(247 * (1 - t * 0.2));
      } else if (dist < r + 4) {
        // Border
        red = 192;
        green = 132;
        blue = 252;
      }

      rawData[pixelOffset] = red;
      rawData[pixelOffset + 1] = green;
      rawData[pixelOffset + 2] = blue;
      rawData[pixelOffset + 3] = 255;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type), data]));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Ensure directories
fs.mkdirSync('./public/icons', { recursive: true });

fs.writeFileSync('./public/icons/icon-192.png', createPNG(192, 192));
fs.writeFileSync('./public/icons/icon-512.png', createPNG(512, 512));
fs.writeFileSync('./public/icons/icon-maskable-512.png', createPNG(512, 512));
fs.writeFileSync('./public/apple-touch-icon.png', createPNG(180, 180));
console.log('PNG icons created successfully!');
