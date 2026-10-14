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
  ChevronDown,
} from 'lucide-react';
import { SynapProject, ProjectTemplate } from '../../lib/types';
import { projectToSandpackFiles } from '../../lib/project-storage';
import { LocalPreview } from './local-preview';

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
 * Componente que detecta erros de compilação do Sandpack e mostra
 * automaticamente em overlay. Quando o preview fica preto, é porque
 * deu erro de compilação ou o bundler não conectou — esse componente
 * pega o erro e mostra.
 */
const SandpackErrorWatcher: React.FC<{
  onError: (error: string | null) => void;
  onConnectionFail?: () => void;
}> = ({ onError, onConnectionFail }) => {
  const { sandpack } = useSandpack();
  const { error, status } = sandpack;
  const initialTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sandpack popula `error` quando há erro de compilação
    if (error) {
      const errorMsg = typeof error === 'string'
        ? error
        : (error as any)?.message || JSON.stringify(error);
      onError(errorMsg);
    } else if (status === 'running') {
      // Compilou sem erro — limpa
      onError(null);
    }

    // Detecta "Couldn't connect to server" — status fica em 'initial' demais
    // ou o erro contém "connect to server"
    if (status === 'initial') {
      // Se ficar em initial mais de 15s, provavelmente o bundler caiu
      if (initialTimerRef.current) clearTimeout(initialTimerRef.current);
      initialTimerRef.current = setTimeout(() => {
        if (onConnectionFail) onConnectionFail();
      }, 15000);
    } else {
      if (initialTimerRef.current) {
        clearTimeout(initialTimerRef.current);
        initialTimerRef.current = null;
      }
    }

    // Erro explícito de conexão
    const errorStr = typeof error === 'string' ? error : (error as any)?.message || '';
    if (errorStr && errorStr.includes('connect to server')) {
      if (onConnectionFail) onConnectionFail();
    }
  }, [error, status, onError, onConnectionFail]);

  useEffect(() => {
    return () => {
      if (initialTimerRef.current) clearTimeout(initialTimerRef.current);
    };
  }, []);

  return null;
};

/**
 * Componente que abre o preview do Sandpack em nova aba (tela cheia).
 * Vive dentro do SandpackProvider pra ter acesso ao bundler URL.
 */
const OpenInNewTabButton: React.FC = () => {
  const { sandpack } = useSandpack();
  const { status } = sandpack;

  const handleOpen = () => {
    // O Sandpack gera um sandbox URL quando compila
    // Usamos o iframe do preview pra pegar a URL compilada
    const iframe = document.querySelector('.sp-preview-iframe') as HTMLIFrameElement | null;
    if (iframe?.src) {
      window.open(iframe.src, '_blank', 'noopener,noreferrer');
    }
  };

  if (status !== 'running') return null;

  return (
    <button
      type="button"
      onClick={handleOpen}
      title="Abrir preview em tela cheia (nova aba)"
      className="p-1.5 rounded-lg text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622] transition cursor-pointer"
    >
      <ExternalLink className="w-3.5 h-3.5" />
    </button>
  );
};

/**
 * Gera um link pra CodeSandbox com os arquivos do projeto.
 * CodeSandbox tem bundler próprio — não depende do servidor do Sandpack.
 * Usado como fallback quando o Sandpack não conecta.
 */
function buildCodeSandboxUrl(
  files: Record<string, { code: string }>,
  template: string,
  dependencies?: Record<string, string>
): string {
  // CodeSandbox API: POST pra /api/v1/sandboxes/define
  // Mas pra simplicidade, usamos o formato GET com parameters JSON
  const sandboxFiles: Record<string, { content: string }> = {};
  for (const [path, file] of Object.entries(files)) {
    sandboxFiles[path] = { content: file.code };
  }

  const parameters = {
    files: sandboxFiles,
    template: template === 'react-ts' ? 'create-react-app-typescript' : template,
    dependencies: dependencies || {},
  };

  // CodeSandbox usa query param `parameters` com JSON comprimido
  // Pra simplificar, usamos JSON direto (sem compressão lz-string)
  // Formato: https://codesandbox.io/api/v1/sandboxes/define?parameters=ENCODED_JSON
  const json = JSON.stringify(parameters);
  // Base64 + URL encode
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return `https://codesandbox.io/api/v1/sandboxes/define?parameters=${encodeURIComponent(encoded)}&embed=true&runonclick=1`;
}

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
  const [showConsole, setShowConsole] = useState(false); // console colapsado por padrão
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

    // Heurísticas pra detectar App vazio
    // Só checa o ÚLTIMO return do arquivo (return do componente principal)
    // Antes checava ANY 'return null' no arquivo inteiro → falso positivo
    // em arquivos com funções auxiliares que usam return null
    const lastReturnMatch = appContent.match(/return\s+(null|<><\/>|<><\/>|<\s*>\s*<\/\s*>|\(\s*\))/g);
    const appIsEmpty = !appContent.trim() ||
      (lastReturnMatch !== null && lastReturnMatch.length === 1 && appContent.trim().endsWith(lastReturnMatch[0]));

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
  const [compileError, setCompileError] = useState<string | null>(null);
  const [connectionFailed, setConnectionFailed] = useState(false);

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
    <div className="flex flex-col h-full bg-[#181714] overflow-hidden">
      {/* Preview em tela cheia — sem header, sem footer */}
      <div className="flex-1 min-h-0 relative">
        <LocalPreview project={project} />

        {/* Botão flutuante mínimo: fechar (voltar ao chat) */}
        <button
          type="button"
          onClick={onClose}
          title="Fechar preview (voltar ao chat)"
          className="absolute top-2 left-2 z-20 p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition cursor-pointer backdrop-blur-sm"
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

              <div className="bg-[#22201d] border border-[#3b3831] rounded-lg p-2.5">
                <div className="text-[10px] uppercase font-bold text-[#8c867a] tracking-wider mb-1.5">Dependencies ({diagnosticInfo.deps.length})</div>
                {diagnosticInfo.deps.length === 0 ? (
                  <div className="text-[10px] text-[#5e5a52]">Nenhuma dependency extra</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {diagnosticInfo.deps.map((d) => (
                      <span key={d} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#0d0c0a] text-[#a39d93] border border-[#3b3831]">{d}</span>
                    ))}
                  </div>
                )}
              </div>

              {diagnosticInfo.hasApp && (
                <div className="bg-[#22201d] border border-[#3b3831] rounded-lg p-2.5">
                  <div className="text-[10px] uppercase font-bold text-[#8c867a] tracking-wider mb-1.5">Início do App.tsx (200 chars)</div>
                  <pre className="text-[10px] text-[#a39d93] font-mono whitespace-pre-wrap break-all bg-[#0d0c0a] p-2 rounded border border-[#2d2a25] max-h-32 overflow-y-auto">{diagnosticInfo.appPreview || '(vazio)'}</pre>
                </div>
              )}

              <div className="bg-[#22201d] border border-[#3b3831] rounded-lg p-2.5">
                <div className="text-[10px] uppercase font-bold text-[#8c867a] tracking-wider mb-1.5">Todos os arquivos</div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {Object.keys(project.files).map((p) => (
                    <span key={p} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#0d0c0a] text-[#5e5a52] border border-[#2d2a25]">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
