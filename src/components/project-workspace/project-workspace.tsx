import React, { useState, useMemo } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { SynapProject } from '../../lib/types';
import { LocalPreview } from './local-preview';

interface ProjectWorkspaceProps {
  project: SynapProject;
  onClose: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  /** Callback chamado quando o usuário edita arquivos no editor */
  onFileChange?: (path: string, content: string) => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  project,
  onClose,
}) => {
  // Diagnóstico: verifica se o projeto tem conteúdo visível
  const diagnosticInfo = useMemo(() => {
    const files = Object.keys(project.files || {});
    const appTsx = project.files['src/App.tsx'] || project.files['src/App.js'];
    const mainTsx = project.files['src/main.tsx'] || project.files['src/main.js'];
    const indexHtml = project.files['index.html'];
    const pkgJson = project.files['package.json'];

    let appContent = '';
    if (appTsx) {
      appContent = typeof appTsx === 'string' ? appTsx : appTsx.content || '';
    }

    const lastReturnMatch = appContent.match(/return\s+(null|<><\/>|<\s*>\s*<\/\s*>|\(\s*\))/g);
    const appIsEmpty =
      !appContent.trim() ||
      (lastReturnMatch !== null &&
        lastReturnMatch.length === 1 &&
        appContent.trim().endsWith(lastReturnMatch[0]));

    return {
      totalFiles: files.length,
      hasApp: !!appTsx,
      hasMain: !!mainTsx,
      hasIndexHtml: !!indexHtml,
      hasPkgJson: !!pkgJson,
      appIsEmpty,
      appLineCount: appContent.split('\n').length,
      appPreview: appContent.slice(0, 200),
      deps: project.dependencies ? Object.keys(project.dependencies) : [],
      template: project.template,
    };
  }, [project]);

  const [showDiagnostic, setShowDiagnostic] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#09090b] overflow-hidden">
      {/* Preview em tela cheia — sem header, sem footer */}
      <div className="flex-1 min-h-0 relative">
        <LocalPreview project={project} />

        {/* Botão flutuante: fechar (voltar ao chat) */}
        <button
          type="button"
          onClick={onClose}
          title="Fechar preview (voltar ao chat)"
          className="absolute top-3 left-3 z-20 p-2 rounded-xl bg-[color:var(--c-bg-181714,#181714)]/90 hover:bg-[color:var(--c-bg-25231e,#25231e)] text-[color:var(--c-fg-a39d93,#a39d93)] hover:text-[color:var(--c-fg-f3efe6,#f3efe6)] border border-[color:var(--c-bg-2d2b26,#2d2b26)]/80 shadow-lg active:scale-95 transition-all cursor-pointer backdrop-blur-md"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Overlay de Diagnóstico (manual) */}
        {showDiagnostic && (
          <div className="absolute inset-0 z-40 bg-[#0d0c0a]/95 backdrop-blur-sm overflow-y-auto p-3 text-[#f3efe6] text-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Diagnóstico do Preview</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagnostic(false)}
                className="p-1 hover:bg-[#282622] rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-[#22201d] border border-[#3b3831] rounded-lg p-2.5 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-[#8c867a] tracking-wider mb-1">Arquivos do projeto</div>
                <div className="flex justify-between"><span className="text-[#8c867a]">Total de arquivos:</span><span className="font-mono">{diagnosticInfo.totalFiles}</span></div>
                <div className="flex justify-between"><span className="text-[#8c867a]">src/App.tsx:</span><span className={diagnosticInfo.hasApp ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>{diagnosticInfo.hasApp ? `✓ ${diagnosticInfo.appLineCount} linhas` : '✕ ausente'}</span></div>
                <div className="flex justify-between"><span className="text-[#8c867a]">src/main.tsx:</span><span className={diagnosticInfo.hasMain ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>{diagnosticInfo.hasMain ? '✓' : '✕ ausente'}</span></div>
                <div className="flex justify-between"><span className="text-[#8c867a]">index.html:</span><span className={diagnosticInfo.hasIndexHtml ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>{diagnosticInfo.hasIndexHtml ? '✓' : '✕ ausente'}</span></div>
                <div className="flex justify-between"><span className="text-[#8c867a]">package.json:</span><span className={diagnosticInfo.hasPkgJson ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>{diagnosticInfo.hasPkgJson ? '✓' : '✕ ausente'}</span></div>
                <div className="flex justify-between"><span className="text-[#8c867a]">Template:</span><span className="font-mono">{diagnosticInfo.template}</span></div>
              </div>

              {diagnosticInfo.appIsEmpty && (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-2.5 text-amber-200">
                  <div className="font-bold text-amber-300 text-[11px] mb-1">⚠ App.tsx parece estar vazio</div>
                  <div className="text-[10px] leading-relaxed">O App.tsx não retorna nada visível.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
