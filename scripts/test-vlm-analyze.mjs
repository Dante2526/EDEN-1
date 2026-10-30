// Teste da cascata VLM com a imagem real do usuário (Kaizen)
// Gera um data URL e posta no endpoint local do server.ts
import { readFileSync } from 'node:fs';

const PNG_PATH = '/home/z/my-project/upload/pasted_image_1793322229678.png';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  const buf = readFileSync(PNG_PATH);
  const b64 = buf.toString('base64');
  const dataUrl = `data:image/png;base64,${b64}`;
  console.log(`Imagem: ${buf.length / 1024} KB, base64: ${b64.length / 1024} KB`);

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/vlm-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = await res.json();
  console.log(`\n=== ${res.status} em ${elapsed}s ===`);
  console.log(JSON.stringify(data, null, 2).slice(0, 3000));
}

main().catch((e) => {
  console.error('Falha no teste:', e.message);
  process.exit(1);
});
