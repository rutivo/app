// Apariencia de la app: "clasico" (claro, sigue el modo del móvil) o "elegante" (azul marino).
import { $, readFlag, writeFlag } from './dom.js';

const KEY = 'tema';
export const DEFAULT_THEME = 'elegante';
const THEMES = {
  elegante: { label: 'Elegante', sub: 'Azul marino, sobrio', swatch: 'linear-gradient(160deg,#163563,#0a1426)' },
  clasico: { label: 'Clásico', sub: 'Claro (oscuro si el móvil está en modo oscuro)', swatch: 'linear-gradient(120deg,#e4ecfa,#f8faff)' },
};

export const currentTheme = () => (THEMES[readFlag(KEY)] ? readFlag(KEY) : DEFAULT_THEME);

export function applyTheme(theme = currentTheme()) {
  if (theme === 'elegante') document.documentElement.dataset.theme = 'elegante';
  else delete document.documentElement.dataset.theme;
}

export function renderThemeChoice() {
  const box = $('#tema');
  if (!box) return;
  const cur = currentTheme();
  box.innerHTML = Object.entries(THEMES)
    .map(
      ([key, t]) =>
        '<button class="row-btn" type="button" data-theme-set="' + key + '">' +
        '<span class="theme-swatch" style="background:' + t.swatch + '"></span>' +
        '<span class="txt"><b>' + t.label + '</b><small>' + t.sub + '</small></span>' +
        '<span class="chev" aria-hidden="true">' + (cur === key ? '✓' : '') + '</span></button>',
    )
    .join('');
}

export function initTheme() {
  applyTheme();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    writeFlag(KEY, b.dataset.themeSet);
    applyTheme(b.dataset.themeSet);
    renderThemeChoice();
  });
}
