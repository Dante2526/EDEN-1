import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GlobalErrorBoundary } from './components/global-error-boundary';

import { isDynamicChunkError } from './lib/lazy-retry';

// Auto-reload inteligente ao falhar dynamic import de chunk desatualizado pós-deploy
const handleChunkError = (err: any) => {
  if (isDynamicChunkError(err)) {
    const lastReload = Number(sessionStorage.getItem('synap_dynamic_chunk_reload') || 0);
    if (Date.now() - lastReload > 10000) {
      sessionStorage.setItem('synap_dynamic_chunk_reload', String(Date.now()));
      console.warn('[Synap] Novo deploy detectado. Recarregando página para atualizar assets...');
      window.location.reload();
    }
  }
};

// Evento nativo do Vite para falha de preload de assets
window.addEventListener('vite:preloadError', (event) => {
  handleChunkError(event);
});

// Handler global de erros NÃO capturados (erros de Promise, fetch, etc.)
window.addEventListener('error', (event) => {
  handleChunkError(event.error || event.message);
  console.error('[Global Error Handler]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  handleChunkError(event.reason);
  console.error('[Unhandled Promise Rejection]', event.reason);
});

// Register PWA service worker
if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration note:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);
