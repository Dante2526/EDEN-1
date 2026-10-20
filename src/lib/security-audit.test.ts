import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_SKILLS } from './storage.js';
import { extractUsedSkills } from './skills-extractor.js';
import { Skill } from './types.js';

describe('Cloudflare Security Audit Skill (Metodologia Adversarial Oficial)', () => {
  it('deve ter a skill cloudflare-security-audit registrada no catálogo BUILTIN_SKILLS', () => {
    const skill = BUILTIN_SKILLS.find((s) => s.id === 'cloudflare-security-audit');
    assert.ok(skill, 'A skill cloudflare-security-audit deve existir em BUILTIN_SKILLS');
    assert.equal(skill?.name, 'Auditoria de Segurança (Cloudflare)');
    assert.equal(skill?.icon, 'shield');
    assert.equal(skill?.enabled, true);
    assert.equal(skill?.isBuiltin, true);
  });

  it('deve conter as diretrizes oficiais da Cloudflare no systemPrompt da skill', () => {
    const skill = BUILTIN_SKILLS.find((s) => s.id === 'cloudflare-security-audit');
    assert.ok(skill, 'Skill deve existir');
    const prompt = skill?.systemPrompt || '';

    // 1. Validação Adversarial & Eliminação de Falsos Positivos
    assert.ok(
      prompt.includes('ELIMINAÇÃO TOTAL DE FALSOS POSITIVOS') && prompt.includes('VALIDAÇÃO ADVERSARIAL'),
      'Deve exigir validação adversarial'
    );
    // 2. Rastreamento Taint (Source -> Sink)
    assert.ok(
      prompt.includes('RASTREAMENTO TAINT') && prompt.includes('SOURCE → SINK'),
      'Deve orientar rastreamento do dado sujo ao sink'
    );
    // 3. Classes de Ataque Prioritárias
    assert.ok(
      prompt.includes('CLASSES DE ATAQUE PRIORITÁRIAS') && prompt.includes('SSRF') && prompt.includes('SQLi'),
      'Deve cobrir classes prioritárias de ataque'
    );
    // 4. Prova de Conceito (PoC)
    assert.ok(
      prompt.includes('PROVA DE CONCEITO (PoC)') && prompt.includes('CWE/OWASP'),
      'Deve exigir prova de conceito e classificação'
    );
  });

  it('deve extrair a habilidade quando declarada explicitamente no texto da IA', () => {
    const aiResponse =
      'Auditei o arquivo api/login.ts:\n' +
      '[Habilidade: Auditoria de Segurança (Cloudflare)]\n' +
      'Nenhuma vulnerabilidade crítica confirmada após teste adversarial.';
    const detected = extractUsedSkills(aiResponse);
    assert.ok(detected.includes('Auditoria de Segurança (Cloudflare)'));
  });

  it('deve associar a habilidade ativa no fallback quando houver modificação de arquivos', () => {
    const activeSkills: Skill[] = [
      {
        id: 'cloudflare-security-audit',
        name: 'Auditoria de Segurança (Cloudflare)',
        description: 'Auditoria adversarial',
        icon: 'shield',
        enabled: true,
        isBuiltin: true,
        systemPrompt: '',
      },
    ];

    const detected = extractUsedSkills('Corrigi a sanitização de parâmetros na rota de login.', activeSkills, true);
    assert.ok(detected.includes('Auditoria de Segurança (Cloudflare)'));
  });
});
