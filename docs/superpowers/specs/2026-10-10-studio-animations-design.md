# Design: Animações Ricas no Studio Panel

## 1. Visão Geral
O objetivo é incorporar as animações de inteligência artificial (iguais às do chat) na aba de Studio, dando vida à execução sequencial dos agentes (Planner, Revisor, Implementador) e aumentando o "Wow-factor" do sistema. A opção escolhida foca em usar os orbs na linha do tempo.

## 2. Abordagem (Avatar Animado na Timeline)
No componente `TimelineCard` (dentro de `studio-panel.tsx`), o ícone à esquerda do card indica qual agente atuou ou está atuando (User, Planner, Reviewer, Implementer, System). 
Vamos substituir ou sobrepor este ícone estático com o componente `ThinkingOrb` (do pacote `thinking-orbs`) durante as fases em que o agente está ativamente trabalhando.

### 2.1. Lógica Visual
*   **Quando em Execução (`isWorking === true` para o agente específico):**
    *   **Planner:** Avatar se torna um `ThinkingOrb state="shaping"` (brilho rápido, laranja/âmbar, `speed={1.5}`).
    *   **Revisor:** Avatar se torna um `ThinkingOrb state="weaving"` (ondas azuis, `speed={1.5}`).
    *   **Implementador:** Avatar se torna um `ThinkingOrb state="composing"` (linhas roxas, `speed={2.0}`).
*   **Quando Concluído (`status === 'success' | 'warning' | 'error'`):**
    *   O `ThinkingOrb` pode voltar a ficar estático ou ser substituído novamente pelo ícone original (Cérebro, Lupa, Raio) envolto por um brilho mais sutil.
    *   *Decisão de Design:* Para maior elegância, quando concluído, voltaremos ao ícone LucideReact original, mas com uma borda iluminada para marcar que a etapa passou, mantendo a tela limpa.

### 2.2. Alterações no Estado da Sessão (`StudioTimelineEntry`)
*   O componente `TimelineCard` precisa saber se a etapa que ele representa está **"em progresso"** ou **"concluída"**. 
*   Já existe um campo `status` em `StudioTimelineEntry` que assume `'info'` (em andamento), `'success'`, `'warning'`, `'error'`. Podemos usar `status === 'info'` para disparar o `ThinkingOrb`.

## 3. Tarefas de Implementação (Resumo)
1.  Importar `ThinkingOrb` de `thinking-orbs` em `src/studio/studio-panel.tsx`.
2.  Atualizar o renderizador do avatar no `TimelineCard`. Se `entry.status === 'info'` e `entry.actor !== 'user'`, renderizar o orb.
3.  Ajustar as cores e tamanhos para encaixar perfeitamente no slot `w-6 h-6` ou `w-8 h-8` do avatar.
4.  Substituir o pequeno `Loader2` por `ThinkingOrb state="working" size={16}` na lista de passos iterativos (`entry.steps` quando em progresso).

## 4. Revisão e Limites
*   Não alteraremos a lógica de backend ou dos agentes (Planner/Revisor/Implementador).
*   Garantiremos que não haja erro de layout em telas menores.
