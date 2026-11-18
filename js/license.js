// Periodo de prueba y activación por código.
//
// El código de activación se deriva del código del dispositivo con una clave.
// NO cambies LICENSE_SECRET ni licenseCode(): invalidaría las activaciones ya hechas.
// Aviso: al estar en el navegador, alguien con conocimientos podría leer la clave.
import { exportBackup } from './store.js';

const LICENSE_SECRET = 'mlg1274-Tx9q';
export const TRIAL_DAYS = 15;
const WHATSAPP = '34659555874';
const WHATSAPP_DISPLAY = '+34 659 555 874';
const KEYS = { device: 'gt_id', start: 'gt_ini', activation: 'gt_act' };

/** Código de activación de 6 caracteres para un código de dispositivo. */
export function licenseCode(deviceId) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = String(deviceId).toUpperCase().trim() + '|' + LICENSE_SECRET;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

/** Días de prueba que quedan (puede ser 0 o negativo). */
export const trialDaysLeft = (startMs, nowMs = Date.now()) => Math.ceil(TRIAL_DAYS - (nowMs - startMs) / 864e5);

function trialBanner(daysLeft, deviceId) {
  const b = document.createElement('div');
  b.className = 'card';
  b.innerHTML =
    '<b>Te quedan ' + daysLeft + ' día' + (daysLeft > 1 ? 's' : '') + ' de prueba.</b>' +
    '<div class="mut">Para seguir usándola, pide tu código de activación por WhatsApp al ' + WHATSAPP_DISPLAY +
    '. Tu código de dispositivo: <b>' + deviceId + '</b></div>';
  const brand = document.getElementById('brand');
  if (brand) brand.parentNode.insertBefore(b, brand.nextSibling);
}

function lockScreen(st, deviceId, onActivated) {
  const text = 'Hola, quiero activar Gestor Transfer. Mi código de dispositivo es ' + deviceId;
  const o = document.createElement('div');
  o.className = 'license-wall';
  o.innerHTML =
    '<div><h1>Tu prueba gratuita ha terminado</h1>' +
    '<p>Has usado Gestor Transfer ' + TRIAL_DAYS + ' días. Para seguir usándola, pide tu código de activación por WhatsApp.</p>' +
    '<div class="card"><div class="mut">Tu código de dispositivo</div><div class="big code">' + deviceId + '</div>' +
    '<a class="cta" href="https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">Pedir código por WhatsApp</a></div>' +
    '<div class="card"><label class="f" for="gtin">Código de activación</label><input id="gtin" autocapitalize="characters" autocomplete="off">' +
    '<button id="gtok">Activar</button><div id="gter" class="out mt8"></div></div>' +
    '<div class="card"><div class="mut">Tus datos siguen guardados en este móvil. Puedes copiarlos cuando quieras.</div>' +
    '<button class="sec" id="gtbk">Copiar mis datos</button><textarea id="gtbt" rows="3" class="mt8" style="display:none"></textarea></div></div>';
  document.body.appendChild(o);

  o.querySelector('#gtok').onclick = () => {
    const v = o.querySelector('#gtin').value.toUpperCase().replace(/\s/g, '');
    if (v !== licenseCode(deviceId)) {
      o.querySelector('#gter').textContent = 'Ese código no es válido.';
      return;
    }
    try {
      st.setItem(KEYS.activation, v);
    } catch {
      /* sin almacenamiento */
    }
    o.remove();
    onActivated();
  };
  o.querySelector('#gtbk').onclick = async () => {
    const text = exportBackup();
    const ta = o.querySelector('#gtbt');
    ta.style.display = 'block';
    ta.value = text;
    ta.select();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* el usuario puede copiar a mano */
    }
  };
}

/** Comprueba la licencia. Dentro de Claude no se aplica. */
export function checkLicense(onActivated) {
  if (window.claude) return;
  let st;
  try {
    st = localStorage;
  } catch {
    return;
  }
  if (!st) return;

  let id = st.getItem(KEYS.device);
  let start = +st.getItem(KEYS.start);
  try {
    if (!id) {
      id = Math.random().toString(36).slice(2, 8).toUpperCase();
      st.setItem(KEYS.device, id);
    }
    if (!start) {
      start = Date.now();
      st.setItem(KEYS.start, String(start));
    }
  } catch {
    return;
  }

  try {
    if (st.getItem(KEYS.activation) === licenseCode(id)) return;
  } catch {
    /* seguir */
  }

  const left = trialDaysLeft(start);
  if (left > 0) {
    if (left <= 5) trialBanner(left, id);
    return;
  }
  lockScreen(st, id, onActivated);
}
