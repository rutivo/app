// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel «🔗 Enlace para tu cliente» de un servicio de Transfer: eliges el idioma,
// revisas tus datos (teléfono, coche, punto de encuentro) y se lo mandas por WhatsApp.
import { bottomSheet, toast } from '../dom.js';
import { canShortLink, saveLink } from '../cloud.js';
import { CLOUD_PHOTO_MAX, PHOTO_MAX, clientUrl, linkData, linkExpiry, linkMessage, linkRecord, newLinkId, photoPart, shortUrl } from '../enlace.js';
import { MSG_LANGS } from '../mensajes.js';
import { S, save } from '../store.js';
import { esc } from '../utils.js';
import { firstName } from '../welcome.js';

const appBase = () => new URL('./', location.href).href;

/** Foto en buena calidad (va aparte en la nube) y foto pequeña (dentro del enlace largo). */
const HQ = { max: CLOUD_PHOTO_MAX, sides: [1600, 1280, 1080, 900, 720, 560], qs: [0.85, 0.75, 0.65] };
const SMALL = { max: PHOTO_MAX, sides: [420, 360, 300, 240, 200, 160], qs: [0.6, 0.5, 0.4] };

/**
 * Reduce una foto (archivo o data:) hasta que quepa en `opt.max`: prueba tamaños y
 * calidades de mayor a menor y se queda con la primera que cabe (la de más calidad).
 */
export async function shrinkPhoto(src, opt = HQ) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const c = document.createElement('canvas');
    for (const side of opt.sides) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; // un PNG con transparencia saldría negro en JPEG
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      for (const q of opt.qs) {
        const d = c.toDataURL('image/jpeg', q);
        if (photoPart(d, opt.max)) return d;
      }
    }
    return '';
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}

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
    '<div class="mut">Tu cliente abre el enlace sin instalar nada y ve, en su idioma: tu nombre, tu coche, dónde le esperas (con tu foto), su vuelo en directo y botones para escribirte o llamarte. ' +
    'Solo lo puede abrir quien tenga el enlace, y caduca 2 días después del servicio.</div>' +
    '<label class="f">Idioma del cliente</label><div class="hchips">' +
    MSG_LANGS.map(([k, t]) => '<button type="button" class="hchip" data-llang="' + k + '">' + t + '</button>').join('') + '</div>' +
    '<label class="f" for="lkpunto">Dónde le esperas</label><input id="lkpunto" data-k="punto" placeholder="Ej.: Terminal 3, puerta de salida 3, junto a la cafetería" value="' + esc(S.cfg.punto || '') + '">' +
    '<label class="f">📸 Foto del punto de encuentro</label>' +
    '<div class="lk-ph"><img id="lkimg" alt="Foto del punto de encuentro" hidden><div class="lk-phb">' +
    '<label class="btn sec lk-pick">📷 Elegir foto<input type="file" id="lkfile" accept="image/*" hidden></label>' +
    '<button type="button" class="sec" id="lkdel" hidden>🗑️ Quitar foto</button></div></div>' +
    '<div class="row">' + field('lkcoche', 'Tu coche', 'coche', 'Ej.: Toyota Corolla blanco') + field('lkmat', 'Matrícula', 'mat', 'Ej.: 1234 ABC') + '</div>' +
    field('lktel', 'Tu teléfono (para que te escriba o te llame)', 'tel', 'Ej.: +34 600 000 000', 'tel') +
    '<div id="lkwarn" class="mut mt8" role="status"></div><div id="lkstate" class="mut" role="status"></div>' +
    '<a class="btn" id="lksend" target="_blank" rel="noopener noreferrer">📲 Enviárselo por WhatsApp</a>' +
    '<div class="row2"><button type="button" class="sec" id="lkcopy">📋 Copiar enlace</button><a class="btn sec" id="lkview" target="_blank" rel="noopener">👀 Ver lo que verá</a></div>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const $s = (q) => sheet.querySelector(q);
  let url = '';
  let smallPhoto = ''; // sin cuenta: la foto en pequeño, para el enlace largo
  // Enlace corto: los datos se guardan en la nube con un código secreto (uno por servicio).
  // Mientras se guardan, los botones esperan; sin cuenta o sin conexión, sale el enlace largo.
  const short = canShortLink();
  if (short && !s.lk) { s.lk = newLinkId(); save(); }
  let ready = !short;
  let timer = 0;
  let round = 0;
  const setReady = (v, note = '') => {
    ready = v;
    for (const b of [$s('#lksend'), $s('#lkcopy'), $s('#lkview')]) { b.classList.toggle('wait', !v); b.setAttribute('aria-disabled', String(!v)); }
    $s('#lkstate').textContent = note;
  };
  const upload = async () => {
    const mine = ++round;
    const data = linkData(s, S.cfg, lang);
    const ok = await saveLink(s.lk, linkRecord(data, S.cfg.pfoto), linkExpiry(data));
    if (mine !== round) return; // ya hay otro cambio guardándose
    if (ok) return setReady(true);
    // Sin conexión: el enlace largo (lleva los datos dentro y la foto en pequeño), para no dejarte sin enviar
    const small = S.cfg.pfoto ? await shrinkPhoto(S.cfg.pfoto, SMALL).catch(() => '') : '';
    if (mine !== round) return;
    url = clientUrl(appBase(), data, small);
    paintLinks();
    setReady(true, 'Sin conexión con tu cuenta: esta vez el enlace sale largo (funciona igual).');
  };
  const paintLinks = () => {
    const text = linkMessage(lang, s, S.cfg, url);
    $s('#lksend').href = 'https://wa.me/' + (s.tl || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(text);
    $s('#lkview').href = url;
  };
  const refresh = () => {
    url = short ? shortUrl(appBase(), s.lk) : clientUrl(appBase(), linkData(s, S.cfg, lang), smallPhoto);
    const img = $s('#lkimg');
    img.hidden = !S.cfg.pfoto;
    if (S.cfg.pfoto) img.src = S.cfg.pfoto;
    $s('#lkdel').hidden = !S.cfg.pfoto;
    paintLinks();
    if (short) {
      setReady(false, '⏳ Preparando el enlace…');
      clearTimeout(timer);
      timer = setTimeout(upload, 350);
    } else {
      $s('#lkstate').textContent = 'Entra con tu cuenta para que el enlace salga corto.';
    }
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
  $s('#lkfile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const d = await shrinkPhoto(f, HQ).catch(() => '');
    if (!d) return toast('No he podido usar esa foto. Prueba con otra.');
    S.cfg.pfoto = d;
    smallPhoto = short ? '' : await shrinkPhoto(d, SMALL).catch(() => '');
    save();
    refresh();
    toast('Foto puesta ✓');
  });
  $s('#lkdel').onclick = () => { delete S.cfg.pfoto; smallPhoto = ''; save(); refresh(); };
  // Mientras se guarda, los botones no hacen nada (el enlace aún no se puede abrir)
  sheet.addEventListener('click', (e) => { if (!ready && e.target.closest('#lksend, #lkview')) e.preventDefault(); }, true);
  $s('#lkcopy').onclick = async () => !ready ? null : toast((await copy(url)) ? 'Enlace copiado ✓' : 'No se pudo copiar. Mantén pulsado el enlace y cópialo.');
  if (!short && S.cfg.pfoto) shrinkPhoto(S.cfg.pfoto, SMALL).then((d) => { smallPhoto = d; refresh(); }).catch(() => {});
  refresh();
  return sheet;
}
