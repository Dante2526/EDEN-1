# Task List: Correção do Botão de Gerar Mensagem de Commit

- [x] **Task: Correção do Gerador de Mensagem de Commit e Ajuste Visual do Botão**
  - [x] Step 1: Eliminar o timeout prematuro de 10s em `handleGenerateCommitMessage`, estender para 45s com captura resiliente de chunks e fallback inteligente para nunca deixar o campo vazio
  - [x] Step 2: Ajustar o botão no JSX: manter apenas o `<Sparkles />` amarelinho na esquerda, remover o emoji `✨` duplicado e alterar o texto para apenas `Gerar` (sem `com IA`)
  - [x] Step 3: Atualizar o placeholder do textarea para "Escreva a mensagem ou clique em 'Gerar'..."
  - [x] Step 4: Executar verificação (`npm run lint`, `npm test`, `npm run build`)
