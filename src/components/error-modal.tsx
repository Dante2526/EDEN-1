import React, { useState } from 'react';
import { AlertTriangle, Copy, Check, RefreshCw, X, Bug, Terminal, ShieldAlert } from 'lucide-react';

export interface AppErrorInfo {
  id: string;
  title: string;
  message: string;
  status?: number;
  endpoint?: string;
  rawResponse?: string;
  stack?: string;
  timestamp: number;
}

interface ErrorModalProps {
  error: AppErrorInfo | null;
  errorHistory: AppErrorInfo[];
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
  onClearHistory: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  error,
  errorHistory,
  isOpen,
  onClose,
  onRetry,
  onClearHistory,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<AppErrorInfo | null>(null);

  if (!isOpen) return null;

  const current = selectedHistoryItem || error || errorHistory[0];

  const handleCopy = (item: AppErrorInfo | null) => {
    if (!item) return;
    const details = `[SYNAP ERROR REPORT]
Título: ${item.title}
Status: ${item.status || 'N/A'}
Endpoint: ${item.endpoint || 'N/A'}
Horário: ${new Date(item.timestamp).toLocaleString()}
Mensagem: ${item.message}
${item.rawResponse ? `Resposta Bruta:\n${item.rawResponse}` : ''}
${item.stack ? `Stack Trace:\n${item.stack}` : ''}`;

    navigator.clipboard.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-red-500/40 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-red-950/40 border-b border-red-500/25">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>Inspetor de Erros do Sistema</span>
                {current?.status && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 font-mono border border-red-500/30">
                    HTTP {current.status}
                  </span>
                )}
              </h2>
              <p className="text-xs text-red-300/80">
                Diagnóstico detalhado do problema ocorrido na aplicação
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {errorHistory.length > 1 && (
              <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => { setActiveTab('current'); setSelectedHistoryItem(null); }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'current' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Atual
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    activeTab === 'history' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Histórico</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-[10px] text-red-300">
                    {errorHistory.length}
                  </span>
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-300">
          {activeTab === 'history' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Histórico de Erros da Sessão ({errorHistory.length})
                </span>
                <button
                  onClick={onClearHistory}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Limpar histórico
                </button>
              </div>
              <div className="space-y-2">
                {errorHistory.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    onClick={() => { setSelectedHistoryItem(item); setActiveTab('current'); }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      (current?.id === item.id)
                        ? 'bg-red-950/30 border-red-500/50 text-white'
                        : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-slate-400 truncate">{item.message}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0 ml-2 font-mono">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {current ? (
                <div className="space-y-5">
                  {/* Title & Message Card */}
                  <div className="bg-slate-950/60 border border-red-500/30 rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase font-bold text-red-400 tracking-wider">
                        {current.title || 'Erro na Aplicação'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(current.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-white text-base font-medium leading-relaxed bg-red-950/20 p-3.5 rounded-lg border border-red-500/20 font-mono">
                      {current.message}
                    </div>

                    {current.endpoint && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span className="text-slate-500">Endpoint / Origem:</span>
                        <span className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 border border-slate-800">
                          {current.endpoint}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Raw Response or Details */}
                  {current.rawResponse && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>Resposta Bruta / Log do Servidor:</span>
                      </div>
                      <div className="bg-black/80 border border-slate-800 rounded-xl p-4 font-mono text-xs text-red-200 overflow-x-auto max-h-48 whitespace-pre-wrap select-all">
                        {current.rawResponse}
                      </div>
                    </div>
                  )}

                  {/* Stack Trace */}
                  {current.stack && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                        <span>Stack Trace:</span>
                      </div>
                      <div className="bg-black/80 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-400 overflow-x-auto max-h-40 whitespace-pre-wrap">
                        {current.stack}
                      </div>
                    </div>
                  )}

                  {/* Detailed Vercel Diagnosis Checklist */}
                  <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 text-xs text-amber-200 space-y-3">
                    <p className="font-bold text-amber-300 flex items-center gap-1.5 text-sm">
                      <Bug className="w-4 h-4 text-amber-400" />
                      <span>Diagnóstico Preciso do Erro (Vercel Serverless Function):</span>
                    </p>
                    
                    <div className="space-y-2 text-amber-100/90 leading-relaxed font-sans">
                      <p>
                        O erro <code className="bg-amber-900/60 px-1.5 py-0.5 rounded font-mono text-amber-300 font-bold">FUNCTION_INVOCATION_FAILED</code> ou <code className="bg-amber-900/60 px-1.5 py-0.5 rounded font-mono text-amber-300 font-bold">500</code> significa que a Serverless Function da Vercel falhou ao iniciar no servidor em nuvem.
                      </p>

                      <div className="bg-slate-900/80 p-3 rounded-lg border border-amber-500/30 space-y-2 font-mono text-[11px]">
                        <p className="font-bold text-amber-300 uppercase tracking-wider">Causa Principal #1: Variável NVIDIA_API_KEY Não Configurada na Vercel</p>
                        <p className="text-slate-300">Em produção na Vercel, o arquivo <code className="text-amber-300">.env.local</code> local NÃO é enviado por segurança. A chave da API precisa ser cadastrada no painel da Vercel.</p>
                      </div>

                      <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 space-y-1.5 text-slate-300 font-sans">
                        <p className="font-bold text-white text-xs">Passo a Passo Rápido para Resolver:</p>
                        <ol className="list-decimal list-inside space-y-1 text-slate-300">
                          <li>Acesse <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="text-amber-400 underline font-mono">vercel.com/dashboard</a> e selecione seu projeto.</li>
                          <li>Vá em <strong>Settings</strong> &rarr; <strong>Environment Variables</strong>.</li>
                          <li>Adicione a variável <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300 font-mono font-bold">NVIDIA_API_KEY</code> com a sua chave (ex: <code className="text-slate-400 font-mono">nvapi-...</code>).</li>
                          <li>Vá na aba <strong>Deployments</strong>, toque nos 3 pontinhos do último deploy e clique em <strong>Redeploy</strong> (para aplicar as novas variáveis).</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  Nenhum erro registrado no momento.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-t border-slate-800">
          <button
            onClick={() => handleCopy(current)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl transition-colors border border-slate-700"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copiado para a área de transferência!' : 'Copiar Detalhes do Erro'}</span>
          </button>

          <div className="flex items-center gap-3">
            {onRetry && (
              <button
                onClick={() => {
                  onClose();
                  onRetry();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-red-900/30"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tentar Novamente</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
