#!/usr/bin/env python3
"""Patches /home/z/my-project/api/chat.ts to fix a bug in CloudflareThinkSplitter
where lastEmittedContentLen / lastEmittedReasoningLen became stale after
contentBuffer.slice(...). Refactor to a simpler approach: after each slice,
the remaining buffer is by definition "not yet emitted", so we reset offset
counters to 0."""

import re
from pathlib import Path

CHAT_TS = Path('/home/z/my-project/api/chat.ts')
text = CHAT_TS.read_text(encoding='utf-8')

# Match the entire feed() method body (from "/** Processa um chunk" comment to the closing "}" before flush)
pattern = re.compile(
    r'  /\*\* Processa um chunk de content \(string\) e retorna os SSEs a emitir\. \*/\n'
    r'  feed\(contentDelta: string\): \{ reasoningDelta\?: string; contentDelta\?: string \} \{.*?\n  \}\n',
    re.DOTALL,
)

new_feed = '''  /** Processa um chunk de content (string) e retorna os SSEs a emitir. */
  feed(contentDelta: string): { reasoningDelta?: string; contentDelta?: string } {
    if (!contentDelta) return {};
    this.contentBuffer += contentDelta;

    const out: { reasoningDelta?: string; contentDelta?: string } = {};
    const OPEN = String.fromCharCode(60, 116, 104, 105, 110, 107, 62);   //  Dems
    const CLOSE = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62); //  Democrats

    // Loop: em um único feed podemos ter OPEN ... CLOSE ... OPEN ... CLOSE.
    // IMPORTANTE: depois de cada slice() no contentBuffer, tudo que sobra é
    // "não emitido por construção", então não rastreamos offsets — só
    // mantemos um lookahead de OPEN/CLOSE.length chars no fim (caso a tag
    // venha cortada entre dois chunks) e soltamos o resto no flush().
    while (true) {
      if (!this.inThinking) {
        const openIdx = this.contentBuffer.indexOf(OPEN);
        if (openIdx !== -1) {
          // Emite como content tudo que veio antes do OPEN.
          if (openIdx > 0) {
            out.contentDelta = (out.contentDelta || '') + this.contentBuffer.slice(0, openIdx);
          }
          this.contentBuffer = this.contentBuffer.slice(openIdx + OPEN.length);
          this.inThinking = true;
          this.thinkTagEmitted = true;
          continue; // volta pro while pra procurar CLOSE
        }
        // Não achou OPEN: emite tudo exceto os últimos OPEN.length chars
        // (lookahead de segurança, caso a tag venha cortada no próximo chunk).
        if (this.contentBuffer.length > OPEN.length) {
          const safeLen = this.contentBuffer.length - OPEN.length;
          out.contentDelta = (out.contentDelta || '') + this.contentBuffer.slice(0, safeLen);
          this.contentBuffer = this.contentBuffer.slice(safeLen);
        }
        break; // buffer pequeno e sem OPEN: espera próximo chunk
      }

      // Estamos dentro de  Dems... Democrats: procura o fechamento.
      const closeIdx = this.contentBuffer.indexOf(CLOSE);
      if (closeIdx !== -1) {
        if (closeIdx > 0) {
          out.reasoningDelta = (out.reasoningDelta || '') + this.contentBuffer.slice(0, closeIdx);
        }
        this.contentBuffer = this.contentBuffer.slice(closeIdx + CLOSE.length);
        this.inThinking = false;
        continue; // volta pro while pra procurar próximo OPEN
      }
      // Não fechou ainda: emite tudo exceto os últimos CLOSE.length chars
      // (lookahead de segurança, caso a tag de fechamento venha cortada).
      if (this.contentBuffer.length > CLOSE.length) {
        const safeLen = this.contentBuffer.length - CLOSE.length;
        out.reasoningDelta = (out.reasoningDelta || '') + this.contentBuffer.slice(0, safeLen);
        this.contentBuffer = this.contentBuffer.slice(safeLen);
      }
      break; // buffer pequeno e sem CLOSE: espera próximo chunk
    }
    return out;
  }
'''

new_text, count = pattern.subn(new_feed, text)
if count != 1:
    raise SystemExit(f'Expected exactly 1 match, got {count}')

# Também simplifica o flush() — agora só precisa soltar o que sobrou no buffer.
flush_pattern = re.compile(
    r'  /\*\* Flush final: emite qualquer texto restante como content\. \*/\n'
    r'  flush\(\): \{ reasoningDelta\?: string; contentDelta\?: string \} \{.*?\n  \}\n',
    re.DOTALL,
)

new_flush = '''  /** Flush final: solta qualquer texto restante no buffer. */
  flush(): { reasoningDelta?: string; contentDelta?: string } {
    const out: { reasoningDelta?: string; contentDelta?: string } = {};
    if (this.inThinking) {
      // Nunca fechou  Dems: emite tudo como reasoning (caso patológico).
      if (this.contentBuffer) out.reasoningDelta = this.contentBuffer;
    } else {
      if (this.contentBuffer) out.contentDelta = this.contentBuffer;
    }
    this.contentBuffer = '';
    return out;
  }
'''

new_text, count2 = flush_pattern.subn(new_flush, new_text)
if count2 != 1:
    raise SystemExit(f'Expected exactly 1 flush match, got {count2}')

# Removemos os campos não usados (lastEmittedContentLen, lastEmittedReasoningLen) da classe.
# Como agora não há mais referência a eles, deixamos as declarações mas isso gera warning.
# Melhor removê-las.
new_text = re.sub(
    r'  private lastEmittedContentLen: number = 0;\n  private lastEmittedReasoningLen: number = 0;\n',
    '',
    new_text,
)

CHAT_TS.write_text(new_text, encoding='utf-8')
print(f'OK: replaced feed() ({count} match) and flush() ({count2} match)')
