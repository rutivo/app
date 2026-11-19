// Panel "Bienvenida": elegir un mensaje preparado, ajustarlo y enviarlo por WhatsApp.
import { bottomSheet, toast } from '../dom.js';
import { S, save } from '../store.js';
import { esc } from '../utils.js';
import { PRESETS, buildWelcome, driverName, firstName } from '../welcome.js';

const LANGS = [['es', 'Español'], ['en', 'Inglés'], ['ambos', 'Los dos']];

const waLink = (s, text) => 'https://wa.me/' + (s.tl || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

/** Recuerda el punto de encuentro como habitual y entre los últimos usados. */
function rememberPoint(point) {
  const p = point.trim();
  if (!p) return;
  S.cfg.punto = p;
  S.cfg.puntos = [p, ...(S.cfg.puntos || []).filter((x) => x !== p)].slice(0, 6);
  save();
}

/** Abre el panel de bienvenida del servicio `s`. */
export function openWelcome(s) {
  let preset = S.cfg.wp && (S.cfg.wp === 'mio' || PRESETS.some((p) => p.id === S.cfg.wp)) ? S.cfg.wp : 'cercano';
  let lang = S.cfg.wl || 'es';
  const name = firstName(s.pa);
  const driver = driverName(S.cfg);
  const chips = [...PRESETS.map((p) => [p.id, p.title]), ['mio', '✏️ El mío']];
  const points = [...new Set([S.cfg.punto, ...(S.cfg.puntos || [])].filter(Boolean))];

  const sheet = bottomSheet(
    '<h3>💬 Bienvenida' + (name ? ' para ' + esc(name) : '') + '</h3>' +
    '<div class="mut">' + (driver ? 'De ' + esc(driver) + ', tu nombre de la cuenta.' : 'Pon tu nombre en Facturas → Mis datos de emisor y saldrá solo.') + '</div>' +
    '<label class="f">Estilo del mensaje</label><div class="hchips wchips">' +
    chips.map(([id, t]) => '<button type="button" class="hchip" data-wset="' + id + '">' + t + '</button>').join('') + '</div>' +
    '<label class="f">Idioma</label><div class="hchips">' +
    LANGS.map(([id, t]) => '<button type="button" class="hchip" data-wlang="' + id + '">' + t + '</button>').join('') + '</div>' +
    '<label class="f" for="wpt">Punto de encuentro</label><input id="wpt" list="wptl" placeholder="Ej.: el restaurante La Mano, llegadas…" value="' + esc(S.cfg.punto || '') + '">' +
    '<datalist id="wptl">' + points.map((p) => '<option value="' + esc(p) + '">').join('') + '</datalist>' +
    '<label class="f" for="wtx">Mensaje (puedes cambiar lo que quieras)</label><textarea id="wtx" rows="8"></textarea>' +
    '<a class="btn" id="wsend" target="_blank" rel="noopener noreferrer">📲 Enviar por WhatsApp' + (s.tl ? '' : ' (elige el contacto)') + '</a>' +
    '<div class="row2"><button type="button" class="sec" id="wcopy">📋 Copiar</button><button type="button" class="sec" id="wfav">⭐ Usar siempre este</button></div>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const text = sheet.querySelector('#wtx');
  const point = sheet.querySelector('#wpt');
  const send = sheet.querySelector('#wsend');
  const sync = () => { send.href = waLink(s, text.value); };
  const fill = () => {
    text.value = buildWelcome(s, S.cfg, { preset, lang, punto: point.value });
    sheet.querySelectorAll('[data-wset]').forEach((b) => b.classList.toggle('on', b.dataset.wset === preset));
    sheet.querySelectorAll('[data-wlang]').forEach((b) => b.classList.toggle('on', b.dataset.wlang === lang));
    sync();
  };
  sheet.addEventListener('click', (e) => {
    const p = e.target.closest('[data-wset]');
    const l = e.target.closest('[data-wlang]');
    if (p) { preset = p.dataset.wset; fill(); }
    if (l) { lang = l.dataset.wlang; fill(); }
  });
  point.addEventListener('input', fill);
  text.addEventListener('input', sync);
  send.addEventListener('click', () => rememberPoint(point.value));
  sheet.querySelector('#wcopy').onclick = async () => {
    rememberPoint(point.value);
    toast((await copy(text.value)) ? 'Mensaje copiado ✓' : 'No se pudo copiar. Mantén pulsado el texto y cópialo.');
  };
  sheet.querySelector('#wfav').onclick = () => {
    S.cfg.wp = preset;
    S.cfg.wl = lang;
    rememberPoint(point.value);
    save();
    toast('A partir de ahora saldrá este estilo primero ✓');
  };
  fill();
  return sheet;
}
