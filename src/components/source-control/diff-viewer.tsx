import React, { useState, Suspense } from 'react';
import { X, Check, Undo2, Edit3, Save, FileCode, Plus, Minus } from 'lucide-react';

const ReactDiffViewer = React.lazy(() => import('react-diff-viewer-continued'));
import { PendingChange } from '../../lib/types';

interface DiffViewerProps {
  change: PendingChange;
  isOpen: boolean;
  onClose: () => void;
  onStage: (id: string) => void;
  onUnstage: (id: string) => void;
  onDiscard: (id: string) => void;
  onUpdateContent: (id: string, newContent: string) => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  change,
  isOpen,
  onClose,
  onStage,
  onUnstage,
  onDiscard,
  onUpdateContent,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(change.newContent);

  if (!isOpen) return null;

  const handleSaveEdit = () => {
    onUpdateContent(change.id, editedText);
    setIsEditing(false);
  };

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  // Custom dark theme styles for react-diff-viewer-continued
  const customStyles = {
    variables: {
      dark: {
        diffViewerBackground: '#181714',
        diffViewerColor: '#f3efe6',
        addedBackground: '#133820',
        addedColor: '#7ee787',
        removedBackground: '#3d1618',
        removedColor: '#ff7b72',
        wordAddedBackground: '#1e5932',
        wordRemovedBackground: '#5c2225',
        addedGutterBackground: '#102e1b',
        removedGutterBackground: '#301314',
        gutterBackground: '#1d1b18',
        gutterBackgroundDark: '#141311',
        highlightBackground: '#2a2620',
        highlightGutterBackground: '#2a2620',
        codeFoldGutterBackground: '#22201c',
        codeFoldBackground: '#1d1b18',
        emptyLineBackground: '#141311',
        gutterColor: '#7a7469',
        addedGutterColor: '#7ee787',
        removedGutterColor: '#ff7b72',
      },
    },
    line: {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: '12px',
      lineHeight: '1.5',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[92vh] rounded-2xl bg-[color:var(--c-bg-1d1b18)] border border-[color:var(--c-bg-3b3831)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[color:var(--c-bg-312f2a)] bg-[color:var(--c-bg-23211d)] flex items-center justify-between flex-wrap gap-2">
          {/* File path & badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <FileCode className="w-4 h-4 text-[color:var(--c-fg-d97757)] shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs sm:text-sm text-[color:var(--c-fg-f3efe6)] font-medium truncate">
                  {change.path}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                    change.type === 'modified'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : change.type === 'added'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {change.type === 'modified'
                    ? 'M • Modified'
                    : change.type === 'added'
                    ? 'A • Added'
                    : 'D • Deleted'}
                </span>
                {change.staged && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#d97757]/20 text-[color:var(--c-fg-f09a7d)] border border-[#d97757]/40">
                    Staged
                  </span>
                )}
              </div>
              <p className="text-[10px] font-mono text-[color:var(--c-fg-8c867a)]">
                {change.repo} · branch {change.branch}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle edit */}
            {!isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setEditedText(change.newContent);
                  setIsEditing(true);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-[color:var(--c-fg-c4bfb6)] hover:text-[color:var(--c-fg-f3efe6)] bg-[color:var(--c-bg-2d2a24)] hover:bg-[color:var(--c-bg-38342d)] border border-[color:var(--c-bg-3e3a32)] transition cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[color:var(--c-fg-d97757)]" />
                <span className="hidden sm:inline">Editar conteúdo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveEdit}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 transition cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar edição</span>
              </button>
            )}

            {/* Stage / Unstage */}
            {change.staged ? (
              <button
                type="button"
                onClick={() => onUnstage(change.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/40 transition cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Unstage</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onStage(change.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-800/40 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Stage</span>
              </button>
            )}

            {/* Discard */}
            <button
              type="button"
              onClick={() => {
                if (confirm(`Descartar todas as alterações em "${change.path}"?`)) {
                  onDiscard(change.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 transition cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Discard</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar diff viewer"
              className="w-7 h-7 rounded-lg bg-[color:var(--c-bg-2e2b26)] hover:bg-[color:var(--c-bg-38352f)] text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] transition flex items-center justify-center cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content area: Diff Viewer or Inline Editor */}
        <div className="flex-1 overflow-auto bg-[color:var(--c-bg-181714)]">
          {isEditing ? (
            <div className="h-full flex flex-col p-3">
              <div className="flex items-center justify-between mb-2 text-xs font-mono text-[color:var(--c-fg-8c867a)]">
                <span>Editando conteúdo pendente:</span>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-[color:var(--c-fg-a39d93)] hover:text-[color:var(--c-fg-f3efe6)] underline cursor-pointer"
                >
                  Cancelar edição
                </button>
              </div>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="flex-1 w-full p-4 font-mono text-xs sm:text-sm bg-[color:var(--c-bg-12110f)] border border-[color:var(--c-bg-3b3831)] rounded-xl text-[color:var(--c-fg-f3efe6)] focus:outline-hidden focus:border-[#d97757] resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="p-2 sm:p-4">
              <Suspense fallback={<div className="p-4 text-sm font-mono text-[color:var(--c-fg-8c867a)]">Carregando visualizador de diff...</div>}>
                <ReactDiffViewer
                  oldValue={change.originalContent || ''}
                  newValue={change.newContent}
                  splitView={isDesktop}
                  useDarkTheme={true}
                  styles={customStyles}
                  compareMethod={"diffWords" as any}
                  leftTitle="Original (GitHub Branch)"
                  rightTitle="Modificado pela IA (Pendente)"
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
