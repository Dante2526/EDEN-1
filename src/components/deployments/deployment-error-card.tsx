import React from 'react';
import {
  AlertTriangle,
  Terminal,
  Wrench,
  X,
  GitCommit,
  ExternalLink,
} from 'lucide-react';
import { DeploymentInfo } from '../../lib/deployment-service';

interface DeploymentErrorCardProps {
  deployment: DeploymentInfo;
  onViewLogs: () => void;
  onFixWithAi: (errorSnippet: string) => void;
  onDismiss?: () => void;
}

export const DeploymentErrorCard: React.FC<DeploymentErrorCardProps> = ({
  deployment,
  onViewLogs,
  onFixWithAi,
  onDismiss,
}) => {
  const shortSha = deployment.commitHash?.slice(0, 7) || deployment.shortId;

  return (
    <div className="w-full my-3 synap-card border-rose-500/30 bg-[color:var(--c-bg-241f1d)] overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-rose-950/40 border-b border-rose-800/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-rose-900/50 border border-rose-700/60 flex items-center justify-center text-rose-300 shrink-0 shadow-xs">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-rose-200 truncate">
              Falha na Implantação da Cloudflare Pages
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-rose-300/80 font-mono">
              <span className="flex items-center gap-1">
                <GitCommit className="w-3 h-3" />
                {shortSha}
              </span>
              {deployment.branch && (
                <span>• {deployment.branch}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {deployment.url && (
            <a
              href={deployment.url}
              target="_blank"
              rel="noreferrer"
              className="p-1 text-rose-300/70 hover:text-rose-100 hover:bg-rose-900/40 rounded transition-colors"
              title="Abrir URL do deploy"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 text-rose-300/70 hover:text-rose-100 hover:bg-rose-900/40 rounded transition-colors"
              title="Dispensar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error Details */}
      <div className="p-4 space-y-3">
        <p className="text-xs text-[color:var(--c-fg-c4bfb6)] leading-relaxed">
          O build disparado pelo último commit falhou durante a compilação no Cloudflare Pages.
          Você pode auditar o log do terminal ou acionar a IA para diagnosticar e aplicar a solução.
        </p>

        {deployment.errorSnippet && (
          <div className="rounded-xl overflow-hidden border border-[color:var(--c-bg-3e392f)] bg-[#12110f] p-3 font-mono text-xs">
            <div className="text-[10px] uppercase tracking-wider text-rose-400 font-bold mb-1 flex items-center gap-1.5 select-none">
              <Terminal className="w-3 h-3" />
              Trecho da Falha
            </div>
            <pre className="text-rose-300 whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto select-text font-mono text-[11px]">
              {deployment.errorSnippet}
            </pre>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
          <button
            onClick={onViewLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[color:var(--c-fg-c4bfb6)] hover:text-white bg-[color:var(--c-bg-2e2a22)] hover:bg-[color:var(--c-bg-383329)] border border-[color:var(--c-bg-3e392f)] transition-colors active:scale-[0.98]"
          >
            <Terminal className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
            <span>Ver Logs do Build</span>
          </button>

          <button
            onClick={() => onFixWithAi(deployment.errorSnippet || 'Build failed on Cloudflare Pages')}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#d97757] hover:bg-[#e08364] text-white shadow-md hover:shadow-lg active:scale-[0.97] transition-all"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Corrigir Erro com IA</span>
          </button>
        </div>
      </div>
    </div>
  );
};
