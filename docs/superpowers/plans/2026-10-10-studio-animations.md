# Studio Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar animações ricas (`ThinkingOrb`) ao Studio Panel para indicar agentes em ação (Kimi, GLM, Implementador).

**Architecture:** O componente `TimelineCard` de `src/studio/studio-panel.tsx` será alterado para condicionalmente renderizar o `ThinkingOrb` baseado no `status` da etapa e da sub-etapa.

**Tech Stack:** React, TailwindCSS, `thinking-orbs`

## Global Constraints
- Manter o layout responsivo atual do Studio.
- Garantir que apenas o agente ativo/em progresso (`status === 'info'`) exiba a animação completa.

---

### Task 1: Integrar ThinkingOrb no Avatar da Timeline

**Files:**
- Modify: `src/studio/studio-panel.tsx`

**Interfaces:**
- Consumes: `ThinkingOrb` do pacote `thinking-orbs`.

- [ ] **Step 1: Importar o componente**

Modificar os imports no topo de `src/studio/studio-panel.tsx`:
```tsx
import { ThinkingOrb } from 'thinking-orbs';
```

- [ ] **Step 2: Lógica de estado e renderização do Avatar animado**

Localizar o componente `TimelineCard` e substituir a renderização do Avatar (por volta da linha 820) para injetar o Orb quando `entry.status === 'info'` e `entry.actor !== 'user'`.

```tsx
        <div
          className={`w-6 h-6 rounded-lg ${actor.bg} border border-[#2d2b26] flex items-center justify-center overflow-hidden`}
        >
          {entry.status === 'info' && entry.actor !== 'user' ? (
            <ThinkingOrb 
              state={entry.actor === 'planner' ? 'shaping' : entry.actor === 'reviewer' ? 'weaving' : 'composing'} 
              size={24} 
              theme="dark" 
              speed={entry.actor === 'implementer' ? 2.0 : 1.5} 
            />
          ) : (
            <actor.icon className={`w-3.5 h-3.5 ${actor.color} ${entry.status === 'success' ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : ''}`} />
          )}
        </div>
```

- [ ] **Step 3: Substituir o Loader2 nos sub-passos**

Ainda no `TimelineCard`, localizar a renderização dos sub-passos (`entry.type === 'progress'`). Substituir o `<Loader2 animate-spin />` do `step.status === 'in_progress'` pelo mini orb.

```tsx
                    <span className="flex-shrink-0 mt-0.5">
                      {step.status === 'completed' ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : step.status === 'in_progress' ? (
                        <div className="w-4 h-4 rounded-full flex items-center justify-center overflow-hidden">
                          <ThinkingOrb state="working" size={16} theme="dark" speed={1.5} />
                        </div>
                      ) : step.status === 'failed' ? (
                        <X className="w-4 h-4 text-rose-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[#3b3831]" />
                      )}
                    </span>
```

- [ ] **Step 4: Executar Lint e Build**

Executar build e lint para confirmar que não existem erros de tipagem.
Run: `npm run build` ou o equivalente do projeto.

- [ ] **Step 5: Commit**

```bash
git add src/studio/studio-panel.tsx
git commit -m "feat(studio): add thinking orb animations to timeline cards"
```
