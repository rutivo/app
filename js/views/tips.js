// Avisos en la pantalla principal: instalar la app y hacer copia de seguridad.
import { cloudEnabled } from '../cloud.js';
import { $, onClick, readFlag, writeFlag } from '../dom.js';
import { daysSinceBackup, hasLocalData } from '../store.js';
import { accountsEnabled } from './cuenta.js';

const INSTALL_DISMISSED = 'tipInstall';
const BACKUP_SNOOZE = 'tipBackupSnooze';
const BACKUP_EVERY_DAYS = 7;
const SNOOZE_DAYS = 3;

const isInstalled = () =>
  window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isMobile = () => /Android|iPhone|iPad|iPod/.test(navigator.userAgent);

function installTip() {
  if (isInstalled() || !isMobile() || readFlag(INSTALL_DISMISSED)) return '';
  const how = isIOS()
    ? 'En Safari, toca <b>Compartir</b> (cuadrado con flecha) y luego <b>Añadir a pantalla de inicio</b>.'
    : 'En Chrome, toca el menú <b>⋮</b> y luego <b>Instalar app</b>.';
  return (
    '<div class="card"><button class="x tip-close" data-tip="install" aria-label="Cerrar aviso">×</button>' +
    '<b>Instala Rutivo en tu móvil</b>' +
    '<div class="mut mt8">' + how + ' Se abre como una app, funciona sin internet y el móvil no borra tus datos.</div></div>'
  );
}

function backupTip() {
  // Con cuenta en la nube no hace falta: los datos ya están a salvo.
  if (accountsEnabled() || cloudEnabled() || !hasLocalData()) return '';
  const days = daysSinceBackup();
  if (days !== null && days < BACKUP_EVERY_DAYS) return '';
  const snooze = +readFlag(BACKUP_SNOOZE) || 0;
  if (Date.now() - snooze < SNOOZE_DAYS * 864e5) return '';
  const when = days === null ? 'Aún no has hecho ninguna copia.' : 'Tu última copia es de hace ' + days + ' días.';
  return (
    '<div class="card"><b>Haz una copia de seguridad</b>' +
    '<div class="mut mt8">' + when + ' Si se borran los datos del navegador o pierdes el móvil, la copia es la única forma de recuperarlos.</div>' +
    '<div class="row"><button class="sec" data-tip="later">Más tarde</button><button data-tip="backup">Hacer copia ahora</button></div></div>'
  );
}

export function renderTips() {
  $('#tips').innerHTML = installTip() + backupTip();
}

export function initTips(saveBackupFile) {
  onClick('[data-tip]', (el) => {
    const action = el.dataset.tip;
    if (action === 'install') writeFlag(INSTALL_DISMISSED, '1');
    if (action === 'later') writeFlag(BACKUP_SNOOZE, String(Date.now()));
    if (action === 'backup') saveBackupFile();
    renderTips();
  });
}
