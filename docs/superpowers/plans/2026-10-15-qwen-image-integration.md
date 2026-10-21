# Integração Qwen-Image e Qwen-Image-Edit (NVIDIA NIM)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar os modelos visuais da NVIDIA NIM **Qwen-Image** (geração de imagens do zero com alta fidelidade de texto) e **Qwen-Image-Edit** (edição de imagens existentes com consistência) usando a chave `NVIDIA_API_KEY` do usuário, com fallback automático para Pollinations FLUX.

**Architecture:** Atualizar o endpoint serverless `/api/image.ts` para ler `env.NVIDIA_API_KEY`. Quando uma chave estiver presente, direcionar requisições para `https://ai.api.nvidia.com/v1/genai/qwen/qwen-image` (ou `qwen-image-edit` caso uma imagem base seja enviada). Retornar os artefatos visuais diretamente no formato base64 Data URI (`data:image/jpeg;base64,...`). Caso a API da NVIDIA esteja offline, com cota esgotada ou sem chave, ativar o fallback transparente para o motor FLUX.

**Tech Stack:** Node.js, Cloudflare Pages Worker (`_worker.ts`), NVIDIA NIM REST API, React 19, TypeScript.

## Global Constraints
- Nenhuma quebra de retrocompatibilidade: a chamada `generate_image` continua funcionando sem alterar o contrato existente.
- Imagens geradas em Base64 Data URI devem ser renderizadas perfeitamente pelo componente de chat (`chat-message.tsx`).
- Fallback automático para Pollinations FLUX para garantir disponibilidade ininterrupta (zero erros 500 para o usuário).
- Validação estrita de tipos com `tsc --noEmit` e suíte de testes 100% verde (`npm test`).

---

### Task 1: Integração de Qwen-Image e Qwen-Image-Edit no Backend
**Files:**
- Modify: `api/image.ts`

- [ ] **Step 1: Injetar suporte a NVIDIA NIM em `api/image.ts`**
  - Obter `env.NVIDIA_API_KEY` via `getEnv(envArg)`.
  - Suportar parâmetros `prompt`, `aspect_ratio`, `image_url` / `image` e `mode` (`'generate'` | `'edit'`).
  - Chamar `https://ai.api.nvidia.com/v1/genai/qwen/qwen-image` para geração do zero.
  - Chamar `https://ai.api.nvidia.com/v1/genai/qwen/qwen-image-edit` para edição de imagem existente.
  - Extrair o artefato `data.artifacts[0].base64` e montar Data URI `data:image/jpeg;base64,...`.
- [ ] **Step 2: Implementar fallback silencioso e resiliente**
  - Se a requisição NVIDIA falhar ou não houver chave, executar fallback para Pollinations FLUX.
- [ ] **Step 3: Compilar e validar tipos com `tsc --noEmit`**

---

### Task 2: Atualização do Tool Schema e System Prompt no Frontend
**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Atualizar o esquema da ferramenta `IMAGE_GEN_TOOL`**
  - Adicionar o parâmetro opcional `image_url` (para edição de imagem com Qwen-Image-Edit).
  - Atualizar a descrição da ferramenta indicando suporte a **Qwen-Image** e **Qwen-Image-Edit**.
- [ ] **Step 2: Atualizar o handler de execução da ferramenta em `src/App.tsx`**
  - Repassar `image_url` e `mode` na requisição `POST /api/image`.
- [ ] **Step 3: Atualizar a diretriz do System Prompt**
  - Instruir a IA sobre a capacidade de editar imagens de referência fornecidas pelo usuário usando `image_url`.

---

### Task 3: Verificação e Build
- [ ] **Step 1: Executar `npm run lint` (`tsc --noEmit`)**
- [ ] **Step 2: Executar testes automatizados (`npm test`)**
- [ ] **Step 3: Executar `npm run build`**
- [ ] **Step 4: Atualizar `walkthrough.md` com os detalhes da integração**
