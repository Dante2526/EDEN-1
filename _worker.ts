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
import dbProjectsHandler from './api/db-projects';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

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
      if (path === '/api/opencut-proxy' || path.startsWith('/api/opencut-proxy/')) {
        return await opencutProxyHandler(request, env);
      }
      if (path === '/api/browser' || path === '/api/browser/') {
        return await browserHandler(request, env);
      }
      if (path === '/api/db-projects' || path === '/api/db-projects/') {
        return await dbProjectsHandler(request, env);
      }

      if (path.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: `Endpoint não encontrado: ${path}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status === 200) {
          return assetRes;
        }
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
