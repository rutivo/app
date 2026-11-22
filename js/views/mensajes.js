// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Panel «💬 Mensajes» de un servicio de Transfer: eliges un mensaje, el idioma
// del cliente, lo retocas si quieres y lo envías por WhatsApp (o lo copias).
import { bottomSheet, toast } from '../dom.js';
import { cachedStatus } from '../flight.js';
import { arrivalTime, hhmm } from '../flightStatus.js';
import { MSG_LANGS, allTemplates, buildMessage, usesField } from '../mensajes.js';
import { S, save } from '../store.js';
import { esc, uid } from '../utils.js';
import { firstName } from '../welcome.js';

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

/** Hora de llegada del vuelo (la última vista: real, revisada o prevista). */
function arrivalOf(s) {
  if (!s.vu) return '';
  const st = cachedStatus(s.vu, s.f);
  const t = st && arrivalTime(st);
  return t ? hhmm(t) : '';
}

/** Abre el panel de mensajes del servicio `s`. */
export function openMessages(s) {
  let lang = S.cfg.ml || 'es';
  let id = 'llegadas';
  const name = firstName(s.pa);
  const sheet = bottomSheet(
    '<h3>💬 Mensajes' + (name ? ' para ' + esc(name) : '') + '</h3>' +
    '<div class="mut">' + (s.tl ? 'Se envían por WhatsApp a ' + esc(s.tl) + '.' : 'Este servicio no tiene teléfono: al enviar, eliges el contacto en WhatsApp.') + '</div>' +
    '<label class="f">Idioma del cliente</label><div class="hchips">' +
    MSG_LANGS.map(([k, t]) => '<button type="button" class="hchip" data-mlang="' + k + '">' + t + '</button>').join('') + '</div>' +
    '<label class="f">Mensaje</label><div class="hchips wchips" id="mlist"></div>' +
    '<div id="mmin" hidden><label class="f" for="mminv">Minutos</label><div class="hchips">' +
      [5, 10, 15, 20].map((m) => '<button type="button" class="hchip" data-mmin="' + m + '">' + m + ' min</button>').join('') + '</div></div>' +
    '<div id="mcar" class="row" hidden><div><label class="f" for="mcoche">Tu coche</label><input id="mcoche" placeholder="Ej.: Toyota Corolla blanco" value="' + esc(S.cfg.coche || '') + '"></div>' +
      '<div><label class="f" for="mmat">Matrícula</label><input id="mmat" placeholder="Ej.: 1234 ABC" value="' + esc(S.cfg.mat || '') + '"></div></div>' +
    '<label class="f" for="mtx">Texto (puedes cambiar lo que quieras)</label><textarea id="mtx" rows="6"></textarea>' +
    '<div id="mwarn" class="mut mt8" role="status"></div>' +
    '<a class="btn" id="msend" target="_blank" rel="noopener noreferrer">📲 Enviar por WhatsApp</a>' +
    '<div class="row2"><button type="button" class="sec" id="mcopy">📋 Copiar</button><button type="button" class="sec" id="msave">⭐ Guardar como plantilla</button></div>' +
    '<button type="button" class="sec" data-close>Cerrar</button>',
  );
  const $s = (q) => sheet.querySelector(q);
  const text = $s('#mtx');
  const send = $s('#msend');
  let min = 10;
  const list = () => {
    $s('#mlist').innerHTML = allTemplates(S.cfg).map((t) => '<button type="button" class="hchip" data-mid="' + esc(t.id) + '">' + esc(t.title) +
      (t.mine ? ' <span data-mdel="' + esc(t.id) + '" aria-label="Borrar plantilla">✕</span>' : '') + '</button>').join('');
  };
  const fill = () => {
    S.cfg.coche = $s('#mcoche').value.trim();
    S.cfg.mat = $s('#mmat').value.trim();
    text.value = buildMessage(id, s, S.cfg, { lang, min, arrival: arrivalOf(s) });
    $s('#mmin').hidden = !usesField(id, 'min', S.cfg);
    $s('#mcar').hidden = !usesField(id, 'coche', S.cfg) && !usesField(id, 'matricula', S.cfg);
    // Avisa de lo que falta (la frase con ese dato no se manda)
    const miss = [];
    if (usesField(id, 'punto', S.cfg) && !(S.cfg.punto || '').trim()) miss.push('el punto de encuentro (ponlo en 💬 Bienvenida)');
    if (usesField(id, 'llegada', S.cfg) && !arrivalOf(s)) miss.push('la hora de llegada del vuelo (abre ✈️ Vuelo para consultarla)');
    if (usesField(id, 'coche', S.cfg) && !S.cfg.coche && !S.cfg.mat) miss.push('tu coche y matrícula');
    $s('#mwarn').textContent = miss.length ? 'Falta ' + miss.join(' y ') + ': esa frase no se envía.' : '';
    sheet.querySelectorAll('[data-mlang]').forEach((b) => b.classList.toggle('on', b.dataset.mlang === lang));
    sheet.querySelectorAll('[data-mid]').forEach((b) => b.classList.toggle('on', b.dataset.mid === id));
    sheet.querySelectorAll('[data-mmin]').forEach((b) => b.classList.toggle('on', +b.dataset.mmin === min));
    send.href = waLink(s, text.value);
  };
  sheet.addEventListener('click', (e) => {
    const del = e.target.closest('[data-mdel]');
    if (del) {
      S.cfg.msgs = (S.cfg.msgs || []).filter((m) => m.id !== del.dataset.mdel);
      save();
      if (id === del.dataset.mdel) id = 'llegadas';
      list(); fill();
      return;
    }
    const t = e.target.closest('[data-mid]');
    const l = e.target.closest('[data-mlang]');
    const m = e.target.closest('[data-mmin]');
    if (t) id = t.dataset.mid;
    if (l) { lang = l.dataset.mlang; S.cfg.ml = lang; save(); }
    if (m) min = +m.dataset.mmin;
    if (t || l || m) fill();
  });
  $s('#mcoche').addEventListener('change', () => { fill(); save(); });
  $s('#mmat').addEventListener('change', () => { fill(); save(); });
  text.addEventListener('input', () => { send.href = waLink(s, text.value); });
  $s('#mcopy').onclick = async () => toast((await copy(text.value)) ? 'Mensaje copiado ✓' : 'No se pudo copiar. Mantén pulsado el texto y cópialo.');
  $s('#msave').onclick = () => {
    const body = text.value.trim();
    if (!body) return toast('Escribe primero el mensaje.');
    // Se guarda con los datos genéricos para reutilizarla con otros clientes
    const generic = name ? body.split(name).join('{nombre}') : body;
    // Nombre corto para el botón: sin el saludo ni el nombre, cortado por una palabra entera
    const core = generic.replace(/^\s*(hola|buenas|hi|hello|hallo|bonjour|buenos días|buenas tardes)\b[^,.!?]*[,.!?]?\s*/i, '').replace(/\{nombre\}/g, '').replace(/^[\s,¡!¿?.]+/, '');
    const cut = core.length > 26 ? core.slice(0, 26).replace(/\s+\S*$/, '') + '…' : core;
    const title = (cut.charAt(0).toUpperCase() + cut.slice(1)).trim() || 'Mi mensaje';
    S.cfg.msgs = [...(S.cfg.msgs || []), { id: 'm' + uid(), title, text: generic, lang }].slice(-12);
    save();
    list(); fill();
    toast('Plantilla guardada ✓ (el nombre del cliente se pone solo)');
  };
  list();
  fill();
  return sheet;
}
