import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  GitBranch,
  Loader2,
  X,
  FileCode,
  ArrowLeft,
  Copy,
  Check,
} from 'lucide-react';
import { ActiveRepoState, GitHubFileItem } from '../../lib/types';
import {
  fetchRepoBranches,
  fetchRepoContents,
  fetchFileContent,
} from '../../lib/github';
import { formatFileSize } from '../../lib/utils';

interface FileExplorerProps {
  activeRepo: ActiveRepoState;
  onCloseRepo: () => void;
  onChangeBranch: (branch: string) => void;
  onBackToRepoList: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  activeRepo,
  onCloseRepo,
  onChangeBranch,
  onBackToRepoList,
}) => {
  const [branches, setBranches] = useState<string[]>([]);
  const [fileTree, setFileTree] = useState<GitHubFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, GitHubFileItem[]>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});

  // File Preview state
  const [viewingFile, setViewingFile] = useState<{ path: string; content: string } | null>(null);
  const [loadingFileContent, setLoadingFileContent] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load branches and root files
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchRepoBranches(null, activeRepo.owner, activeRepo.repo),
      fetchRepoContents(null, activeRepo.owner, activeRepo.repo, '', activeRepo.branch),
    ])
      .then(([bList, rootContents]) => {
        if (!mounted) return;
        setBranches(bList.length > 0 ? bList : [activeRepo.branch]);
        setFileTree(rootContents);
        setExpandedFolders({});
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load repo files:', err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeRepo.owner, activeRepo.repo, activeRepo.branch]);

  const toggleFolder = async (folderPath: string) => {
    if (expandedFolders[folderPath]) {
      // Collapse
      const next = { ...expandedFolders };
      delete next[folderPath];
      setExpandedFolders(next);
      return;
    }

    // Expand & fetch subcontents
    setLoadingFolders((prev) => ({ ...prev, [folderPath]: true }));
    try {
      const contents = await fetchRepoContents(
        null,
        activeRepo.owner,
        activeRepo.repo,
        folderPath,
        activeRepo.branch
      );
      setExpandedFolders((prev) => ({ ...prev, [folderPath]: contents }));
    } catch (err) {
      console.error(`Failed to expand folder ${folderPath}:`, err);
    } finally {
      setLoadingFolders((prev) => ({ ...prev, [folderPath]: false }));
    }
  };

  const handleOpenFile = async (filePath: string) => {
    setLoadingFileContent(true);
    try {
      const content = await fetchFileContent(
        null,
        activeRepo.owner,
        activeRepo.repo,
        filePath,
        activeRepo.branch
      );
      setViewingFile({ path: filePath, content });
    } catch (err: any) {
      console.error(`Failed to read file ${filePath}:`, err);
    } finally {
      setLoadingFileContent(false);
    }
  };

  const handleCopyContent = async () => {
    if (!viewingFile) return;
    try {
      await navigator.clipboard.writeText(viewingFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // Render tree node recursive
  const renderItems = (items: GitHubFileItem[], depth = 0) => {
    return items.map((item) => {
      const isDir = item.type === 'dir';
      const isExpanded = Boolean(expandedFolders[item.path]);
      const isFolderLoading = Boolean(loadingFolders[item.path]);

      return (
        <div key={item.path}>
          <div
            onClick={() => (isDir ? toggleFolder(item.path) : handleOpenFile(item.path))}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
            className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-[color:var(--c-bg-262420)] text-xs font-mono text-[color:var(--c-fg-c4bfb6)] hover:text-[color:var(--c-fg-f3efe6)] transition cursor-pointer select-none"
          >
            {isDir ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-[color:var(--c-fg-736e65)]" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-[color:var(--c-fg-736e65)]" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="w-3" />
                <FileText className="w-3.5 h-3.5 text-[color:var(--c-fg-8c867a)] shrink-0" />
              </>
            )}
            <span className="truncate flex-1">{item.name}</span>
            {isFolderLoading && <Loader2 className="w-3 h-3 animate-spin text-[color:var(--c-fg-d97757)] shrink-0" />}
          </div>

          {/* Render children if expanded */}
          {isDir && isExpanded && expandedFolders[item.path] && (
            <div>{renderItems(expandedFolders[item.path], depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[color:var(--c-bg-181714)] text-[color:var(--c-fg-f3efe6)] select-none overflow-hidden">
      {/* Top Header */}
      <div className="p-3 border-b border-[color:var(--c-bg-2d2a25)] bg-[color:var(--c-bg-1d1b18)] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBackToRepoList}
            title="Voltar para lista de repositórios"
            className="p-1 rounded text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-xs font-semibold text-[color:var(--c-fg-f3efe6)] truncate">
              {activeRepo.fullName}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onCloseRepo}
          title="Fechar repositório"
          className="p-1 rounded text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-fg-f3efe6)] hover:bg-[color:var(--c-bg-282622)] text-[11px] transition cursor-pointer"
        >
          Fechar
        </button>
      </div>

      {/* Branch selector */}
      <div className="px-3 py-2 border-b border-[color:var(--c-bg-2d2a25)] bg-[color:var(--c-bg-1a1915)] flex items-center gap-2">
        <GitBranch className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)] shrink-0" />
        <select
          value={activeRepo.branch}
          onChange={(e) => onChangeBranch(e.target.value)}
          className="flex-1 bg-[color:var(--c-bg-13120f)] border border-[color:var(--c-bg-3b3831)] rounded-lg px-2 py-1 text-xs text-[color:var(--c-fg-f3efe6)] font-mono focus:outline-hidden focus:border-[#d97757] cursor-pointer"
        >
          {branches.map((b, idx) => {
            // Defesa: se vier objeto do backend (bug antigo), extrai o name
            const raw = b as unknown as { name?: string } | string;
            const branchName = typeof raw === 'string' ? raw : (raw?.name || `branch-${idx}`);
            return (
              <option key={branchName} value={branchName}>
                {branchName}
              </option>
            );
          })}
        </select>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2 text-[color:var(--c-fg-8c867a)]">
            <Loader2 className="w-4 h-4 animate-spin text-[color:var(--c-fg-d97757)]" />
            <span className="text-xs">Carregando árvore de arquivos...</span>
          </div>
        ) : fileTree.length === 0 ? (
          <div className="text-center py-8 text-xs text-[color:var(--c-fg-8c867a)]">
            Repositório vazio ou nenhum arquivo encontrado nesta branch.
          </div>
        ) : (
          renderItems(fileTree)
        )}
      </div>

      {/* File Viewer Modal (Read-Only) */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in">
          <div className="w-full max-w-4xl h-[88vh] rounded-2xl bg-[color:var(--c-bg-1d1b18)] border border-[color:var(--c-bg-3b3831)] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[color:var(--c-bg-312f2a)] bg-[color:var(--c-bg-23211d)] flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileCode className="w-4 h-4 text-[color:var(--c-fg-d97757)] shrink-0" />
                <span className="font-mono text-xs text-[color:var(--c-fg-f3efe6)] truncate font-medium">
                  {viewingFile.path}
                </span>
                <span className="text-[10px] font-mono text-[color:var(--c-fg-8c867a)] hidden sm:inline">
                  ({formatFileSize(new Blob([viewingFile.content]).size)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyContent}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--c-fg-c4bfb6)] hover:text-[color:var(--c-fg-f3efe6)] bg-[color:var(--c-bg-2d2a24)] hover:bg-[color:var(--c-bg-38342d)] transition cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingFile(null)}
                  className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2e2b26)] hover:bg-[color:var(--c-bg-38352f)] text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] transition flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-[color:var(--c-bg-141311)]">
              <pre className="font-mono text-xs text-[color:var(--c-fg-f3efe6)] leading-relaxed whitespace-pre selection:bg-[#d97757]/30">
                {viewingFile.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
