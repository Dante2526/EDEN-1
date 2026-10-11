import React, { useState } from 'react';
import {
  Blocks,
  FlaskConical,
  Bug,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  Server,
  RefreshCw,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  FileText,
  Brain,
  GitCommit,
  Smartphone,
  Cloud,
} from 'lucide-react';
import { Skill, McpServer, SkillIcon, KnowledgeFact, KnowledgeCategory } from '../../lib/types';

interface ExtensionsPanelProps {
  skills: Skill[];
  onToggleSkill: (id: string) => void;
  onAddSkill: (skill: Omit<Skill, 'id' | 'isBuiltin'>) => void;
  onDeleteSkill: (id: string) => void;
  mcpServers: McpServer[];
  onAddMcpServer: (server: { name: string; url: string; transport: 'sse' | 'http'; apiKey?: string }) => void;
  onToggleMcpServer: (id: string) => void;
  onDeleteMcpServer: (id: string) => void;
  onTestMcpServer: (id: string) => Promise<void>;
  testingServerId?: string | null;
  knowledgeFacts: KnowledgeFact[];
  onAddKnowledgeFact: (fact: string, category?: KnowledgeCategory) => void;
  onDeleteKnowledgeFact: (id: string) => void;
  onClearKnowledgeFacts: () => void;
}

export const ExtensionsPanel: React.FC<ExtensionsPanelProps> = ({
  skills,
  onToggleSkill,
  onAddSkill,
  onDeleteSkill,
  mcpServers,
  onAddMcpServer,
  onToggleMcpServer,
  onDeleteMcpServer,
  onTestMcpServer,
  testingServerId,
  knowledgeFacts,
  onAddKnowledgeFact,
  onDeleteKnowledgeFact,
  onClearKnowledgeFacts,
}) => {
  const [subTab, setSubTab] = useState<'skills' | 'mcp' | 'memories'>('skills');
  const [newFactText, setNewFactText] = useState('');
  const [newFactCategory, setNewFactCategory] = useState<KnowledgeCategory>('general');
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);
  const [isAddMcpOpen, setIsAddMcpOpen] = useState(false);
  const [expandedMcpId, setExpandedMcpId] = useState<string | null>(null);

  // Form states for new skill
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillIcon, setNewSkillIcon] = useState<SkillIcon>('sparkles');
  const [newSkillPrompt, setNewSkillPrompt] = useState('');

  // Form states for new MCP server
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpApiKey, setNewMcpApiKey] = useState('');

  const activeSkillsCount = skills.filter((s) => s.enabled).length;
  const connectedMcpCount = mcpServers.filter((s) => s.enabled && s.status === 'connected').length;

  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillPrompt.trim()) return;
    onAddSkill({
      name: newSkillName.trim(),
      description: newSkillDesc.trim(),
      icon: newSkillIcon,
      systemPrompt: newSkillPrompt.trim(),
      enabled: true,
    });
    setNewSkillName('');
    setNewSkillDesc('');
    setNewSkillPrompt('');
    setIsAddSkillOpen(false);
  };

  const handleCreateMcp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMcpName.trim() || !newMcpUrl.trim()) return;
    onAddMcpServer({
      name: newMcpName.trim(),
      url: newMcpUrl.trim(),
      transport: 'http',
      apiKey: newMcpApiKey.trim() || undefined,
    });
    setNewMcpName('');
    setNewMcpUrl('');
    setNewMcpApiKey('');
    setIsAddMcpOpen(false);
  };

  const renderSkillIcon = (icon: SkillIcon) => {
    switch (icon) {
      case 'flask':
        return <FlaskConical className="w-4 h-4 text-emerald-400" />;
      case 'bug':
        return <Bug className="w-4 h-4 text-rose-400" />;
      case 'shield':
        return <ShieldCheck className="w-4 h-4 text-sky-400" />;
      case 'zap':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'file-text':
        return <FileText className="w-4 h-4 text-orange-400" />;
      case 'git-commit':
        return <GitCommit className="w-4 h-4 text-cyan-400" />;
      case 'smartphone':
        return <Smartphone className="w-4 h-4 text-pink-400" />;
      case 'cloud':
        return <Cloud className="w-4 h-4 text-slate-300" />;
      default:
        return <Blocks className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#181714] text-[#f3efe6]">
      {/* Sub-tab Navigation */}
      <div className="px-3 pt-2 pb-1.5 flex items-center gap-1.5 border-b border-[#2d2a25] bg-[#161512]">
        <button
          type="button"
          onClick={() => setSubTab('skills')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            subTab === 'skills'
              ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
              : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
          }`}
        >
          <Blocks className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>Habilidades</span>
          {activeSkillsCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">
              {activeSkillsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('mcp')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            subTab === 'mcp'
              ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
              : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
          }`}
        >
          <Server className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Servidores MCP</span>
          {connectedMcpCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
              {connectedMcpCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('memories')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            subTab === 'memories'
              ? 'bg-[#2b2823] text-[#f3efe6] border border-[#3e3b33] shadow-xs'
              : 'text-[#8c867a] hover:text-[#c4bfb6] hover:bg-[#201e1a]'
          }`}
        >
          <Brain className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>Memória</span>
          {knowledgeFacts.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold">
              {knowledgeFacts.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {subTab === 'skills' ? (
          <>
            {/* Header / Add Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-[#f3efe6]">Habilidades Comportamentais</h3>
                <p className="text-[10px] text-[#8c867a]">Injetam regras e fluxos especializados no chat</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSkillOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2b2823] hover:bg-[#38342e] border border-[#3e3b33] text-xs font-medium text-[#f3efe6] transition cursor-pointer"
              >
                <Plus className="w-3 h-3 text-[#d97757]" />
                <span>Nova</span>
              </button>
            </div>

            {/* Skills List */}
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className={`p-3 rounded-xl border transition-all ${
                    skill.enabled
                      ? 'bg-[#23211d] border-purple-500/30 shadow-sm'
                      : 'bg-[#1e1c18] border-[#2d2a25] opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-[#181714] border border-[#2d2a25]">
                        {renderSkillIcon(skill.icon)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#f3efe6]">{skill.name}</span>
                          {skill.isBuiltin && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                              Nativa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#a39d93] leading-tight mt-0.5">{skill.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!skill.isBuiltin && (
                        <button
                          type="button"
                          onClick={() => onDeleteSkill(skill.id)}
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                          title="Excluir habilidade"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleSkill(skill.id)}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                          skill.enabled ? 'bg-purple-600' : 'bg-zinc-700'
                        }`}
                        title={skill.enabled ? 'Desativar habilidade' : 'Ativar habilidade'}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            skill.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : subTab === 'mcp' ? (
          <>
            {/* MCP Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-[#f3efe6]">Conexões MCP Externas</h3>
                <p className="text-[10px] text-[#8c867a]">Ferramentas via Model Context Protocol</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMcpOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2b2823] hover:bg-[#38342e] border border-[#3e3b33] text-xs font-medium text-[#f3efe6] transition cursor-pointer"
              >
                <Plus className="w-3 h-3 text-emerald-400" />
                <span>Conectar</span>
              </button>
            </div>

            {/* MCP Server List */}
            {mcpServers.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-[#2d2a25] text-center space-y-2">
                <Server className="w-6 h-6 text-[#8c867a] mx-auto opacity-50" />
                <p className="text-xs text-[#a39d93]">Nenhum servidor MCP conectado.</p>
                <p className="text-[11px] text-[#8c867a]">
                  Conecte servidores locais ou remotos para expor bancos de dados, APIs ou serviços à IA.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {mcpServers.map((server) => {
                  const isExpanded = expandedMcpId === server.id;
                  const isTesting = testingServerId === server.id;
                  const isConnected = server.status === 'connected';

                  return (
                    <div
                      key={server.id}
                      className="p-3 rounded-xl border border-[#2d2a25] bg-[#1e1c18] space-y-2 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isConnected
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                                : server.status === 'connecting'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-zinc-600'
                            }`}
                          />
                          <div>
                            <span className="text-xs font-medium text-[#f3efe6]">{server.name}</span>
                            <p className="text-[10px] text-[#8c867a] font-mono truncate max-w-[160px]">
                              {server.url}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onTestMcpServer(server.id)}
                            disabled={isTesting}
                            className="p-1 rounded text-zinc-400 hover:text-[#f3efe6] hover:bg-[#282622] transition cursor-pointer"
                            title="Atualizar / Testar conexão"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-400' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMcpServer(server.id)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                            title="Remover servidor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleMcpServer(server.id)}
                            className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ml-1 ${
                              server.enabled ? 'bg-emerald-600' : 'bg-zinc-700'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                server.enabled ? 'translate-x-3.5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Tool count & expand tools */}
                      <div className="flex items-center justify-between pt-1 border-t border-[#2d2a25]/60 text-[11px]">
                        <span className="text-[#a39d93]">
                          {server.tools.length > 0
                            ? `${server.tools.length} ferramenta(s) disponível(is)`
                            : 'Nenhuma ferramenta listada'}
                        </span>
                        {server.tools.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedMcpId(isExpanded ? null : server.id)}
                            className="text-[#d97757] hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>{isExpanded ? 'Recolher' : 'Ver ferramentas'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {server.errorMessage && (
                        <p className="text-[10px] text-rose-400 bg-rose-500/10 p-1.5 rounded border border-rose-500/20">
                          {server.errorMessage}
                        </p>
                      )}

                      {/* Expanded Tools List */}
                      {isExpanded && server.tools.length > 0 && (
                        <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {server.tools.map((t) => (
                            <div
                              key={t.name}
                              className="p-2 rounded-lg bg-[#141311] border border-[#2d2a25] text-xs space-y-0.5"
                            >
                              <div className="font-mono text-emerald-400 font-semibold">{t.name}</div>
                              {t.description && (
                                <p className="text-[11px] text-[#8c867a] leading-tight">{t.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Header / Clear Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-[#f3efe6]">Base de Conhecimento</h3>
                <p className="text-[10px] text-[#8c867a]">Fatos permanentes ativos em todas as conversas</p>
              </div>
              {knowledgeFacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Tem certeza que deseja apagar todas as memórias salvas?')) {
                      onClearKnowledgeFacts();
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-[10px] font-medium text-rose-400 transition cursor-pointer"
                  title="Limpar todas as memórias"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar Tudo</span>
                </button>
              )}
            </div>

            {/* Quick Add Fact Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newFactText.trim()) return;
                onAddKnowledgeFact(newFactText.trim(), newFactCategory);
                setNewFactText('');
              }}
              className="p-2.5 rounded-xl bg-[#201e1a] border border-[#2d2a25] space-y-2"
            >
              <div className="text-[11px] font-medium text-[#c4bfb6]">Adicionar Novo Fato</div>
              <input
                type="text"
                required
                placeholder="Ex: O projeto usa Vercel Hobby e Tailwind CSS v4"
                value={newFactText}
                onChange={(e) => setNewFactText(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#141311] border border-[#2d2a25] text-xs text-[#f3efe6] placeholder-[#6b655b] focus:outline-none focus:border-sky-400"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newFactCategory}
                  onChange={(e) => setNewFactCategory(e.target.value as KnowledgeCategory)}
                  className="px-2 py-1 rounded-lg bg-[#141311] border border-[#2d2a25] text-[11px] text-[#c4bfb6] focus:outline-none focus:border-sky-400"
                >
                  <option value="stack">Stack Técnica</option>
                  <option value="preference">Preferência</option>
                  <option value="rule">Regra de Projeto</option>
                  <option value="general">Geral</option>
                </select>
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Salvar Fato</span>
                </button>
              </div>
            </form>

            {/* Facts List */}
            {knowledgeFacts.length === 0 ? (
              <div className="p-6 text-center space-y-2 rounded-xl bg-[#201e1a] border border-[#2d2a25]">
                <Brain className="w-8 h-8 text-sky-400/40 mx-auto" />
                <p className="text-xs text-[#c4bfb6] font-medium">Nenhum fato gravado ainda</p>
                <p className="text-[11px] text-[#8c867a] leading-relaxed">
                  A IA aprenderá fatos automaticamente com a ferramenta <code className="text-sky-300">save_memory</code> ou você pode cadastrar manualmente acima.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {knowledgeFacts.map((item) => {
                  const getCategoryBadge = (cat?: KnowledgeCategory) => {
                    switch (cat) {
                      case 'stack':
                        return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">STACK</span>;
                      case 'preference':
                        return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">PREFERÊNCIA</span>;
                      case 'rule':
                        return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">REGRA</span>;
                      default:
                        return <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">GERAL</span>;
                    }
                  };

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[#201e1a] border border-[#2d2a25] hover:border-[#3e3b33] transition space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {getCategoryBadge(item.category)}
                          <span className="text-[10px] text-[#6b655b] font-mono">{item.id}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteKnowledgeFact(item.id)}
                          className="opacity-70 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-[#8c867a] hover:text-rose-400 transition cursor-pointer"
                          title="Esquecer este fato"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-[#f3efe6] leading-relaxed break-words">{item.fact}</p>
                      <div className="text-[10px] text-[#6b655b]">
                        Salvo em {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Criar Nova Skill */}
      {isAddSkillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#23211d] border border-[#3b3831] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#3b3831]">
              <span className="font-semibold text-[#f3efe6] flex items-center gap-1.5">
                <Blocks className="w-4 h-4 text-purple-400" />
                Nova Habilidade Customizada
              </span>
              <button
                type="button"
                onClick={() => setIsAddSkillOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSkill} className="space-y-3">
              <div>
                <label className="block text-[11px] text-[#a39d93] mb-1">Nome da Habilidade</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Auditor de Acessibilidade"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#181714] border border-[#3b3831] text-[#f3efe6] focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#a39d93] mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Audita tags ARIA, contraste e navegação por teclado"
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#181714] border border-[#3b3831] text-[#f3efe6] focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#a39d93] mb-1">Prompt de Instrução do Sistema</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Escreva as diretrizes comportamentais e regras obrigatórias que a IA deve obedecer..."
                  value={newSkillPrompt}
                  onChange={(e) => setNewSkillPrompt(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#181714] border border-[#3b3831] text-[#f3efe6] focus:outline-none focus:border-purple-400 text-[11px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSkillOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-sm cursor-pointer"
                >
                  Salvar Habilidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Conectar Servidor MCP */}
      {isAddMcpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#23211d] border border-[#3b3831] p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#3b3831]">
              <span className="font-semibold text-[#f3efe6] flex items-center gap-1.5">
                <Server className="w-4 h-4 text-emerald-400" />
                Conectar Servidor MCP
              </span>
              <button
                type="button"
                onClick={() => setIsAddMcpOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMcp} className="space-y-3">
              <div>
                <label className="block text-[11px] text-[#a39d93] mb-1">Nome da Conexão</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Servidor de Dados Local"
                  value={newMcpName}
                  onChange={(e) => setNewMcpName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#181714] border border-[#3b3831] text-[#f3efe6] focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#a39d93] mb-1">URL do Endpoint MCP</label>
                <input
                  type="url"
                  required
                  placeholder="https://meu-mcp.com/rpc ou http://localhost:3001"
                  value={newMcpUrl}
                  onChange={(e) => setNewMcpUrl(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#181714] border border-[#3b3831] text-[#f3efe6] focus:outline-none focus:border-emerald-400 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#a39d93] mb-1">Token de Autorização / API Key (Opcional)</label>
                <input
                  type="password"
                  placeholder="Bearer token..."
                  value={newMcpApiKey}
                  onChange={(e) => setNewMcpApiKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#181714] border border-[#3b3831] text-[#f3efe6] focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMcpOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm cursor-pointer"
                >
                  Conectar Servidor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
