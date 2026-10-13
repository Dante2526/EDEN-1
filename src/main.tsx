import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GlobalErrorBoundary } from './components/global-error-boundary';

// Handler global de erros NÃO capturados (erros de Promise, fetch, etc.)
// Captura erros que escapam de try/catch e exibe no console + num alerta visual.
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler]', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);
  // Não importa se é erro de fetch/network — só loga no console
  // pra não spammar o usuário com alerts pra cada request falhado
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
