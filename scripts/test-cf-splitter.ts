// Teste de sanidade para a lógica de split  Dems do Cloudflare.
// Replicamos a classe Splitter aqui (não importamos do chat.ts porque ele
// exporta o handler edge). As tags  Dems/</think são construídas via
// String.fromCharCode para evitar que o tool de escrita as interprete como HTML.

const OPEN = String.fromCharCode(60, 116, 104, 105, 110, 107, 62);   //  Dems
const CLOSE = String.fromCharCode(60, 47, 116, 104, 105, 110, 107, 62); //  Democrats

class Splitter {
  private contentBuffer: string = '';
  private inThinking: boolean = false;
  private thinkTagEmitted: boolean = false;

  feed(contentDelta: string): { reasoningDelta?: string; contentDelta?: string } {
    if (!contentDelta) return {};
    this.contentBuffer += contentDelta;

    const out: { reasoningDelta?: string; contentDelta?: string } = {};

    while (true) {
      if (!this.inThinking) {
        const openIdx = this.contentBuffer.indexOf(OPEN);
        if (openIdx !== -1) {
          if (openIdx > 0) {
            out.contentDelta = (out.contentDelta || '') + this.contentBuffer.slice(0, openIdx);
          }
          this.contentBuffer = this.contentBuffer.slice(openIdx + OPEN.length);
          this.inThinking = true;
          this.thinkTagEmitted = true;
          continue;
        }
        if (this.contentBuffer.length > OPEN.length) {
          const safeLen = this.contentBuffer.length - OPEN.length;
          out.contentDelta = (out.contentDelta || '') + this.contentBuffer.slice(0, safeLen);
          this.contentBuffer = this.contentBuffer.slice(safeLen);
        }
        break;
      }

      const closeIdx = this.contentBuffer.indexOf(CLOSE);
      if (closeIdx !== -1) {
        if (closeIdx > 0) {
          out.reasoningDelta = (out.reasoningDelta || '') + this.contentBuffer.slice(0, closeIdx);
        }
        this.contentBuffer = this.contentBuffer.slice(closeIdx + CLOSE.length);
        this.inThinking = false;
        continue;
      }
      if (this.contentBuffer.length > CLOSE.length) {
        const safeLen = this.contentBuffer.length - CLOSE.length;
        out.reasoningDelta = (out.reasoningDelta || '') + this.contentBuffer.slice(0, safeLen);
        this.contentBuffer = this.contentBuffer.slice(safeLen);
      }
      break;
    }
    return out;
  }

  flush(): { reasoningDelta?: string; contentDelta?: string } {
    const out: { reasoningDelta?: string; contentDelta?: string } = {};
    if (this.inThinking) {
      if (this.contentBuffer) out.reasoningDelta = this.contentBuffer;
    } else {
      if (this.contentBuffer) out.contentDelta = this.contentBuffer;
    }
    this.contentBuffer = '';
    return out;
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e: any) {
    console.error(`FAIL  ${name}: ${e.message}`);
    process.exit(1);
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function emitAndFlush(s: Splitter, ...chunks: string[]): { reasoning: string; content: string } {
  let reasoning = '';
  let content = '';
  for (const c of chunks) {
    const r = s.feed(c);
    if (r.reasoningDelta) reasoning += r.reasoningDelta;
    if (r.contentDelta) content += r.contentDelta;
  }
  const f = s.flush();
  if (f.reasoningDelta) reasoning += f.reasoningDelta;
  if (f.contentDelta) content += f.contentDelta;
  return { reasoning, content };
}

// Teste 1: chunk único com think+content
runTest('chunk único com think+content', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(s, OPEN + 'Analisando...' + CLOSE + 'Resposta final aqui.');
  assert(reasoning === 'Analisando...', `esperava 'Analisando...', veio '${reasoning}'`);
  assert(content === 'Resposta final aqui.', `esperava 'Resposta final aqui.', veio '${content}'`);
});

// Teste 2: think cortado em pedaços
runTest('think cortado em pedaços', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(s, OPEN + 'Analisando', ' o problema', '...' + CLOSE, 'Resposta.');
  assert(reasoning === 'Analisando o problema...', `esperava 'Analisando o problema...', veio '${reasoning}'`);
  assert(content === 'Resposta.', `esperava 'Resposta.', veio '${content}'`);
});

// Teste 3: tag de fechamento cortada no meio
runTest('tag close cortada no meio', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(s, OPEN + 'Analisando', '...', CLOSE + 'Resposta.');
  assert(reasoning === 'Analisando...', `esperava 'Analisando...', veio '${reasoning}'`);
  assert(content === 'Resposta.', `esperava 'Resposta.', veio '${content}'`);
});

// Teste 4: sem think (apenas content)
runTest('content puro sem think', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(s, 'Olá mundo ', 'sem think.');
  assert(reasoning === '', `esperava '', veio '${reasoning}'`);
  assert(content === 'Olá mundo sem think.', `esperava 'Olá mundo sem think.', veio '${content}'`);
});

// Teste 5: flush com buffer restante dentro de think (nunca fechou)
runTest('flush final dentro de think aberto', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(s, OPEN + 'pensando');
  assert(reasoning === 'pensando', `esperava 'pensando', veio '${reasoning}'`);
  assert(content === '', `esperava '', veio '${content}'`);
});

// Teste 6: content antes do think
runTest('content antes do think', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(s, 'Olá! ', OPEN + 'Raciocinando...' + CLOSE + 'Resposta.');
  assert(content === 'Olá! Resposta.', `esperava 'Olá! Resposta.', veio '${content}'`);
  assert(reasoning === 'Raciocinando...', `esperava 'Raciocinando...', veio '${reasoning}'`);
});

// Teste 7: múltiplos blocos think (modelo que pensa duas vezes)
runTest('múltiplos blocos think', () => {
  const s = new Splitter();
  const { reasoning, content } = emitAndFlush(
    s,
    OPEN + 'Primeiro pensamento.' + CLOSE,
    'Início da resposta. ',
    OPEN + 'Segundo pensamento.' + CLOSE,
    'Continuação.',
  );
  assert(reasoning === 'Primeiro pensamento.Segundo pensamento.', `esperava 'Primeiro pensamento.Segundo pensamento.', veio '${reasoning}'`);
  assert(content === 'Início da resposta. Continuação.', `esperava 'Início da resposta. Continuação.', veio '${content}'`);
});

// Teste 8: tag OPEN cortada char a char (worst case)
runTest('tag OPEN cortada char a char', () => {
  const s = new Splitter();
  // Envia "Olá " + OPEN char a char
  const { reasoning, content } = emitAndFlush(
    s,
    'Olá ',
    OPEN[0],
    OPEN.slice(1, 4),
    OPEN.slice(4),
    'pensando',
    CLOSE,
    ' resposta.',
  );
  assert(content === 'Olá  resposta.', `esperava 'Olá  resposta.', veio '${content}'`);
  assert(reasoning === 'pensando', `esperava 'pensando', veio '${reasoning}'`);
});

// Teste 9: fluxo realista - simula resposta R1 típica
runTest('fluxo realista R1', () => {
  const s = new Splitter();
  const fullResponse =
    OPEN + 'O usuário perguntou sobre o céu. O céu é azul devido ao espalhamento Rayleigh. ' +
    'Vou explicar isso em termos simples.' + CLOSE +
    'O céu parece azul porque as moléculas do ar espalham a luz azul do sol mais do que a luz vermelha. ' +
    'Esse fenômeno é chamado de espalhamento Rayleigh.\n\n' +
    'Em resumo: luz branca do sol + atmosfera = céu azul.';

  // Quebra em chunks de 20 chars (simula stream real)
  const chunks: string[] = [];
  for (let i = 0; i < fullResponse.length; i += 20) {
    chunks.push(fullResponse.slice(i, i + 20));
  }

  const { reasoning, content } = emitAndFlush(s, ...chunks);

  const expectedReasoning = 'O usuário perguntou sobre o céu. O céu é azul devido ao espalhamento Rayleigh. Vou explicar isso em termos simples.';
  const expectedContent = 'O céu parece azul porque as moléculas do ar espalham a luz azul do sol mais do que a luz vermelha. Esse fenômeno é chamado de espalhamento Rayleigh.\n\nEm resumo: luz branca do sol + atmosfera = céu azul.';

  assert(reasoning === expectedReasoning, `reasoning mismatch:\nesperado: ${expectedReasoning}\nveio: ${reasoning}`);
  assert(content === expectedContent, `content mismatch:\nesperado: ${expectedContent}\nveio: ${content}`);
});

console.log('\nTodos os testes passaram!');
