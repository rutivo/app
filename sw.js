// Service worker: la app funciona sin conexión.
// Estrategia "red primero": siempre intenta la versión nueva y, si no hay red,
// usa la copia guardada. Sube CACHE al cambiar la lista de archivos.
const CACHE = 'gestor-transfer-v42';
const FILES = [
  './',
  './index.html',
  './legal.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/main.js',
  './js/agency.js',
  './js/asistente.js',
  './js/backend/claude.js',
  './js/backend/firebase.js',
  './js/cloud.js',
  './js/compensa.js',
  './js/config.js',
  './js/dom.js',
  './js/facturaLegal.js',
  './js/flight.js',
  './js/flightStatus.js',
  './js/fuelPack.js',
  './js/fuelReceipt.js',
  './js/huchas.js',
  './js/jornada.js',
  './js/legal.js',
  './js/license.js',
  './js/logo.js',
  './js/microfono.js',
  './js/money.js',
  './js/ocr.js',
  './js/oido.js',
  './js/oidoWorker.js',
  './js/providerReader.js',
  './js/push.js',
  './js/reminders.js',
  './js/serviceReader.js',
  './js/report.js',
  './js/ruta.js',
  './js/salida.js',
  './js/store.js',
  './js/theme.js',
  './js/trips.js',
  './js/utils.js',
  './js/views/asistente.js',
  './js/views/bienvenida.js',
  './js/views/caja.js',
  './js/views/compensa.js',
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

// Solo se guardan los archivos de la app y las librerías; los mapas y las
// consultas de vuelos siempre van a la red (y así no llenan el móvil).
const KEEP = [self.location.origin, 'https://cdn.jsdelivr.net', 'https://www.gstatic.com'];

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!KEEP.some((o) => e.request.url.startsWith(o + '/'))) return;
  // Los archivos de la app se piden sin la caché del navegador (GitHub Pages
  // la deja 10 min), para que una versión nueva se vea al momento.
  const own = e.request.url.startsWith(self.location.origin + '/');
  e.respondWith(
    fetch(e.request, own ? { cache: 'no-cache' } : undefined)
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

// ---------- Notificaciones con la app cerrada (Web Push) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Rutivo', body: e.data ? e.data.text() : '' };
  }
  const title = String(d.title || 'Rutivo').slice(0, 90);
  e.waitUntil(
    self.registration.showNotification(title, {
      body: String(d.body || '').slice(0, 240),
      tag: String(d.tag || 'rutivo'),
      renotify: true,
      requireInteraction: /Sal ya|cancelado|desviado/.test(title),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [300, 120, 300, 120, 300],
      data: { url: './' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
