import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  Copy,
  Check,
  Loader2,
  Wrench,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { DeploymentInfo, fetchDeploymentLogs } from '../../lib/deployment-service';

interface DeploymentLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  deployment: DeploymentInfo | null;
  onFixWithAi?: (errorSnippet: string) => void;
}

export const DeploymentLogModal: React.FC<DeploymentLogModalProps> = ({
  isOpen,
  onClose,
  deployment,
  onFixWithAi,
}) => {
  const [logs, setLogs] = useState<string>('');
  const [errorSnippet, setErrorSnippet] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && deployment?.id) {
      setIsLoading(true);
      fetchDeploymentLogs(deployment.id, deployment.projectName)
        .then((res) => {
          setLogs(res.logs || 'Nenhum log retornado pelo servidor.');
          setErrorSnippet(res.errorSnippet || '');
        })
        .catch((err) => {
          setLogs(`Erro ao buscar logs: ${err?.message || 'Falha de rede'}`);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setLogs('');
      setErrorSnippet('');
    }
  }, [isOpen, deployment?.id, deployment?.projectName]);

  if (!isOpen || !deployment) return null;

  const handleCopy = () => {
    if (!logs) return;
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFix = () => {
    if (onFixWithAi) {
      onFixWithAi(errorSnippet || logs);
      onClose();
    }
  };

  const logLines = logs.split('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-4xl max-h-[85vh] synap-card flex flex-col overflow-hidden bg-[color:var(--c-bg-1c1a17)] border border-[color:var(--c-bg-3b362b)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--c-bg-322f28)] bg-[color:var(--c-bg-24211d)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[color:var(--c-bg-2e2a22)] border border-[color:var(--c-bg-3e392f)] flex items-center justify-center text-[color:var(--c-fg-d97757)] shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-[color:var(--c-fg-f3efe6)] truncate">
                  Logs de Implantação — Cloudflare Pages
                </h3>
                {deployment.status === 'failure' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60">
                    <AlertTriangle className="w-3 h-3" /> Falha no build
                  </span>
                )}
                {deployment.status === 'building' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Compilando
                  </span>
                )}
              </div>
              <p className="text-xs text-[color:var(--c-fg-a69f91)] font-mono truncate">
                Commit: {deployment.commitHash?.slice(0, 7) || deployment.shortId} • {deployment.commitMessage || 'deploy automático'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {deployment.url && (
              <a
                href={deployment.url}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[color:var(--c-fg-c4bfb6)] hover:text-white bg-[color:var(--c-bg-2e2a22)] hover:bg-[color:var(--c-bg-383329)] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ver Site
              </a>
            )}
            <button
              onClick={handleCopy}
              disabled={isLoading || !logs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[color:var(--c-fg-c4bfb6)] hover:text-white bg-[color:var(--c-bg-2e2a22)] hover:bg-[color:var(--c-bg-383329)] transition-colors disabled:opacity-40"
              title="Copiar logs completos"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--c-fg-a69f91)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-2e2a22)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 p-4 overflow-y-auto bg-[#12110f] font-mono text-xs leading-relaxed max-h-[60vh] select-text">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[color:var(--c-fg-a69f91)] gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[color:var(--c-fg-d97757)]" />
              <span>Buscando histórico de logs na Cloudflare Pages...</span>
            </div>
          ) : logLines.length > 0 ? (
            <div className="space-y-0.5">
              {logLines.map((line, idx) => {
                const isError = /error|failed|failure|npm ERR!|syntaxerror/i.test(line);
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 px-2 py-0.5 rounded font-mono ${
                      isError
                        ? 'bg-rose-950/30 text-rose-300 font-semibold'
                        : 'text-[color:var(--c-fg-c4bfb6)] hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className="w-9 text-right text-[color:var(--c-fg-a69f91)]/50 select-none text-[11px] shrink-0">
                      {idx + 1}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{line}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-[color:var(--c-fg-a69f91)]">
              Nenhum log registrado para este build.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[color:var(--c-bg-322f28)] bg-[color:var(--c-bg-24211d)]">
          <div className="text-xs text-[color:var(--c-fg-a69f91)]">
            Total de linhas: <span className="font-mono text-[color:var(--c-fg-f3efe6)]">{logLines.length}</span>
          </div>

          <div className="flex items-center gap-2">
            {deployment.status === 'failure' && onFixWithAi && (
              <button
                onClick={handleFix}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#d97757] hover:bg-[#e08364] text-white shadow-sm hover:shadow active:scale-[0.98] transition-all"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Corrigir Erro com IA</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[color:var(--c-fg-c4bfb6)] hover:text-white bg-[color:var(--c-bg-2e2a22)] hover:bg-[color:var(--c-bg-383329)] transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
