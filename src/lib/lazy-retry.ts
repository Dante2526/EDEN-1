import React from 'react';

/**
 * Identifica se um erro foi causado por um chunk dinâmico desatualizado
 * (ex: novo deploy publicado no Cloudflare Pages enquanto o usuário já estava com a aba aberta).
 */
export function isDynamicChunkError(error: any): boolean {
  if (!error) return false;
  const msg = String(error?.message || error?.reason || error || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed')
  );
}

const RELOAD_STORAGE_KEY = 'synap_dynamic_chunk_reload';

/**
 * Embrulha React.lazy com proteção contra chunks desatualizados após deploys.
 * Quando ocorre erro de módulo dinâmico, força um reload limpo para buscar a nova versão dos assets.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      if (isDynamicChunkError(error) && typeof window !== 'undefined') {
        const lastReload = Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) || 0);
        // Evita loop infinito: só recarrega automaticamente se passou mais de 10 segundos do último reload
        if (Date.now() - lastReload > 10000) {
          sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()));
          console.warn('[Synap] Chunk desatualizado detectado pós-deploy. Recarregando para nova versão...');
          window.location.reload();
          // Retorna uma Promise pendente enquanto o browser recarrega a página
          return new Promise(() => {});
        }
      }
      throw error;
    }
  });
}
