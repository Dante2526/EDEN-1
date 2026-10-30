import { Env, getEnv } from '../lib/server/env';
import { checkAuthAndRateLimit } from '../lib/server/_security';

export const config = {
  runtime: 'edge',
};

/**
 * VLM Analyze API — Desconstrutor de Imagem
 * ==========================================
 * Recebe uma imagem (base64 data URL) e usa o modelo NVIDIA Nemotron VL
 * (vision-language) para detectar os componentes visuais e retornar um JSON
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
 * Modelos (cascata com fallback): nemotron-vl → glm-5.3-flash →
 * gemma-4-31b-it. Primeiro que retornar JSON válido vence.
 */

/**
 * Cascata de modelos VLM — telemetria de produção (3 testes reais):
 *   - Nemotron VL 120B: acerta em ~15-20s (3/3 sucessos) — o workhorse
 *   - GLM-5.3 Flash: timeout em 20s (0/3) — não gera o JSON pesado a tempo
 *   - Gemma 4 31B: timeout em 20s (0/3) — idem
 *
 * Por isso o Nemotron vai PRIMEIRO: caminho de sucesso ~20s (vs 60s se
 * queimássemos 40s em flash+gemma antes). Flash e Gemma ficam como
 * fallback pra quando o Nemotron especificamente estiver fora do ar.
 */
const VLM_CASCADE = [
  { id: 'nvidia/nemotron-3.5-super-vl-120b-a12b', timeoutMs: 45000, label: 'Nemotron VL 120B' },
  { id: 'z-ai/glm-5.3-flash', timeoutMs: 25000, label: 'GLM-5.3 Flash' },
  { id: 'google/gemma-4-31b-it', timeoutMs: 25000, label: 'Gemma 4 31B' },
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
3. Posições (x, y) são em PORCENTAGEM (0-100) da dimensão da imagem, onde (0,0) é o canto superior esquerdo. Representam o CENTRO do elemento.
4. width e height também em PORCENTAGEM (0-100) da dimensão da imagem.
5. Para type=image, descreva o objeto complexo (ex: 'a green tree with brown trunk', 'a yellow sun with rays', 'a female character wearing a red dress').
6. Para type=text, use o texto exato detectado na imagem.
7. Para type=sticker, use o emoji mais próximo do elemento visual.
8. Para type=shape, escolha a forma geométrica mais próxima (rect/circle/triangle/line).
9. rotation em graus (0-360).
10. Use cores hex válidas (#rrggbb).
11. Retorne SOMENTE o JSON, sem markdown, sem explicação, sem fences.`;

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
  // Cascata de modelos VLM: GLM-5.3 Flash → Gemma 4 → Nemotron VL
  // Primeiro que retornar JSON válido vence.
  // =========================================================================
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const failures: string[] = [];

  for (const model of VLM_CASCADE) {
    const payload = {
      model: model.id,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise esta imagem e retorne o JSON estruturado conforme as instruções.' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 4096,
      stream: false,
    };

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), model.timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[VLM Analyze] ${model.label} ${res.status}: ${errText.slice(0, 200)}`);
        failures.push(`${model.label}: HTTP ${res.status}`);
        continue; // próximo modelo da cascata
      }

      const data: any = await res.json();
      const rawContent: string = data?.choices?.[0]?.message?.content || '';

      if (!rawContent) {
        failures.push(`${model.label}: resposta vazia`);
        continue;
      }

      const analysis = extractJsonFromResponse(rawContent);

      if (!analysis || !analysis.background || !Array.isArray(analysis.elements)) {
        console.warn(`[VLM Analyze] ${model.label} retornou JSON inválido. Bruto (200 chars):`, rawContent.slice(0, 200));
        failures.push(`${model.label}: JSON malformado`);
        continue;
      }

      // SUCESSO — sanitiza e retorna
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

      const sanitizedAnalysis = {
        background: {
          prompt: String(analysis.background?.prompt || 'a neutral gradient background').slice(0, 500),
          dominant_color: String(analysis.background?.dominant_color || '#ffffff').slice(0, 7),
        },
        elements: sanitizedElements,
        meta: {
          model: model.id,
          model_label: model.label,
          provider: 'NVIDIA NIM',
          element_count: sanitizedElements.length,
          raw_tokens: data?.usage?.completion_tokens || 0,
          /** Modelos descartados antes deste acertar (telemetry p/ debug) */
          skipped: failures,
        },
      };

      return new Response(JSON.stringify(sanitizedAnalysis), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.warn(`[VLM Analyze] ${model.label} timeout (${model.timeoutMs}ms)`);
        failures.push(`${model.label}: timeout`);
      } else {
        console.warn(`[VLM Analyze] ${model.label} erro:`, err?.message || err);
        failures.push(`${model.label}: ${err?.message || 'erro'}`);
      }
      continue; // próximo modelo da cascata
    }
  }

  // =========================================================================
  // Todos os modelos falharam
  // =========================================================================
  return new Response(
    JSON.stringify({
      error: 'Todos os modelos de visão falharam. A NVIDIA pode estar instável — tente novamente em alguns segundos.',
      attempts: failures,
    }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}
