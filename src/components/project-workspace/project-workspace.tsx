import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackFileExplorer,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackConsole,
  useSandpack,
} from '@codesandbox/sandpack-react';
import {
  X,
  RefreshCw,
  ExternalLink,
  Trash2,
  Edit2,
  Check,
  Loader2,
  FileCode,
  Eye,
  Terminal,
  Files,
  AlertCircle,
  Sparkles,
  Save,
} from 'lucide-react';
import { SynapProject, ProjectTemplate } from '../../lib/types';
import { projectToSandpackFiles } from '../../lib/project-storage';

interface ProjectWorkspaceProps {
  project: SynapProject;
  onClose: () => void;
  onDelete: () => void;
  onRename: (newName: string) => void;
  /** Callback chamado quando o usuário edita arquivos no editor */
  onFileChange?: (path: string, content: string) => void;
}

const TEMPLATE_LABELS: Record<ProjectTemplate, string> = {
  'react-ts': 'React + TypeScript',
  react: 'React + JavaScript',
  'vite-react-ts': 'Vite + React + TS',
  'vanilla-ts': 'Vanilla + TypeScript',
  vanilla: 'Vanilla + JavaScript',
  vue: 'Vue 3',
  static: 'HTML/CSS/JS (estático)',
  node: 'Node.js',
};

type BottomPanel = 'preview' | 'console';

/**
 * Componente invisível que vive dentro do SandpackProvider e observa
 * mudanças nos arquivos. Quando o usuário edita algo no editor, o Sandpack
 * atualiza o `files` no estado interno — aqui nós propagamos isso para o
 * storage do Synap (via onFileChange).
 */
const SandpackSyncListener: React.FC<{
  onFileChange: (path: string, content: string) => void;
  activeFile: string | null;
}> = ({ onFileChange, activeFile }) => {
  const { sandpack } = useSandpack();
  const { files } = sandpack;
  const lastContentRef = React.useRef<Record<string, string>>({});

  useEffect(() => {
    if (!activeFile) return;
    const file = files[activeFile];
    if (!file) return;
    const code = typeof file === 'string' ? file : (file as any).code || '';
    if (code !== lastContentRef.current[activeFile]) {
      lastContentRef.current[activeFile] = code;
      onFileChange(activeFile, code);
    }
  }, [activeFile, files, onFileChange]);

  return null;
};

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  project,
  onClose,
  onDelete,
  onRename,
  onFileChange,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false); // explorer oculto por padrão
  const [showCode, setShowCode] = useState(false); // código oculto por padrão — só preview
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  // Define o arquivo ativo inicial quando o projeto carrega
  useEffect(() => {
    const active = Object.values(project.files).find((f) => f.active);
    if (active) {
      setActiveFilePath(active.path);
    } else {
      // Pega o primeiro arquivo .tsx/.jsx/.ts/.js ou HTML
      const priority = ['src/App.tsx', 'src/App.js', 'src/index.ts', 'src/index.js', 'index.html'];
      const found = priority.find((p) => project.files[p]);
      setActiveFilePath(found || Object.keys(project.files)[0] || null);
    }
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sandpack template name mapping
  const sandpackTemplate = useMemo(() => {
    const map: Record<ProjectTemplate, 'react-ts' | 'react' | 'vanilla-ts' | 'vanilla' | 'vue' | 'static' | 'node' | undefined> = {
      'react-ts': 'react-ts',
      react: 'react',
      'vite-react-ts': 'react-ts', // Sandpack não tem vite isolado, usa react-ts
      'vanilla-ts': 'vanilla-ts',
      vanilla: 'vanilla',
      vue: 'vue',
      static: 'static',
      node: 'node',
    };
    return map[project.template];
  }, [project.template]);

  const sandpackFiles = useMemo(() => projectToSandpackFiles(project), [project]);

  // Atualiza nome quando projeto muda externamente
  useEffect(() => {
    setNameInput(project.name);
  }, [project.id, project.name]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  }, [nameInput, project.name, onRename]);

  // Debounce save status indicator quando arquivos mudam
  useEffect(() => {
    setSaveStatus('saving');
    const t = setTimeout(() => setSaveStatus('saved'), 600);
    return () => clearTimeout(t);
  }, [project.updatedAt]);

  const handleFileChangeInternal = useCallback(
    (path: string, content: string) => {
      onFileChange?.(path, content);
    },
    [onFileChange]
  );

  return (
    <div className="flex flex-col h-full bg-[#181714] text-[#f3efe6] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#2d2a25] bg-[#1d1b18]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#d97757]/20 to-[#d97757]/5 border border-[#d97757]/30 flex items-center justify-center shrink-0">
            <FileCode className="w-3.5 h-3.5 text-[#d97757]" />
          </div>

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') {
                      setNameInput(project.name);
                      setIsRenaming(false);
                    }
                  }}
                  autoFocus
                  className="bg-[#22201d] border border-[#d97757]/60 rounded-md px-2 py-0.5 text-xs text-[#f3efe6] focus:outline-none w-full max-w-xs"
                />
                <button
                  type="button"
                  onClick={handleRenameSubmit}
                  className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                className="group flex items-center gap-1.5 cursor-text min-w-0"
                title="Clique para renomear"
              >
                <span className="text-xs font-medium text-[#f3efe6] truncate">{project.name}</span>
                <Edit2 className="w-3 h-3 text-[#5e5a52] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-[#736e65] font-mono">
              <span>{TEMPLATE_LABELS[project.template]}</span>
              <span>·</span>
              <span>{Object.keys(project.files).length} arquivos</span>
              {saveStatus === 'saving' && (
                <>
                  <span>·</span>
                  <span className="text-amber-500/70 flex items-center gap-0.5">
                    <Save className="w-2.5 h-2.5" /> salvando...
                  </span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <span>·</span>
                  <span className="text-emerald-500/70 flex items-center gap-0.5">
                    <Save className="w-2.5 h-2.5" /> salvo
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle: Preview / Código — estilo Google AI Studio */}
          <div className="flex bg-[#22201d] border border-[#3b3831] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => {
                setShowCode(false);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                !showCode
                  ? 'bg-[#d97757] text-white shadow-sm'
                  : 'text-[#8c867a] hover:text-[#f3efe6]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCode(true);
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                showCode
                  ? 'bg-[#d97757] text-white shadow-sm'
                  : 'text-[#8c867a] hover:text-[#f3efe6]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Código</span>
            </button>
          </div>

          {/* Toggle Explorer (árvore de arquivos) */}
          <button
            type="button"
            onClick={() => setShowExplorer((v) => !v)}
            title={showExplorer ? 'Ocultar arquivos' : 'Mostrar arquivos'}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              showExplorer
                ? 'text-[#d97757] bg-[#282622]'
                : 'text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622]'
            }`}
          >
            <Files className="w-4 h-4" />
          </button>

          {showDeleteConfirm ? (
            <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-800/40 rounded-lg px-1.5 py-0.5">
              <span className="text-[10px] text-rose-300">Apagar?</span>
              <button
                type="button"
                onClick={onDelete}
                className="p-0.5 text-rose-400 hover:text-white"
                aria-label="Confirmar exclusão"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="p-0.5 text-zinc-400 hover:text-white"
                aria-label="Cancelar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              title="Apagar projeto"
              className="p-1.5 rounded-lg text-[#8c867a] hover:text-rose-400 hover:bg-[#3a1d1d] transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Fechar projeto (voltar ao chat)"
            className="p-1.5 rounded-lg text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sandpack Workspace */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SandpackProvider
          template={sandpackTemplate}
          files={sandpackFiles}
          theme="dark"
          options={{
            recompileMode: 'delayed',
            recompileDelay: 300,
            classes: {
              'sp-wrapper': '!bg-[#181714]',
              'sp-layout': '!bg-[#181714] !border-0 !rounded-none',
              'sp-stack': '!bg-[#181714]',
            },
          }}
          customSetup={{
            dependencies: project.dependencies,
          }}
        >
          <SandpackLayout
            style={{
              '--sp-layout-height': '100%',
              '--sp-colors-surface1': '#181714',
              '--sp-colors-surface2': '#1f1d19',
              '--sp-colors-surface3': '#282622',
              '--sp-colors-disabled': '#5e5a52',
              '--sp-colors-error': '#ef4444',
              '--sp-colors-errorSurface': '#3a1d1d',
              '--sp-font-body': 'Inter, ui-sans-serif, system-ui',
              '--sp-font-mono': 'JetBrains Mono, ui-monospace, monospace',
              '--sp-font-size': '12px',
              '--sp-space-1': '4px',
              '--sp-space-2': '8px',
              '--sp-space-3': '12px',
              '--sp-space-4': '16px',
              '--sp-border-radius': '6px',
            } as React.CSSProperties}
            className="!h-full !w-full !border-0 !rounded-none"
          >
            {showExplorer && (
              <SandpackFileExplorer className="!w-[180px] shrink-0" />
            )}

            {showCode && (
              <SandpackCodeEditor
                showLineNumbers
                showInlineErrors
                showTabs
                closableTabs
                className="!flex-1 !min-w-0"
              />
            )}

            {/* Listener invisível que sincroniza mudanças do Sandpack com o storage do Synap */}
            <SandpackSyncListener
              onFileChange={handleFileChangeInternal}
              activeFile={activeFilePath}
            />

            {!showCode && (
              <div className="!flex-1 !min-w-0 flex flex-col bg-[#181714] min-h-0">
                {/* Preview — ocupa a maior parte */}
                <div className="flex-1 min-h-0 overflow-hidden border-b border-[#2d2a25] relative">
                  <SandpackPreview
                    showOpenInCodeSandbox={false}
                    showRefreshButton
                    className="!h-full"
                  />
                </div>

                {/* Console — barra inferior fixa (mostra erros de compilação) */}
                <div className="h-32 shrink-0 overflow-hidden bg-[#0d0c0a] border-t border-[#2d2a25]">
                  <div className="flex items-center justify-between px-2 py-1 bg-[#1d1b18] border-b border-[#2d2a25]">
                    <div className="flex items-center gap-1 text-[10px] text-[#8c867a] font-mono">
                      <Terminal className="w-3 h-3 text-[#d97757]" />
                      <span>Console</span>
                    </div>
                    <span className="text-[9px] text-[#5e5a52] font-mono flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-[#d97757]" /> Live
                    </span>
                  </div>
                  <div className="h-[calc(100%-28px)] overflow-y-auto">
                    <SandpackConsole
                      showHeader={false}
                      showSyntaxError
                      className="!h-full !min-h-0"
                    />
                  </div>
                </div>
              </div>
            )}
          </SandpackLayout>
        </SandpackProvider>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between gap-2 px-3 py-1 border-t border-[#2d2a25] bg-[#1d1b18] text-[10px] text-[#5e5a52]">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" />
          <span>
            Edite os arquivos e o preview atualiza sozinho (~300ms).
          </span>
        </div>
        <span className="font-mono">
          {project.id.slice(0, 16)} · atualizado{' '}
          {new Date(project.updatedAt).toLocaleString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
};
