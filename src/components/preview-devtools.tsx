import React, { useState } from 'react';
import {
  Terminal,
  Wifi,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  Info,
  Wand2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { PreviewConsoleLog, PreviewNetworkRequest } from '../lib/preview-devtools';
import { formatDevToolsErrorForAi } from '../lib/preview-devtools';

interface PreviewDevToolsProps {
  logs: PreviewConsoleLog[];
  requests: PreviewNetworkRequest[];
  onClearLogs: () => void;
  onClearNetwork: () => void;
  onFixWithAi?: (promptText: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export function PreviewDevTools({
  logs,
  requests,
  onClearLogs,
  onClearNetwork,
  onFixWithAi,
  isOpen,
  onToggleOpen,
}: PreviewDevToolsProps) {
  const [activeTab, setActiveTab] = useState<'console' | 'network'>('console');
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn'>('all');

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;
  const failedNetworkCount = requests.filter((r) => r.status >= 400 || r.error).length;

  const filteredLogs = logs.filter((l) => {
    if (filterLevel === 'error') return l.level === 'error';
    if (filterLevel === 'warn') return l.level === 'warn';
    return true;
  });

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur font-mono text-xs text-zinc-300 flex flex-col z-30 transition-all select-none">
      {/* Barra de Título / Abas do DevTools */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800/80">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setActiveTab('console');
              if (!isOpen) onToggleOpen();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'console' && isOpen
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Console</span>
            {errorCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                {errorCount}
              </span>
            ) : warnCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-400 font-bold">
                {warnCount}
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500">({logs.length})</span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('network');
              if (!isOpen) onToggleOpen();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'network' && isOpen
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Network</span>
            {failedNetworkCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-400 font-bold border border-red-500/30">
                {failedNetworkCount}
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500">({requests.length})</span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {isOpen && activeTab === 'console' && (
            <div className="flex items-center gap-1 mr-2 bg-zinc-950/60 p-0.5 rounded border border-zinc-800">
              <button
                onClick={() => setFilterLevel('all')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  filterLevel === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilterLevel('error')}
                className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${
                  filterLevel === 'error' ? 'bg-red-500/20 text-red-300 font-bold' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <AlertCircle className="w-2.5 h-2.5 text-red-400" />
                Erros
              </button>
              <button
                onClick={() => setFilterLevel('warn')}
                className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${
                  filterLevel === 'warn' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                Alertas
              </button>
            </div>
          )}

          {isOpen && (
            <>
              <button
                onClick={activeTab === 'console' ? onClearLogs : onClearNetwork}
                title="Limpar logs"
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Restaurar altura' : 'Maximizar'}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </>
          )}

          <button
            onClick={onToggleOpen}
            className="flex items-center gap-1 px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-[11px] transition-colors"
          >
            <span>DevTools</span>
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Conteúdo Expansível do DevTools */}
      {isOpen && (
        <div
          className={`overflow-y-auto overflow-x-hidden p-2 transition-all ${
            isExpanded ? 'h-72' : 'h-40'
          }`}
        >
          {activeTab === 'console' ? (
            filteredLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-[11px] italic">
                Nenhum log no console até o momento.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredLogs.map((log) => {
                  const isErr = log.level === 'error';
                  const isWarn = log.level === 'warn';
                  const isInf = log.level === 'info';

                  return (
                    <div
                      key={log.id}
                      className={`p-1.5 rounded border text-[11px] font-mono flex items-start justify-between gap-2 ${
                        isErr
                          ? 'bg-red-950/30 border-red-900/50 text-red-300'
                          : isWarn
                          ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
                          : isInf
                          ? 'bg-sky-950/20 border-sky-900/40 text-sky-300'
                          : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-start gap-1.5 overflow-hidden">
                        {isErr ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        ) : isWarn ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        ) : isInf ? (
                          <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                        ) : (
                          <span className="text-zinc-600 shrink-0 font-bold select-none">&gt;</span>
                        )}

                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="whitespace-pre-wrap break-all leading-tight">
                            {log.messages.join(' ')}
                          </span>
                          {log.source && (
                            <span className="text-[10px] text-zinc-500">
                              {log.source}:{log.line || 1}
                            </span>
                          )}
                          {log.stack && (
                            <details className="mt-1">
                              <summary className="text-[10px] text-red-400/80 cursor-pointer hover:underline">
                                Stack Trace
                              </summary>
                              <pre className="mt-1 p-1 bg-black/40 rounded text-[10px] text-red-300/80 overflow-x-auto whitespace-pre-wrap">
                                {log.stack}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>

                      {/* Botão de Auto-Correção com IA para Erros */}
                      {isErr && onFixWithAi && (
                        <button
                          onClick={() => onFixWithAi(formatDevToolsErrorForAi(log))}
                          title="Enviar este erro para a IA corrigir o código automaticamente"
                          className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm"
                        >
                          <Wand2 className="w-2.5 h-2.5 text-red-400 animate-pulse" />
                          <span>Corrigir com IA</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Aba Network */
            requests.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-500 text-[11px] italic">
                Nenhuma requisição de rede interceptada ainda.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {requests.map((req) => {
                  const isFail = req.status >= 400 || req.error;
                  return (
                    <div
                      key={req.id}
                      className={`flex items-center justify-between p-1.5 rounded border text-[11px] ${
                        isFail
                          ? 'bg-red-950/20 border-red-900/40 text-red-300'
                          : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden mr-2">
                        <span
                          className={`px-1 rounded text-[9px] font-bold ${
                            req.method === 'GET'
                              ? 'bg-sky-500/20 text-sky-400'
                              : req.method === 'POST'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {req.method}
                        </span>
                        <span className="truncate text-zinc-200" title={req.url}>
                          {req.url}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-[10px]">
                        <span
                          className={`font-bold ${
                            isFail ? 'text-red-400' : 'text-emerald-400'
                          }`}
                        >
                          {req.status} {req.statusText}
                        </span>
                        <span className="text-zinc-500">{req.durationMs}ms</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
