import React, { useState } from 'react';
import { Zap, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ContextCompaction } from '../lib/types';

interface CompactionMarkerProps {
  compaction: ContextCompaction;
}

export const CompactionMarker: React.FC<CompactionMarkerProps> = ({ compaction }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-6 px-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-amber-500/20"></div>
        </div>
        <div className="relative flex items-center gap-2 bg-zinc-900/90 border border-amber-500/30 px-3.5 py-1.5 rounded-full text-xs font-medium text-amber-300 shadow-sm backdrop-blur-md transition-all hover:border-amber-500/50">
          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Contexto compactado ({compaction.originalMessageCount} mensagens resumidas)</span>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="ml-1 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center p-0.5 rounded cursor-pointer"
            title={isOpen ? 'Ocultar resumo' : 'Ver resumo do contexto'}
          >
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 p-4 bg-zinc-900/90 border border-zinc-800/80 rounded-xl text-xs text-zinc-300 shadow-xl max-h-80 overflow-y-auto backdrop-blur-md">
          <div className="font-semibold text-zinc-200 mb-2 flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="flex items-center gap-1.5 text-amber-300">
              <Zap className="w-3.5 h-3.5" />
              Memória Ativa Resumida
            </span>
            <span className="text-[10px] text-zinc-500 font-normal">
              {new Date(compaction.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="prose prose-invert prose-xs max-w-none text-zinc-300 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{compaction.summary}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
