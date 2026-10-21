/**
 * Streaming Speech Queue (50/50 Flow)
 *
 * Divide o streaming de texto da IA em sentenças em tempo real e inicia
 * a síntese de voz (Web Speech API) enquanto o modelo ainda está gerando as
 * próximas frases, criando uma experiência de conversa fluida sem pausas ou silêncio.
 */

export function extractCleanSpeechText(rawText: string): string {
  if (!rawText) return '';

  return rawText
    // Remove tags de raciocínio / thinking (DeepSeek, GLM, Kimi)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    // Remove tags de raciocínio abertas ainda não fechadas durante streaming
    .replace(/<think>[\s\S]*$/g, '')
    // Remove blocos de ferramentas XML/textuais (<synap_edit>, <synap_tool>)
    .replace(/<synap_edit[\s\S]*?<\/synap_edit>/g, ' Trecho de código editado. ')
    .replace(/<synap_tool[\s\S]*?<\/synap_tool>/g, '')
    .replace(/<synap_edit[\s\S]*$/g, '')
    .replace(/<synap_tool[\s\S]*$/g, '')
    // Remove blocos de código markdown completos e incompletos
    .replace(/```[\s\S]*?```/g, ' Trecho de código omitido. ')
    .replace(/```[\s\S]*$/g, '')
    // Código inline
    .replace(/`([^`]+)`/g, '$1')
    // Remove links markdown e preserva texto visível
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove cabeçalhos markdown (#, ##, ###)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove tabelas markdown
    .replace(/\|[^\n]+\|/g, '')
    // Remove marcadores de lista (*, -, +, 1.)
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove ênfases (*, _, ~)
    .replace(/[*_~]{1,3}/g, '')
    // Substitui quebras de linha por pontos para respiração natural
    .replace(/\n+/g, '. ')
    // Remove caracteres especiais e normaliza espaços
    .replace(/[-=]{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Divide o texto limpo em sentenças completas delimitadas por pontuação (. ! ? :)
 * Mantém qualquer trecho inacabado em `remaining`.
 */
export function splitSpeechSentences(
  text: string,
  isFinal: boolean
): { completed: string[]; remaining: string } {
  if (!text || !text.trim()) {
    return { completed: [], remaining: '' };
  }

  const rawSentences: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    current += char;

    const isSentenceEnd =
      (char === '.' || char === '!' || char === '?' || char === ':') &&
      (i === text.length - 1 || /\s/.test(text[i + 1]));

    if (isSentenceEnd) {
      const trimmed = current.trim();
      if (trimmed) {
        rawSentences.push(trimmed);
      }
      current = '';
    }
  }

  let remaining = current.trim();

  if (isFinal && remaining) {
    rawSentences.push(remaining);
    remaining = '';
  }

  // Agrupa sentenças muito curtas (< 15 caracteres) com a próxima para ritmo natural
  const completed: string[] = [];
  let buffer = '';

  for (let i = 0; i < rawSentences.length; i++) {
    const s = rawSentences[i];
    if (buffer) {
      buffer += ' ' + s;
    } else {
      buffer = s;
    }

    // Se é a última sentença e isFinal é falso, não força se for curta demais
    const isLast = i === rawSentences.length - 1;
    if (!isLast && buffer.length < 18) {
      continue;
    }

    completed.push(buffer);
    buffer = '';
  }

  if (buffer) {
    if (isFinal) {
      completed.push(buffer);
    } else {
      // Devolve ao remaining para esperar mais conteúdo
      remaining = remaining ? `${buffer} ${remaining}` : buffer;
    }
  }

  return { completed, remaining };
}

export interface StreamingSpeechQueueOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  onStartSentence?: (sentence: string) => void;
  onFinishedAll?: () => void;
}

export class StreamingSpeechQueue {
  private queue: string[] = [];
  private spokenSentences: string[] = [];
  private processedSentenceCount = 0;
  private isPlaying = false;
  private isFinalized = false;
  private isCancelled = false;
  private options: StreamingSpeechQueueOptions;
  private selectedVoice: SpeechSynthesisVoice | null = null;

  constructor(options: StreamingSpeechQueueOptions = {}) {
    this.options = {
      rate: 1.05,
      pitch: 1.0,
      ...options,
    };
    this.initVoice();
  }

  private initVoice() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const findBestVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;

      // 1. Voz específica selecionada
      if (this.options.voice) {
        const found = voices.find(
          v => v.name.includes(this.options.voice!) || v.voiceURI.includes(this.options.voice!)
        );
        if (found) return found;
      }

      // 2. Vozes neurais brasileiras de alta qualidade do Edge/Windows/Chrome
      const preferred = ['Francisca', 'Maria', 'Antonio', 'Luciana', 'Google português do Brasil'];
      for (const name of preferred) {
        const match = voices.find(v => v.name.includes(name) && v.lang.startsWith('pt'));
        if (match) return match;
      }

      // 3. Qualquer voz pt-BR
      const ptBr = voices.find(v => v.lang.toLowerCase() === 'pt-br' || v.lang.startsWith('pt_BR'));
      if (ptBr) return ptBr;

      // 4. Qualquer voz em português
      const pt = voices.find(v => v.lang.toLowerCase().startsWith('pt'));
      return pt || null;
    };

    this.selectedVoice = findBestVoice();
    if (!this.selectedVoice && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.selectedVoice = findBestVoice();
      };
    }
  }

  /**
   * Alimenta a fila com o texto mais recente durante o streaming do modelo.
   */
  public feed(rawText: string): void {
    if (this.isCancelled) return;

    const cleaned = extractCleanSpeechText(rawText);
    const { completed } = splitSpeechSentences(cleaned, false);

    // Enfileira apenas as sentenças novas que ainda não foram processadas
    if (completed.length > this.processedSentenceCount) {
      const newSentences = completed.slice(this.processedSentenceCount);
      for (const s of newSentences) {
        this.queue.push(s);
      }
      this.processedSentenceCount = completed.length;

      // Inicia a reprodução se a fila estava ociosa
      if (!this.isPlaying) {
        this.playNext();
      }
    }
  }

  /**
   * Chamado quando o modelo conclui o streaming.
   * Fala qualquer texto remanescente até o final.
   */
  public finalize(rawText?: string): void {
    if (this.isCancelled) return;
    this.isFinalized = true;

    if (rawText) {
      const cleaned = extractCleanSpeechText(rawText);
      const { completed } = splitSpeechSentences(cleaned, true);
      if (completed.length > this.processedSentenceCount) {
        const newSentences = completed.slice(this.processedSentenceCount);
        for (const s of newSentences) {
          this.queue.push(s);
        }
        this.processedSentenceCount = completed.length;
      }
    }

    if (!this.isPlaying && this.queue.length > 0) {
      this.playNext();
    } else if (!this.isPlaying && this.queue.length === 0) {
      if (this.options.onFinishedAll) {
        this.options.onFinishedAll();
      }
    }
  }

  /**
   * Executa a próxima sentença da fila via Web Speech API.
   */
  private playNext(): void {
    if (this.isCancelled) return;

    if (this.queue.length === 0) {
      this.isPlaying = false;
      if (this.isFinalized && this.options.onFinishedAll) {
        this.options.onFinishedAll();
      }
      return;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.isPlaying = false;
      return;
    }

    const sentence = this.queue.shift()!;
    this.spokenSentences.push(sentence);
    this.isPlaying = true;

    if (this.options.onStartSentence) {
      this.options.onStartSentence(sentence);
    }

    // Prepara a fala nativa do navegador
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = 'pt-BR';
    utterance.rate = this.options.rate || 1.05;
    utterance.pitch = this.options.pitch || 1.0;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    utterance.onend = () => {
      if (this.isCancelled) return;
      // Transição imediata para a próxima sentença (buffer contínuo)
      this.playNext();
    };

    utterance.onerror = (e) => {
      // Se foi interrompido por cancel(), ignora
      if (this.isCancelled || e.error === 'canceled' || e.error === 'interrupted') {
        return;
      }
      // Em caso de erro transitório, continua a fila
      this.playNext();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      this.playNext();
    }
  }

  /**
   * Interrompe imediatamente qualquer fala em andamento e esvazia a fila.
   */
  public cancel(): void {
    this.isCancelled = true;
    this.isPlaying = false;
    this.queue = [];

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public isSpeaking(): boolean {
    return this.isPlaying;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getSpokenText(): string {
    return this.spokenSentences.join(' ');
  }
}
