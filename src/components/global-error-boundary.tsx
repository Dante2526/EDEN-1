import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary global — captura crashes de render do React.
 * Sem ele, qualquer erro de render (ex: SandpackProvider com dados inválidos)
 * faz a tela ficar preta sem nenhuma mensagem.
 *
 * Quando captura um erro:
 * 1. Renderiza um fallback com botão "Ver detalhes do erro"
 * 2. Chama onError (pra abrir o ErrorModal)
 * 3. Oferece botão "Recarregar página"
 */
export class GlobalErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary] React render crash:', error, info);
    if (this.props.onError) {
      this.props.onError(error, info);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    // Recarrega a página pra limpar estado corrompido
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  handleCopyError = () => {
    if (!this.state.error) return;
    const text = `[SYNAP CRASH]
${this.state.error.message}

Stack:
${this.state.error.stack || '(sem stack)'}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0f0e0c] text-[#f3efe6]">
          <div className="max-w-lg w-full bg-[#181714] border border-red-500/40 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 bg-red-950/40 border-b border-red-500/25 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-[#f3efe6]">A aplicação encontrou um erro</h2>
                <p className="text-[11px] text-red-300/70 font-mono mt-0.5">React render crash capturado</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="bg-black/40 border border-red-500/20 rounded-lg p-3">
                <div className="text-[10px] uppercase font-bold text-red-400 tracking-wider mb-1.5">
                  Mensagem do erro
                </div>
                <div className="text-xs text-[#f3efe6] font-mono break-all leading-relaxed">
                  {this.state.error.message || 'Erro desconhecido'}
                </div>
              </div>

              {this.state.error.stack && (
                <details className="group">
                  <summary className="text-[10px] uppercase font-bold text-[#8c867a] tracking-wider mb-1.5 cursor-pointer hover:text-[#f3efe6] transition-colors flex items-center gap-1">
                    <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Stack trace (toque pra expandir)
                  </summary>
                  <div className="mt-2 bg-black/60 border border-[#2d2a25] rounded-lg p-3 max-h-40 overflow-y-auto">
                    <pre className="text-[10px] text-[#8c867a] font-mono whitespace-pre-wrap break-all">
                      {this.state.error.stack}
                    </pre>
                  </div>
                </details>
              )}

              <div className="text-[11px] text-[#8c867a] leading-relaxed bg-[#22201d] border border-[#3b3831] rounded-lg p-3">
                💡 <strong className="text-[#c4bfb6]">O que fazer:</strong> Tente recarregar a página.
                Se o erro persistir ao vincular um repo, o problema pode ser arquivos
                corrompidos no projeto salvo. Limpe o projeto em <code className="text-[#d97757]">Projetos → deletar</code> e tente novamente.
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={this.handleCopyError}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#22201d] hover:bg-[#2b2924] border border-[#3b3831] text-[#b8b3a8] hover:text-[#f3efe6] text-xs font-medium transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copiar erro
                </button>
                <button
                  type="button"
                  onClick={this.handleDismiss}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#22201d] hover:bg-[#2b2924] border border-[#3b3831] text-[#b8b3a8] hover:text-[#f3efe6] text-xs font-medium transition-colors cursor-pointer"
                >
                  Tentar continuar
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#d97757] hover:bg-[#c4663f] text-white text-xs font-medium transition-colors cursor-pointer shadow-md"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Recarregar página
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
