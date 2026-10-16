/**
 * Utilitários para extração e manipulação de prints e imagens da Área de Transferência (Clipboard)
 */

/**
 * Extrai arquivos de imagem de itens da área de transferência (ex: prints colados com Ctrl+V no chat)
 */
export function extractImagesFromClipboardData(
  clipboardData: {
    items?: ArrayLike<{ kind?: string; type?: string; getAsFile?: () => File | null }>;
    files?: ArrayLike<File>;
  } | null | undefined
): File[] {
  if (!clipboardData) return [];

  const extracted: File[] = [];

  // 1. Tenta extrair de clipboardData.items (padrão de navegadores modernos para prints via Ctrl+V)
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item && item.type && item.type.startsWith('image/')) {
        const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
        if (file) {
          const extension = file.type.split('/')[1] || 'png';
          const namedFile = new File([file], `print-${Date.now()}-${i + 1}.${extension}`, {
            type: file.type,
            lastModified: Date.now(),
          });
          extracted.push(namedFile);
        }
      }
    }
  }

  // 2. Fallback para clipboardData.files se items não trouxer arquivos
  if (extracted.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file && file.type && file.type.startsWith('image/')) {
        extracted.push(file);
      }
    }
  }

  return extracted;
}
