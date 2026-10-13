// Converte a paleta escura para os tons exatos de PAINEL-DSS (#111217, #1E2029, #15171E, #252836, #F7FAFC, #A0AEC0)
// Edita o bloco `.dark` de src/theme-vars.generated.css preservando cores de destaque/acentos.
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

// Cores base do PAINEL-DSS
// Dark BG: #111217
// Dark Card / Secondary: #1E2029
// Dark Header: #15171E
// Dark Hover / Surface: #252836
// Dark Text: #F7FAFC
// Dark Text Secondary: #A0AEC0

function hexToRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}
function lerpColor(c1, c2, t) {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  const res = rgb1.map((val, i) => val + (rgb2[i] - val) * t);
  return rgbToHex(res);
}

dark = dark.replace(/(--c-(bg|fg)-[0-9a-f]{6}): (#[0-9a-f]{6});/g, (m, name, role, hex) => {
  if (spread(hex) > 40) return m; // cores de destaque mantidas
  const l = lum(hex);

  if (role === 'bg') {
    if (l >= 0.40) return m;
    // Fundo mais escuro vai para #111217
    // Cards e superfícies médias vão para #1E2029
    // Superfícies mais altas / hover / bordas vão para #252836 até #2e3244
    if (l <= 0.08) {
      return `${name}: #111217;`;
    } else if (l <= 0.16) {
      const t = (l - 0.08) / (0.16 - 0.08);
      return `${name}: ${lerpColor('#111217', '#1E2029', t)};`;
    } else if (l <= 0.25) {
      const t = (l - 0.16) / (0.25 - 0.16);
      return `${name}: ${lerpColor('#1E2029', '#252836', t)};`;
    } else {
      const t = (l - 0.25) / (0.40 - 0.25);
      return `${name}: ${lerpColor('#252836', '#353a4c', t)};`;
    }
  }

  if (role === 'fg') {
    if (l < 0.25) return m;
    // Texto primário vai para #F7FAFC
    // Texto secundário/muted vai para #A0AEC0
    if (l >= 0.80) {
      return `${name}: #F7FAFC;`;
    } else if (l >= 0.45) {
      const t = (l - 0.45) / (0.80 - 0.45);
      return `${name}: ${lerpColor('#A0AEC0', '#F7FAFC', t)};`;
    } else {
      const t = (l - 0.25) / (0.45 - 0.25);
      return `${name}: ${lerpColor('#64748b', '#A0AEC0', t)};`;
    }
  }

  return m;
});

fs.writeFileSync(file, head + dark);
console.log('Paleta PAINEL-DSS aplicada em theme-vars.generated.css');
