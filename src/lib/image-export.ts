/**
 * Helpers pra exportar canvas do Fabric.js pra PNG/JPEG.
 *
 * O canvas do Fabric.js 6 tem método toDataURL() que retorna data URL
 * direto. Usamos isso pra:
 *   - Exportar imagem final pro chat (PNG com transparência)
 *   - Exportar thumbnail pra mostrar no card
 *   - Salvar no histórico
 */

/**
 * Exporta canvas do Fabric pra data URL PNG.
 * Retorna string no formato "data:image/png;base64,..."
 */
export function exportCanvasToPng(canvas: any): string {
  if (!canvas) return '';
  try {
    return canvas.toDataURL({
      format: 'png',
      quality: 1.0,
      multiplier: 1,
      enableRetinaScaling: true,
    });
  } catch (err) {
    console.error('[image-export] Erro ao exportar PNG:', err);
    return '';
  }
}

/**
 * Exporta canvas do Fabric pra data URL JPEG (menor tamanho).
 */
export function exportCanvasToJpeg(canvas: any, quality: number = 0.92): string {
  if (!canvas) return '';
  try {
    return canvas.toDataURL({
      format: 'jpeg',
      quality,
      multiplier: 1,
      enableRetinaScaling: true,
    });
  } catch (err) {
    console.error('[image-export] Erro ao exportar JPEG:', err);
    return '';
  }
}

/**
 * Gera thumbnail reduzido (max 400x400) pra preview no chat.
 */
export function exportThumbnail(canvas: any, maxSize: number = 400): string {
  if (!canvas) return '';
  try {
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const scale = Math.min(maxSize / w, maxSize / h, 1);
    return canvas.toDataURL({
      format: 'jpeg',
      quality: 0.85,
      multiplier: scale,
      enableRetinaScaling: false,
    });
  } catch (err) {
    console.error('[image-export] Erro ao gerar thumbnail:', err);
    return '';
  }
}

/**
 * Faz download de data URL como arquivo.
 * Cria <a> temporário, clica, remove.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  if (!dataUrl || typeof document === 'undefined') return;
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('[image-export] Erro no download:', err);
  }
}
