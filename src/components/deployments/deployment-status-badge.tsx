import React from 'react';
import {
  CloudUpload,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  Loader2,
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

  // Renderização customizada por status (sem bolinhas genéricas)
  if (isLoading || status === 'building') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-amber-950/40 border border-amber-600/30 text-amber-300 shadow-xs hover:bg-amber-900/40 hover:border-amber-500/50 transition-all cursor-pointer ${className}`}
        title={`Cloudflare Pages: compilação em andamento (${shortSha})`}
      >
        <CloudUpload className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        <span className="hidden sm:inline font-mono text-[11px]">Deploy:</span>
        <span className="font-semibold text-[11px]">Compilando...</span>
      </button>
    );
  }

  if (status === 'failure') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-rose-950/50 border border-rose-600/40 text-rose-300 shadow-xs hover:bg-rose-900/50 hover:border-rose-500/60 transition-all cursor-pointer ${className}`}
        title="O build da Cloudflare Pages falhou! Clique para inspecionar os logs de erro."
      >
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
        <span className="hidden sm:inline font-mono text-[11px]">Deploy:</span>
        <span className="font-semibold text-[11px]">Falha</span>
      </button>
    );
  }

  if (status === 'success') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-emerald-950/30 border border-emerald-600/30 text-emerald-300 shadow-xs hover:bg-emerald-900/30 hover:border-emerald-500/40 transition-all cursor-pointer ${className}`}
        title={`Deploy ativo na Cloudflare Pages: ${shortSha}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="hidden sm:inline font-mono text-[11px]">Deploy:</span>
        <span className="font-semibold text-[11px]">No ar</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-[color:var(--c-bg-24211d)] border border-[color:var(--c-bg-3e392f)] text-[color:var(--c-fg-a69f91)] shadow-xs hover:text-[color:var(--c-fg-f3efe6)] transition-all cursor-pointer ${className}`}
      title="Status de deploy na Cloudflare Pages"
    >
      <Cloud className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
      <span className="font-semibold text-[11px]">Cloudflare</span>
    </button>
  );
};
