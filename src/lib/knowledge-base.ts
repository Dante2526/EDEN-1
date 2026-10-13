import { KnowledgeFact, KnowledgeCategory } from './types';

/**
 * Compila a lista de fatos aprendidos para um bloco de System Prompt limpo e conciso.
 */
export function formatKnowledgePrompt(facts?: KnowledgeFact[]): string | undefined {
  if (!facts || facts.length === 0) {
    return undefined;
  }

  const list = facts
    .map((f) => {
      const cat = f.category ? `[${f.category.toUpperCase()}] ` : '';
      return `- [${f.id}] ${cat}${f.fact}`;
    })
    .join('\n');

  return (
    '--- BASE DE CONHECIMENTO PERSISTENTE (MEMÓRIA DE LONGO PRAZO) ---\n' +
    'Estes são fatos e preferências que você aprendeu em conversas com o usuário e deve respeitar ativamente:\n' +
    `${list}\n\n` +
    'Diretrizes de memória:\n' +
    '1. Quando o usuário mencionar novas regras de projeto, preferências duradouras ou stack técnica, use a ferramenta `save_memory`.\n' +
    '2. Quando uma informação for explicitamente revogada ou corrigida pelo usuário, use a ferramenta `forget_memory`.'
  );
}

/**
 * Cria um novo fato com ID único e validação de texto.
 */
export function createKnowledgeFact(
  factText: string,
  category: KnowledgeCategory = 'general'
): KnowledgeFact {
  const trimmed = factText?.trim();
  if (!trimmed) {
    throw new Error('O texto da memória não pode ser vazio.');
  }

  const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    fact: trimmed,
    category,
    createdAt: Date.now(),
  };
}

/**
 * Filtra fatos por ID, texto ou categoria.
 */
export function filterKnowledgeFacts(facts: KnowledgeFact[], query: string): KnowledgeFact[] {
  if (!query || !query.trim()) return facts;
  const q = query.toLowerCase().trim();

  return facts.filter((f) => {
    return (
      f.id.toLowerCase().includes(q) ||
      f.fact.toLowerCase().includes(q) ||
      (f.category && f.category.toLowerCase().includes(q))
    );
  });
}
