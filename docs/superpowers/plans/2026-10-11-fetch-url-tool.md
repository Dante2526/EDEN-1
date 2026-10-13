# Implementação da Ferramenta `fetch_url` (Web Page Reader)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos utilizam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Implementar a ferramenta `fetch_url` permitindo que a IA extraia e leia o conteúdo textual limpo de URLs externas (artigos, documentações técnicas, links de usuários) com sanitização HTML via Cheerio e proteção contra SSRF.

**Architecture:** Novo endpoint `/api/fetch-url` com extração semântica e truncamento de contexto (máximo 10k caracteres), registrado no Express (`server.ts`) e Vercel Serverless. No frontend (`src/App.tsx`), inclusão de `fetch_url` nos schemas de function calling e renderização de feedback em tempo real no `chat-message.tsx`.

**Tech Stack:** TypeScript, Node.js / Express, Cheerio, React 19, Lucide Icons, Vite.

## Global Constraints
- Sem quebra de compatibilidade com as ferramentas de chat existentes (`web_search`, `generate_image`, `run_terminal_command`, MCP e GitHub).
- Proteção SSRF obrigatória: bloquear loops locais (`localhost`, `127.0.0.1`, `::1`) e faixas de rede privada (`10.*`, `192.168.*`, `172.16-31.*`).
- Limite máximo de 10.000 caracteres no conteúdo extraído com nota de truncamento explícita.
- Timeout estrito de 8.000ms na requisição HTTP.
- Zero erros de tipos no TypeScript (`npm run lint` / `tsc --noEmit`).

---

### Task 1: Instalação do Cheerio e Utilitário de Extração HTML com Teste Unitário

**Files:**
- Modify: `package.json`
- Create: `src/lib/html-extractor.ts`
- Create: `src/lib/html-extractor.test.ts`

**Interfaces:**
- Consumes: `cheerio`
- Produces: `extractCleanContent(html: string, maxChars?: number): { title: string; content: string; length: number; truncated: boolean }`

- [ ] **Step 1: Instalar dependência cheerio**

Executar no terminal:
```bash
npm install cheerio
```

- [ ] **Step 2: Escrever o teste unitário para o extrator de HTML**

Criar `src/lib/html-extractor.test.ts`:
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractCleanContent } from './html-extractor';

describe('extractCleanContent', () => {
  it('deve extrair o título e limpar tags script, style e nav', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>React 19 - Documentação</title>
          <style>.hide { display: none; }</style>
        </head>
        <body>
          <nav><a href="/">Home</a><a href="/docs">Docs</a></nav>
          <main>
            <h1>Novidades do React 19</h1>
            <p>O hook use() simplifica o consumo de Promises e Context.</p>
          </main>
          <script>console.log("tracking");</script>
          <footer>Copyright 2026</footer>
        </body>
      </html>
    `;

    const result = extractCleanContent(rawHtml);
    assert.strictEqual(result.title, 'React 19 - Documentação');
    assert.ok(result.content.includes('Novidades do React 19'));
    assert.ok(result.content.includes('O hook use() simplifica'));
    assert.ok(!result.content.includes('console.log'));
    assert.ok(!result.content.includes('Home'));
    assert.ok(!result.content.includes('Copyright 2026'));
  });

  it('deve truncar quando o texto ultrapassar o limite configurado', () => {
    const longHtml = `<html><body><article><p>${'A'.repeat(500)}</p></article></body></html>`;
    const result = extractCleanContent(longHtml, 100);
    assert.strictEqual(result.truncated, true);
    assert.ok(result.content.includes('[... Conteúdo truncado para otimização de contexto ...]'));
  });
});
```

- [ ] **Step 3: Implementar `src/lib/html-extractor.ts`**

Criar `src/lib/html-extractor.ts`:
```typescript
import * as cheerio from 'cheerio';

export interface ExtractedPageContent {
  title: string;
  content: string;
  length: number;
  truncated: boolean;
}

export function extractCleanContent(html: string, maxChars: number = 10000): ExtractedPageContent {
  const $ = cheerio.load(html);

  // 1. Extrair título da página
  const title = $('title').text().trim() || $('h1').first().text().trim() || 'Sem título';

  // 2. Remover tags indesejadas que poluem o contexto da IA
  $('script, style, noscript, svg, iframe, nav, footer, header, aside, form').remove();

  // 3. Priorizar elementos semânticos principais
  const mainCandidate = $('article, main, [role="main"], #content, .content, .main-content');
  const targetElement = mainCandidate.length > 0 ? mainCandidate.first() : $('body');

  // 4. Obter texto limpo e normalizar espaços em branco
  const rawText = targetElement.text() || $('body').text() || '';
  const cleanedText = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  // 5. Truncamento com salvaguarda
  if (cleanedText.length > maxChars) {
    const truncatedText =
      cleanedText.slice(0, maxChars) +
      '\n\n[... Conteúdo truncado para otimização de contexto ...]';
    return {
      title,
      content: truncatedText,
      length: truncatedText.length,
      truncated: true,
    };
  }

  return {
    title,
    content: cleanedText,
    length: cleanedText.length,
    truncated: false,
  };
}
```

- [ ] **Step 4: Rodar o teste para validar**

Executar:
```bash
npx tsx --test src/lib/html-extractor.test.ts
```
Esperado: 2/2 testes passando com sucesso.

---

### Task 2: Endpoint de Backend `/api/fetch-url.ts` e Rota no `server.ts`

**Files:**
- Create: `api/fetch-url.ts`
- Modify: `server.ts`

**Interfaces:**
- Consumes: `extractCleanContent` de `src/lib/html-extractor.ts`, `checkAuthAndRateLimit` de `src/lib/server/_security.ts`
- Produces: Rota HTTP `GET /api/fetch-url?url=...` retornando JSON `{ url, title, content, length, truncated }`

- [ ] **Step 1: Criar `api/fetch-url.ts` com validação de SSRF e fetch seguro**

Criar `api/fetch-url.ts`:
```typescript
import { checkAuthAndRateLimit } from '../lib/server/_security';
import { extractCleanContent } from '../src/lib/html-extractor';

export const config = {
  runtime: 'nodejs',
};

function isLocalOrPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return true;
    }

    // Bloqueia faixas privadas IPv4 (10.*, 192.168.*, 172.16-31.*)
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return true;
    }
    const match172 = hostname.match(/^172\.(\d+)\./);
    if (match172) {
      const secondOctet = parseInt(match172[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return true;
    }

    return false;
  } catch {
    return true;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const securityResponse = checkAuthAndRateLimit(req);
  if (securityResponse) return securityResponse;

  const reqUrl = new URL(req.url);
  const targetUrl = reqUrl.searchParams.get('url') || reqUrl.searchParams.get('q') || '';

  if (!targetUrl.trim()) {
    return new Response(JSON.stringify({ error: 'Parâmetro `url` é obrigatório.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isLocalOrPrivateUrl(targetUrl)) {
    return new Response(
      JSON.stringify({ error: 'Acesso a URLs locais ou IPs privados é proibido por segurança.' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SynapWebReader/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Falha ao acessar ${targetUrl} (Status HTTP ${response.status}: ${response.statusText})`,
        }),
        {
          status: response.status >= 400 && response.status < 500 ? response.status : 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('xml')) {
      return new Response(
        JSON.stringify({
          error: `O recurso em ${targetUrl} não é uma página legível (Content-Type: ${contentType}).`,
        }),
        {
          status: 415,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const html = await response.text();
    const extracted = extractCleanContent(html, 10000);

    return new Response(
      JSON.stringify({
        url: targetUrl,
        title: extracted.title,
        content: extracted.content,
        length: extracted.length,
        truncated: extracted.truncated,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('timeout');
    return new Response(
      JSON.stringify({
        error: isTimeout
          ? `Tempo limite de 8s esgotado ao tentar ler ${targetUrl}.`
          : `Erro ao baixar página: ${err?.message || 'Falha desconhecida.'}`,
      }),
      {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
```

- [ ] **Step 2: Conectar o handler em `server.ts`**

No arquivo `server.ts`:
- Importar `fetchUrlHandler from './api/fetch-url';`
- Adicionar `app.all('/api/fetch-url', adaptWebHandler(fetchUrlHandler));`

---

### Task 3: Definição da Tool `fetch_url` e Orquestração em `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `/api/fetch-url`
- Produces: `FETCH_URL_TOOL` no array de tools do modelo, execução transparente via `executeTool`

- [ ] **Step 1: Declarar a tool `FETCH_URL_TOOL` e adicionar a `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`**

```typescript
const FETCH_URL_TOOL = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Lê e extrai o conteúdo textual limpo de uma página web, documentação ou artigo online a partir de uma URL. ' +
      'Use após `web_search` para acessar os detalhes de um link encontrado ou diretamente quando o usuário enviar um link.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A URL completa e válida (começando com http:// ou https://) da página a ser lida.',
        },
      },
      required: ['url'],
    },
  },
};
```
Atualizar:
```typescript
const DEFAULT_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, IMAGE_GEN_TOOL, TERMINAL_TOOL];
const ALL_CHAT_TOOLS = [WEB_SEARCH_TOOL, FETCH_URL_TOOL, IMAGE_GEN_TOOL, TERMINAL_TOOL, ...GITHUB_TOOLS];
```

- [ ] **Step 2: Adicionar tratamento de execução no `executeTool`**

No switch/ifs de `executeTool` em `src/App.tsx`:
```typescript
if (name === 'fetch_url') {
  try {
    const targetUrl = args.url || '';
    const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(targetUrl)}`, {
      headers: { 'x-api-key': import.meta.env.VITE_API_SECRET || '' }
    });
    const data = await res.json();
    if (!res.ok) {
      return { result: JSON.stringify({ error: data.error || `Erro HTTP ${res.status}` }) };
    }
    return {
      result: JSON.stringify({
        url: data.url,
        title: data.title,
        content: data.content,
        truncated: data.truncated
      })
    };
  } catch (err: any) {
    return { result: JSON.stringify({ error: err?.message || `Erro ao ler URL ${args.url}` }) };
  }
}
```

- [ ] **Step 3: Atualizar a diretriz do System Prompt**

Incluir instrução clara no prompt do sistema:
`'3. Navegação Web: Use `web_search` para descobrir fontes e links relevantes. Use `fetch_url` para acessar e ler o conteúdo completo de páginas, documentações ou URLs fornecidas pelo usuário.'`

---

### Task 4: Feedback Visual da Tool na UI (`src/components/chat-message.tsx`)

**Files:**
- Modify: `src/components/chat-message.tsx`

**Interfaces:**
- Consumes: Chamadas de ferramentas com nome `fetch_url`
- Produces: Badge dinâmico com ícone `Globe` / `Compass`, hostname da URL e estado de carregamento/conclusão

- [ ] **Step 1: Tratar `fetch_url` nas verificações de nome de ferramenta**

Adicionar verificação para `isFetchUrl` e ícone `Globe` de `lucide-react`.

- [ ] **Step 2: Renderizar status amigável**
- Enquanto executa: "Lendo página web: `<hostname da url>`"
- Concluído: "Página lida: `<título da página>`"

---

### Task 5: Validação Completa, Testes e Verificação Estrita

**Files:**
- Test: `src/lib/html-extractor.test.ts`
- Lint: `npm run lint`
- Build: `npm run build`

- [ ] **Step 1: Rodar os testes unitários**
```bash
npx tsx --test src/lib/html-extractor.test.ts
```
Esperado: 2/2 testes passando.

- [ ] **Step 2: Rodar verificação de tipos estritos**
```bash
npm run lint
```
Esperado: 0 erros (`tsc --noEmit`).

- [ ] **Step 3: Compilar bundle de produção**
```bash
npm run build
```
Esperado: Build do Vite concluído com sucesso em `dist/`.
