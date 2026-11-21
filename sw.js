// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Service worker: la app se abre al instante y funciona sin conexión.
//
// Estrategia «primero lo guardado»: cada versión de la app se guarda completa en
// el móvil (caché con el nombre de la versión) y se abre desde ahí, sin esperar a
// internet. Por detrás, el navegador mira si hay un sw.js nuevo; si lo hay, el
// nuevo descarga la versión entera, la activa y la página se recarga (si se
// acaba de abrir) o muestra «Nueva versión · Actualizar» (ver js/actualizar.js).
//
// VERSION es la huella de todos los archivos de FILES: si cambia cualquiera,
// hay que regenerarla con `npm run version` (las pruebas fallan si no).
const VERSION = '3d830425aac1';
const CACHE = 'rutivo-' + VERSION;
const FILES = [
  './',
  './index.html',
  './legal.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './fonts/manrope-latin.woff2',
  './fonts/manrope-latin-ext.woff2',
  './js/main.js',
  './js/actualizar.js',
  './js/agency.js',
  './js/asistente.js',
  './js/backend/claude.js',
  './js/backend/firebase.js',
  './js/cloud.js',
  './js/compensa.js',
  './js/config.js',
  './js/despertar.js',
  './js/dom.js',
  './js/facturaLegal.js',
  './js/flight.js',
  './js/fotos.js',
  './js/flightStatus.js',
  './js/fuelPack.js',
  './js/fuelReceipt.js',
  './js/huchas.js',
  './js/i18n.js',
  './js/jornada.js',
  './js/kws.js',
  './js/legal.js',
  './js/localDb.js',
  './js/logo.js',
  './js/microfono.js',
  './js/money.js',
  './js/ocr.js',
  './js/oido.js',
  './js/oidoWorker.js',
  './js/pdfCompat.js',
  './js/pdfLib.js',
  './js/pdfWorker.mjs',
  './js/providerReader.js',
  './js/push.js',
  './js/reminders.js',
  './js/serviceReader.js',
  './js/report.js',
  './js/ruta.js',
  './js/salida.js',
  './js/store.js',
  './js/sync/merge.js',
  './js/sync/shards.js',
  './js/theme.js',
  './js/trips.js',
  './js/utils.js',
  './js/vozAcciones.js',
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
  './js/views/manosLibres.js',
  './js/views/proximos.js',
  './js/views/tips.js',
  './js/views/transfer.js',
  './js/welcome.js',
];

// Huella de los archivos descargados (la misma cuenta que scripts/version-sw.mjs)
async function fingerprint(entries) {
  const enc = new TextEncoder();
  const parts = [];
  for (const [f, buf] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) parts.push(enc.encode(f + '\0'), new Uint8Array(buf), enc.encode('\0'));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  return [...hash].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

self.addEventListener('install', (e) => {
  // Se descarga la versión entera, saltándose la caché del navegador, y solo se
  // instala si TODO coincide con la huella (p. ej. no a mitad de una publicación).
  // Si algo falla, sigue la versión anterior y se reintenta en la próxima apertura.
  e.waitUntil((async () => {
    const got = await Promise.all(FILES.map(async (f) => {
      const res = await fetch(new Request(f, { cache: 'reload' }));
      if (!res.ok) throw new Error('falta ' + f);
      return [f, res, await res.clone().arrayBuffer()];
    }));
    const print = await fingerprint(got.map(([f, , buf]) => [f, buf]));
    if (print !== VERSION) throw new Error('versión incompleta: ' + print + ' ≠ ' + VERSION);
    const c = await caches.open(CACHE);
    await Promise.all(got.map(([f, res]) => c.put(f, res)));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Se borran SOLO las versiones anteriores de la app («rutivo-…» y las antiguas «gestor-transfer-vN»).
  // Lo demás se respeta: p. ej. el reconocedor de voz (~77 MB, «transformers-cache»),
  // que antes se borraba en cada actualización y había que volver a descargar.
  const ours = (k) => k !== CACHE && (k.startsWith('rutivo-') || k.startsWith('gestor-transfer-'));
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(ours).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Solo se guardan los archivos de la app y las librerías (con su versión en la
// dirección: no cambian); los mapas y las consultas siempre van a la red.
const KEEP = [self.location.origin, 'https://cdn.jsdelivr.net/npm'];

async function fromCache(req) {
  const c = await caches.open(CACHE);
  // Las páginas (index.html, legal.html, './') se buscan sin «?…» (p. ej. ?source=pwa)
  const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    if (req.mode === 'navigate') {
      const page = await c.match('./index.html');
      if (page) return page;
    }
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!KEEP.some((o) => e.request.url.startsWith(o + '/'))) return;
  if (new URL(e.request.url).pathname.endsWith('/sw.js')) return;
  e.respondWith(fromCache(e.request));
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
