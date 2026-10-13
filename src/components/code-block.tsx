import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language = 'text', value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="relative my-4 rounded-xl border border-[#38352e] bg-[#181614] overflow-hidden text-sm shadow-md">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2d2a25] bg-[#22201c] text-xs text-[#a39d93]">
        <span className="font-mono text-[#c4bfb6] uppercase tracking-wider font-semibold text-[11px]">
          {language}
        </span>
        <button
          onClick={handleCopy}
          aria-label="Copiar código"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[#a39d93] hover:text-[#f3efe6] hover:bg-[#2d2a25] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium text-xs">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-xs">Copiar</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto font-mono text-[13px] leading-relaxed text-[#ede9e1]">
        <pre>
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
};
