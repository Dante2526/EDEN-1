---
trigger: always_on
description: Garante que qualquer tela, modal, componente ou layout criado no projeto seja projetado Mobile-First.
---

## mobile-first-mandatory

Regras obrigatórias de UI/UX Mobile-First para qualquer alteração ou criação de interface:

1. **Mentalidade Mobile Primeiro:** Projete pensando em telas de 360px a 430px antes de telas maiores. Classes Tailwind base sem prefixo são mobile (`w-full`, `flex-col`, `p-3`).
2. **Modais e Diálogos:** No celular (< 640px), modais devem ser tela cheia ou gaveta (`h-full sm:h-[85vh]`, `p-0 sm:p-4`, `rounded-none sm:rounded-2xl`).
3. **Split-Views (Paineis Duplos):** PROIBIDO colunas fixas lado a lado no celular. Use o fluxo Master-Detail: exiba apenas um painel por vez com botão explícito `← Voltar` no celular, exibindo ambos lado a lado apenas em `sm:` para cima.
4. **Ergonomia e Toque:** Áreas clicáveis e botões devem ter no mínimo 44x44px.
5. **Zero Overflow Horizontal:** Aplique `truncate`, `min-w-0` e `break-words`. PROIBIDO gerar scroll horizontal em celulares.
