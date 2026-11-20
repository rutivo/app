// Aceptación de las condiciones de uso y la política de privacidad (legal.html).
// Se guarda la versión aceptada y cuándo, en los ajustes (y así en la nube).
import { bottomSheet, readFlag, writeFlag } from './dom.js';
import { S, save } from './store.js';

export const LEGAL_VERSION = 1;
const PENDING_KEY = 'legalAcepta'; // aceptada en la pantalla de registro, antes de tener los datos cargados

export const legalLinks =
  '<a href="legal.html#condiciones" target="_blank" rel="noopener">Condiciones de uso</a> y la ' +
  '<a href="legal.html#privacidad" target="_blank" rel="noopener">Política de privacidad</a>';

/** Recuerda que se aceptó al crear la cuenta (se guarda en cuanto se cargan los datos). */
export function rememberAccepted() {
  writeFlag(PENDING_KEY, String(Date.now()));
}

let open = null;
/** Si aún no se han aceptado las condiciones de esta versión, pide aceptarlas (una vez). */
export function checkLegal() {
  const ok = S.cfg.legal && S.cfg.legal.v >= LEGAL_VERSION;
  if (ok || open) return;
  const pending = +readFlag(PENDING_KEY) || 0;
  if (pending) {
    S.cfg.legal = { v: LEGAL_VERSION, at: new Date(pending).toISOString() };
    writeFlag(PENDING_KEY, '');
    save();
    return;
  }
  if (document.querySelector('.auth-wall')) return; // primero, entrar
  open = bottomSheet(
    '<div class="card"><div class="mut">📄 Información legal</div>' +
    '<p>Para seguir usando Rutivo, lee y acepta las ' + legalLinks + '. Resumen: Rutivo es gratis, no usa tus datos para publicidad ni los vende, ' +
    'tu voz se procesa dentro del móvil y puedes borrar tu cuenta cuando quieras. Las facturas son un extra opcional.</p></div>' +
    '<button type="button" id="lgok">He leído y acepto</button>',
    { onClose: () => { open = null; } },
  );
  open.querySelector('#lgok').onclick = () => {
    S.cfg.legal = { v: LEGAL_VERSION, at: new Date().toISOString() };
    save();
    open.close();
  };
}
