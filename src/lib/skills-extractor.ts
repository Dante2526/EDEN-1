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

  // Heurística contextual para relatórios analíticos de segurança mesmo sem alteração de arquivos
  if (detected.size === 0 && activeSkills.some((s) => s.id === 'cloudflare-security-audit')) {
    const isSecurityAuditContent =
      /\b(vulnerabilidade|vulnerabilidades|cwe-\d+|owasp|prova de conceito|poc|auditoria de seguran[cç]a|metodologia cloudflare|taint analysis)\b/i.test(
        text
      );
    if (isSecurityAuditContent) {
      detected.add('Auditoria de Segurança (Cloudflare)');
    }
  }

  // Se a IA realizou modificações de arquivos mas não emitiu a tag explicitamente,
  // associa as habilidades ativas pertinentes como garantia de transparência
  if (detected.size === 0 && hasFileModifications && activeSkills.length > 0) {
    const activeNames = activeSkills.map((s) => s.name);
    const mentionsSecurity = /\b(vulnerabilidade|seguran[cç]a|exploit|cwe|owasp)\b/i.test(text);
    const priorityList = mentionsSecurity
      ? [
          'Auditoria de Segurança (Cloudflare)',
          'Code Review & Segurança',
          'Systematic Debugging',
          'Test-Driven Development (TDD)',
          'Conventional Commits',
          'Claude Design (UI Sênior)',
          'HyperFrames (Vídeo em Código)',
          'Mobile-First Design & UX',
        ]
      : [
          'Code Review & Segurança',
          'Auditoria de Segurança (Cloudflare)',
          'Systematic Debugging',
          'Test-Driven Development (TDD)',
          'Conventional Commits',
          'Claude Design (UI Sênior)',
          'HyperFrames (Vídeo em Código)',
          'Mobile-First Design & UX',
        ];

    for (const core of priorityList) {
      if (activeNames.includes(core)) {
        detected.add(core);
        break;
      }
    }
  }

  return Array.from(detected);
}
