// Punto de entrada: carga los datos, conecta las pantallas y pinta la app.
import { $, $$, toast } from './dom.js';
import { TRIAL_ENABLED } from './config.js';
import { checkLicense } from './license.js';
import { renderReminders, scheduleReminders } from './reminders.js';
import { loadLocal, requestPersistentStorage } from './store.js';
import { initCaja, renderCaja } from './views/caja.js';
import { initAccount, renderAccount } from './views/cuenta.js';
import { initFacturas, renderBrand, renderFacturas, saveBackupFile } from './views/facturas.js';
import { initGasolina, renderGasolina } from './views/gasolina.js';
import { initHucha, renderHucha } from './views/hucha.js';
import { initTips } from './views/tips.js';
import { initTransfer, renderTransfer } from './views/transfer.js';

/** Vuelve a pintar todas las pantallas a partir del estado. */
function render() {
  renderBrand();
  renderCaja();
  renderTransfer();
  renderGasolina();
  renderFacturas();
  renderHucha();
  renderAccount();
  renderReminders();
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

loadLocal();
initTabs();
drawFavicon();
initCaja();
initTransfer(render);
initGasolina(render);
initHucha();
initFacturas(render);
initTips(saveBackupFile);
render();
requestPersistentStorage();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
initAccount(render);
if (TRIAL_ENABLED) checkLicense(() => toast('App activada ✓'));
