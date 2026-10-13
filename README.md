# Synap — AI Chat (NVIDIA NIM & GLM)

App web de chat com IA estilo ChatGPT, conectado à API da NVIDIA NIM (endpoint OpenAI-compatible), com suporte a modelos GLM-5.3, GLM-5.3-Flash e Moonshot Kimi K3, controle completo de `reasoning_effort`, visão multimodal (imagens), voz nativa (STT e TTS) e histórico offline salvo no IndexedDB.

---

## 📐 Antes de modificar o código

> **AVISO PARA AGENTES IA e DESENVOLVEDORES**: Antes de modificar qualquer arquivo em `api/`, `vercel.json`, ou trocar `reasoning_effort` / `runtime`, **LEIA o [ARCHITECTURE.md](./ARCHITECTURE.md)**. Ele contém 15 regras críticas (com justificativas) sobre o que NÃO fazer e por quê — cada regra foi paga com erro 500 em produção.

Decisões arquiteturais importantes documentadas lá:
- Por que usar `runtime: 'edge'` (NUNCA `nodejs`)
- Por que `_security.ts` NÃO pode estar em `api/`
- Por que imports relativos NÃO podem ter extensão `.ts`
- IDs corretos dos modelos NVIDIA (`moonshotai/kimi-k3`, não `z-ai/kimi-k3`)
- Como resolver lentidão (modelo Flash + reasoning low, NÃO trocar runtime)
- E mais 10 regras

---

## 🚀 Como Rodar

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie o modelo de ambiente:
```bash
cp .env.example .env.local
```
*(ou se preferir, pode nomear como `.env`)*

Edite o arquivo gerado e configure suas chaves de API:
```env
# 1. Chave da NVIDIA NIM (Obrigatória para o Chat e Modelos GLM-5.3)
NVIDIA_API_KEY=nvapi-sua-chave-aqui

# 2. Chave Google Gemini (Opcional - para Voz Neural de Estúdio em Português pt-BR)
GEMINI_API_KEY=AIzaSy-sua-chave-aqui

# 3. GitHub Token (Recomendado para Source Control e edição de repositórios)
GITHUB_TOKEN=ghp_seu-token-aqui
```

#### Onde obter as chaves gratuitas:
- **`NVIDIA_API_KEY`**: Obtenha gratuitamente com créditos em [build.nvidia.com](https://build.nvidia.com).
- **`GEMINI_API_KEY`**: Obtenha em segundos sem custo no Google AI Studio em [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
- **`GITHUB_TOKEN`**: Gere em [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) com escopos "Contents: Read and Write" e "Metadata: Read".
  > **Nota de Segurança**: Configurar `GITHUB_TOKEN` nas variáveis de ambiente da Vercel ou no `.env.local` é a forma mais segura, pois o token permanece no servidor e nunca precisa ser salvo no navegador.
  > **Nota sobre o TTS Neural**: A `GEMINI_API_KEY` alimenta o modelo neural `gemini-3.8-flash-lite-tts`, que lê o texto em português brasileiro nativo sem sotaque estrangeiro (vozes *Aoede*, *Kore*, *Puck*, *Charon*). Se a chave não for configurada, o aplicativo automaticamente utilizará a síntese local do navegador (Web Speech API).

### 3. Iniciar o servidor
```bash
npm run dev
```

### 4. Acessar no navegador
- **No PC**: [http://localhost:3000](http://localhost:3000)
- **No Celular (mesma Wi-Fi)**: `http://[IP-DO-SEU-PC]:3000`
- **No Celular (via Tailscale / qualquer lugar)**: `http://[IP-TAILSCALE-DO-PC]:3000`

---

## 🌐 Como Fazer Deploy na Vercel (Passo a Passo)

O projeto já está 100% pronto para a Vercel com Edge Functions para streaming SSE sem limite de tempo e sem buffer.

### Método 1: Pelo GitHub (Recomendado)
1. Crie um repositório no seu GitHub (pode ser privado ou público).
2. Suba o projeto para o GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: chat nvidia nim"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
3. Acesse [vercel.com](https://vercel.com) e faça login com seu GitHub.
4. Clique em **"Add New..."** > **"Project"** e importe o repositório do chat.
5. Na tela de configuração antes de clicar em Deploy:
   - Expanda **"Environment Variables"**.
   - Adicione:
     - `NVIDIA_API_KEY`: sua chave da NVIDIA (`nvapi-...`).
     - `GEMINI_API_KEY`: sua chave do Google AI Studio para voz neural pt-BR (`AIzaSy...`).
     - `GITHUB_TOKEN`: seu token do GitHub com escopos "Contents: Read and Write" + "Metadata: Read" para navegação e Source Control.
6. Clique no botão **Deploy**.
7. Pronto! A Vercel vai gerar uma URL pública com HTTPS (ex: `https://meu-chat.vercel.app`) para você usar tanto no PC quanto no celular em qualquer lugar.

### Método 2: Pela CLI da Vercel
```bash
npm i -g vercel
vercel
```
Durante o processo, informe as variáveis `NVIDIA_API_KEY` e `GEMINI_API_KEY`.

---

## ⚡ Funcionalidades Principais

1. **Multi-conversa com Persistência Local**:
   - Sidebar com listagem de conversas, timestamps e títulos automáticos.
   - Renomeação e exclusão de conversas.
   - Salvo no IndexedDB via `idb-keyval` (continua salvo mesmo após fechar o navegador).
   - Exportação do histórico completo em JSON e opção de limpeza total com confirmação dupla.

2. **Conexão Segura com NVIDIA NIM**:
   - Proxy server-side em `/api/chat` via Express.
   - A `NVIDIA_API_KEY` **nunca** é exposta ao navegador do usuário.
   - Streaming Server-Sent Events (SSE) palavra por palavra.

3. **Controle de `reasoning_effort`**:
   - Seletor visível no topo (`low`, `high`, `max`).
   - Enviado no nível raiz da requisição para a NVIDIA (`payload.reasoning_effort`).
   - Persistido no `localStorage`.

4. **Modelos Suportados**:
   - `GLM-5.3 (Pensar)` (`z-ai/glm-5.3`): Modo texto focado em raciocínio analítico.
   - `GLM-5.3-Flash (Rápido + Visão)` (`z-ai/glm-5.3-flash`): Multimodal com suporte a upload de imagens.
   - `Kimi K3 (Visão Expandida)` (`moonshotai/kimi-k3`): O modelo da Moonshot AI com capacidades robustas de visão multimodal.

5. **Visão Multimodal**:
   - Upload de imagens (PNG, JPG, WebP, GIF até 5MB).
   - Conversão para base64 no formato padrão OpenAI `image_url`.
   - Suporte a múltiplas imagens por mensagem.

6. **Voz Neural de Alta Fidelidade (TTS Gemini 3.8 Flash Lite) & Transcrição (STT)**:
   - **Voz Neural (Text-to-Speech)**: Modelo `gemini-3.8-flash-lite-tts` com metadados de estilo para pronúncia e entonação nativas do Brasil (sem sotaque americano ou voz robotizada).
   - **Seleção de Vozes Reais**: Suporte às vozes de estúdio `Aoede` (feminina expressiva recomendada para pt-BR), `Kore` (suave), `Puck` (masculina jovem amigável), `Charon` (masculina profissional) e `Fenrir`.
   - **Fallback Inteligente**: Se a `GEMINI_API_KEY` não estiver definida, a aplicação utiliza automaticamente o sintetizador local do navegador (`window.speechSynthesis`), exibindo aviso transparente na interface.
   - **Entrada por Voz (Speech-to-Text)**: Botão de microfone com reconhecimento contínuo em português (`pt-BR`).

7. **Renderização de Markdown & Código**:
   - Suporte completo a tabelas, listas, links e blocos de código com botão de cópia com feedback instantâneo.
   - Accordion de raciocínio (Thinking process) expansível.

8. **PWA (Progressive Web App)**:
   - `manifest.json` completo e service worker para cache do shell.
   - Instalável na tela de início de celulares Android e iOS.
