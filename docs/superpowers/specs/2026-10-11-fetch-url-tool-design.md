# Especificação de Design: Ferramenta `fetch_url` (Web Page Reader)

- **Data:** 2026-10-11
- **Status:** Proposto
- **Autor:** Antigravity / Synap Core

---

## 1. Contexto e Motivação

Atualmente, o Synap possui a ferramenta `web_search` que consulta a API DuckDuckGo e Wikipedia. No entanto, ela retorna apenas snippets de 2 a 3 linhas. Quando o usuário faz perguntas que exigem documentações atualizadas (ex.: novidades do React 19, documentação de bibliotecas, APIs recém-lançadas) ou quando o usuário compartilha um link direto no chat, o modelo não consegue ler o conteúdo real da página.

A ferramenta `fetch_url` preenche essa lacuna, permitindo que a IA extraia o texto limpo de qualquer página web pública.

---

## 2. Arquitetura da Solução

```mermaid
flowchart LR
    User[Usuário / Chat] --> LLM[Modelo de IA]
    LLM -- 1. web_search query --> SearchAPI[/api/search]
    SearchAPI -- links relevantes --> LLM
    LLM -- 2. fetch_url url --> FetchAPI[/api/fetch-url]
    FetchAPI -- limpa HTML com Cheerio --> CleanText[Texto Limpo & Truncado]
    CleanText --> LLM
    LLM -- Resposta completa e precisa --> User
```

O fluxo segue o padrão da indústria (duas etapas):
1. **Descoberta:** `web_search` localiza fontes relevantes.
2. **Leitura Profunda:** `fetch_url` extrai o conteúdo do artigo/documentação.
3. **Leitura Direta:** O usuário pode fornecer URLs diretamente no chat para a IA inspecionar.

---

## 3. Especificação do Endpoint `/api/fetch-url`

### 3.1. Rota e Assinatura
- **Método:** `GET /api/fetch-url?url=<encoded_url>`
- **Segurança:** Autenticação e rate-limit via `checkAuthAndRateLimit` (mesmo padrão de `/api/search.ts`).
- **Runtime:** Node.js / Serverless / Express (adaptado via `adaptWebHandler`).

### 3.2. Proteção contra SSRF e Validação
- Rejeitar URLs que não usem protocolo `http:` ou `https:`.
- Rejeitar endereços IP privados/locais (`localhost`, `127.0.0.1`, `::1`, `10.*.*.*`, `192.168.*.*`, `172.16.*` até `172.31.*`).

### 3.3. Fetch & Sanitização
- Timeout rígido de 8 segundos (`AbortSignal.timeout(8000)`).
- `User-Agent` de navegador desktop padrão para evitar bloqueios de scraping simples.
- Extração via `cheerio`:
  - Captura do `<title>` e meta description.
  - Remoção de tags inúteis: `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<noscript>`, `<svg>`, `<iframe>`, `<aside>`, `<form>`.
  - Priorização de seletores semânticos: `article`, `main`, `[role="main"]`, `#content`, ou `body`.
  - Normalização de espaçamentos em branco e quebras de linha.
- Teto de tamanho: **máximo de 10.000 caracteres** (~2.500 tokens). Caso ultrapasse, trunca com indicador explicativo `\n\n[... Restante do conteúdo truncado para preservar a janela de contexto ...]`.

### 3.4. Formato de Resposta (JSON)
```json
{
  "url": "https://react.dev/reference/react/use",
  "title": "use – React",
  "content": "use is a React Hook that lets you read the value of a resource like a Promise or context...",
  "length": 8420,
  "truncated": false
}
```

---

## 4. Integração no Frontend (`src/App.tsx`)

### 4.1. Definição da Tool (`FETCH_URL_TOOL`)
```typescript
const FETCH_URL_TOOL = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description:
      'Baixa e extrai o conteúdo textual limpo de uma página web, artigo ou documentação online. ' +
      'Use após `web_search` para ler documentações detalhadas ou quando o usuário fornecer um link direto.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A URL completa e válida (iniciando com http:// ou https://) da página a ser lida.',
        },
      },
      required: ['url'],
    },
  },
};
```

### 4.2. Registro nos Conjuntos de Ferramentas
- Adicionado a `DEFAULT_CHAT_TOOLS` e `ALL_CHAT_TOOLS`.
- Injeção da instrução no system prompt para orientar o modelo a combinar `web_search` e `fetch_url`.

### 4.3. Execução no `executeTool`
- Executa chamada para `/api/fetch-url?url=...` com cabeçalho `x-api-key`.
- Retorna o JSON formatado ou mensagem de erro amigável.

---

## 5. Interface do Usuário (`chat-message.tsx`)

- Identificação do tool call `fetch_url`:
  - Ícone: `Globe` ou `ExternalLink`.
  - Label: "Lendo página: `<hostname>`".
  - Estado de carregamento: badge com efeito de pulso e spinner animado.
  - Estado concluído: indicação do título da página e contagem de caracteres lidos.

---

## 6. Testes e Critérios de Aceite

1. **Compilação Estrita:** `npm run lint` (`tsc --noEmit`) sem erros de tipo.
2. **Build de Produção:** `npm run build` executado com sucesso.
3. **Teste Funcional:** Chamada de `/api/fetch-url?url=https://example.com` retorna o título e o texto sem tags HTML.
4. **Proteção SSRF:** Chamada para `http://localhost:3000` ou `http://127.0.0.1` retorna erro 400 imediato.
