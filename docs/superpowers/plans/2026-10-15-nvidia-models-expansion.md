# Expansão de Modelos NVIDIA NIM: Google Gemma 4 31B + Qwen-Image & Qwen-Image-Edit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar no Synap todos os novos modelos da chave NVIDIA NIM solicitados pelo usuário:
1. **Google Gemma 4 31B (`google/gemma-4-31b-it`)** no seletor de modelos de chat (com 256k contexto, visão multimodal e tools).
2. **Qwen-Image (`qwen/qwen-image`)** e **Qwen-Image-Edit (`qwen/qwen-image-edit`)** no backend `/api/image.ts` para geração do zero e edição de fotos.

**Architecture:** 
- No Chat: Registrar `'google/gemma-4-31b-it'` em `src/lib/models.ts`, `src/lib/types.ts` e `src/components/model-controls.tsx`. No backend `api/chat.ts`, incluir o modelo nas listas de visão e ferramentas, enviando o payload diretamente para `https://integrate.api.nvidia.com/v1/chat/completions`.
- No Motor de Imagem: Atualizar `api/image.ts` para usar a `env.NVIDIA_API_KEY` nos endpoints oficiais `https://ai.api.nvidia.com/v1/genai/qwen/qwen-image` e `qwen-image-edit`, com retorno Data URI Base64 e fallback para FLUX.

**Tech Stack:** Node.js, Cloudflare Pages Worker, NVIDIA NIM API, React 19, TypeScript.

## Global Constraints
- Total retrocompatibilidade com os modelos atuais (GLM-5.3, Flash, DeepSeek e Qwen Coder).
- Manter zero erros no `tsc --noEmit` e suíte de testes passando (`npm test`).
- Fallback automático para FLUX caso a cota de imagens da NVIDIA oscile.

---

### Task 1: Habilitar Google Gemma 4 31B no Chat e Visão
**Files:**
- Modify: `src/lib/models.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/components/model-controls.tsx`
- Modify: `api/chat.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Adicionar `'google/gemma-4-31b-it'` aos tipos e constantes**
  - Em `models.ts`: incluir em `ALLOWED_MODELS` e `VISION_MODELS`.
  - Em `types.ts`: atualizar o union `ModelId`.
- [ ] **Step 2: Configurar o seletor de modelos na UI (`model-controls.tsx`)**
  - Adicionar card com título `Gemma 4 31B`, subtítulo `Google DeepMind multimodal (256k contexto, visão e lógica)` e badge `Google · 31B`.
- [ ] **Step 3: Ajustar roteamento e permissões no backend (`api/chat.ts`)**
  - Incluir em `isVisionCapable` para aceitar imagens anexadas no prompt.
  - Incluir em `modelSupportsTools` para execução de terminal, busca e skills.
- [ ] **Step 4: Atualizar validação de storage e flash em `src/App.tsx`**

---

### Task 2: Habilitar Qwen-Image e Qwen-Image-Edit no Motor de Imagens
**Files:**
- Modify: `api/image.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Conectar `api/image.ts` aos endpoints NVIDIA NIM**
  - Chamar `https://ai.api.nvidia.com/v1/genai/qwen/qwen-image` para geração nova.
  - Chamar `https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit` para edição com imagem base (`image_url`).
  - Extrair `artifacts[0].base64` e retornar Data URI `data:image/jpeg;base64,...`.
- [ ] **Step 2: Fallback transparente para FLUX (Pollinations)**
- [ ] **Step 3: Atualizar `IMAGE_GEN_TOOL` em `src/App.tsx` com parâmetro `image_url`**

---

### Task 3: Verificação e Build
- [ ] **Step 1: Validar tipos com `npm run lint` (`tsc --noEmit`)**
- [ ] **Step 2: Executar suite de testes (`npm test`)**
- [ ] **Step 3: Compilar bundle de produção com `npm run build`**
- [ ] **Step 4: Atualizar `walkthrough.md` com os novos modelos disponíveis**
