const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.resolve(__dirname, "..", ".tmp", "drive-docs");
const WEBHOOK_URL = (process.env.GDRIVE_WEBHOOK_URL || "").trim();
const SECRET_TOKEN = process.env.GDRIVE_SECRET_TOKEN || "eden-secret";

async function main() {
  if (!WEBHOOK_URL) {
    console.error("❌ ERRO FATAL: GDRIVE_WEBHOOK_URL não configurada no GitHub Secrets.");
    process.exit(1);
  }

  if (!WEBHOOK_URL.includes("/exec")) {
    console.warn("⚠️ AVISO: A URL do webhook deve terminar com '/exec' (URL de Implantação do App da Web).");
    console.warn(`URL recebida: ${WEBHOOK_URL}`);
  }

  const filesToSync = [
    "1_Frontend_e_Componentes.md",
    "2_Backend_e_APIs.md",
    "3_Arquitetura_Motores_e_Tipos.md"
  ];

  for (const fileName of filesToSync) {
    const filePath = path.join(DOCS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`Arquivo não encontrado: ${filePath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const payload = JSON.stringify({
      token: SECRET_TOKEN,
      fileName,
      content
    });

    console.log(`📤 Enviando ${fileName} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB) para o Google Drive...`);

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        redirect: "follow"
      });

      const text = await res.text();
      console.log(`[Status ${res.status}] Resposta para ${fileName}: ${text.substring(0, 150)}`);

      if (text.includes("accounts.google.com") || text.includes("Sign in")) {
        console.error("❌ O Google Drive está exigindo Login! Configure a implantação como 'Quem tem acesso: Qualquer pessoa'.");
        process.exit(1);
      }

      if (!text.includes("OK:") && !text.includes("atualizado") && !text.includes("gravado")) {
        console.error(`❌ O Google Drive recusou a gravação de ${fileName}! Resposta recebida: ${text}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Erro ao enviar ${fileName}:`, err.message);
      process.exit(1);
    }
  }

  console.log("🏁 Todos os arquivos foram enviados e confirmados com sucesso no Google Drive!");
}

main().catch(err => {
  console.error("Falha no sync:", err);
  process.exit(1);
});
