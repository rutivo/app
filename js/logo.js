// Logo del emisor (cabecera de la app y de las facturas), generado como SVG.
import { S } from './store.js';
import { esc } from './utils.js';

/** Iconos sobre un fondo de 90×90. "{c}" se sustituye por el color elegido. */
export const ICONS = {
  taxi:
    '<rect x="39" y="25" width="12" height="5" rx="1.5" fill="#fff"/><path d="M29 45L36 32H54L61 45Z" fill="#fff"/><rect x="20" y="44" width="50" height="15" rx="6" fill="#fff"/><path d="M35 44l4-9h5v9zM47 44v-9h6l4 9z" fill="{c}"/><circle cx="33" cy="60" r="5.5" fill="{c}" stroke="#fff" stroke-width="3"/><circle cx="57" cy="60" r="5.5" fill="{c}" stroke="#fff" stroke-width="3"/>',
  coche:
    '<path d="M27 44l6-11h24l6 11z" fill="#fff"/><rect x="18" y="43" width="54" height="16" rx="7" fill="#fff"/><circle cx="32" cy="60" r="5.5" fill="{c}" stroke="#fff" stroke-width="3"/><circle cx="58" cy="60" r="5.5" fill="{c}" stroke="#fff" stroke-width="3"/>',
  furgo:
    '<rect x="17" y="30" width="38" height="28" rx="3" fill="#fff"/><path d="M57 38h9l8 10v10H57z" fill="#fff"/><circle cx="31" cy="60" r="5.5" fill="{c}" stroke="#fff" stroke-width="3"/><circle cx="63" cy="60" r="5.5" fill="{c}" stroke="#fff" stroke-width="3"/>',
  bus:
    '<rect x="21" y="26" width="48" height="36" rx="7" fill="#fff"/><rect x="26" y="31" width="38" height="13" rx="2" fill="{c}"/><circle cx="32" cy="53" r="3" fill="{c}"/><circle cx="58" cy="53" r="3" fill="{c}"/><rect x="28" y="62" width="9" height="7" rx="2" fill="#fff"/><rect x="53" y="62" width="9" height="7" rx="2" fill="#fff"/>',
  maleta:
    '<rect x="23" y="36" width="44" height="28" rx="5" fill="#fff"/><path d="M36 36v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5" fill="none" stroke="#fff" stroke-width="4"/><rect x="23" y="47" width="44" height="3" fill="{c}"/>',
  avion:
    '<path d="M20 47L70 24 58 66 45 52 34 61 31 49z" fill="#fff"/>',
  pin:
    '<path d="M45 21a16 16 0 0 0-16 16c0 12 16 31 16 31s16-19 16-31a16 16 0 0 0-16-16z" fill="#fff"/><circle cx="45" cy="37" r="6.5" fill="{c}"/>',
  estrella:
    '<path d="M45 21l7.6 15.6 17 2.4-12.4 12 3 17L45 59.8 29.8 68l3-17-12.4-12 17-2.4z" fill="#fff"/>',
  corona:
    '<path d="M24 56L20 32l14 12 11-18 11 18 14-12-4 24z" fill="#fff"/><rect x="24" y="58" width="42" height="6" rx="2" fill="#fff"/>',
  rayo:
    '<path d="M50 20L28 50h14l-4 22 24-32H48z" fill="#fff"/>',
  corazon:
    '<path d="M45 66S24 52 24 38c0-8 6-13 12-13 4 0 7 2 9 6 2-4 5-6 9-6 6 0 12 5 12 13 0 14-21 28-21 28z" fill="#fff"/>',
  sol:
    '<circle cx="45" cy="45" r="11" fill="#fff"/><g stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M45 21v7M45 62v7M21 45h7M62 45h7M28 28l5 5M57 57l5 5M62 28l-5 5M33 57l-5 5"/></g>',
  ancla:
    '<g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"><circle cx="45" cy="28" r="5"/><path d="M45 33v32M34 42h22M26 54c2 10 10 15 19 15s17-5 19-15"/></g>',
  montana:
    '<path d="M18 64L38 30l10 16 8-10 16 28z" fill="#fff"/>',
  ola:
    '<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M18 46c6-7 12-7 18 0s12 7 18 0 12-7 18 0"/><path d="M18 60c6-7 12-7 18 0s12 7 18 0 12-7 18 0"/></g>',
  volante:
    '<circle cx="45" cy="45" r="21" fill="none" stroke="#fff" stroke-width="5"/><circle cx="45" cy="45" r="5" fill="#fff"/><path d="M45 50v16M40 44H24M50 44h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  brujula:
    '<circle cx="45" cy="45" r="22" fill="none" stroke="#fff" stroke-width="4"/><path d="M45 27l8 18-8 18-8-18z" fill="#fff"/>',
  casa:
    '<path d="M45 24L22 44h8v20h12V52h6v12h12V44h8z" fill="#fff"/>',
  cohete:
    '<path d="M45 20c10 8 14 20 12 34H33C31 40 35 28 45 20z" fill="#fff"/><circle cx="45" cy="40" r="5" fill="{c}"/><path d="M33 54l-8 10 10-2zM57 54l8 10-10-2z" fill="#fff"/>',
  llave:
    '<circle cx="34" cy="38" r="10" fill="none" stroke="#fff" stroke-width="5"/><path d="M42 45l22 22M54 57l6-6M60 63l5-5" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
};

export const ICON_NAMES = {
  taxi: 'Taxi', coche: 'Coche', furgo: 'Furgoneta', bus: 'Minibús', maleta: 'Maletas',
  avion: 'Aeropuerto', pin: 'Destino', estrella: 'Estrella', corona: 'Corona', rayo: 'Rayo',
  corazon: 'Corazón', sol: 'Sol', ancla: 'Ancla', montana: 'Montaña', ola: 'Olas',
  volante: 'Volante', brujula: 'Brújula', casa: 'Casa', cohete: 'Cohete', llave: 'Llave',
};

export const COLORS = {
  azul: '#1d5fe0', verde: '#1f8f5f', rojo: '#c8432b', naranja: '#d9731a', morado: '#6b3fc9', negro: '#1b2430',
};

export const accentColor = () => COLORS[S.cfg.col] || COLORS.azul;

export const iconSvg = (key, color) => (ICONS[key] || ICONS.taxi).replace(/\{c\}/g, color);

const initials = (t) =>
  (t.match(/[A-Za-zÀ-ÿ0-9]+/g) || []).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const background = (c) =>
  S.cfg.lf === 'cuadrado'
    ? '<rect x="5" y="5" width="80" height="80" rx="18" fill="' + c + '"/>'
    : '<circle cx="45" cy="45" r="40" fill="' + c + '"/>';

/** Marca gráfica (icono, iniciales o imagen) según la configuración. */
function mark(c) {
  const type = S.cfg.lt || 'icono';
  if (type === 'texto') return '';
  if (type === 'imagen' && /^data:image\//.test(S.cfg.limg || '')) {
    return '<image href="' + esc(S.cfg.limg) + '" x="5" y="5" width="80" height="80" preserveAspectRatio="xMidYMid meet"/>';
  }
  if (type === 'letras') {
    const t = initials(S.cfg.ln || S.cfg.nom || '');
    const two = t.length > 1;
    return (
      background(c) +
      '<text x="45" y="' + (two ? 56 : 58) + '" text-anchor="middle" font-family="Manrope,Arial,sans-serif" font-weight="800" font-size="' +
      (two ? 32 : 40) + '" fill="#fff">' + esc(t) + '</text>'
    );
  }
  return background(c) + iconSvg(S.cfg.ico, c);
}

/** Logo completo: marca + nombre + segunda línea. */
export function logoSvg(width, ink) {
  const c = accentColor();
  const textOnly = (S.cfg.lt || 'icono') === 'texto';
  const name = (S.cfg.ln || S.cfg.nom || 'Tu negocio').toUpperCase();
  const sub = S.cfg.ls || S.cfg.lic || '';
  const x0 = textOnly ? 4 : 100;
  const fs = Math.max(12, Math.min(textOnly ? 40 : 34, (266 - x0) / (name.length * 0.7)));
  return (
    '<svg viewBox="0 0 270 90" width="' + width + '" overflow="visible" role="img" aria-label="' + esc(name) + '">' +
    mark(c) +
    '<g font-family="Manrope,Arial,sans-serif" font-weight="800">' +
    '<text x="' + x0 + '" y="' + (sub ? 46 : 54) + '" font-size="' + fs + '" style="fill:' + ink + '">' + esc(name) + '</text>' +
    (sub ? '<text x="' + x0 + '" y="70" font-size="' + Math.min(22, fs * 0.8) + '" letter-spacing="1" fill="' + c + '">' + esc(sub) + '</text>' : '') +
    '</g></svg>'
  );
}
