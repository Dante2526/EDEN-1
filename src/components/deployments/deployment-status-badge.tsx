import React from 'react';
import {
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Cloud,
} from 'lucide-react';
import { DeploymentInfo } from '../../lib/deployment-service';

interface DeploymentStatusBadgeProps {
  deployment: DeploymentInfo | null;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export const DeploymentStatusBadge: React.FC<DeploymentStatusBadgeProps> = ({
  deployment,
  isLoading = false,
  onClick,
  className = '',
}) => {
  if (!deployment && !isLoading) {
    return null;
  }

  const status = deployment?.status || 'idle';
  const shortSha = deployment?.commitHash?.slice(0, 7) || deployment?.shortId || '';

  // Renderização customizada por status (sem bolinhas genéricas, icon-only compacto como no mobile)
  if (isLoading || status === 'building') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Status do deploy: compilação em andamento (${shortSha})`}
        className={`p-1.5 rounded-lg border text-xs font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer select-none flex items-center justify-center bg-amber-100/90 dark:bg-amber-950/40 border-amber-300/80 dark:border-amber-600/30 text-amber-900 dark:text-amber-300 shadow-xs hover:bg-amber-200/90 dark:hover:bg-amber-900/40 hover:border-amber-400 dark:hover:border-amber-500/50 ${className}`}
        title={`Cloudflare Pages: compilação em andamento (${shortSha}). Clique para ver logs.`}
      >
        <CloudUpload className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400 animate-pulse shrink-0" />
      </button>
    );
  }

  if (status === 'failure') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Status do deploy: falhou"
        className={`p-1.5 rounded-lg border text-xs font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer select-none flex items-center justify-center bg-rose-100/90 dark:bg-rose-950/50 border-rose-300/80 dark:border-rose-600/40 text-rose-900 dark:text-rose-300 shadow-xs hover:bg-rose-200/90 dark:hover:bg-rose-900/50 hover:border-rose-400 dark:hover:border-rose-500/60 ${className}`}
        title="O build da Cloudflare Pages falhou! Clique para inspecionar os logs de erro."
      >
        <AlertTriangle className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
      </button>
    );
  }

  if (status === 'success') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Status do deploy: ativo (${shortSha})`}
        className={`p-1.5 rounded-lg border text-xs font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer select-none flex items-center justify-center bg-emerald-100/90 dark:bg-emerald-950/30 border-emerald-300/80 dark:border-emerald-600/30 text-emerald-900 dark:text-emerald-300 shadow-xs hover:bg-emerald-200/90 dark:hover:bg-emerald-900/30 hover:border-emerald-400 dark:hover:border-emerald-500/40 ${className}`}
        title={`Deploy ativo na Cloudflare Pages (${shortSha}). Clique para ver logs.`}
      >
        <CheckCircle2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Status do deploy: inativo"
      className={`p-1.5 rounded-lg border text-xs font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer select-none flex items-center justify-center bg-[color:var(--c-bg-24211d)] border border-[color:var(--c-bg-3e392f)] text-zinc-700 dark:text-[color:var(--c-fg-a69f91)] shadow-xs hover:text-zinc-950 dark:hover:text-[color:var(--c-fg-f3efe6)] ${className}`}
      title="Status de deploy na Cloudflare Pages. Clique para ver logs."
    >
      <Cloud className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
    </button>
  );
};
