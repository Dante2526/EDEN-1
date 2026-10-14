// ===========================================================================
// copy-cf-artifacts.mjs
// ===========================================================================
// Copia e compila os artefatos do Cloudflare Pages para dentro de dist/
// DEPOIS do build do Vite.
//
// O que este script faz:
//   1. Compila _worker.ts (TypeScript) → dist/_worker.js (ESM bundle via esbuild).
//      Em produção (CF Pages CI), o wrangler faz isso automaticamente. Em dev
//      local (wrangler pages dev), ele espera _worker.js pronto.
//   2. Copia _routes.json, _headers, _redirects para dist/.
//
// Em produção (CF Pages conectado ao GitHub), o wrangler do CI detecta
// _worker.ts na raiz do repo e faz o bundle sozinho. Mas como este script
// sempre roda no `npm run build`, garantimos que dist/ está completo para
// qualquer ambiente (local dev, CI manual, deploy direto).
// ===========================================================================

import { copyFile, mkdir, access, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

const COPY_ARTIFACTS = [
  '_routes.json',
  '_headers',
  '_redirects',
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!existsSync(DIST)) {
    console.error(`[copy-cf-artifacts] ERRO: dist/ não encontrado. Rode "vite build" primeiro.`);
    process.exit(1);
  }

  await mkdir(DIST, { recursive: true });

  // 1. Compila _worker.ts → dist/_worker.js (ESM bundle)
  const workerSrc = join(ROOT, '_worker.ts');
  const workerDst = join(DIST, '_worker.js');
  if (await exists(workerSrc)) {
    // Remove versão anterior (se existir) pra evitar confusão
    await rm(workerDst, { force: true });
    await build({
      entryPoints: [workerSrc],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      outfile: workerDst,
      external: ['node:*'],
      logLevel: 'info',
    });
    console.log(`[copy-cf-artifacts] ✓ _worker.ts → dist/_worker.js (bundled)`);
  } else {
    console.warn(`[copy-cf-artifacts] ⚠ _worker.ts não encontrado na raiz — pulando.`);
  }

  // 2. Copia os outros artefatos
  for (const artifact of COPY_ARTIFACTS) {
    const src = join(ROOT, artifact);
    const dst = join(DIST, artifact);
    if (await exists(src)) {
      await copyFile(src, dst);
      console.log(`[copy-cf-artifacts] ✓ ${artifact} → dist/${artifact}`);
    } else {
      console.warn(`[copy-cf-artifacts] ⚠ ${artifact} não encontrado na raiz — pulando.`);
    }
  }

  console.log('[copy-cf-artifacts] Done.');
}

main().catch((err) => {
  console.error('[copy-cf-artifacts] FALHA:', err);
  process.exit(1);
});
