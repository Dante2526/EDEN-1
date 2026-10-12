import React from 'react';
import { X, FileText, Code, FileSpreadsheet, File } from 'lucide-react';
import { AttachedDocument } from '../lib/types';
import { formatFileSize } from '../lib/utils';

export interface FileAttachmentPreviewsProps {
  images: string[];
  documents: AttachedDocument[];
  onRemoveImage?: (index: number) => void;
  onRemoveDocument?: (id: string) => void;
  readOnly?: boolean;
}

export const FileAttachmentPreviews: React.FC<FileAttachmentPreviewsProps> = ({
  images,
  documents,
  onRemoveImage,
  onRemoveDocument,
  readOnly = false,
}) => {
  if (images.length === 0 && documents.length === 0) return null;

  const getDocIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css', 'json', 'sql', 'sh', 'c', 'cpp', 'java', 'xml', 'yaml', 'yml'].includes(ext)) {
      return <Code className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />;
    }
    if (['csv', 'xlsx', 'xls'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    }
    if (['pdf'].includes(ext)) {
      return <File className="w-4 h-4 text-rose-400" />;
    }
    return <FileText className="w-4 h-4 text-[color:var(--c-fg-d97757)]" />;
  };

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3 pb-2 border-b border-[color:var(--c-bg-312f2a)]">
      {/* Attached Images */}
      {images.map((img, idx) => (
        <div
          key={`img-${idx}`}
          className="relative group rounded-xl overflow-hidden border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1a1916)] shadow-sm w-16 h-16 flex-shrink-0"
        >
          <img src={img} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover" />
          {!readOnly && onRemoveImage && (
            <button
              type="button"
              onClick={() => onRemoveImage(idx)}
              aria-label="Remover imagem"
              className="absolute top-1 right-1 p-0.5 rounded-full bg-dark-bg/90 text-[color:var(--c-fg-a39d93)] hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {/* Attached Documents / Code / Files */}
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[color:var(--c-bg-3b3831)] bg-[color:var(--c-bg-1a1916)] text-[color:var(--c-fg-f3efe6)] text-xs shadow-sm max-w-xs group"
        >
          <div className="flex-shrink-0">{getDocIcon(doc.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-xs text-[color:var(--c-fg-f3efe6)]">{doc.name}</div>
            <div className="text-[10px] text-[color:var(--c-fg-8c867a)] font-mono">{formatFileSize(doc.size)}</div>
          </div>
          {!readOnly && onRemoveDocument && (
            <button
              type="button"
              onClick={() => onRemoveDocument(doc.id)}
              aria-label={`Remover ${doc.name}`}
              className="p-1 rounded-md text-[color:var(--c-fg-8c867a)] hover:text-[color:var(--c-on-strong)] hover:bg-[color:var(--c-bg-2e2b26)] transition-colors cursor-pointer flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

// Also keep ImagePreviews alias for backward compatibility
export const ImagePreviews: React.FC<{
  images: string[];
  onRemove: (index: number) => void;
}> = ({ images, onRemove }) => (
  <FileAttachmentPreviews
    images={images}
    documents={[]}
    onRemoveImage={onRemove}
    onRemoveDocument={() => {}}
  />
);
