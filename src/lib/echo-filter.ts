/**
 * Filtro de eco do Modo Voz Contínua.
 *
 * O microfone fica aberto enquanto a IA fala (pra permitir interromper). Em alto-falante,
 * ele pode captar a própria voz da IA. Esta função decide se o que o microfone ouviu parece
 * ser a IA falando (eco) ou o usuário de verdade.
 */

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * @param heard   texto reconhecido pelo microfone
 * @param spoken  texto que a IA está falando agora
 * @returns true se `heard` parece eco de `spoken`
 */
export function looksLikeEcho(heard: string, spoken: string): boolean {
  const h = words(heard);
  if (h.length === 0) return true; // nada útil ouvido
  const spokenSet = new Set(words(spoken));
  if (spokenSet.size === 0) return false;
  const hits = h.filter((w) => spokenSet.has(w)).length;
  // Frases curtas (1–2 palavras): só é eco se TODAS as palavras estão no que a IA fala,
  // assim um "pare" ou "espera" do usuário interrompe na hora.
  if (h.length <= 2) return hits === h.length;
  // Frases longas: eco se a grande maioria das palavras coincide.
  return hits / h.length >= 0.7;
}
