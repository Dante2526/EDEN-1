import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractUsedSkills } from './skills-extractor';
import { Skill } from './types';

describe('extractUsedSkills', () => {
  const mockSkills: Skill[] = [
    {
      id: 'debugging',
      name: 'Systematic Debugging',
      description: 'Investiga causa raiz',
      icon: 'bug',
      enabled: true,
      systemPrompt: 'prompt',
    },
    {
      id: 'security',
      name: 'Code Review & Segurança',
      description: 'Auditoria de segurança',
      icon: 'shield',
      enabled: true,
      systemPrompt: 'prompt',
    },
    {
      id: 'mobile-first',
      name: 'Mobile-First Design & UX',
      description: 'Mobile first',
      icon: 'smartphone',
      enabled: true,
      systemPrompt: 'prompt',
    },
  ];

  it('extrai habilidade explicitamente declarada com tag [Habilidade: Nome]', () => {
    const text = 'Analisei o problema e identifiquei a causa raiz.\n\n[Habilidade: Systematic Debugging]';
    const skills = extractUsedSkills(text, mockSkills);
    assert.deepStrictEqual(skills, ['Systematic Debugging']);
  });

  it('extrai múltiplas habilidades separadas por vírgula ou "e"', () => {
    const text = 'Código revisado e responsivo.\n\n[Habilidade: Code Review & Segurança, Mobile-First Design & UX]';
    const skills = extractUsedSkills(text, mockSkills);
    assert.ok(skills.includes('Code Review & Segurança'));
    assert.ok(skills.includes('Mobile-First Design & UX'));
  });

  it('associa habilidade ativa de engenharia quando há modificações de arquivos e nenhuma tag foi emitida', () => {
    const text = 'Arquivo src/App.tsx atualizado com sucesso.';
    const skills = extractUsedSkills(text, mockSkills, true);
    assert.ok(skills.includes('Code Review & Segurança'));
  });

  it('retorna array vazio quando não há tags e não houve modificações de arquivos', () => {
    const text = 'Olá! Como posso te ajudar hoje?';
    const skills = extractUsedSkills(text, mockSkills, false);
    assert.deepStrictEqual(skills, []);
  });
});
