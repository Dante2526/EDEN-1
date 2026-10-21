import { get, set } from 'idb-keyval';

export type BrowserRecipeActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'wait'
  | 'scroll'
  | 'extract_text'
  | 'extract_table';

export interface BrowserRecipeAction {
  id: string;
  type: BrowserRecipeActionType;
  target?: string;
  value?: string;
  description: string;
  timestamp: number;
}

export interface BrowserRecipe {
  id: string;
  name: string;
  description: string;
  startUrl: string;
  actions: BrowserRecipeAction[];
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastStatus?: 'success' | 'error';
  lastExtractedData?: any;
}

const RECIPES_STORAGE_KEY = 'synap_browser_recipes_v1';

export function createBrowserRecipe(
  name: string,
  startUrl: string,
  actions: BrowserRecipeAction[] = [],
  description = ''
): BrowserRecipe {
  const now = Date.now();
  return {
    id: `recipe-${now}-${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim(),
    startUrl: startUrl.trim(),
    description: description.trim(),
    actions,
    createdAt: now,
    updatedAt: now,
  };
}

export function createRecipeAction(
  type: BrowserRecipeActionType,
  params: { target?: string; value?: string; description?: string }
): BrowserRecipeAction {
  const target = params.target?.trim() || '';
  const value = params.value?.trim() || '';
  let autoDesc = params.description?.trim();

  if (!autoDesc) {
    switch (type) {
      case 'navigate':
        autoDesc = `Navegar para ${target}`;
        break;
      case 'click':
        autoDesc = `Clicar no elemento ${target}`;
        break;
      case 'type':
        autoDesc = `Digitar "${value}" em ${target}`;
        break;
      case 'wait':
        autoDesc = `Aguardar ${value || 1000}ms`;
        break;
      case 'scroll':
        autoDesc = `Rolar a página (${value || '500px'})`;
        break;
      case 'extract_text':
        autoDesc = `Extrair texto do elemento ${target}`;
        break;
      case 'extract_table':
        autoDesc = `Extrair dados da tabela ${target || 'table'}`;
        break;
      default:
        autoDesc = `Ação ${type}`;
    }
  }

  return {
    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type,
    target,
    value,
    description: autoDesc,
    timestamp: Date.now(),
  };
}

export function validateRecipe(recipe: BrowserRecipe): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!recipe.name || !recipe.name.trim()) {
    errors.push('O nome da receita é obrigatório.');
  }

  if (!recipe.startUrl || !recipe.startUrl.trim()) {
    errors.push('A URL inicial é obrigatória.');
  } else {
    try {
      const parsed = new URL(recipe.startUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push('A URL inicial deve começar com http:// ou https://.');
      }
    } catch {
      errors.push('A URL inicial informada não é válida.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function compileRecipeToPuppeteerScript(recipe: BrowserRecipe): string {
  const actionsJson = JSON.stringify(recipe.actions);
  const startUrl = JSON.stringify(recipe.startUrl);

  return `
module.exports = async ({ page }) => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const actions = ${actionsJson};
  const startUrl = ${startUrl};
  const extractedData = { items: [], fields: {} };

  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);

    for (const act of actions) {
      if (act.type === 'navigate' && act.target) {
        await page.goto(act.target, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } else if (act.type === 'click' && act.target) {
        await page.waitForSelector(act.target, { timeout: 7000 });
        await page.click(act.target);
      } else if (act.type === 'type' && act.target) {
        await page.waitForSelector(act.target, { timeout: 7000 });
        await page.type(act.target, act.value || '');
      } else if (act.type === 'wait') {
        const ms = parseInt(act.value || '1000', 10);
        await sleep(isNaN(ms) ? 1000 : ms);
      } else if (act.type === 'scroll') {
        const px = parseInt(act.value || '500', 10);
        await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), isNaN(px) ? 500 : px);
      } else if (act.type === 'extract_text' && act.target) {
        const texts = await page.$$eval(act.target, (els) => els.map((e) => e.innerText ? e.innerText.trim() : (e.getAttribute('src') || e.getAttribute('href') || e.textContent || '').trim()).filter(Boolean));
        if (texts.length === 1) {
          extractedData.fields[act.target] = texts[0];
        } else if (texts.length > 1) {
          extractedData.fields[act.target] = texts;
        }
      } else if (act.type === 'extract_table') {
        const tableSelector = act.target || 'table';
        const rows = await page.$$eval(tableSelector + ' tr', (trs) => {
          return trs.map((tr) => {
            const cells = Array.from(tr.querySelectorAll('th, td'));
            return cells.map((c) => (c.innerText || '').trim());
          }).filter((r) => r.length > 0);
        });
        if (rows.length > 0) {
          extractedData.items = rows;
        }
      }
      await sleep(500);
    }

    const title = await page.title();
    const currentUrl = page.url();
    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 75 });
    const screenshotBase64 = 'data:image/jpeg;base64,' + screenshotBuffer.toString('base64');

    return {
      success: true,
      currentUrl,
      title,
      extractedData,
      screenshotBase64,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      currentUrl: page.url(),
      title: await page.title().catch(() => ''),
      extractedData,
    };
  }
};
`.trim();
}

export function formatRecipeRunResultForAi(
  recipe: BrowserRecipe,
  extractedData: any,
  success: boolean,
  error?: string
): string {
  const parts: string[] = [
    `### Robô de Navegação: ${recipe.name}`,
    `- URL Inicial: ${recipe.startUrl}`,
    `- Status: ${success ? 'Concluído com Sucesso' : 'Falhou'}`,
  ];

  if (recipe.description) {
    parts.push(`- Objetivo: ${recipe.description}`);
  }

  if (error) {
    parts.push(`- ⚠️ Erro durante execução: ${error}`);
  }

  if (extractedData) {
    parts.push('\n**Dados Coletados:**');
    if (typeof extractedData === 'object') {
      try {
        parts.push('```json');
        parts.push(JSON.stringify(extractedData, null, 2));
        parts.push('```');
      } catch {
        parts.push(String(extractedData));
      }
    } else {
      parts.push(String(extractedData));
    }
  }

  return parts.join('\n');
}

export async function loadSavedRecipes(): Promise<BrowserRecipe[]> {
  try {
    const data = await get<BrowserRecipe[]>(RECIPES_STORAGE_KEY);
    if (Array.isArray(data)) return data;
  } catch {}

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(RECIPES_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return [];
}

export async function saveRecipe(recipe: BrowserRecipe): Promise<void> {
  const recipes = await loadSavedRecipes();
  const existingIdx = recipes.findIndex((r) => r.id === recipe.id);
  const updated = { ...recipe, updatedAt: Date.now() };

  let nextList: BrowserRecipe[];
  if (existingIdx >= 0) {
    nextList = [...recipes];
    nextList[existingIdx] = updated;
  } else {
    nextList = [updated, ...recipes];
  }

  try {
    await set(RECIPES_STORAGE_KEY, nextList);
  } catch {}

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(nextList));
    } catch {}
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const recipes = await loadSavedRecipes();
  const filtered = recipes.filter((r) => r.id !== id);

  try {
    await set(RECIPES_STORAGE_KEY, filtered);
  } catch {}

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(RECIPES_STORAGE_KEY, JSON.stringify(filtered));
    } catch {}
  }
}
