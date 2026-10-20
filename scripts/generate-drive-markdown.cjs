const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, ".tmp", "drive-docs");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Extensões de código aceitas
const VALID_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md"]);

// Pastas ou arquivos que NUNCA devem entrar
const IGNORED_PATHS = [
  "node_modules",
  "dist",
  ".git",
  ".tmp",
  "scratch",
  "graphify-out",
  "brain",
  ".gemini",
  ".antigravity",
  "package-lock.json",
  "bun.lock"
];

function isIgnored(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  for (const ign of IGNORED_PATHS) {
    if (norm === ign || norm.startsWith(ign + "/")) return true;
  }
  // Ignora arquivos de teste para manter os markdowns super leves para o Gemini
  if (norm.endsWith(".test.ts") || norm.endsWith(".test.tsx") || norm.endsWith(".spec.ts")) {
    return true;
  }
  // Ignora arquivos json secundários gigantes ou gerados
  if (norm.endsWith(".json") && !["package.json", "tsconfig.json", "vercel.json", "_routes.json"].includes(path.basename(norm))) {
    return true;
  }
  return false;
}

function collectFiles(dir, baseDir = ROOT_DIR) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (isIgnored(relPath)) continue;

    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTENSIONS.has(ext)) {
        results.push({ fullPath, relPath });
      }
    }
  }

  return results;
}

function buildMarkdownBundle(title, description, files) {
  let md = `# ${title}\n\n`;
  md += `> **Descrição:** ${description}\n`;
  md += `> **Gerado em:** ${new Date().toISOString()}\n`;
  md += `> **Total de Arquivos:** ${files.length}\n\n`;

  md += `## 📑 Sumário de Arquivos\n`;
  for (const f of files) {
    md += `- \`${f.relPath.replace(/\\/g, "/")}\`\n`;
  }
  md += `\n---\n\n`;

  for (const f of files) {
    const norm = f.relPath.replace(/\\/g, "/");
    try {
      const content = fs.readFileSync(f.fullPath, "utf8");
      const ext = path.extname(f.relPath).replace(".", "") || "txt";
      md += `## 📄 Arquivo: \`${norm}\`\n\n`;
      md += "```" + ext + "\n";
      md += content.trim();
      md += "\n```\n\n---\n\n";
    } catch (err) {
      console.warn(`Erro ao ler arquivo ${norm}:`, err.message);
    }
  }

  return md;
}

// 1. Coleta todos os arquivos relevantes do projeto
const allFiles = collectFiles(ROOT_DIR);

// Categorização em 3 arquivos objetivos para leitura ágil pelo Gemini
const frontendFiles = allFiles.filter(f => {
  const norm = f.relPath.replace(/\\/g, "/");
  return (
    norm.startsWith("src/components") ||
    norm === "src/App.tsx" ||
    norm === "src/index.css" ||
    norm === "src/theme-vars.generated.css" ||
    norm === "index.html"
  );
});

const backendFiles = allFiles.filter(f => {
  const norm = f.relPath.replace(/\\/g, "/");
  return (
    norm.startsWith("api/") ||
    norm.startsWith("lib/server/") ||
    norm === "server.ts" ||
    norm === "_worker.ts"
  );
});

const architectureFiles = allFiles.filter(f => {
  const norm = f.relPath.replace(/\\/g, "/");
  return (
    norm.startsWith("src/lib/") ||
    norm.startsWith("src/workers/") ||
    norm === "package.json" ||
    norm === "tsconfig.json" ||
    norm === "vite.config.ts" ||
    norm === "vercel.json" ||
    norm === "_routes.json"
  );
});

console.log(`Frontend: ${frontendFiles.length} arquivos`);
console.log(`Backend: ${backendFiles.length} arquivos`);
console.log(`Arquitetura & Motores: ${architectureFiles.length} arquivos`);

// Gera os 3 markdowns
const frontendMd = buildMarkdownBundle(
  "Éden - Frontend, Componentes e Telas",
  "Interface React completa, Chat interativo, Modais (Inpaint, OpenCut, Robôs), Sidebar, Header, Canvas e Temas.",
  frontendFiles
);

const backendMd = buildMarkdownBundle(
  "Éden - Backend, Servidor e Rotas Edge",
  "Servidor Express local, Cloudflare Pages Advanced Worker, Endpoints Serverless (/api/chat, /api/image, /api/inpaint, /api/transcribe, /api/fetch-url) e blindagem de segurança anti-SSRF.",
  backendFiles
);

const architectureMd = buildMarkdownBundle(
  "Éden - Arquitetura, Motores e Tipos",
  "Motores lógicos (Inpainting, OpenCut, Context Compaction, Web Search, Knowledge Base, Storage IndexedDB), Tipos TypeScript e configurações de build.",
  architectureFiles
);

fs.writeFileSync(path.join(OUTPUT_DIR, "1_Frontend_e_Componentes.md"), frontendMd, "utf8");
fs.writeFileSync(path.join(OUTPUT_DIR, "2_Backend_e_APIs.md"), backendMd, "utf8");
fs.writeFileSync(path.join(OUTPUT_DIR, "3_Arquitetura_Motores_e_Tipos.md"), architectureMd, "utf8");

const size1 = (Buffer.byteLength(frontendMd) / 1024).toFixed(1);
const size2 = (Buffer.byteLength(backendMd) / 1024).toFixed(1);
const size3 = (Buffer.byteLength(architectureMd) / 1024).toFixed(1);

console.log(`✅ 1_Frontend_e_Componentes.md gerado com sucesso (${size1} KB)`);
console.log(`✅ 2_Backend_e_APIs.md gerado com sucesso (${size2} KB)`);
console.log(`✅ 3_Arquitetura_Motores_e_Tipos.md gerado com sucesso (${size3} KB)`);
