// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Punto de entrada: carga los datos, conecta las pantallas y pinta la app.
import { $, $$ } from './dom.js';
import { checkLegal } from './legal.js';
import { renderReminders, scheduleReminders } from './reminders.js';
import { loadLocal, migratePhotos, requestPersistentStorage } from './store.js';
import { initUpdates } from './actualizar.js';
import { initTheme, renderThemeChoice } from './theme.js';
import { initCaja, renderCaja } from './views/caja.js';
import { accountsEnabled, initAccount, renderAccount } from './views/cuenta.js';
import { cloudEnabled } from './cloud.js';
import { initFacturas, renderBrand, renderFacturas, saveBackupFile } from './views/facturas.js';
import { initGasolina, renderGasolina } from './views/gasolina.js';
import { initHucha, renderHucha } from './views/hucha.js';
import { initJornada } from './views/jornada.js';
import { initUpcoming } from './views/proximos.js';
import { initAssistant } from './views/asistente.js';
import { initTips } from './views/tips.js';
import { initTransfer, renderTransfer } from './views/transfer.js';

// Seguridad: Rutivo no se deja abrir dentro de otra web (clickjacking: una página
// falsa encima que te hace tocar botones sin darte cuenta). GitHub Pages no deja
// poner la cabecera que lo impide, así que se hace aquí.
if (window.top !== window.self && !window.claude) {
  document.documentElement.innerHTML = '';
  try {
    window.top.location.replace(location.href);
  } catch {
    /* si no deja salir del marco, al menos no se ve nada */
  }
  throw new Error('Rutivo no se puede abrir dentro de otra página');
}

/** Vuelve a pintar todas las pantallas a partir del estado. */
function render() {
  renderBrand();
  renderCaja();
  renderTransfer();
  renderGasolina();
  renderFacturas();
  renderHucha();
  renderAccount();
  renderThemeChoice();
  renderReminders();
  if (cloudEnabled() || !accountsEnabled()) setTimeout(checkLegal, 800); // con cuenta: cuando ya están sus datos
  scheduleReminders();
}

let lastTab = 'hoy';

/** Muestra una pantalla: 'hoy', 'tr', 'ga', 'fa', 'hu' o 'cu' (Cuenta). */
function showView(view) {
  $$('.tabs button').forEach((t) => t.classList.toggle('on', t.dataset.v === view));
  $$('.v').forEach((v) => v.classList.toggle('on', v.id === 'v-' + view));
  $('#acctbtn').classList.toggle('hide', view === 'cu');
  if (view !== 'cu') lastTab = view;
  scrollTo(0, 0);
  render();
}

function initTabs() {
  $$('.tabs button').forEach((tab) => (tab.onclick = () => showView(tab.dataset.v)));
  $('#acctbtn').onclick = () => showView('cu');
  $('#cuback').onclick = () => showView(lastTab);
}

/** Icono provisional dibujado al vuelo (pestaña del navegador / atajo de inicio). */
function drawFavicon() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const x = c.getContext('2d');
    x.fillStyle = '#1d5fe0';
    x.fillRect(0, 0, 180, 180);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.font = '800 44px Arial,sans-serif';
    x.fillText('RUTIVO', 90, 118);
    const url = c.toDataURL('image/png');
    for (const rel of ['apple-touch-icon', 'icon']) {
      const l = document.createElement('link');
      l.rel = rel;
      l.href = url;
      document.head.appendChild(l);
    }
  } catch {
    /* sin canvas */
  }
}

initTheme();
loadLocal();
initTabs();
drawFavicon();
initCaja();
initTransfer(render);
initGasolina(render);
initHucha();
initJornada(render);
initFacturas(render);
initTips(saveBackupFile);
initUpcoming();
initAssistant(render);
render();
requestPersistentStorage();
// Fotos antiguas de localStorage → almacén grande (copia primero; ver store.js)
setTimeout(() => migratePhotos().catch(() => {}), 1500);

initUpdates();
initAccount(render);
