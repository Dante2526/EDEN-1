import type { Skill } from './types.js';

export interface SmartToolSelectionContext {
  userText: string;
  hasActiveRepo: boolean;
  hasActiveProject: boolean;
}

export interface SmartSkillSelectionContext {
  userText: string;
  hasActiveRepo: boolean;
}

const DOC_INTENT_REGEX =
  /\b(?:pdf|excel|xlsx|planilha|word|docx|pptx|powerpoint|slide|slides|apresenta[çc][ãa]o|relat[oó]rio|contrato|documento|exportar\s+arquivo|baixar\s+arquivo)\b/i;

const PYTHON_INTENT_REGEX =
  /\b(?:python|pyodide|script\s+python|calcul|c[aá]lculo|estat[ií]stic|regress[ãa]o|simul|equa[çc][ãa]o|matriz|integral|derivada|pandas|numpy|scraping|scraper|urllib|beautifulsoup|bs4|regex|parse\s+html|m3u8|mp4|streamtape|ffprobe|ffmpeg|curl|iframe)\b/i;

const SANDPACK_INTENT_REGEX =
  /\b(?:sandpack|novo\s+projeto\s+local|criar\s+projeto\s+no\s+preview|abrir\s+projeto\s+salvo|template\s+react)\b/i;

const GIT_COMMIT_INTENT_REGEX =
  /\b(?:commit|commits|git\s+commit|git\s+push|git\s+status|git\s+log|branch|pull\s+request|merge|changelog)\b/i;

const CLOUDFLARE_INTENT_REGEX =
  /\b(?:cloudflare|worker|_worker|_routes|wrangler|pages|edge|serverless|api\/|endpoint|backend|kv|d1|r2)\b/i;

const REMOTE_DEPLOY_INTENT_REGEX =
  /\b(?:vps|servidor\s+remoto|ssh|scp|sftp|paramiko|webhook|workflow_dispatch|github\s+actions|subir\s+na\s+vps)\b/i;

const IMAGE_MEDIA_INTENT_REGEX =
  /\b(?:imagem|imagens|foto|fotos|ilustra[çc][ãa]o|desenhe|gere\s+uma\s+imagem|flux|inpaint|pincel|m[aá]scara|camadas?\s+edit[aá]veis|flyer|poster|banner|logo|arte)\b/i;

const VIDEO_STUDIO_INTENT_REGEX =
  /\b(?:opencut|capcut|editor\s+de\s+v[ií]deo|cortar\s+v[ií]deo|reels|tiktok|shorts|roteiro\s+de\s+v[ií]deo|v[ií]deo|anima[çc][ãa]o|hyperframe)\b/i;

const BROWSER_RECIPE_INTENT_REGEX =
  /\b(?:receita|rob[ôo]|maxun|autom[aá]tico|navegador|browser|playwright|puppeteer|scrape|scraping|extrair\s+dados|acessar\s+site|abrir\s+site)\b/i;

/**
 * Filtra dinamicamente as ferramentas enviadas à API da NVIDIA NIM para reduzir
 * o tamanho do JSON Schema (Guided Decoding + Prefill) e acelerar o Time-To-First-Token (TTFT).
 */
export function selectContextualTools<T extends { function?: { name?: string } }>(
  tools: T[],
  ctx: SmartToolSelectionContext
): T[] {
  const text = (ctx.userText || '').toLowerCase();
  const wantsDoc = DOC_INTENT_REGEX.test(text);
  const wantsPython = PYTHON_INTENT_REGEX.test(text);
  const wantsSandpack = SANDPACK_INTENT_REGEX.test(text);
  const wantsImage = IMAGE_MEDIA_INTENT_REGEX.test(text);
  const wantsVideo = VIDEO_STUDIO_INTENT_REGEX.test(text);
  const wantsBrowserRecipe = BROWSER_RECIPE_INTENT_REGEX.test(text);

  const hasQueryCodeGraph = tools.some((t) => t.function?.name === 'query_code_graph');

  return tools.filter((tool) => {
    const name = tool.function?.name || '';
    if (!name) return true;

    // 1. Remove duplicata exata de schema (query_code_graph já cobre query_architecture_graph)
    if (name === 'query_architecture_graph' && hasQueryCodeGraph) {
      return false;
    }

    // 2. Quando um repositório GitHub está ativo, read_file/list_files/search_code já cobrem leitura de repo
    if (ctx.hasActiveRepo && (name === 'read_github_file' || name === 'search_github_repos')) {
      return false;
    }

    // 3. Se está editando repositório GitHub e não há projeto local aberto nem pedido de Sandpack,
    // omite as 3 ferramentas de workspace Sandpack local
    if (
      ctx.hasActiveRepo &&
      !ctx.hasActiveProject &&
      !wantsSandpack &&
      (name === 'create_project' || name === 'update_project_files' || name === 'open_project')
    ) {
      return false;
    }

    // 4. Schema pesado do Office/PDF (generate_document) só vai quando o usuário pede documentos/planilhas/slides/PDF
    if (name === 'generate_document' && !wantsDoc) {
      return false;
    }

    // 5. Interpretador Python (Pyodide) só vai quando o prompt envolve Python, cálculos ou simulações
    if (name === 'run_python' && !wantsPython) {
      return false;
    }

    // 6. Envio/Deploy Remoto (request_remote_deploy) só é injetado se houver intenção de vps/ssh/webhook
    if (name === 'request_remote_deploy' && !REMOTE_DEPLOY_INTENT_REGEX.test(text)) {
      return false;
    }

    // 7. Quando editando código em repositório ativo, omite ferramentas pesadas de geração de imagem/vídeo/robôs
    // caso o prompt seja uma tarefa de código/UI sem menção a mídia ou scraping
    if (ctx.hasActiveRepo || ctx.hasActiveProject) {
      if (
        (name === 'generate_image' || name === 'generate_image_with_layers' || name === 'inpaint_image') &&
        !wantsImage
      ) {
        return false;
      }
      if (name === 'open_video_editor' && !wantsVideo) {
        return false;
      }
      if ((name === 'list_browser_recipes' || name === 'run_browser_recipe') && !wantsBrowserRecipe) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Filtra habilidades (Skills) que só fazem sentido em contextos específicos,
 * economizando tokens de System Prompt no Prefill da GPU.
 */
export function selectContextualSkills(skills: Skill[], ctx: SmartSkillSelectionContext): Skill[] {
  const text = (ctx.userText || '').toLowerCase();
  const wantsDoc = DOC_INTENT_REGEX.test(text);
  const wantsGit = GIT_COMMIT_INTENT_REGEX.test(text);
  const wantsCloudflare = CLOUDFLARE_INTENT_REGEX.test(text);

  return skills.filter((skill) => {
    if (!skill.enabled) return false;

    if (skill.id === 'doc-creator' && !wantsDoc) {
      return false;
    }
    if (skill.id === 'conventional-commits' && !wantsGit) {
      return false;
    }
    if (skill.id === 'cloudflare-pages' && !wantsCloudflare) {
      return false;
    }

    return true;
  });
}
