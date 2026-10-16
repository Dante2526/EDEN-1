import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Shared API handlers (Single Source of Truth for local Express, Vercel, e CF Pages)
import statusHandler from './api/status';
import chatHandler from './api/chat';
import ttsHandler from './api/tts';
import githubHandler from './api/github';
import searchHandler from './api/search';
import fetchUrlHandler from './api/fetch-url';
import downloadHandler from './api/download';
import transcribeHandler from './api/transcribe';
import deploymentsHandler from './api/deployments';
import { Env } from './lib/server/env';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable raw body parsing to avoid double JSON serialization in adapter
app.use(express.raw({ type: '*/*', limit: '30mb' }));

/**
 * Adapter que converte Express (req, res) → Web Standard (Request → Response).
 * Monta um objeto `env` a partir de `process.env` (dev local) e passa como
 * segundo argumento pro handler — mesma assinatura que o CF Pages usa.
 */
function adaptWebHandler(handler: (req: Request, env?: Env) => Promise<Response>) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const protocol = req.protocol || 'http';
      const host = req.get('host') || `localhost:${PORT}`;
      const url = `${protocol}://${host}${req.originalUrl || req.url}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'content-length' || lowerKey === 'host' || lowerKey === 'connection') continue;

        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }

      const method = req.method.toUpperCase();
      const controller = new AbortController();
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (method !== 'GET' && method !== 'HEAD') {
        if (Buffer.isBuffer(req.body)) {
          init.body = req.body as unknown as BodyInit;
        } else if (req.body && typeof req.body === 'object') {
          init.body = JSON.stringify(req.body);
        } else if (typeof req.body === 'string') {
          init.body = req.body;
        }
      }

      const webReq = new Request(url, init);
      // Monta Env a partir de process.env (dev local). Em produção no CF Pages,
      // o _worker.ts passa o env real do binding — aqui em dev é só um snapshot.
      const env: Env = {
        NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        GITHUB_PAT: process.env.GITHUB_PAT,
        SYNAP_API_SECRET: process.env.SYNAP_API_SECRET,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
        KV_REST_API_URL: process.env.KV_REST_API_URL,
        KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
      };
      const webRes = await handler(webReq, env);

      res.status(webRes.status);
      webRes.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value);
        }
      });

      if (!webRes.body) {
        res.end();
        return;
      }

      const reader = webRes.body.getReader();
      res.on('close', () => {
        if (!res.writableEnded) {
          controller.abort();
          reader.cancel().catch(() => {});
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(value)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
      res.end();
    } catch (err: any) {
      console.error('API Error in handler adapter:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Erro interno no servidor.' });
      } else {
        res.end();
      }
    }
  };
}

// Routes wired directly to single-source handlers
app.all('/api/status', adaptWebHandler(statusHandler));
app.all('/api/chat', adaptWebHandler(chatHandler));
app.all('/api/tts', adaptWebHandler(ttsHandler));
app.all('/api/github', adaptWebHandler(githubHandler));
app.all('/api/search', adaptWebHandler(searchHandler));
app.all('/api/fetch-url', adaptWebHandler(fetchUrlHandler));
app.all('/api/download', adaptWebHandler(downloadHandler));
app.all('/api/transcribe', adaptWebHandler(transcribeHandler));
app.all('/api/deployments', adaptWebHandler(deploymentsHandler));

// Fallback explícito para rotas de API inexistentes (evita retornar HTML do SPA)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint da API não encontrado' });
});

// Setup Vite middleware in dev or serve static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // SPA Fallback usando app.use para evitar problemas com Express 5 wildcard (* ou /{*splat})
    app.use((req, res, next) => {
      if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
      } else {
        next();
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NVIDIA NIM Chat Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
