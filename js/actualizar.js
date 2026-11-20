// Versiones nuevas de la app (ver sw.js).
//
// La app se abre desde lo guardado en el móvil. Si hay una versión nueva, el
// service worker la descarga entera por detrás y la activa. Entonces:
// - si la app se acaba de abrir (y no se está escribiendo nada), se recarga sola;
// - si no, aparece «Nueva versión · Actualizar» para no cortar lo que se hace.

const FRESH_MS = 12000; // «recién abierta»
const openedAt = Date.now();
let reloading = false;

function busy() {
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || !!document.querySelector('.modal.on, #ph.on');
}

function reload() {
  if (reloading) return;
  reloading = true;
  location.reload();
}

function offerUpdate() {
  if (document.getElementById('upd')) return;
  const b = document.createElement('button');
  b.id = 'upd';
  b.type = 'button';
  b.textContent = '✨ Nueva versión · Actualizar';
  b.setAttribute('style', 'position:fixed;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top, 0px));z-index:9999;' +
    'border:0;border-radius:999px;padding:10px 18px;font:600 15px inherit;background:#1d5fe0;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25)');
  b.onclick = reload;
  document.body.appendChild(b);
}

export function initUpdates() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller; // la primera instalación no es una «versión nueva»
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (Date.now() - openedAt < FRESH_MS && !busy()) reload();
    else offerUpdate();
  });
  sw.register('sw.js').then((reg) => {
    // Con la app abierta mucho rato (o vuelta del fondo), se mira de vez en cuando
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60e3);
  }).catch(() => {});
}
