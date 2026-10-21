# Plano de Implementação: Mini-Editor Visual de Imagem Mobile-First (Pincel & Retoque)

> **Para executores:** Seguir TDD, regras de isolamento e validação estrita.

**Objetivo:** Permitir que o usuário toque/clique sobre qualquer imagem anexada ou gerada no Synap para destacar a área exata a alterar (via pincel touch-friendly), digitando a instrução de alteração para a IA com suporte total a celulares e desktops.

---

### 1. Arquitetura Mobile-First (Celulares & Desktops)
- **Prevenção de Scroll Acidental:** O canvas utiliza `touch-action: none` e listeners de Pointer Events (`pointerdown`, `pointermove`, `pointerup`), permitindo pintar com o dedo no celular sem mover a tela.
- **Ergonomia do Polegar (Mobile Toolbar):** Controles principais (Tamanho do pincel, Desfazer, Limpar e Botão de Enviar) posicionados na parte inferior da tela no mobile, com touch targets de no mínimo 48x48px.
- **Responsividade Fullscreen:** Em telas menores que 640px, o modal ocupa 100% da viewport (`inset-0 h-full w-full`); em desktops, abre como um modal flutuante centralizado e elegante.

---

### 2. Componentes e Módulos

#### Componente 1: `src/components/image-editor-modal.tsx`
- **Canvas Duplo Interativo:**
  1. *Layer de Base:* Renderiza a imagem original redimensionada proporcionalmente via `object-contain`.
  2. *Layer de Máscara:* Canvas transparente onde o usuário desenha a área a modificar com tinta semi-transparente (azul neon / ciano translúcido com brilho).
- **Barra de Ações:**
  - Slider ergonômico de espessura do pincel (fino, médio, grosso).
  - Botão "Desfazer" e "Limpar Seleção".
  - Campo de prompt: *"O que deseja alterar nesta área?"*.
  - Botão de ação direta: *"Aplicar Retoque"*.

#### Componente 2: Botão de Acesso Rápido nas Imagens (`src/components/chat-message.tsx`)
- Nas imagens renderizadas no chat (ou anexos pré-envio), adiciona um botão flutuante discreto com ícone de pincel/varinha mágica (`Pencil` / `Wand2`) com label *"Retocar"*.
- Ao tocar, abre instantaneamente o `ImageEditorModal`.

#### Módulo 3: Helper de Processamento Visual (`src/lib/image-mask-helper.ts` com TDD)
- Extrai a máscara binária (preto e branco) e a bounding box (coordenadas e porcentagens) da área desenhada pelo usuário.
- Se a área estiver selecionada, gera a instrução contextual enriquecida para o `qwen-image-edit` (ex.: *"Na região destacada da imagem [X%, Y%], faça: <prompt do usuário>"*).
- 100% testado via testes unitários automatizados.

---

### 3. Fases de Execução
1. **Fase 1 (TDD):** Implementar e testar `src/lib/image-mask-helper.ts`.
2. **Fase 2 (UI Mobile-First):** Criar `src/components/image-editor-modal.tsx` com canvas touch-friendly.
3. **Fase 3 (Integração):** Adicionar botão de disparo no `chat-message.tsx` e conectar com o fluxo de envio da mensagem.
4. **Fase 4 (Verificação):** `npm test`, `npm run lint` (`tsc --noEmit`), `npm run build`.
