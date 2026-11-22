// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel «🔗 Enlace para tu cliente» de un servicio de Transfer: eliges el idioma,
// revisas tus datos (teléfono, coche, punto de encuentro) y se lo mandas por WhatsApp.
import { bottomSheet, toast } from '../dom.js';
import { clientUrl, linkData, linkMessage } from '../enlace.js';
import { MSG_LANGS } from '../mensajes.js';
import { S, save } from '../store.js';
import { esc } from '../utils.js';
import { firstName } from '../welcome.js';

const appBase = () => new URL('./', location.href).href;

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

/** Abre el panel del enlace del servicio `s`. */
export function openClientLink(s) {
  let lang = S.cfg.ml || 'en';
  const name = firstName(s.pa);
  const field = (id, label, key, ph, type = 'text') =>
    '<div><label class="f" for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" data-k="' + key + '" placeholder="' + ph + '" value="' + esc(S.cfg[key] || '') + '"></div>';
  const sheet = bottomSheet(
    '<h3>🔗 Enlace para ' + (name ? esc(name) : 'tu cliente') + '</h3>' +
    '<div class="mut">Tu cliente abre el enlace sin instalar nada y ve, en su idioma: tu nombre, tu coche, dónde le esperas, su vuelo en directo y botones para escribirte o llamarte. ' +
    'Los datos van dentro del enlace: no se guardan en ningún sitio.</div>' +
    '<label class="f">Idioma del cliente</label><div class="hchips">' +
    MSG_LANGS.map(([k, t]) => '<button type="button" class="hchip" data-llang="' + k + '">' + t + '</button>').join('') + '</div>' +
    '<label class="f" for="lkpunto">Dónde le esperas</label><input id="lkpunto" data-k="punto" placeholder="Ej.: Terminal 3, puerta de salida 3, junto a la cafetería" value="' + esc(S.cfg.punto || '') + '">' +
    '<div class="row">' + field('lkcoche', 'Tu coche', 'coche', 'Ej.: Toyota Corolla blanco') + field('lkmat', 'Matrícula', 'mat', 'Ej.: 1234 ABC') + '</div>' +
    field('lktel', 'Tu teléfono (para que te escriba o te llame)', 'tel', 'Ej.: +34 600 000 000', 'tel') +
    '<div id="lkwarn" class="mut mt8" role="status"></div>' +
    '<a class="btn" id="lksend" target="_blank" rel="noopener noreferrer">📲 Enviárselo por WhatsApp</a>' +
    '<div class="row2"><button type="button" class="sec" id="lkcopy">📋 Copiar enlace</button><a class="btn sec" id="lkview" target="_blank" rel="noopener">👀 Ver lo que verá</a></div>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const $s = (q) => sheet.querySelector(q);
  let url = '';
  const refresh = () => {
    url = clientUrl(appBase(), linkData(s, S.cfg, lang));
    const text = linkMessage(lang, s, S.cfg, url);
    $s('#lksend').href = 'https://wa.me/' + (s.tl || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
    $s('#lkview').href = url;
    const miss = [];
    if (!(S.cfg.punto || '').trim()) miss.push('dónde le esperas');
    if (!(S.cfg.tel || '').trim()) miss.push('tu teléfono');
    if (!(S.cfg.coche || '').trim() && !(S.cfg.mat || '').trim()) miss.push('tu coche');
    $s('#lkwarn').textContent = miss.length ? 'Te falta ' + miss.join(', ') + ': el cliente no lo verá.' : '';
    sheet.querySelectorAll('[data-llang]').forEach((b) => b.classList.toggle('on', b.dataset.llang === lang));
  };
  sheet.addEventListener('click', (e) => {
    const l = e.target.closest('[data-llang]');
    if (l) {
      lang = l.dataset.llang;
      S.cfg.ml = lang;
      save();
      refresh();
    }
  });
  sheet.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.addEventListener('input', () => { S.cfg[inp.dataset.k] = inp.value.trim(); refresh(); });
    inp.addEventListener('change', () => save());
  });
  $s('#lkcopy').onclick = async () => toast((await copy(url)) ? 'Enlace copiado ✓' : 'No se pudo copiar. Mantén pulsado el enlace y cópialo.');
  refresh();
  return sheet;
}
