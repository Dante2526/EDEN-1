import type { BrowserActionResult } from './browser-agent-engine';

export type Role = 'user' | 'assistant' | 'system' | 'tool';

// ====================================================================
// Sandpack Project Types — projetos criados pela IA com preview ao vivo
// ====================================================================

export type ProjectTemplate =
  | 'react-ts'
  | 'react'
  | 'vite-react-ts'
  | 'vanilla-ts'
  | 'vanilla'
  | 'vue'
  | 'static' // HTML/CSS/JS puro (sem bundler)
  | 'node';

export interface ProjectFile {
  /** Caminho relativo do arquivo, ex: "src/App.tsx", "index.html", "package.json" */
  path: string;
  /** Conteúdo do arquivo (string) */
  content: string;
  /** Se true, este arquivo é oculto da lista de arquivos mas ainda é enviado pro bundler */
  hidden?: boolean;
  /** Se true, este arquivo é marcado como ativo no editor quando o projeto abre */
  active?: boolean;
}

export interface SynapProject {
  id: string;
  /** ID do chat onde o projeto foi criado (para vincular ao histórico) */
  conversationId?: string;
  name: string;
  description?: string;
  template: ProjectTemplate;
  /** Arquivos do projeto (key = path, value = ProjectFile) */
  files: Record<string, ProjectFile>;
  /** Dependências extras (além das que vêm no template) */
  dependencies?: Record<string, string>;
  /** createdAt / updatedAt (epoch ms) */
  createdAt: number;
  updatedAt: number;
  /**
   * Se este projeto foi criado a partir de um repo GitHub vinculado,
   * guarda o full_name (owner/repo) pra evitar duplicação e permitir
   * re-sincronizar quando o repo muda.
   */
  sourceRepoFullName?: string;
  /** Branch do repo de onde veio (pra re-sincronizar) */
  sourceRepoBranch?: string;
}

export interface AttachedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
}

export type ChangeType = 'modified' | 'added' | 'deleted';

export interface PendingChange {
  id: string;
  path: string;
  repo: string; // owner/repo
  branch: string;
  type: ChangeType;
  originalContent?: string; // undefined se added
  baseSha?: string; // SHA do arquivo quando lido para evitar conflitos de update (lost update)
  newContent: string; // novo conteúdo
  createdAt: number;
  staged: boolean;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string; // owner/repo
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string | null;
  private: boolean;
}

export interface GitHubFileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
}

export interface ActiveRepoState {
  owner: string;
  repo: string;
  fullName: string;
  branch: string;
  defaultBranch: string;
  commitSha?: string;
}

export interface MessageEditedFile {
  path: string;
  type: ChangeType;
  changeId?: string;
}

export interface GitHubCommitItem {
  sha: string;
  short_sha: string;
  message: string;
  author: {
    name: string;
    login?: string;
    avatar_url?: string;
    date: string | null;
  };
  html_url: string;
}

export interface MessageToolCall {
  id: string;
  name: string;
  arguments: string;
  status: 'running' | 'waiting' | 'pending' | 'completed' | 'error';
  result?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  images?: string[]; // base64 data URLs
  documents?: AttachedDocument[];
  createdAt: number;
  reasoning?: string; // conteúdo do thinking (se vier separado ou extraído)
  reasoningEffort?: ReasoningEffort; // 'low' | 'high' | 'max'
  isPlanMode?: boolean;
  editedFiles?: MessageEditedFile[]; // arquivos editados pela IA nesta mensagem
  batchRefactor?: {
    summary: string;
    files: MessageEditedFile[];
  };
  toolCalls?: MessageToolCall[]; // histórico e status das chamadas de ferramentas executadas
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  fallbackWarning?: string;
  isTruncated?: boolean;
  streamError?: string;
  usedSkills?: string[]; // Habilidades aplicadas pela IA nesta resposta/alteração
  isConnected?: boolean; // true assim que o backend recebe HTTP 200 da NVIDIA/provedor
  webSources?: WebSourceItem[]; // Fontes ao vivo da Web estilo Perplexity
  isWebSearchMode?: boolean; // Se foi gerada com o modo Web ao Vivo ativado
  pendingRemoteAction?: {
    id: string;
    provider: 'vps_webhook' | 'github_workflow' | 'cloudflare_hook';
    targetHost: string;
    summary: string;
    filesOrCommand: string;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
    createdAt: number;
    resultMessage?: string;
    payload: {
      endpoint?: string;
      filePath?: string;
      fileContent?: string;
      command?: string;
      workflowId?: string;
      branch?: string;
      owner?: string;
      repo?: string;
    };
  };
  browserResult?: BrowserActionResult;
  canvasPrototype?: CanvasPrototype;
}

export interface CanvasPrototype {
  id: string;
  title: string;
  description?: string;
  html: string;
  viewport?: 'mobile' | 'desktop';
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: number;
}

export interface WebSourceItem {
  title: string;
  snippet: string;
  link: string;
  content?: string;
  domain?: string;
}

export interface ContextCompaction {
  summary: string;
  compactedUpToMessageId: string;
  timestamp: number;
  originalMessageCount: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  reasoningEffort: 'low' | 'high' | 'max';
  isPlanMode?: boolean;
  isWebSearchMode?: boolean;
  activeRepo?: ActiveRepoState | null;
  contextCompaction?: ContextCompaction;
  isArchived?: boolean;
}

export type ModelId =
  | 'z-ai/glm-5.3'
  | 'z-ai/glm-5.3-flash'
  | 'google/gemma-4-31b-it'
  | 'deepseek-ai/deepseek-v4.1-flash'
  | 'nvidia/nemotron-3.5-super-vl-120b-a12b';
export type ReasoningEffort = 'low' | 'high' | 'max';

export interface AppSettings {
  saveHistoryLocally: boolean;
  voiceEnabled: boolean;
  darkMode: boolean;
  speechVoice?: string;
  speechRate?: number;
  browserlessApiKey?: string;
  browserEndpoint?: string;
}

export type SkillIcon = 'flask' | 'bug' | 'shield' | 'zap' | 'sparkles' | 'file-text' | 'git-commit' | 'smartphone' | 'cloud' | 'bot' | 'layout' | 'palette' | 'video';

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: SkillIcon;
  systemPrompt: string;
  enabled: boolean;
  isBuiltin?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: 'sse' | 'http';
  apiKey?: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  errorMessage?: string;
  tools: McpTool[];
  lastConnectedAt?: number;
}

export type KnowledgeCategory = 'stack' | 'preference' | 'rule' | 'general';

export interface KnowledgeFact {
  id: string;
  fact: string;
  category?: KnowledgeCategory;
  createdAt: number;
  updatedAt?: number;
}

export interface SelectedPreviewElement {
  id: string;
  tagName: string;
  className?: string;
  textContent?: string;
  selector?: string;
  outerHtmlSnippet?: string;
}

export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export interface OpenCutClip {
  id: string;
  name?: string;
  src?: string;
  start: number;
  duration: number;
  type: 'video' | 'audio' | 'image' | 'text';
  text?: string;
}

export interface OpenCutTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text';
  clips: OpenCutClip[];
}

export interface OpenCutTimeline {
  title: string;
  aspectRatio?: VideoAspectRatio;
  duration?: number;
  tracks: OpenCutTrack[];
}

