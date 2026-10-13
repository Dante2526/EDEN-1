import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // If today
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // If yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }

  // Otherwise dd/mm/yyyy
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function generateTitleFromMessage(content: string): string {
  const clean = content.trim().replace(/^#+\s*/, '').replace(/\n+/g, ' ');
  if (!clean) return 'Nova conversa';
  if (clean.length <= 32) return clean;
  return clean.slice(0, 32) + '...';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Limit to 4MB for text/code files
    if (file.size > 4 * 1024 * 1024) {
      return reject(new Error('O arquivo de texto/código não pode ultrapassar 4MB.'));
    }

    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 15 * 1024 * 1024) {
      return reject(new Error('A imagem não pode ultrapassar 15MB.'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrlOriginal = e.target?.result as string;
      
      // Apenas tentar comprimir se for uma imagem JPEG, PNG ou WebP suportada pelo Canvas
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
        return resolve(dataUrlOriginal);
      }

      // Se o arquivo original for incrivelmente pequeno (menos de 300KB), mantemos para não gastar CPU
      if (file.size <= 300 * 1024) {
        return resolve(dataUrlOriginal);
      }

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        // Limita as dimensões (máx 1024px) para reduzir tamanho preservando qualidade aceitável
        const MAX_SIZE = 1024;
        if (width > height && width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrlOriginal);

        // Preenche o fundo com branco para evitar que PNGs transparentes fiquem com fundo preto no JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Exporta como JPEG com qualidade inicial 0.8
        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // O limite da Vercel é 4.5MB por request.
        // Como o usuário pode enviar VÁRIAS imagens, vamos forçar cada base64 a ficar abaixo de 600KB.
        const MAX_B64_LENGTH = 600 * 1024;

        while (dataUrl.length > MAX_B64_LENGTH && quality > 0.1) {
          quality -= 0.15;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };
      
      img.onerror = () => resolve(dataUrlOriginal);
      img.src = dataUrlOriginal;
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}
