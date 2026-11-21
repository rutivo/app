// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Lo que el asistente de voz cambia en tus datos: apuntar, corregir y quitar.
//
// Todo pasa por aquí (la pantalla del asistente y el manos libres), con las
// mismas listas y el mismo guardado que la app (save → móvil y tu cuenta, con
// las reglas de Firebase: cada usuario solo escribe en lo suyo).
// Nunca se da por hecho: si no se ha podido guardar, se deshace y se dice.
import { S, save } from './store.js';
import { uid } from './utils.js';

const LISTS = new Set(['mov', 'huc']);

/** Las partes de una acción del asistente (una, o dos si se cobró una parte en efectivo y otra con tarjeta). */
const itemsOf = (action) => (Array.isArray(action.items) && action.items.length ? action.items : [action.item]);

/**
 * Apunta lo que ha pedido el usuario. Devuelve `done` (para corregir o quitar
 * después) o null si no se ha podido guardar (y entonces no queda nada a medias).
 *  - mov: ingresos y gastos de la caja.
 *  - huc: la hucha.
 *  - gasolina (action.gas): además del gasto en la caja, el ticket en Gasolina
 *    (igual que al apuntarla a mano: el ticket lleva `mid`, el gasto de la caja).
 */
export function execute(action) {
  if (!action || !LISTS.has(action.list)) return null;
  const refs = [];
  const items = itemsOf(action).map((it) => ({ id: uid(), ...it }));
  for (const it of items) {
    S[action.list].push(it);
    refs.push({ list: action.list, id: it.id });
    if (action.gas && action.list === 'mov') {
      const g = { id: uid(), mid: it.id, f: it.f, i: it.i, l: +action.gas.l || 0, p: it.p, s: String(action.gas.s || '').slice(0, 60) };
      S.gas.push(g);
      refs.push({ list: 'gas', id: g.id });
    }
  }
  if (!save()) {
    // Ni en el móvil ni en la cuenta: se quita para no dar por apuntado algo que se perdería
    for (const r of refs) S[r.list] = S[r.list].filter((x) => x.id !== r.id);
    return null;
  }
  return { list: action.list, refs, items: items.map(({ id, ...x }) => x), gas: !!action.gas, at: Date.now() };
}

/** ¿Sigue existiendo lo apuntado? (puede haberse borrado a mano o desde otro móvil). */
export const stillThere = (done) => !!done && done.refs.every((r) => S[r.list].some((x) => x.id === r.id));

/**
 * Corrige lo último apuntado: importe (`i`) y/o forma de pago (`p`), o si era
 * ingreso o gasto (`t`). Solo cuando se apuntó una sola cosa. Devuelve el nuevo
 * `done` o null si no se pudo.
 */
export function amend(done, changes) {
  if (!stillThere(done) || done.items.length !== 1) return null;
  const before = done.refs.map((r) => ({ r, old: { ...S[r.list].find((x) => x.id === r.id) } }));
  for (const { r } of before) {
    const x = S[r.list].find((y) => y.id === r.id);
    if (changes.i != null) x.i = changes.i;
    if (changes.p) x.p = changes.p;
    if (changes.t && r.list === 'mov') x.t = changes.t;
  }
  if (!save()) {
    for (const { r, old } of before) {
      const k = S[r.list].findIndex((y) => y.id === r.id);
      if (k >= 0) S[r.list][k] = old;
    }
    return null;
  }
  return { ...done, items: [{ ...done.items[0], ...changes }], at: Date.now() };
}

/** Quita lo último apuntado (con todas sus partes). true si se ha quitado y guardado. */
export function undo(done) {
  if (!stillThere(done)) return false;
  const kept = {};
  for (const r of done.refs) {
    kept[r.list] = kept[r.list] || S[r.list];
    S[r.list] = S[r.list].filter((x) => x.id !== r.id);
  }
  if (!save()) {
    Object.assign(S, kept);
    return false;
  }
  return true;
}
