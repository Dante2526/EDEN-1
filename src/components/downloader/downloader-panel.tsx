import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Download,
  Link2,
  Loader2,
  Music,
  Video,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ClipboardPaste,
  Youtube,
  Instagram,
  Twitter,
  Clock,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';

interface PickerItem {
  type: 'video' | 'audio' | 'photo';
  url: string;
  thumb?: string;
  filename?: string;
  metadata?: { title?: string; duration?: string };
}

interface DownloadResult {
  ok: boolean;
  status: 'stream' | 'redirect' | 'picker' | 'success' | 'tunnel' | 'error';
  url?: string;
  picker?: PickerItem[];
  filename?: string;
  platform?: string;
  instance?: string;
  error?: string;
}

interface HistoryItem {
  id: string;
  url: string;
  platform: string;
  timestamp: number;
  status: 'success' | 'error';
  title?: string;
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  YouTube: Youtube,
  Instagram: Instagram,
  'Twitter/X': Twitter,
  TikTok: Music,
  SoundCloud: Music,
};

const SUPPORTED_PLATFORMS = [
  'YouTube',
  'TikTok',
  'Instagram',
  'Twitter/X',
  'Reddit',
  'SoundCloud',
  'Pinterest',
  'Facebook',
  'Twitch',
  'Vimeo',
  'Bilibili',
  'Snapchat',
  'Telegram',
];

export const DownloaderPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [inputUrl, setInputUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pasteHint, setPasteHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega histórico do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('synap-downloader-history');
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  const saveHistory = useCallback((items: HistoryItem[]) => {
    setHistory(items);
    try {
      localStorage.setItem('synap-downloader-history', JSON.stringify(items.slice(0, 20)));
    } catch {
      /* ignore */
    }
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputUrl(text.trim());
        setPasteHint(false);
      }
    } catch {
      setPasteHint(true);
      setTimeout(() => setPasteHint(false), 2500);
      inputRef.current?.focus();
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setResult({
        ok: false,
        status: 'error',
        error: 'URL inválida. Deve começar com http:// ou https://',
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, audioOnly }),
      });

      // Lê como texto: se a Vercel devolver uma página de erro (não-JSON), mostramos
      // uma mensagem clara em vez de "Unexpected token ... is not valid JSON".
      const raw = await response.text();
      let data: DownloadResult;
      try {
        data = JSON.parse(raw) as DownloadResult;
      } catch {
        data = {
          ok: false,
          status: 'error',
          error: `O servidor retornou uma resposta inesperada (HTTP ${response.status}). Tente novamente em instantes.`,
        };
      }
      setResult(data);

      // Adiciona ao histórico
      const platform = data.platform || 'Web';
      const newItem: HistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        platform,
        timestamp: Date.now(),
        status: data.ok ? 'success' : 'error',
        title: data.filename || (data.picker?.[0]?.metadata?.title ?? undefined),
      };
      saveHistory([newItem, ...history.filter((h) => h.url !== url)].slice(0, 20));
    } catch (err: any) {
      setResult({
        ok: false,
        status: 'error',
        error: err?.message || 'Falha de conexão com o servidor.',
      });
    } finally {
      setLoading(false);
    }
  }, [inputUrl, audioOnly, history, saveHistory]);

  const handleClearHistory = useCallback(() => {
    saveHistory([]);
  }, [saveHistory]);

  const handleRemoveHistoryItem = useCallback(
    (id: string) => {
      saveHistory(history.filter((h) => h.id !== id));
    },
    [history, saveHistory]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && inputUrl.trim()) {
      e.preventDefault();
      handleDownload();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Header / Título */}
      <div className="px-4 pt-4 pb-3 border-b border-[#2d2a25]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#d97757]/20 to-[#d97757]/5 border border-[#d97757]/30 flex items-center justify-center">
            <Download className="w-4 h-4 text-[#d97757]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-[#f3efe6] font-serif">Downloader</h2>
            <p className="text-[10px] text-[#736e65] font-mono">Cole o link • Baixe o vídeo</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 rounded-lg text-[#8c867a] hover:text-[#f3efe6] hover:bg-[#282622] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-[11px] text-[#8c867a] leading-relaxed mt-1.5">
          Baixe vídeos, áudios e imagens de qualquer plataforma suportada. Sem marca d&apos;água,
          sem login, direto do servidor.
        </p>
      </div>

      {/* Input + Ações */}
      <div className="p-3 space-y-2.5 border-b border-[#2d2a25]">
        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#736e65] pointer-events-none" />
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            placeholder="Cole aqui o link do vídeo..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="w-full bg-[#22201d] border border-[#3b3831] focus:border-[#d97757]/60 rounded-xl pl-9 pr-20 py-2.5 text-xs text-[#f3efe6] placeholder:text-[#5e5a52] focus:outline-none focus:ring-1 focus:ring-[#d97757]/40 transition-colors disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handlePaste}
            disabled={loading}
            aria-label="Colar link"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-[#a39d93] hover:text-[#f3efe6] hover:bg-[#302d28] transition-colors disabled:opacity-50"
          >
            <ClipboardPaste className="w-3 h-3" />
            Colar
          </button>
        </div>

        {pasteHint && (
          <div className="text-[10px] text-amber-400 flex items-center gap-1 px-1">
            <AlertCircle className="w-3 h-3" />
            Pressione Ctrl+V para colar (permissão de clipboard negada).
          </div>
        )}

        {/* Toggle: Apenas áudio (MP3) */}
        <label className="flex items-center gap-2 px-1 cursor-pointer select-none group">
          <button
            type="button"
            role="switch"
            aria-checked={audioOnly}
            onClick={() => setAudioOnly(!audioOnly)}
            className={`relative rounded-full transition-colors shrink-0 ${
              audioOnly ? 'bg-[#d97757]' : 'bg-[#3b3831]'
            }`}
            style={{ height: '18px', width: '32px' }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                audioOnly ? 'translate-x-3.5' : ''
              }`}
            />
          </button>
          <span className="text-[11px] text-[#b8b3a8] group-hover:text-[#f3efe6] flex items-center gap-1">
            <Music className="w-3 h-3 text-[#d97757]" />
            Extrair apenas áudio (MP3)
          </span>
        </label>

        {/* Botão Baixar */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading || !inputUrl.trim()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-[#d97757] to-[#c4663f] hover:from-[#e08368] hover:to-[#d97757] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Obter link de download
            </>
          )}
        </button>
      </div>

      {/* Resultado */}
      {result && (
        <div className="p-3 border-b border-[#2d2a25]">
          {result.ok ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Pronto para download!{' '}
                {result.platform && (
                  <span className="text-[#736e65] font-mono">· {result.platform}</span>
                )}
              </div>

              {/* Resultado único (stream/redirect) */}
              {result.url && (
                <a
                  href={result.url}
                  download={result.filename || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    {audioOnly ? (
                      <Music className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Video className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[#f3efe6] font-medium truncate">
                      {result.filename || 'Clique para baixar'}
                    </div>
                    <div className="text-[10px] text-[#8c867a] font-mono">
                      {audioOnly ? 'Áudio' : 'Vídeo'} · {result.instance}
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
                </a>
              )}

              {/* Picker (múltiplos formatos) */}
              {result.picker && result.picker.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-[#8c867a] font-mono uppercase tracking-wide">
                    {result.picker.length} opção(ões) disponível(is):
                  </div>
                  {result.picker.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      download={item.filename || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#22201d] border border-[#3b3831] hover:bg-[#2b2924] hover:border-[#d97757]/40 transition-colors group cursor-pointer"
                    >
                      {item.thumb ? (
                        <img
                          src={item.thumb}
                          alt=""
                          loading="lazy"
                          className="w-10 h-10 rounded-md object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-[#302d28] flex items-center justify-center shrink-0">
                          {item.type === 'audio' ? (
                            <Music className="w-4 h-4 text-[#d97757]" />
                          ) : item.type === 'photo' ? (
                            <ImageIcon className="w-4 h-4 text-[#d97757]" />
                          ) : (
                            <Video className="w-4 h-4 text-[#d97757]" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-[#f3efe6] font-medium truncate">
                          {item.metadata?.title || item.filename || `Arquivo ${idx + 1}`}
                        </div>
                        <div className="text-[10px] text-[#8c867a] font-mono flex items-center gap-1.5">
                          <span className="capitalize">{item.type}</span>
                          {item.metadata?.duration && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {item.metadata.duration}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Download className="w-3.5 h-3.5 text-[#a39d93] group-hover:text-[#d97757] group-hover:translate-y-0.5 transition-all shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-1.5 text-rose-400 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-0.5">Falha no download</div>
                  <div className="text-[10px] text-[#8c867a] font-mono leading-relaxed">
                    {result.error || 'Erro desconhecido. Tente novamente.'}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-[#5e5a52] px-1 leading-relaxed">
                Possíveis causas: plataforma não suportada, vídeo privado/removido,
                ou todas as instâncias estão sobrecarregadas. Aguarde 30s e tente
                novamente.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plataformas suportadas */}
      <div className="px-4 py-2.5 border-b border-[#2d2a25]">
        <div className="flex items-center justify-center gap-1 text-[10px] text-[#736e65] mb-1.5 font-mono uppercase tracking-wider">
          <Sparkles className="w-3 h-3 text-[#d97757]" />
          Plataformas suportadas
        </div>
        <div className="flex flex-wrap gap-1 justify-center">
          {SUPPORTED_PLATFORMS.map((p) => {
            const Icon = PLATFORM_ICONS[p];
            return (
              <span
                key={p}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#22201d] border border-[#3b3831] text-[9px] text-[#a39d93] font-mono"
              >
                {Icon && <Icon className="w-2.5 h-2.5" />}
                {p}
              </span>
            );
          })}
        </div>
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-2.5 pb-1 flex items-center justify-between">
            <div className="text-[10px] font-semibold text-[#736e65] uppercase tracking-wider font-mono">
              Histórico ({history.length})
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[10px] text-[#736e65] hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Limpar
            </button>
          </div>

          <div className="px-2 pb-3 space-y-0.5 overflow-y-auto">
            {history.map((item) => {
              const Icon = PLATFORM_ICONS[item.platform] || ExternalLink;
              return (
                <div
                  key={item.id}
                  className="group relative flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#22201d] transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      item.status === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInputUrl(item.url);
                      inputRef.current?.focus();
                    }}
                    className="flex-1 min-w-0 text-left"
                    title={item.url}
                  >
                    <div className="text-[10px] text-[#b8b3a8] truncate">
                      {item.title || item.url}
                    </div>
                    <div className="text-[9px] text-[#5e5a52] font-mono">
                      {item.platform} · {new Date(item.timestamp).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveHistoryItem(item.id)}
                    aria-label="Remover do histórico"
                    className="opacity-0 group-hover:opacity-100 p-1 text-[#736e65] hover:text-rose-400 transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
