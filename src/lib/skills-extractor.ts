import { Skill } from './types';

/**
 * Extrai habilidades explicitamente declaradas pela IA no texto (ex: [Habilidade: Systematic Debugging])
 * ou associa automaticamente habilidades ativas pertinentes caso tenham ocorrido alterações de arquivos.
 */
export function extractUsedSkills(
  text: string,
  activeSkills: Skill[] = [],
  hasFileModifications: boolean = false
): string[] {
  const detected = new Set<string>();
  const skillRegex = /\[Habilidade(?:s)?(?:\s*Usada(?:s)?)?:\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;

  while ((match = skillRegex.exec(text)) !== null) {
    const rawNames = match[1];
    rawNames.split(/[,;\n]+|\s+e\s+/i).forEach((n) => {
      const clean = n.trim();
      if (clean.length > 1) detected.add(clean);
    });
  }

  // Se a IA realizou modificações de arquivos mas não emitiu a tag explicitamente,
  // associa as habilidades ativas pertinentes como garantia de transparência
  if (detected.size === 0 && hasFileModifications && activeSkills.length > 0) {
    const activeNames = activeSkills.map((s) => s.name);
    for (const core of [
      'Code Review & Segurança',
      'Systematic Debugging',
      'Test-Driven Development (TDD)',
      'Conventional Commits',
      'Claude Design (UI Sênior)',
      'HyperFrames (Vídeo em Código)',
      'Mobile-First Design & UX',
    ]) {
      if (activeNames.includes(core)) {
        detected.add(core);
        break;
      }
    }
  }

  return Array.from(detected);
}
