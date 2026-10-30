/**
 * Simula a lógica de estágios + corrida paralela do api/vlm-analyze.ts
 * sem rede — valida: wiring de abort, telemetria, sem unhandled rejections.
 */
class VlmCallError extends Error {
  constructor(label, reason, status, retryAfterMs, abortedByRace) {
    super(`${label}: ${reason}`);
    this.name = 'VlmCallError'; this.label = label; this.reason = reason;
    this.status = status; this.retryAfterMs = retryAfterMs; this.abortedByRace = abortedByRace;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// callVlmModel simulado: recebe comportamento por modelo
async function callVlmModel(cfg) {
  const t0 = Date.now();
  const ownCtrl = new AbortController();
  const onOuterAbort = () => ownCtrl.abort();
  if (cfg.signal) {
    if (cfg.signal.aborted) ownCtrl.abort();
    else cfg.signal.addEventListener('abort', onOuterAbort);
  }
  const timeout = setTimeout(() => ownCtrl.abort(), cfg.timeoutMs);
  try {
    const behavior = cfg.behavior;
    await sleep(behavior.delayMs);
    if (cfg.signal?.aborted) throw new AbortError2();
    if (behavior.ownAbort) throw new AbortError2(); // simula timeout do próprio modelo
    if (behavior.httpError) throw new VlmCallError(cfg.label, `HTTP ${behavior.httpError}`, behavior.httpError);
    if (behavior.invalid) throw new VlmCallError(cfg.label, 'JSON malformado');
    return { analysis: behavior.analysis, completionTokens: 100, durationMs: Date.now() - t0 };
  } catch (err) {
    if (err instanceof VlmCallError) throw err;
    if (err?.name === 'AbortError') {
      if (cfg.signal?.aborted) throw new VlmCallError(cfg.label, 'abortado (outro modelo venceu a corrida)', undefined, undefined, true);
      throw new VlmCallError(cfg.label, `timeout (${Math.round(cfg.timeoutMs / 1000)}s)`);
    }
    throw new VlmCallError(cfg.label, err?.message || 'erro de rede');
  } finally {
    clearTimeout(timeout);
    cfg.signal?.removeEventListener('abort', onOuterAbort);
  }
}
class AbortError2 extends Error { constructor() { super('aborted'); this.name = 'AbortError'; } }

const STAGE_2_RACE = [
  { id: 'nemotron', timeoutMs: 400, label: 'Nemotron VL 120B (retry)' },
  { id: 'glm', timeoutMs: 400, label: 'GLM-5.3 Flash' },
  { id: 'gemma', timeoutMs: 400, label: 'Gemma 4 31B' },
];

process.on('unhandledRejection', (e) => { console.error('❌ UNHANDLED REJECTION:', e); process.exitCode = 1; });

async function run(strategy) {
  const failures = [];
  const t0 = Date.now();
  let outcome = '';

  // Estágio 1
  try {
    await callVlmModel({ ...{ id: 'nemotron', timeoutMs: 300, label: 'Nemotron VL 120B' }, behavior: strategy.stage1 });
    outcome = 'stage1-ok';
  } catch (err) {
    if (!(err instanceof VlmCallError)) throw err;
    failures.push(`${err.label}: ${err.reason}`);
    await sleep(err.status === 429 ? 50 : 25);
  }

  // Estágio 2
  if (outcome !== 'stage1-ok') {
    const ctrls = STAGE_2_RACE.map(() => new AbortController());
    const raceFailures = STAGE_2_RACE.map(() => null);
    const promises = STAGE_2_RACE.map((m, i) => {
      const p = callVlmModel({ ...m, signal: ctrls[i].signal, behavior: strategy.stage2[i] }).then((r) => ({ ...r, model: m, index: i }));
      p.catch((e) => { if (e instanceof VlmCallError && !e.abortedByRace) raceFailures[i] = `${e.label}: ${e.reason}`; });
      return p;
    });
    try {
      const winner = await Promise.any(promises);
      ctrls.forEach((c, j) => { if (j !== winner.index) c.abort(); });
      STAGE_2_RACE.forEach((m, j) => { if (j !== winner.index) failures.push(raceFailures[j] || `${m.label}: abortado (outro modelo venceu)`); });
      outcome = `stage2-ok (${winner.model.label})`;
    } catch {
      STAGE_2_RACE.forEach((m, i) => { if (raceFailures[i]) failures.push(raceFailures[i]); });
      outcome = 'all-failed';
    }
  }

  const ok = outcome === strategy.expect || (strategy.expect.includes('(') && outcome.startsWith(strategy.expect.split('(')[0]));
  console.log(`${ok ? '✅' : '❌'} ${strategy.name} → ${outcome} em ${Date.now() - t0}ms${failures.length ? ' | failures: ' + failures.join(' · ') : ''}`);
  if (!ok) process.exitCode = 1;
}

const validAnalysis = { background: { prompt: 'x', dominant_color: '#fff' }, elements: [{ type: 'shape', name: 'A', x: 10, y: 20, width: 5, height: 5 }, { type: 'text', name: 'B', x: 80, y: 70, width: 10, height: 4 }] };

(async () => {
  await run({
    name: '1. Estágio 1 direto (caminho feliz)',
    expect: 'stage1-ok',
    stage1: { delayMs: 30, analysis: validAnalysis },
    stage2: [],
  });
  await run({
    name: '2. Estágio 1 trava → retry do Nemotron vence, reservas abortadas',
    expect: 'stage2-ok (Nemotron VL 120B (retry))',
    stage1: { delayMs: 999, ownAbort: true },
    stage2: [
      { delayMs: 60, analysis: validAnalysis },
      { delayMs: 2000, ownAbort: true },
      { delayMs: 2000, ownAbort: true },
    ],
  });
  await run({
    name: '3. Reserva falha RÁPIDO (HTTP 500) antes do vencedor — telemetria real',
    expect: 'stage2-ok (Nemotron VL 120B (retry))',
    stage1: { delayMs: 999, ownAbort: true },
    stage2: [
      { delayMs: 80, analysis: validAnalysis },
      { delayMs: 10, httpError: 500 },
      { delayMs: 2000, ownAbort: true },
    ],
  });
  await run({
    name: '4. Tudo falha (NIM fora do ar)',
    expect: 'all-failed',
    stage1: { delayMs: 999, ownAbort: true },
    stage2: STAGE_2_RACE.map(() => ({ delayMs: 999, ownAbort: true })),
  });
  await run({
    name: '5. Estágio 1 recebe 429 → estágio 2 salva',
    expect: 'stage2-ok (Nemotron VL 120B (retry))',
    stage1: { delayMs: 10, httpError: 429 },
    stage2: [
      { delayMs: 50, analysis: validAnalysis },
      { delayMs: 2000, ownAbort: true },
      { delayMs: 2000, ownAbort: true },
    ],
  });
  console.log('\nConcluído.');
})();
