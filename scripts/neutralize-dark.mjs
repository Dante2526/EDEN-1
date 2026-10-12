// Converte a paleta escura quente (marrom) para cinzas neutros estilo ChatGPT (preto + cinzas).
// Edita apenas o bloco `.dark` de src/theme-vars.generated.css. Idempotente: valores já cinza permanecem.
import fs from 'node:fs';

const file = 'src/theme-vars.generated.css';
let css = fs.readFileSync(file, 'utf8');
const start = css.indexOf('.dark {');
const head = css.slice(0, start);
let dark = css.slice(start);

const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};
const spread = (h) => {
  const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return Math.max(...v) - Math.min(...v);
};
const gray = (l) => {
  const v = Math.round(Math.max(0, Math.min(1, l)) * 255).toString(16).padStart(2, '0');
  return `#${v}${v}${v}`;
};

dark = dark.replace(/(--c-(bg|fg)-[0-9a-f]{6}): (#[0-9a-f]{6});/g, (m, name, role, hex) => {
  if (spread(hex) > 40) return m; // acentos/saturados: intactos
  const l = lum(hex);
  if (role === 'bg') {
    if (l >= 0.35) return m;
    const isBorder = false; // bg e border compartilham o papel 'bg'; diferença tratada pela curva
    const base = l <= 0.085 ? 0 : 0.04 + (l - 0.07) * 0.65;
    return `${name}: ${gray(base)};`;
  }
  if (l < 0.3) return m;
  return `${name}: ${gray(l)};`;
});

fs.writeFileSync(file, head + dark);
console.log('paleta escura neutralizada');
