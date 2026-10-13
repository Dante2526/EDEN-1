// Codemod: troca cores hex fixas (Tailwind arbitrary values) por variáveis CSS
// que mudam com o tema (.dark / claro). Uso: node scripts/migrate-theme.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');
const SKIP_FILES = new Set(['code-block.tsx', 'terminal-panel.tsx']); // ilhas escuras nos dois temas
const FG = new Set(['text', 'placeholder', 'fill', 'stroke', 'caret', 'decoration', 'accent']);
const BG = new Set(['bg', 'border', 'divide', 'ring', 'from', 'to', 'via', 'outline']);

function hexToRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l, spread: (max - min) * 255 };
}
function hslToHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// Retorna o valor do tema claro, ou null para manter o hex original (acentos).
function lightValue(role, hex) {
  const hsl = rgbToHsl(hexToRgb(hex));
  const neutral = hsl.spread <= 40 || hsl.s < 0.25;
  if (role === 'fg') {
    if (hsl.l < 0.3) return null;
    if (neutral) return hslToHex({ h: 0, s: 0, l: 0.08 + (1 - hsl.l) * 0.62 });
    if (hsl.l > 0.55) return hslToHex({ h: hsl.h, s: Math.max(0.5, hsl.s - 0.15), l: Math.max(0.36, hsl.l - 0.22) });
    return null;
  }
  if (hsl.l >= 0.35) return null;
  if (neutral) return hslToHex({ h: 0, s: 0, l: Math.min(0.99, 0.99 - (hsl.l - 0.07) * 0.9) });
  return hslToHex({ h: hsl.h, s: Math.min(hsl.s, 0.6), l: 0.93 - hsl.l * 0.3 });
}

const vars = new Map(); // nome -> { dark, light }
const ACCENT_BG = /bg-\[(#d97757|#c26647|#c96442)\]|bg-(red|green|emerald|blue|rose|amber|indigo|purple|sky|orange)-\d+|bg-gradient|from-\[#d97757/;

function transform(src) {
  const lines = src.split('\n');
  return lines
    .map((line) => {
      // text-white em superfícies neutras fica ilegível no tema claro
      if (/\btext-white\b/.test(line) && !ACCENT_BG.test(line)) {
        line = line.replace(/\btext-white(\/\d+)?/g, (_m, a) => `text-[color:var(--c-on-strong)]${a ?? ''}`);
      }
      return line.replace(/(?<![A-Za-z])([a-z]+)(?:-[a-z]{1,2})?-\[(#[0-9a-fA-F]{6})\]/g, (full, first, hex) => {
        const role = FG.has(first) ? 'fg' : BG.has(first) ? 'bg' : null;
        if (!role) return full;
        hex = hex.toLowerCase();
        const light = lightValue(role, hex);
        if (!light) return full;
        const name = `--c-${role}-${hex.slice(1)}`;
        vars.set(name, { dark: hex, light });
        const prefix = full.slice(0, full.indexOf('-[#'));
        return `${prefix}-[color:var(${name})]`;
      });
    })
    .join('\n');
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') && !SKIP_FILES.has(e.name)) out.push(p);
  }
  return out;
}

let changed = 0;
for (const f of walk(SRC)) {
  const before = fs.readFileSync(f, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(f, after);
    changed++;
  }
}

const names = [...vars.keys()].sort();
const dark = names.map((n) => `  ${n}: ${vars.get(n).dark};`).join('\n');
const light = names.map((n) => `  ${n}: ${vars.get(n).light};`).join('\n');
const css = `/* GERADO por scripts/migrate-theme.mjs — não edite à mão. */
:root {
  --c-on-strong: #111111;
${light}
}
.dark {
  --c-on-strong: #ffffff;
${dark}
}
`;
fs.writeFileSync(path.join(SRC, 'theme-vars.generated.css'), css);
console.log(`arquivos alterados: ${changed}, variáveis geradas: ${names.length}`);
