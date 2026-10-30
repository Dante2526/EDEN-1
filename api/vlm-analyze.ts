import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

/**
 * VLM Analyze API — Desconstrutor de Imagem
 * ==========================================
 * Recebe uma imagem (base64 data URL) e usa um modelo vision-language da
 * NVIDIA NIM para detectar os componentes visuais e retornar um JSON
 * estruturado com:
 *   - background: prompt + cor dominante do fundo (pra regenerar via FLUX.1)
 *   - elements[]: cada elemento distinto detectado (shape / text / sticker / image)
 *     com posição (em % da imagem), tamanho, cor e (para imagens complexas)
 *     um prompt pra regenerar isoladamente.
 *
 * Esse JSON é consumido pelo modal `image-deconstruct-modal.tsx` para montar
 * um ImageProject e abrir no editor Fabric.js — onde o usuário pode
 * mover, recolorir, redimensionar, apagar/trocar, duplicar e trocar fundo.
 *
 * =========================================================================
 * ESTRATÉGIA: "retry + corrida paralela" (substitui a cascata serial)
 * =========================================================================
 * Telemetria de produção:
 *   - Nemotron VL 120B: 4/4 sucessos em 7-20s — o único modelo que entrega
 *     o JSON pesado a tempo (testado novamente em 30/10/2026: 7.3s e 11.2s)
 *   - GLM-5.3 Flash: 0/3 — nunca gerou o JSON dentro do timeout
 *   - Gemma 4 31B: 0/3 — idem
 *   - O NIM às vezes TRAVA inteiro (fila saturada): todos os modelos
 *     esgotam o timeout numa janela de instabilidade (caso visto em produção)
 *
 * A cascata serial antiga queimava 45+25+25 = 95s no pior caso, com apenas
 * 1 tentativa no único modelo que funciona. Nova estratégia:
 *
 *   Estágio 1: Nemotron sozinho @ 30s (caminho de sucesso: 7-20s)
 *   Estágio 2 (só se o 1 falhar): pausa breve (respeita Retry-After em 429)
 *     e dispara em PARALELO: Nemotron retry @ 40s + GLM Flash @ 40s + Gemma
 *     @ 40s. O primeiro JSON válido vence; os demais são abortados.
 *
 * Pior caso: ~78s (vs 95s), com 2 tiros no Nemotron e 1 chance real nos
 * modelos reserva — sem custo adicional no caminho feliz.
 */

/** Estágio 1 — o workhorse comprovado. */
const STAGE_1 = { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', timeoutMs: 30000, label: 'Nemotron VL 120B' };

/** Estágio 2 — corrida paralela: retry do workhorse + reservas. */
const STAGE_2_RACE = [
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', timeoutMs: 40000, label: 'Nemotron VL 120B (retry)' },
  { id: 'z-ai/glm-5.3-flash', timeoutMs: 40000, label: 'GLM-5.3 Flash' },
  { id: 'google/gemma-4-31b-it', timeoutMs: 40000, label: 'Gemma 4 31B' },
];

const SYSTEM_PROMPT = `Você é um analisador visual de imagens. Analise a imagem fornecida e retorne APENAS um JSON válido (sem markdown, sem texto adicional, sem fences) com a seguinte estrutura:

{
  "background": {
    "prompt": "descrição detalhada do fundo em inglês, estilo prompt de geração de imagem FLUX.1, focando em cores, gradientes, texturas e elementos de fundo",
    "dominant_color": "#hex cor dominante do fundo"
  },
  "elements": [
    {
      "type": "shape | sticker | text | image",
      "name": "nome amigável em PT-BR (ex: 'Árvore', 'Sol', 'Botão', 'Título')",
      "x": 0-100,
      "y": 0-100,
      "width": 0-100,
      "height": 0-100,
      "rotation": 0-360,
      "shape": "rect | circle | triangle | line",
      "emoji": "caractere emoji (apenas se type=sticker)",
      "text": "texto detectado (apenas se type=text)",
      "fontSize": número (apenas se type=text ou sticker),
      "fontFamily": "Inter, sans-serif",
      "fill": "#hex",
      "fontWeight": "normal | bold",
      "prompt": "descrição em inglês pra regenerar isoladamente via FLUX.1 (apenas se type=image)",
      "dominant_color": "#hex (apenas se type=image)"
    }
  ]
}

REGRAS OBRIGATÓRIAS:
1. Detecte APENAS elementos visualmente distintos e editáveis. Não descreva cada pixel.
2. Máximo 8 elementos para manter o projeto gerenciável.
3. x é a posição horizontal do CENTRO do elemento em porcentagem (0 = borda esquerda, 50 = centro, 100 = borda direita). NUNCA use 100 para todos — calcule a posição real observando a imagem.
4. y é a posição vertical do CENTRO do elemento em porcentagem (0 = topo, 50 = meio, 100 = base). NUNCA use 100 para todos.
5. width é a largura do elemento em porcentagem da largura total da imagem. Um texto curto geralmente tem width ~10-20%; um objeto grande ~30-60%. NUNCA use 100 para tudo.
6. height é a altura do elemento em porcentagem da altura total da imagem.
7. Exemplo: um botão no canto inferior direito de uma imagem 1024x768 pode ter x=85, y=92, width=20, height=8.
8. Para type=image, descreva o objeto complexo (ex: 'a green tree with brown trunk', 'a yellow sun with rays', 'a female character wearing a red dress').
9. Para type=text, use o texto exato detectado na imagem.
10. Para type=sticker, use o emoji mais próximo do elemento visual.
11. Para type=shape, escolha a forma geométrica mais próxima (rect/circle/triangle/line).
12. rotation em graus (0-360).
13. Use cores hex válidas (#rrggbb).
14. Retorne SOMENTE o JSON, sem markdown, sem explicação, sem fences.
15. ANTES de retornar, confira: cada elemento tem x, y, width, height DIFERENTES baseados na posição real na imagem. Se todos os valores forem iguais, você errou — refaça.`;

interface VlmElement {
  type: 'shape' | 'sticker' | 'text' | 'image';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  // shape
  shape?: 'rect' | 'circle' | 'triangle' | 'line';
  // sticker
  emoji?: string;
  fontSize?: number;
  fontFamily?: string;
  // text + shape
  fill?: string;
  fontWeight?: 'normal' | 'bold';
  // text
  text?: string;
  // image
  prompt?: string;
  dominant_color?: string;
}

interface VlmAnalysis {
  background: {
    prompt: string;
    dominant_color: string;
  };
  elements: VlmElement[];
}

/**
 * Extrai o JSON da resposta do VLM — tolerante a fences acidentais e texto extra.
 */
function extractJsonFromResponse(text: string): VlmAnalysis | null {
  if (!text) return null;

  // Tenta parse direto primeiro
  try {
    return JSON.parse(text);
  } catch {}

  // Procura pelo primeiro { ... } balanceado
  let start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (json && typeof json === 'object' && json.background && Array.isArray(json.elements)) {
      return json as VlmAnalysis;
    }
  } catch {}

  return null;
}

/**
 * Valida a estrutura da análise. Retorna o motivo da rejeição ou null se OK.
 */
function validateAnalysis(analysis: VlmAnalysis | null): string | null {
  if (!analysis || !analysis.background || !Array.isArray(analysis.elements)) {
    return 'JSON malformado';
  }
  const els = analysis.elements;
  // Detecta o bug "todas as posições em 100%/100%" — modelo não entendeu
  // o schema de porcentagem e jogou tudo no canto.
  const allSamePosition =
    els.length >= 2 &&
    els.every((e) => Number(e.x) === Number(els[0].x) && Number(e.y) === Number(els[0].y));
  if (allSamePosition) return 'posições duplicadas (schema bug)';
  return null;
}

/**
 * Erro tipado de uma chamada VLM — carrega label do modelo + motivo
 * (para telemetria) + status HTTP / Retry-After (para backoff do estágio 2).
 */
class VlmCallError extends Error {
  label: string;
  reason: string;
  status?: number;
  retryAfterMs?: number;
  /** true = abortado porque outro modelo venceu a corrida (não é falha real) */
  abortedByRace?: boolean;

  constructor(label: string, reason: string, status?: number, retryAfterMs?: number, abortedByRace?: boolean) {
    super(`${label}: ${reason}`);
    this.name = 'VlmCallError';
    this.label = label;
    this.reason = reason;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.abortedByRace = abortedByRace;
  }
}

interface VlmCallConfig {
  id: string;
  label: string;
  timeoutMs: number;
  image: string;
  nvidiaKey: string;
  /** Sinal externo (aborta perdedores da corrida do estágio 2) */
  signal?: AbortSignal;
}

interface VlmCallResult {
  analysis: VlmAnalysis;
  completionTokens: number;
  durationMs: number;
}

/**
 * Uma chamada a um modelo VLM da NVIDIA NIM. Parseia e VALIDA a resposta —
 * só resolve com análise estruturalmente válida; qualquer outro caso vira
 * VlmCallError com motivo legível.
 */
async function callVlmModel(cfg: VlmCallConfig): Promise<VlmCallResult> {
  const t0 = Date.now();
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

  const payload = {
    model: cfg.id,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analise esta imagem e retorne o JSON estruturado conforme as instruções.' },
          { type: 'image_url', image_url: { url: cfg.image } },
        ],
      },
    ],
    temperature: 0.2,
    top_p: 0.7,
    max_tokens: 4096,
    stream: false,
  };

  // Timeout próprio + repasse do abort externo (corrida)
  const ownCtrl = new AbortController();
  const onOuterAbort = () => ownCtrl.abort();
  if (cfg.signal) {
    if (cfg.signal.aborted) ownCtrl.abort();
    else cfg.signal.addEventListener('abort', onOuterAbort);
  }
  const timeout = setTimeout(() => ownCtrl.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.nvidiaKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: ownCtrl.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[VLM Analyze] ${cfg.label} ${res.status}: ${errText.slice(0, 200)}`);
      const retryAfterRaw = res.headers.get('retry-after');
      const retryAfterMs = retryAfterRaw ? Number(retryAfterRaw) * 1000 : undefined;
      throw new VlmCallError(cfg.label, `HTTP ${res.status}`, res.status, retryAfterMs);
    }

    const data: any = await res.json();
    const rawContent: string = data?.choices?.[0]?.message?.content || '';

    if (!rawContent) {
      throw new VlmCallError(cfg.label, 'resposta vazia');
    }

    const analysis = extractJsonFromResponse(rawContent);
    const invalidReason = validateAnalysis(analysis);
    if (invalidReason || !analysis) {
      console.warn(`[VLM Analyze] ${cfg.label} rejeitado (${invalidReason}). Bruto (200 chars):`, rawContent.slice(0, 200));
      throw new VlmCallError(cfg.label, invalidReason || 'JSON malformado');
    }

    return {
      analysis,
      completionTokens: data?.usage?.completion_tokens || 0,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    if (err instanceof VlmCallError) throw err;

    if (err?.name === 'AbortError') {
      // Abortado por fora = perdedor da corrida (não conta como falha real)
      if (cfg.signal?.aborted) {
        throw new VlmCallError(cfg.label, 'abortado (outro modelo venceu a corrida)', undefined, undefined, true);
      }
      throw new VlmCallError(cfg.label, `timeout (${Math.round(cfg.timeoutMs / 1000)}s)`);
    }

    throw new VlmCallError(cfg.label, err?.message || 'erro de rede');
  } finally {
    clearTimeout(timeout);
    cfg.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** Sanitiza + limita a análise antes de devolver pro client. */
function sanitizeAnalysis(analysis: VlmAnalysis) {
  const sanitizedElements = (analysis.elements || [])
    .filter((e) => e && typeof e === 'object' && e.type)
    .slice(0, 8)
    .map((e) => ({
      type: e.type,
      name: String(e.name || 'Elemento').slice(0, 60),
      x: Math.max(0, Math.min(100, Number(e.x) || 50)),
      y: Math.max(0, Math.min(100, Number(e.y) || 50)),
      width: Math.max(1, Math.min(100, Number(e.width) || 20)),
      height: Math.max(1, Math.min(100, Number(e.height) || 20)),
      rotation: Math.max(0, Math.min(360, Number(e.rotation) || 0)),
      shape: e.shape,
      emoji: e.emoji,
      text: e.text,
      fontSize: Number(e.fontSize) || 48,
      fontFamily: e.fontFamily || 'Inter, sans-serif',
      fill: e.fill || '#000000',
      fontWeight: e.fontWeight === 'bold' ? 'bold' : 'normal',
      prompt: e.prompt,
      dominant_color: e.dominant_color,
    }));

  return {
    background: {
      prompt: String(analysis.background?.prompt || 'a neutral gradient background').slice(0, 500),
      dominant_color: String(analysis.background?.dominant_color || '#ffffff').slice(0, 7),
    },
    elements: sanitizedElements,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req: Request, envArg?: Env): Promise<Response> {
  const env = getEnv(envArg);
  const sec = await checkAuthAndRateLimit(req, env);
  if (sec) return sec;

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido. Utilize POST.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Corpo JSON inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const image: string | undefined = body.image;
  if (!image || typeof image !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Parâmetro "image" (base64 data URL) é obrigatório.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!image.startsWith('data:image/')) {
    return new Response(
      JSON.stringify({ error: 'Imagem deve ser um data URL base64 (data:image/...).' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validação de tamanho — VLMs aceitam até ~5MB de base64
  // (base64 é ~33% maior que o binário, então ~3.7MB de imagem)
  if (image.length > 7_500_000) {
    return new Response(
      JSON.stringify({ error: 'Imagem muito grande. Máximo ~5MB.' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const nvidiaKey = env.NVIDIA_API_KEY?.trim();
  if (!nvidiaKey || nvidiaKey.startsWith('sua_') || nvidiaKey.startsWith('nvapi-your')) {
    return new Response(
      JSON.stringify({ error: 'NVIDIA_API_KEY não configurada. O desconstrutor de imagem requer um modelo de visão.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // =========================================================================
  // ESTÁGIO 1 — Nemotron sozinho (caminho feliz: 7-20s)
  // =========================================================================
  const t0 = Date.now();
  const failures: string[] = [];

  try {
    const r = await callVlmModel({ ...STAGE_1, image, nvidiaKey });
    const sanitized = sanitizeAnalysis(r.analysis);
    return new Response(
      JSON.stringify({
        ...sanitized,
        meta: {
          model: STAGE_1.id,
          model_label: STAGE_1.label,
          provider: 'NVIDIA NIM',
          stage: 1,
          element_count: sanitized.elements.length,
          raw_tokens: r.completionTokens,
          duration_ms: r.durationMs,
          elapsed_ms: Date.now() - t0,
          skipped: [] as string[],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    if (!(err instanceof VlmCallError)) throw err;
    failures.push(`${err.label}: ${err.reason}`);

    // Backoff antes do estágio 2 — deixa o load balancer do NIM respirar.
    // Em 429 respeita o Retry-After (cap 8s); nos demais casos, 2.5s.
    const backoff = err.status === 429 ? Math.min(8000, err.retryAfterMs || 5000) : 2500;
    await sleep(backoff);
  }

  // =========================================================================
  // ESTÁGIO 2 — corrida paralela: Nemotron retry + reservas.
  // Primeiro JSON válido vence; perdedores são abortados.
  // =========================================================================
  const raceControllers = STAGE_2_RACE.map(() => new AbortController());
  // Side-channel: registra falhas reais que ocorreram ANTES da corrida ser
  // decidida (distingue "falhou com HTTP 500" de "abortado porque outro venceu")
  const raceFailures: (string | null)[] = STAGE_2_RACE.map(() => null);
  const racePromises = STAGE_2_RACE.map((model, i) => {
    const p = callVlmModel({ ...model, image, nvidiaKey, signal: raceControllers[i].signal }).then(
      (r) => ({ ...r, model, index: i })
    );
    p.catch((e: any) => {
      if (e instanceof VlmCallError && !e.abortedByRace) {
        raceFailures[i] = `${e.label}: ${e.reason}`;
      }
    });
    return p;
  });

  try {
    const winner = await Promise.any(racePromises);

    // Aborta os perdedores (libera sockets; rejections já tratadas acima)
    raceControllers.forEach((c, j) => {
      if (j !== winner.index) c.abort();
    });

    const sanitized = sanitizeAnalysis(winner.analysis);

    // Telemetria dos perdedores: falha real se já tinha falhado, senão corte
    STAGE_2_RACE.forEach((m, j) => {
      if (j !== winner.index) {
        failures.push(raceFailures[j] || `${m.label}: abortado (outro modelo venceu)`);
      }
    });

    return new Response(
      JSON.stringify({
        ...sanitized,
        meta: {
          model: winner.model.id,
          model_label: winner.model.label,
          provider: 'NVIDIA NIM',
          stage: 2,
          element_count: sanitized.elements.length,
          raw_tokens: winner.completionTokens,
          duration_ms: winner.durationMs,
          elapsed_ms: Date.now() - t0,
          skipped: failures,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (agg: any) {
    // Promise.any AggregateError — todas as chamadas do estágio 2 falharam
    for (const e of agg?.errors || []) {
      if (e instanceof VlmCallError && !e.abortedByRace) {
        failures.push(`${e.label}: ${e.reason}`);
      }
    }
  }

  // =========================================================================
  // Tudo falhou — mensagem diferenciada por tipo de falha
  // =========================================================================
  const elapsedS = Math.round((Date.now() - t0) / 1000);
  const allTimeouts = failures.length > 0 && failures.every((f) => f.includes('timeout'));
  const hitRateLimit = failures.some((f) => f.includes('429'));

  const errorMsg = allTimeouts
    ? 'Todos os modelos de visão esgotaram o tempo limite. A NVIDIA parece instável neste momento — aguarde ~1 minuto e tente novamente.'
    : hitRateLimit
      ? 'Limite de requisições da NVIDIA atingido. Aguarde um momento antes de tentar novamente.'
      : 'Todos os modelos de visão falharam. Tente novamente em alguns segundos.';

  return new Response(
    JSON.stringify({
      error: errorMsg,
      attempts: failures,
      elapsed_s: elapsedS,
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}
