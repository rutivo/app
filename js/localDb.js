// Almacén grande del móvil (IndexedDB) para lo que no cabe bien en localStorage:
// las fotos de los tickets y la «base» de la sincronización.
//
// localStorage solo admite unos 5 MB en total y lo comparte con los datos de la
// app (cajaTransfer): si las fotos lo llenan, ya no se pueden guardar los datos.
// IndexedDB admite cientos de MB.
//
// Si IndexedDB no está disponible (navegadores antiguos, algunos modos privados),
// todas las funciones fallan de forma controlada (null / false) y quien las usa
// sigue con localStorage como antes.

const DB_NAME = 'rutivo';
const DB_VERSION = 1;
export const STORES = ['fotos', 'sync'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Si otra pestaña con una versión nueva necesita actualizar, se cierra esta conexión.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/** Ejecuta `fn(store)` en una transacción y espera a que quede guardada. */
async function run(storeName, mode, fn) {
  const db = await open();
  if (!db) throw new Error('idb-unavailable');
  return new Promise((resolve, reject) => {
    let out;
    let tx;
    try {
      tx = db.transaction(storeName, mode);
      const r = fn(tx.objectStore(storeName));
      if (r) r.onsuccess = () => (out = r.result);
    } catch (e) {
      return reject(e);
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error || new Error('idb-error'));
    tx.onabort = () => reject(tx.error || new Error('idb-abort'));
  });
}

/** ¿Se puede usar el almacén grande en este navegador? */
export const available = async () => !!(await open());

/** Valor guardado, o null si no hay (o no se puede leer). */
export async function get(storeName, key) {
  try {
    const v = await run(storeName, 'readonly', (s) => s.get(key));
    return v === undefined ? null : v;
  } catch {
    return null;
  }
}

/** Guarda un valor. true solo si quedó guardado (transacción completada). */
export async function set(storeName, key, value) {
  try {
    await run(storeName, 'readwrite', (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

/** Borra un valor. true si se completó. */
export async function del(storeName, key) {
  try {
    await run(storeName, 'readwrite', (s) => s.delete(key));
    return true;
  } catch {
    return false;
  }
}

/** Todas las claves de un almacén ([] si no se puede leer). */
export async function keys(storeName) {
  try {
    return (await run(storeName, 'readonly', (s) => s.getAllKeys())) || [];
  } catch {
    return [];
  }
}

/** Vacía un almacén. true si se completó. */
export async function clear(storeName) {
  try {
    await run(storeName, 'readwrite', (s) => s.clear());
    return true;
  } catch {
    return false;
  }
}
