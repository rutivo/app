// Notificaciones con la app cerrada (Web Push). El móvil se suscribe y manda la
// lista de avisos al servidor de Rutivo (worker/avisos.js), que los envía a su hora.
// En iPhone solo funciona con Rutivo añadido a la pantalla de inicio (iOS 16.4+).
import { FLIGHT_API, PUSH_PUBLIC_KEY } from './config.js';
import { readFlag, writeFlag } from './dom.js';

const SENT_KEY = 'pushSent';
const RESEND_MS = 30 * 6e4;

const url = () => FLIGHT_API.replace(/\/$/, '') + '/avisos';
/** Clave pública en bytes (base64url → 65 bytes). */
export function keyBytes(b64 = PUSH_PUBLIC_KEY) {
  const t = b64.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
const key = keyBytes;

export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isInstalled = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));

/** 'ok' si se puede; 'install' si en iPhone falta añadirla a la pantalla de inicio; 'no' si el navegador no puede. */
export function pushSupport() {
  if (!FLIGHT_API || !PUSH_PUBLIC_KEY || !('serviceWorker' in navigator)) return 'no';
  if (!('PushManager' in window)) return isIOS() && !isInstalled() ? 'install' : 'no';
  return 'ok';
}

const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

async function subscription(create = false) {
  // Nunca quedarse esperando: si el service worker no está, no hay avisos con la app cerrada
  const reg = (await navigator.serviceWorker.getRegistration()) || (await within(navigator.serviceWorker.ready, create ? 10000 : 1500));
  if (!reg) {
    if (create) throw new Error('sin service worker');
    return null;
  }
  const sub = await reg.pushManager.getSubscription();
  if (sub || !create) return sub;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key() });
}

async function post(body) {
  const r = await fetch(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('avisos ' + r.status);
  return r.json();
}

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Europe/Madrid';
  }
};

/** Pide permiso, suscribe el móvil y manda un aviso de prueba. Lanza error si no se puede. */
export async function enablePush(alarms = []) {
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('permiso');
  const sub = await subscription(true);
  const res = await post({ sub: sub.toJSON(), alarms, tz: tz(), test: true });
  writeFlag(SENT_KEY, JSON.stringify({ h: JSON.stringify(alarms), at: Date.now() }));
  return res;
}

/** ¿Está este móvil recibiendo avisos con la app cerrada? */
export async function pushActive() {
  try {
    // La suscripción es lo fiable: si se quita el permiso, el navegador la borra
    return pushSupport() === 'ok' && !!(await subscription());
  } catch {
    return false;
  }
}

/** Manda la lista de avisos al servidor (solo si ha cambiado o hace 30 min). */
export async function syncAlarms(alarms) {
  if (!(await pushActive())) return false;
  const h = JSON.stringify(alarms);
  let last = {};
  try {
    last = JSON.parse(readFlag(SENT_KEY) || '{}');
  } catch {
    /* nada */
  }
  if (last.h === h && Date.now() - last.at < RESEND_MS) return true;
  const sub = await subscription();
  await post({ sub: sub.toJSON(), alarms, tz: tz() });
  writeFlag(SENT_KEY, JSON.stringify({ h, at: Date.now() }));
  return true;
}

/** Deja de recibir avisos con la app cerrada. */
export async function disablePush() {
  const sub = await subscription();
  if (!sub) return;
  try {
    await post({ sub: sub.toJSON(), off: true });
  } catch {
    /* sin red: al menos se quita la suscripción */
  }
  await sub.unsubscribe();
  writeFlag(SENT_KEY, '');
}
