// Testa o endpoint /api/vlm-analyze em PRODUÇÃO com a imagem real do usuário
import { readFileSync } from 'node:fs';

const PNG_PATH = '/home/z/my-project/upload/pasted_image_1793322229678.png';
const BASE = 'https://eden-ia.pages.dev';

async function main() {
  const buf = readFileSync(PNG_PATH);
  const b64 = buf.toString('base64');
  const dataUrl = `data:image/png;base64,${b64}`;
  console.log(`Imagem: ${(buf.length / 1024).toFixed(0)} KB, base64: ${(b64.length / 1024).toFixed(0)} KB`);

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/vlm-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const data = await res.json();
  console.log(`\n=== HTTP ${res.status} em ${elapsed}s ===`);
  if (data.error) {
    console.log('ERRO:', data.error);
    if (data.attempts) console.log('Tentativas:', data.attempts.join(' | '));
    return;
  }
  console.log(`Modelo usado: ${data.meta?.model_label} (${data.meta?.model})`);
  if (data.meta?.skipped?.length) console.log(`Descartados: ${data.meta.skipped.join(` | `)}`);
  console.log(`Elementos: ${data.elements.length}`);
  data.elements.forEach((e, i) => {
    console.log(`  [${i}] ${e.type} "${e.name}" @ (${e.x}%, ${e.y}%) ${e.width}x${e.height}% fill=${e.fill}${e.text ? ` text="${e.text}"` : ''}${e.prompt ? ` prompt="${e.prompt}"` : ''}`);
  });
  console.log(`\nBackground: ${data.background.dominant_color} — "${data.background.prompt}"`);
}

main().catch((e) => {
  console.error('Falha no teste:', e.message);
  process.exit(1);
});
