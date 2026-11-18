// Ayudas para el DOM y avisos.

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

let toastTimer;
/** Muestra un aviso breve en la parte inferior. */
export function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = 'none'), 5000);
}

/**
 * Botón de confirmación en dos toques: el primero lo "arma" y cambia el texto,
 * el segundo ejecuta. Devuelve true si ya estaba armado.
 */
export function confirmTap(button, armedText, hint) {
  if (button.dataset.arm === '1') return true;
  // En los botones de lista solo cambia el título (elemento con data-label).
  const label = button.querySelector('[data-label]') || button;
  button.dataset.arm = '1';
  button.dataset.text ??= label.textContent;
  label.textContent = armedText;
  if (hint) toast(hint);
  return false;
}

/** Igual que confirmTap pero se desarma solo pasados `ms`. */
export function confirmTapTimed(button, armedText, hint, ms = 6000) {
  if (button.dataset.arm === '1') {
    disarm(button);
    return true;
  }
  confirmTap(button, armedText, hint);
  setTimeout(() => disarm(button), ms);
  return false;
}

export function disarm(button) {
  button.dataset.arm = '';
  const label = button.querySelector('[data-label]') || button;
  if (button.dataset.text) label.textContent = button.dataset.text;
}

/** Delegación de clics: ejecuta handler(el, event) si el clic cae en `selector`. */
export function onClick(selector, handler) {
  document.addEventListener('click', (e) => {
    const el = e.target.closest(selector);
    if (el) handler(el, e);
  });
}

/** Ofrece un archivo para guardar: Claude, compartir del móvil o descarga. */
export async function saveFile(blob, filename, type) {
  try {
    const d = window.claude ? await window.claude.use('downloads') : null;
    if (d) {
      await d.save({ filename, data: blob });
      return 'saved';
    }
  } catch (err) {
    if (err && err.code === 'declined') return 'cancelled';
  }
  try {
    const file = new File([blob], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
  }
  return 'unavailable';
}

/** Carga un script externo una sola vez. */
export const loadScript = (src) =>
  new Promise((ok, ko) => {
    if (document.querySelector('script[src="' + src + '"]')) return ok();
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = ko;
    document.head.appendChild(s);
  });

/** Descarga un archivo con el método clásico del navegador. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Lee un valor de localStorage sin fallar. */
export function readFlag(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Guarda un valor en localStorage sin fallar. */
export function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento */
  }
}
