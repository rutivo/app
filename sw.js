// Service worker: la app funciona sin conexión.
// Estrategia "red primero": siempre intenta la versión nueva y, si no hay red,
// usa la copia guardada. Sube CACHE al cambiar la lista de archivos.
const CACHE = 'gestor-transfer-v13';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/main.js',
  './js/agency.js',
  './js/backend/claude.js',
  './js/backend/firebase.js',
  './js/cloud.js',
  './js/config.js',
  './js/dom.js',
  './js/flight.js',
  './js/flightStatus.js',
  './js/fuelPack.js',
  './js/fuelReceipt.js',
  './js/jornada.js',
  './js/license.js',
  './js/logo.js',
  './js/money.js',
  './js/reminders.js',
  './js/report.js',
  './js/store.js',
  './js/theme.js',
  './js/trips.js',
  './js/utils.js',
  './js/views/caja.js',
  './js/views/cuenta.js',
  './js/views/facturas.js',
  './js/views/fuelPdf.js',
  './js/views/gasolina.js',
  './js/views/gestor.js',
  './js/views/hucha.js',
  './js/views/jornada.js',
  './js/views/proximos.js',
  './js/views/tips.js',
  './js/views/transfer.js',
  './js/welcome.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => {
          if (hit) return hit;
          // Solo las páginas caen en index.html; un script o imagen que falta da error normal.
          return e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error();
        }),
      ),
  );
});
