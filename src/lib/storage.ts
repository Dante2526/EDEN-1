import { get, set, clear } from 'idb-keyval';
import { Conversation, AppSettings, Skill, McpServer, KnowledgeFact } from './types';
import { StudioSession } from '../studio/studio-types';

const STUDIO_SESSIONS_KEY = 'synap_studio_sessions';
const CONVERSATIONS_KEY = 'nim_chat_conversations_v1';
const SETTINGS_KEY = 'nim_chat_settings_v1';
const SKILLS_KEY = 'synap_skills_v1';
const MCP_SERVERS_KEY = 'synap_mcp_servers_v1';
const KNOWLEDGE_FACTS_KEY = 'synap_knowledge_base_v1';

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'tdd',
    name: 'Test-Driven Development (TDD)',
    description: 'Exige escrita de testes antes de implementar código (RED ➔ GREEN ➔ REFACTOR).',
    icon: 'flask',
    enabled: false,
    isBuiltin: true,
    systemPrompt:
      'Você está operando sob a regra estrita de Test-Driven Development (TDD):\n' +
      '1. NUNCA escreva código de produção sem antes escrever um teste automatizado que falhe (RED).\n' +
      '2. Valide o teste antes de prosseguir com a implementação.\n' +
      '3. Escreva apenas o código estritamente necessário para fazer o teste passar (GREEN).\n' +
      '4. Refatore com segurança preservando todos os testes verdes.',
  },
  {
    id: 'debugging',
    name: 'Systematic Debugging',
    description: 'Investiga causa raiz com método científico: hipótese ➔ evidência ➔ conclusão (zero chutes).',
    icon: 'bug',
    enabled: false,
    isBuiltin: true,
    systemPrompt:
      'Você está operando sob a diretriz de Systematic Debugging:\n' +
      '1. NUNCA tente adivinhar a correção ou fazer alterações aleatórias.\n' +
      '2. Formule hipóteses claras com base nos logs, código e mensagens de erro.\n' +
      '3. Colete evidências irrefutáveis antes de propor qualquer modificação.\n' +
      '4. Identifique e resolva a causa raiz, nunca apenas os sintomas superficiais.',
  },
  {
    id: 'security',
    name: 'Code Review & Segurança',
    description: 'Auditoria contínua de vulnerabilidades OWASP, tipagem estrita no TypeScript e robustez.',
    icon: 'shield',
    enabled: false,
    isBuiltin: true,
    systemPrompt:
      'Você está atuando como Auditor de Código e Segurança Sênior:\n' +
      '1. Verifique vulnerabilidades de injeção, vazamento de credenciais e sanitização de inputs.\n' +
      '2. Exija tipagem estrita no TypeScript, sem uso permissivo de `any`.\n' +
      '3. Identifique possíveis condições de corrida, concorrência desprotegida e vazamentos de memória.',
  },
  {
    id: 'perf',
    name: 'Performance & Otimização',
    description: 'Otimiza concorrência, divide bundles, previne re-renderizações e minimiza latência.',
    icon: 'zap',
    enabled: false,
    isBuiltin: true,
    systemPrompt:
      'Você é um especialista em Performance e Arquitetura de Alto Desempenho:\n' +
      '1. Analise criticamente o impacto de re-renders no React (uso correto de memo, callbacks, throttles).\n' +
      '2. Otimize imports e lazy loading para manter o bundle enxuto.\n' +
      '3. Evite operações bloqueantes no loop de eventos e minimize overhead de chamadas de rede.',
  },
  {
    id: 'doc-creator',
    name: 'Office & PDF Architect',
    description: 'Especialista em criação e exportação de planilhas Excel (.xlsx), relatórios PDF, contratos Word e slides PPT.',
    icon: 'file-text',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você é um especialista em Design e Arquitetura de Documentos Corporativos:\n' +
      '1. Escolha o formato ideal para cada solicitação do usuário: Excel (.xlsx) para tabelas/números, PDF para relatórios e documentos protegidos, Word (.docx) para textos longos/contratos, e PowerPoint (.pptx) para apresentações.\n' +
      '2. Ao usar a ferramenta `generate_document`, organize os dados com cabeçalhos claros, seções bem estruturadas e formatação profissional.\n' +
      '3. Avise sempre ao usuário que o arquivo foi gerado e já está disponível para download imediato no card interativo.',
  },
  {
    id: 'conventional-commits',
    name: 'Conventional Commits',
    description: 'Padroniza todas as mensagens de commit (feat, fix, refactor, docs, chore, test) no padrão profissional v1.0.0.',
    icon: 'git-commit',
    enabled: true,
    isBuiltin: true,
    systemPrompt:
      'Você segue RIGOROSAMENTE a convenção oficial Conventional Commits (v1.0.0) em qualquer interação de versionamento Git:\n' +
      '1. Formato estrito: `<tipo>(<escopo opcional>): <descrição no imperativo e em minúsculas>`\n' +
      '2. Tipos permitidos:\n' +
      '   - feat: nova funcionalidade para o usuário\n' +
      '   - fix: correção de bug\n' +
      '   - refactor: refatoração de código que não altera comportamento nem conserta bug\n' +
      '   - docs: mudanças exclusivamente em documentação\n' +
      '   - test: adição ou correção de testes\n' +
      '   - chore: manutenção, ferramentas, dependências ou scripts\n' +
      '   - perf: otimização de desempenho\n' +
      '3. Regras de ouro:\n' +
      '   - Linha de assunto curta (máximo 72 caracteres).\n' +
      '   - Proibido usar mensagens vagas como "update", "fix bug", "changes", "testes".\n' +
      '   - Ao rodar `git commit` via `run_terminal_command` ou ao sugerir commits, formate a mensagem sempre nesse padrão.',
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  saveHistoryLocally: true,
  voiceEnabled: true,
  darkMode: true,
  speechVoice: 'pt-BR-FranciscaNeural',
  speechRate: 1.0,
};

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const data = await get<Conversation[]>(CONVERSATIONS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load conversations from IndexedDB:', error);
    return [];
  }
}

export async function saveConversations(conversations: Conversation[]): Promise<void> {
  try {
    await set(CONVERSATIONS_KEY, conversations);
  } catch (error) {
    console.error('Failed to save conversations to IndexedDB:', error);
  }
}

export async function clearAllConversations(): Promise<void> {
  try {
    await clear();
  } catch (error) {
    console.error('Failed to clear conversations:', error);
  }
}

export async function loadStudioSessions(): Promise<StudioSession[]> {
  try {
    const data = await get<StudioSession[]>(STUDIO_SESSIONS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load studio sessions', error);
    return [];
  }
}

export async function saveStudioSessions(sessions: StudioSession[]): Promise<void> {
  try {
    await set(STUDIO_SESSIONS_KEY, sessions);
  } catch (error) {
    console.error('Failed to save studio sessions', error);
  }
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    if (!parsed.speechVoice) {
      parsed.speechVoice = 'pt-BR-FranciscaNeural';
    }
    return parsed;
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function exportConversationsToJSON(conversations: Conversation[]): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(conversations, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  const date = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute('download', `conversas-nim-chat-${date}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export async function loadSkills(): Promise<Skill[]> {
  try {
    const data = await get<Skill[]>(SKILLS_KEY);
    if (!data || data.length === 0) {
      return BUILTIN_SKILLS;
    }
    const existingIds = new Set(data.map((s) => s.id));
    const missingBuiltins = BUILTIN_SKILLS.filter((b) => !existingIds.has(b.id));
    return [...data, ...missingBuiltins];
  } catch (error) {
    console.error('Failed to load skills from IndexedDB:', error);
    return BUILTIN_SKILLS;
  }
}

export async function saveSkills(skills: Skill[]): Promise<void> {
  try {
    await set(SKILLS_KEY, skills);
  } catch (error) {
    console.error('Failed to save skills to IndexedDB:', error);
  }
}

export async function loadMcpServers(): Promise<McpServer[]> {
  try {
    const data = await get<McpServer[]>(MCP_SERVERS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load MCP servers from IndexedDB:', error);
    return [];
  }
}

export async function saveMcpServers(servers: McpServer[]): Promise<void> {
  try {
    await set(MCP_SERVERS_KEY, servers);
  } catch (error) {
    console.error('Failed to save MCP servers to IndexedDB:', error);
  }
}

export async function loadKnowledgeFacts(): Promise<KnowledgeFact[]> {
  try {
    const data = await get<KnowledgeFact[]>(KNOWLEDGE_FACTS_KEY);
    return data || [];
  } catch (error) {
    console.error('Failed to load knowledge facts from IndexedDB:', error);
    return [];
  }
}

export async function saveKnowledgeFacts(facts: KnowledgeFact[]): Promise<void> {
  try {
    await set(KNOWLEDGE_FACTS_KEY, facts);
  } catch (error) {
    console.error('Failed to save knowledge facts to IndexedDB:', error);
  }
}


