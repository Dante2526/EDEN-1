// ===========================================================================
// Synap — Cloudflare Pages Advanced Mode Worker
// ===========================================================================
//
// Este arquivo é o entrypoint do Worker no Cloudflare Pages. Ele intercepta
// APENAS as requisições /api/* (configurado via _routes.json) e roteia para
// o handler apropriado em api/*.ts. Tudo o resto (HTML, JS, CSS, imagens,
// fonts, SW) é servido diretamente pelo CDN do Pages sem passar por aqui.
//
// Cada handler foi adaptado para a assinatura (req: Request, env?: Env) onde
// `env` são os bindings do CF (variáveis de ambiente + ASSETS). Quando `env`
// é undefined (dev local via server.ts), o handler cai pra `process.env`
// através do helper getEnv() em lib/server/env.ts.
//
// Docs: https://developers.cloudflare.com/pages/functions/advanced-mode/
// ===========================================================================

import { Env } from './lib/server/env';
import chatHandler from './api/chat';
import chatTestHandler from './api/chat-test';
import downloadHandler from './api/download';
import fetchUrlHandler from './api/fetch-url';
import githubHandler from './api/github';
import imageHandler from './api/image';
import inpaintHandler from './api/inpaint';
import opencutProxyHandler from './api/opencut-proxy';
import searchHandler from './api/search';
import statusHandler from './api/status';
import ttsHandler from './api/tts';
import transcribeHandler from './api/transcribe';
import deploymentsHandler from './api/deployments';
import browserHandler from './api/browser';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ====== Roteamento /api/* ======
    // Usamos startsWith com '/' no final pra casar exato ("/api/chat") e
    // também subpaths (ex.: "/api/github?action=user" tem path "/api/github").
    try {
      if (path === '/api/chat' || path === '/api/chat/') {
        return await chatHandler(request, env);
      }
      if (path === '/api/chat-test' || path === '/api/chat-test/') {
        return await chatTestHandler(request, env);
      }
      if (path === '/api/download' || path === '/api/download/') {
        return await downloadHandler(request, env);
      }
      if (path === '/api/fetch-url' || path === '/api/fetch-url/') {
        return await fetchUrlHandler(request, env);
      }
      if (path === '/api/github' || path === '/api/github/') {
        return await githubHandler(request, env);
      }
      if (path === '/api/inpaint' || path === '/api/inpaint/') {
        return await inpaintHandler(request, env);
      }
      if (path === '/api/image' || path === '/api/image/') {
        return await imageHandler(request, env);
      }
      if (path === '/api/search' || path === '/api/search/') {
        return await searchHandler(request, env);
      }
      if (path === '/api/status' || path === '/api/status/') {
        return await statusHandler(request, env);
      }
      if (path === '/api/tts' || path === '/api/tts/') {
        return await ttsHandler(request, env);
      }
      if (path === '/api/transcribe' || path === '/api/transcribe/') {
        return await transcribeHandler(request, env);
      }
      if (path === '/api/deployments' || path === '/api/deployments/') {
        return await deploymentsHandler(request, env);
      }
      // OpenCut proxy com tradução PT-BR injetada — aceita subpaths
      // (/api/opencut-proxy/projects, /api/opencut-proxy/_next/..., etc)
      if (path === '/api/opencut-proxy' || path.startsWith('/api/opencut-proxy/')) {
        return await opencutProxyHandler(request, env);
      }
      if (path === '/api/browser' || path === '/api/browser/') {
        return await browserHandler(request, env);
      }

      // /api/* que não casa com nenhuma rota conhecida — 404 JSON (não cair no SPA fallback)
      if (path.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: `Endpoint não encontrado: ${path}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // ====== Fallback: static assets (HTML/JS/CSS/etc) ======
      // No CF Pages Advanced Mode, o binding ASSETS faz o fetch do asset
      // estático correspondente (servido do diretório `dist/` configurado
      // no dashboard do Pages). Para SPA, se o asset não existir, fazemos
      // fallback pra /index.html (igual ao vercel.json fazia).
      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        // Se o asset existe (200), retorna direto.
        if (assetRes.status === 200) {
          return assetRes;
        }
        // 404 em asset: se for rota de navegação do SPA (sem extensão), reescreve pra /index.html.
        // Se for asset estático com extensão (.js, .css, .png, etc.), retorna 404 real
        // para evitar SyntaxError "Unexpected token '<'" no navegador.
        if (assetRes.status === 404) {
          const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(path);
          if (hasFileExtension) {
            return assetRes;
          }
          const indexReq = new Request(new URL('/', url).toString(), request);
          return env.ASSETS.fetch(indexReq);
        }
        return assetRes;
      }

      // Sem ASSETS binding (dev local cai aqui antes de envolver o server.ts).
      return new Response('ASSETS binding não configurado.', { status: 500 });
    } catch (err: any) {
      console.error('[worker] Uncaught error:', err);
      return new Response(
        JSON.stringify({ error: err?.message || 'Erro interno no Worker.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
