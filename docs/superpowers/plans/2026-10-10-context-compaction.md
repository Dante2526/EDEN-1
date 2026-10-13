# Context Compaction Automático Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o sistema de Context Compaction automático no Synap (estilo Claude Code), compactando conversas longas em segundo plano sem perda visual no chat, economizando tokens e blindando a IA contra degradação de contexto.

**Architecture:** Módulo puro e desacoplado (`src/lib/context-compactor.ts`) que avalia o tamanho do histórico, gera um resumo denso das mensagens antigas via `/api/chat` em background e prepara o payload otimizado (`[System: Resumo] + [Últimas N mensagens]`). O estado é persistido em `Conversation.contextCompaction` no IndexedDB e renderizado com um divisor visual elegante (`CompactionMarker`).

**Tech Stack:** React 19, TypeScript 5.7, IndexedDB (`idb-keyval`), Lucide React, Tailwind CSS 4, Vite 8, `tsx`.

## Global Constraints

- Manter 100% das mensagens visíveis na UI do chat (zero deleção para o usuário).
- Compactação assíncrona e não-bloqueante utilizando modelo veloz (`z-ai/glm-5.3-flash`).
- Degradação graciosa: se a compactação falhar por rede, a conversa continua normalmente com o histórico padrão.
- Compatibilidade com persistência local atual e futuros esquemas de banco de dados na nuvem (PC + Mobile).

---

### Task 1: Definição de Tipos para Context Compaction

**Files:**
- Modify: `src/lib/types.ts:1-25, 105-125`

**Interfaces:**
- Produces: `ContextCompaction` interface e extensão de `Conversation` com `contextCompaction?: ContextCompaction`.

- [ ] **Step 1: Adicionar a interface `ContextCompaction` e atualizar `Conversation` em `src/lib/types.ts`**

Adicionar em `src/lib/types.ts`:
```typescript
export interface ContextCompaction {
  summary: string;
  compactedUpToMessageId: string;
  timestamp: number;
  originalMessageCount: number;
}
```
E estender `Conversation`:
```typescript
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  reasoningEffort: 'low' | 'high' | 'max';
  isPlanMode?: boolean;
  activeRepo?: ActiveRepoState | null;
  contextCompaction?: ContextCompaction;
}
```

- [ ] **Step 2: Verificar checagem de tipos TypeScript**

Run: `npx tsc --noEmit`  
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add ContextCompaction interface to Conversation"
```

---

### Task 2: Motor de Compactação de Contexto (`src/lib/context-compactor.ts`)

**Files:**
- Create: `src/lib/context-compactor.ts`
- Create: `src/lib/context-compactor.test.ts`

**Interfaces:**
- Consumes: `Conversation`, `Message`, `ContextCompaction` de `src/lib/types.ts`
- Produces:
  - `COMPACTION_TRIGGER_THRESHOLD`: `number` (16)
  - `RECENT_MESSAGES_WINDOW`: `number` (6)
  - `shouldCompact(conversation: Conversation): boolean`
  - `buildCompactionPrompt(messages: Message[], existingSummary?: string): string`
  - `compactConversation(conversation: Conversation, apiKey: string): Promise<ContextCompaction | null>`
  - `prepareMessagesForApi(conversation: Conversation, systemPrompts?: { repo?: string; base?: string; plan?: string }): any[]`

- [ ] **Step 1: Escrever teste unitário automatizado em `src/lib/context-compactor.test.ts`**

Criar teste verificando:
1. `shouldCompact` retorna `false` para conversas com <= 16 mensagens.
2. `shouldCompact` retorna `true` para conversas com > 16 mensagens não compactadas.
3. `prepareMessagesForApi` injeta o resumo compactado e fatia apenas as mensagens recentes quando `contextCompaction` existe.

- [ ] **Step 2: Rodar teste para verificar que falha (RED)**

Run: `npx tsx src/lib/context-compactor.test.ts`  
Expected: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `src/lib/context-compactor.ts`**

Implementar as funções com limites definidos, montagem do prompt estruturado e fatiamento seguro de mensagens:
```typescript
import { Conversation, Message, ContextCompaction } from './types';

export const COMPACTION_TRIGGER_THRESHOLD = 16;
export const RECENT_MESSAGES_WINDOW = 6;

export function shouldCompact(conversation: Conversation): boolean {
  if (!conversation.messages || conversation.messages.length <= COMPACTION_TRIGGER_THRESHOLD) {
    return false;
  }
  const lastCompactedId = conversation.contextCompaction?.compactedUpToMessageId;
  if (!lastCompactedId) {
    return conversation.messages.length > COMPACTION_TRIGGER_THRESHOLD;
  }
  const lastIndex = conversation.messages.findIndex(m => m.id === lastCompactedId);
  if (lastIndex === -1) return true;
  const uncompactedCount = conversation.messages.length - (lastIndex + 1);
  return uncompactedCount > (COMPACTION_TRIGGER_THRESHOLD - RECENT_MESSAGES_WINDOW);
}

export function buildCompactionPrompt(messages: Message[], existingSummary?: string): string {
  const serializedHistory = messages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n');
  return `Você é o módulo de Context Compaction do Synap.\n` +
    `Sua missão é resumir o histórico técnico a seguir para que a IA das próximas iterações compreenda perfeitamente o contexto sem consumir a janela inteira de tokens.\n\n` +
    (existingSummary ? `RESUMO ANTERIOR:\n${existingSummary}\n\nNOVO HISTÓRICO:\n` : '') +
    `${serializedHistory}\n\n` +
    `ESTRUTURE OBRIGATORIAMENTE EM MARKDOWN COM AS SEGUINTES SEÇÕES:\n` +
    `### 🎯 Objetivo Principal & Requisitos\n` +
    `### 🛠️ Decisões Técnicas & Arquitetura\n` +
    `### 📂 Arquivos Lidos, Modificados & Estado do Código\n` +
    `### ⏳ Pendências & Próximos Passos Imediatos`;
}

export async function compactConversation(conversation: Conversation, apiKey: string): Promise<ContextCompaction | null> {
  try {
    const totalMsgs = conversation.messages.length;
    if (totalMsgs <= RECENT_MESSAGES_WINDOW) return null;
    const splitIndex = totalMsgs - RECENT_MESSAGES_WINDOW;
    const messagesToCompact = conversation.messages.slice(0, splitIndex);
    const lastMessageToCompact = messagesToCompact[messagesToCompact.length - 1];

    const prompt = buildCompactionPrompt(messagesToCompact, conversation.contextCompaction?.summary);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || ''
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: 'z-ai/glm-5.3-flash',
        reasoning_effort: 'low',
        tools: []
      })
    });

    if (!response.ok) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let summary = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) summary += delta;
          } catch {}
        }
      }
    }

    if (!summary.trim()) return null;

    return {
      summary: summary.trim(),
      compactedUpToMessageId: lastMessageToCompact.id,
      timestamp: Date.now(),
      originalMessageCount: messagesToCompact.length
    };
  } catch (err) {
    console.error('Falha silenciosa na compactação de contexto:', err);
    return null;
  }
}

export function prepareMessagesForApi(
  conversation: Conversation,
  systemPrompts: { repo?: string; base?: string; plan?: string } = {}
): any[] {
  let effectiveMessages = [...conversation.messages];
  let compactedSummaryPrompt: any = null;

  if (conversation.contextCompaction) {
    const cutoffId = conversation.contextCompaction.compactedUpToMessageId;
    const cutoffIndex = effectiveMessages.findIndex(m => m.id === cutoffId);
    if (cutoffIndex !== -1) {
      effectiveMessages = effectiveMessages.slice(cutoffIndex + 1);
    }
    compactedSummaryPrompt = {
      role: 'system',
      content: `[CONTEXT COMPACTION SUMMARY - Histórico anterior resumido para economia de tokens]:\n${conversation.contextCompaction.summary}`
    };
  }

  const formatted = effectiveMessages.map(m => {
    let content = m.content || '';
    if (m.documents && m.documents.length > 0) {
      const docsBlock = m.documents.map(d => `[Arquivo anexado: ${d.name}]\n\`\`\`\n${d.content}\n\`\`\``).join('\n\n');
      content = docsBlock + (content ? `\n\n${content}` : '');
    }
    return {
      role: m.role,
      content,
      images: m.images
    };
  });

  const finalMessages: any[] = [];
  if (systemPrompts.base) finalMessages.push({ role: 'system', content: systemPrompts.base });
  if (systemPrompts.repo) finalMessages.push({ role: 'system', content: systemPrompts.repo });
  if (systemPrompts.plan) finalMessages.push({ role: 'system', content: systemPrompts.plan });
  if (compactedSummaryPrompt) finalMessages.push(compactedSummaryPrompt);

  return [...finalMessages, ...formatted];
}
```

- [ ] **Step 4: Rodar teste unitário e verificar aprovação (GREEN)**

Run: `npx tsx src/lib/context-compactor.test.ts`  
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/context-compactor.ts src/lib/context-compactor.test.ts
git commit -m "feat: add context-compactor core engine with tests"
```

---

### Task 3: Componente Visual `CompactionMarker` (`src/components/compaction-marker.tsx`)

**Files:**
- Create: `src/components/compaction-marker.tsx`

**Interfaces:**
- Consumes: `ContextCompaction` de `src/lib/types.ts`
- Produces: `<CompactionMarker compaction={compaction} />`

- [ ] **Step 1: Criar componente `CompactionMarker`**

Componente elegante com ícone `Zap`, contagem de mensagens resumidas e botão acordeom retrátil para inspecionar o resumo markdown:
```tsx
import React, { useState } from 'react';
import { Zap, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ContextCompaction } from '../lib/types';

interface CompactionMarkerProps {
  compaction: ContextCompaction;
}

export const CompactionMarker: React.FC<CompactionMarkerProps> = ({ compaction }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-6 px-4">
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-amber-500/20"></div>
        </div>
        <div className="relative flex items-center gap-2 bg-zinc-900/90 border border-amber-500/30 px-3 py-1.5 rounded-full text-xs font-medium text-amber-300 shadow-sm backdrop-blur-sm">
          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Contexto compactado ({compaction.originalMessageCount} msgs resumidas)</span>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="ml-1 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center"
            title="Ver resumo do contexto"
          >
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-300 shadow-lg max-h-80 overflow-y-auto">
          <div className="font-semibold text-zinc-200 mb-2 flex items-center justify-between">
            <span>Resumo de Memória Ativa</span>
            <span className="text-[10px] text-zinc-500">{new Date(compaction.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="prose prose-invert prose-xs max-w-none text-zinc-300 leading-relaxed">
            <ReactMarkdown>{compaction.summary}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Validar tipos com TypeScript**

Run: `npx tsc --noEmit`  
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/compaction-marker.tsx
git commit -m "feat(ui): add CompactionMarker visual component"
```

---

### Task 4: Integração no Chat (`src/App.tsx`)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `shouldCompact`, `compactConversation`, `prepareMessagesForApi` de `src/lib/context-compactor.ts`, e `CompactionMarker` de `src/components/compaction-marker.tsx`.

- [ ] **Step 1: Integrar `prepareMessagesForApi` no envio do chat em `src/App.tsx`**

Substituir o bloco manual de injeção de mensagens na chamada de `/api/chat` para usar `prepareMessagesForApi(currentConvWithUserMsg, { repo, base, plan })`.

- [ ] **Step 2: Disparar compactação em segundo plano após resposta do assistente**

Após a conclusão da mensagem do assistente em `src/App.tsx`:
```typescript
if (shouldCompact(updatedConversation)) {
  compactConversation(updatedConversation, import.meta.env.VITE_API_SECRET || '')
    .then((compaction) => {
      if (compaction) {
        setConversations(prev => prev.map(c => c.id === updatedConversation.id ? { ...c, contextCompaction: compaction } : c));
      }
    })
    .catch(() => {});
}
```

- [ ] **Step 3: Renderizar `CompactionMarker` na lista de mensagens**

No map de mensagens de `src/App.tsx`, logo acima da primeira mensagem cujo ID seja posterior a `compactedUpToMessageId`, renderizar `<CompactionMarker compaction={currentConv.contextCompaction} />`.

- [ ] **Step 4: Validar compilação e build Vite**

Run: `npx tsc --noEmit && npm run build`  
Expected: 0 erros e build verde.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(chat): integrate automatic context compaction in App.tsx"
```

---

### Task 5: Verificação e Validação Final

**Files:**
- Verify: Todas as alterações integradas.

- [ ] **Step 1: Executar suite de tipos e linter**

Run: `npm run lint`  
Expected: Código 0, sem problemas de tipos.

- [ ] **Step 2: Executar build de produção**

Run: `npm run build`  
Expected: `dist/` gerado com sucesso.

- [ ] **Step 3: Atualizar `walkthrough.md` com os resultados**
