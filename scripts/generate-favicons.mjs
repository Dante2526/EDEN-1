import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'public', 'favicon.svg');

async function generate() {
  const svgBuffer = fs.readFileSync(SVG_PATH);

  console.log('Generating PNG favicons from bonsai SVG...');

  // 1. favicon-32x32.png
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(ROOT, 'public', 'favicon-32x32.png'));
  console.log('✓ public/favicon-32x32.png');

  // 2. favicon-48x48.png (ideal for ICO and tab headers)
  await sharp(svgBuffer)
    .resize(48, 48)
    .png()
    .toFile(path.join(ROOT, 'public', 'favicon-48x48.png'));
  console.log('✓ public/favicon-48x48.png');

  // 3. favicon.ico (can be PNG-based ICO, perfectly valid in modern browsers)
  // Sharp can output 32x32 PNG, and copying to favicon.ico works natively in Chromium/WebKit
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(ROOT, 'public', 'favicon.ico'));
  console.log('✓ public/favicon.ico');

  // 4. apple-touch-icon.png (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(ROOT, 'public', 'apple-touch-icon.png'));
  console.log('✓ public/apple-touch-icon.png');

  // 5. public/icons/icon-192.png
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(ROOT, 'public', 'icons', 'icon-192.png'));
  console.log('✓ public/icons/icon-192.png');

  // 6. public/icons/icon-512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(ROOT, 'public', 'icons', 'icon-512.png'));
  console.log('✓ public/icons/icon-512.png');

  // 7. public/icons/icon-maskable-512.png
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(ROOT, 'public', 'icons', 'icon-maskable-512.png'));
  console.log('✓ public/icons/icon-maskable-512.png');

  console.log('All bonsai icons successfully generated!');
}

generate().catch(console.error);
