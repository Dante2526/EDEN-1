import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrowserRecipe,
  createRecipeAction,
  validateRecipe,
  compileRecipeToPuppeteerScript,
  formatRecipeRunResultForAi,
  type BrowserRecipe,
  type BrowserRecipeAction,
} from './browser-recipe-engine';

test('createBrowserRecipe - Criação e estrutura padrão de receita de navegação', () => {
  const recipe = createBrowserRecipe('Scraper de Preços', 'https://loja.com/produtos', [], 'Coleta lista de produtos');

  assert.ok(recipe.id.startsWith('recipe-'));
  assert.equal(recipe.name, 'Scraper de Preços');
  assert.equal(recipe.startUrl, 'https://loja.com/produtos');
  assert.equal(recipe.description, 'Coleta lista de produtos');
  assert.deepEqual(recipe.actions, []);
  assert.ok(recipe.createdAt > 0);
  assert.ok(recipe.updatedAt > 0);
});

test('createRecipeAction - Criação de ações de navegação com sanitização', () => {
  const navAction = createRecipeAction('navigate', { target: 'https://exemplo.com' });
  assert.equal(navAction.type, 'navigate');
  assert.equal(navAction.target, 'https://exemplo.com');
  assert.ok(navAction.description.includes('https://exemplo.com'));

  const clickAction = createRecipeAction('click', { target: '#btn-submit', description: 'Clica em Enviar' });
  assert.equal(clickAction.type, 'click');
  assert.equal(clickAction.target, '#btn-submit');
  assert.equal(clickAction.description, 'Clica em Enviar');

  const typeAction = createRecipeAction('type', { target: 'input[name="q"]', value: 'Hunter x Hunter' });
  assert.equal(typeAction.type, 'type');
  assert.equal(typeAction.target, 'input[name="q"]');
  assert.equal(typeAction.value, 'Hunter x Hunter');

  const extractAction = createRecipeAction('extract_text', { target: '.episode-title' });
  assert.equal(extractAction.type, 'extract_text');
  assert.equal(extractAction.target, '.episode-title');
});

test('validateRecipe - Validação de integridade de receitas', () => {
  const invalidRecipe: BrowserRecipe = {
    id: '',
    name: '  ',
    startUrl: 'not-a-valid-url',
    description: '',
    actions: [],
    createdAt: 0,
    updatedAt: 0,
  };

  const validation1 = validateRecipe(invalidRecipe);
  assert.equal(validation1.valid, false);
  assert.ok(validation1.errors.some((e) => e.includes('nome')));
  assert.ok(validation1.errors.some((e) => e.includes('URL')));

  const validRecipe = createBrowserRecipe('Scraper de Animes', 'https://animes.com/episodes', [
    createRecipeAction('click', { target: '.ep-item' }),
    createRecipeAction('extract_text', { target: 'iframe.player' }),
  ]);

  const validation2 = validateRecipe(validRecipe);
  assert.equal(validation2.valid, true);
  assert.equal(validation2.errors.length, 0);
});

test('compileRecipeToPuppeteerScript - Converte receita visual em script executável Puppeteer', () => {
  const recipe = createBrowserRecipe('Extrator de Links de Episódio', 'https://animes.cc/hunter', [
    createRecipeAction('wait', { value: '2000' }),
    createRecipeAction('click', { target: 'a.ep-link' }),
    createRecipeAction('extract_text', { target: 'iframe.player-embed' }),
  ]);

  const script = compileRecipeToPuppeteerScript(recipe);
  assert.ok(script.includes('async ({ page }) =>'));
  assert.ok(script.includes('https://animes.cc/hunter'));
  assert.ok(script.includes('a.ep-link'));
  assert.ok(script.includes('iframe.player-embed'));
  assert.ok(script.includes('extractedData'));
});

test('formatRecipeRunResultForAi - Formatação compacta e rica para o modelo de IA', () => {
  const recipe = createBrowserRecipe('Consulta de Tabela', 'https://finance.com/quotes', []);
  const extractedData = {
    items: [
      { title: 'Item 1', link: 'https://finance.com/1' },
      { title: 'Item 2', link: 'https://finance.com/2' },
    ],
  };

  const formattedSuccess = formatRecipeRunResultForAi(recipe, extractedData, true);
  assert.ok(formattedSuccess.includes('Robô de Navegação: Consulta de Tabela'));
  assert.ok(formattedSuccess.includes('Status: Concluído'));
  assert.ok(formattedSuccess.includes('Item 1'));
  assert.ok(formattedSuccess.includes('Item 2'));

  const formattedError = formatRecipeRunResultForAi(recipe, null, false, 'Elemento #btn não encontrado');
  assert.ok(formattedError.includes('Status: Falhou'));
  assert.ok(formattedError.includes('Elemento #btn não encontrado'));
});
