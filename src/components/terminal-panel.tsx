import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Play,
  CornerDownLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Folder,
} from 'lucide-react';

export interface TerminalEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
  executionTimeMs?: number;
  timestamp: number;
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entries: TerminalEntry[];
  onExecuteCommand: (command: string) => Promise<void>;
  onClear: () => void;
  isRunning?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: '#6b7280', // black / gray
  31: '#f87171', // red
  32: '#4ade80', // green
  33: '#facc15', // yellow
  34: '#38bdf8', // blue
  35: '#c084fc', // magenta
  36: '#22d3ee', // cyan
  37: '#e5e7eb', // white
  39: 'inherit', // default
  90: '#9ca3af', // bright black
  91: '#fca5a5', // bright red
  92: '#86efac', // bright green
  93: '#fde047', // bright yellow
  94: '#7dd3fc', // bright blue
  95: '#d8b4fe', // bright magenta
  96: '#67e8f9', // bright cyan
  97: '#ffffff', // bright white
};

interface AnsiSpan {
  text: string;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
}

export const AnsiText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;

  const ansiRegex = /\x1b\[[0-9;]*m|\u001b\[[0-9;]*m/g;
  const spans: AnsiSpan[] = [];
  let currentColor: string | undefined = undefined;
  let currentBold = false;
  let currentItalic = false;
  let currentUnderline = false;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(text)) !== null) {
    const rawText = text.substring(lastIndex, match.index);
    if (rawText) {
      spans.push({
        text: rawText,
        color: currentColor,
        fontWeight: currentBold ? 'bold' : undefined,
        fontStyle: currentItalic ? 'italic' : undefined,
        textDecoration: currentUnderline ? 'underline' : undefined,
      });
    }

    const codeString = match[0].replace(/[\x1b\u001b]\[|m/g, '');
    const codes = codeString ? codeString.split(';').map(Number) : [0];

    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        currentBold = false;
        currentItalic = false;
        currentUnderline = false;
      } else if (code === 1) {
        currentBold = true;
      } else if (code === 3) {
        currentItalic = true;
      } else if (code === 4) {
        currentUnderline = true;
      } else if (ANSI_COLOR_MAP[code]) {
        currentColor = ANSI_COLOR_MAP[code];
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  const remainingText = text.substring(lastIndex);
  if (remainingText) {
    spans.push({
      text: remainingText,
      color: currentColor,
      fontWeight: currentBold ? 'bold' : undefined,
      fontStyle: currentItalic ? 'italic' : undefined,
      textDecoration: currentUnderline ? 'underline' : undefined,
    });
  }

  return (
    <>
      {spans.map((span, i) => (
        <span
          key={i}
          style={{
            color: span.color,
            fontWeight: span.fontWeight,
            fontStyle: span.fontStyle,
            textDecoration: span.textDecoration,
          }}
        >
          {span.text}
        </span>
      ))}
    </>
  );
};

export const TerminalPanel: React.FC<TerminalPanelProps> = React.memo(({
  isOpen,
  onClose,
  entries,
  onExecuteCommand,
  onClear,
  isRunning = false,
}) => {
  const [inputCommand, setInputCommand] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);

  const commandHistory = entries.map((e) => e.command).filter(Boolean);

  // Keep output scrolled to bottom when new entries arrive without moving window
  useEffect(() => {
    if (isOpen && outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [entries.length, isRunning, isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cmd = inputCommand.trim();
    if (!cmd || isRunning) return;

    setInputCommand('');
    setHistoryIndex(null);
    await onExecuteCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex =
        historyIndex === null
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputCommand(commandHistory[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(null);
        setInputCommand('');
      } else {
        setHistoryIndex(nextIndex);
        setInputCommand(commandHistory[nextIndex] || '');
      }
    }
  };

  const QUICK_COMMANDS = ['tokens', 'git status', 'git log --oneline', 'ls -la', 'help'];

  return (
    <div
      aria-hidden={!isOpen}
      style={{
        transform: isOpen ? 'translate3d(0, 0, 0)' : 'translate3d(0, 100%, 0)',
        visibility: isOpen ? 'visible' : 'hidden',
        transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), height 200ms ease, visibility 260ms',
      }}
      className={`absolute inset-x-0 bottom-0 z-40 bg-[#12110e] border-t border-[#343129] shadow-[0_-8px_32px_rgba(0,0,0,0.6)] flex flex-col will-change-transform ${
        isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      } ${
        isMaximized ? 'h-[calc(100%-3.5rem)]' : 'h-80 sm:h-96'
      }`}
    >
      {/* Terminal Title Bar */}
      <div className="h-10 px-3 bg-[#191814] border-b border-[#2d2b24] flex items-center justify-between select-none">
        <div className="flex items-center gap-2 text-xs font-mono text-[#c4bfb6]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#25231e] text-[#f09a7d] border border-[#3b382f]">
            <TerminalIcon className="w-3.5 h-3.5" />
            <span className="font-semibold">Terminal</span>
          </div>
          <span className="text-[#6d685e]">bash / sh</span>
          {entries.length > 0 && entries[entries.length - 1].cwd && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#8c867a]">
              <Folder className="w-3 h-3 text-[#d97757]" />
              <span className="truncate max-w-[200px]">{entries[entries.length - 1].cwd}</span>
            </div>
          )}
        </div>

        {/* Quick action buttons & window controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="px-2 py-0.5 rounded text-[11px] font-mono text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282620] border border-[#302e26] transition flex items-center gap-1 cursor-pointer"
            title={isMaximized ? 'Restaurar para metade da tela' : 'Expandir para tela cheia'}
          >
            {isMaximized ? (
              <>
                <Minimize2 className="w-3 h-3 text-[#d97757]" />
                <span className="hidden sm:inline">Metade</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3 text-[#d97757]" />
                <span className="hidden sm:inline">Tela Cheia</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClear}
            title="Limpar terminal"
            className="p-1.5 rounded text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282620] transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Fechar terminal (Ctrl+`)"
            className="p-1.5 rounded text-[#8c867a] hover:text-rose-400 hover:bg-[#282620] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Command Suggestions */}
      <div className="px-3 py-1.5 bg-[#161511] border-b border-[#26241e] flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono scrollbar-none">
        <span className="text-[#6d685e] text-[10px] uppercase font-bold shrink-0">Atalhos:</span>
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            type="button"
            disabled={isRunning}
            onClick={() => onExecuteCommand(cmd)}
            className="px-2 py-0.5 rounded bg-[#201e19] hover:bg-[#2d2a23] hover:text-[#f09a7d] text-[#a39d93] border border-[#302e26] transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Terminal Output Area */}
      <div
        ref={outputContainerRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 p-3 overflow-y-auto font-mono text-xs leading-relaxed space-y-3 bg-[#12110e] cursor-text"
      >
        {entries.length === 0 ? (
          <div className="text-[#6d685e] italic py-2">
            Digite um comando abaixo ou use os atalhos. Comandos também podem ser acionados pela IA.
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="space-y-1">
              {/* Command Header line */}
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#8c867a]">
                <span className="text-[#d97757] font-bold">$</span>
                <span className="text-[#f3efe6] font-semibold">{entry.command}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {entry.exitCode === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>exit 0</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-rose-400">
                      <XCircle className="w-3 h-3" />
                      <span>exit {entry.exitCode}</span>
                    </span>
                  )}
                  {entry.executionTimeMs !== undefined && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#6d685e]">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{entry.executionTimeMs}ms</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Stdout */}
              {entry.stdout && (
                <pre className="text-[#d8d3c9] bg-[#171612] p-2.5 rounded-lg border border-[#27251f] overflow-x-auto whitespace-pre-wrap break-words max-h-64 font-mono">
                  <AnsiText text={entry.stdout} />
                </pre>
              )}

              {/* Stderr */}
              {entry.stderr && (
                <pre className="text-rose-300 bg-rose-950/20 p-2.5 rounded-lg border border-rose-900/40 overflow-x-auto whitespace-pre-wrap break-words max-h-48 font-mono">
                  <AnsiText text={entry.stderr} />
                </pre>
              )}
            </div>
          ))
        )}

        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-[#f09a7d] animate-pulse py-1">
            <span className="w-2 h-2 rounded-full bg-[#d97757] animate-ping" />
            <span>Executando comando no terminal…</span>
          </div>
        )}
      </div>

      {/* Terminal Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 bg-[#171612] border-t border-[#292720] flex items-center gap-2"
      >
        <span className="text-[#d97757] font-mono font-bold text-sm select-none pl-1">$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputCommand}
          onChange={(e) => setInputCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRunning ? 'Aguarde o comando atual…' : 'Digite um comando (ex: tokens, git status, git log, help)...'}
          disabled={isRunning}
          className="flex-1 bg-transparent border-none outline-none text-[#f3efe6] font-mono text-xs placeholder-[#5f5a50]"
        />
        <button
          type="submit"
          disabled={!inputCommand.trim() || isRunning}
          title="Executar comando (Enter)"
          className="px-2.5 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#c86646] disabled:opacity-40 text-white text-xs font-mono font-medium flex items-center gap-1 transition cursor-pointer"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="hidden sm:inline">Executar</span>
          <CornerDownLeft className="w-3 h-3 opacity-70" />
        </button>
      </form>
    </div>
  );
});
