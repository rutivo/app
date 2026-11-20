// Almacén remoto cuando la app se abre dentro de Claude (window.claude).
// Mantiene las rutas de versiones anteriores para no perder datos.
export async function claudeStore() {
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  const uid = user ? await user.id() : null;
  if (!db || !uid) return null;
  const col = () => db.collection('data/users/' + uid);
  return {
    uid,
    async list() {
      const snap = await col().get();
      return snap.docs.filter((d) => !d.id.startsWith('foto-')).map((d) => ({ id: d.id, data: d.data() }));
    },
    put: (id, value) => col().doc(id).set(value),
    remove: (id) => col().doc(id).delete(),
    async get(id) {
      const snap = await col().doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    // Este almacén no tiene transacciones: se comprueba la marca justo antes de escribir
    async commit({ sets = {}, deletes = [], expectTs, newTs }) {
      const snap = await col().doc('meta').get();
      const cur = snap.exists && typeof snap.data().ts === 'number' ? snap.data().ts : null;
      if (cur !== expectTs) throw Object.assign(new Error('stale'), { code: 'stale' });
      for (const [id, value] of Object.entries(sets)) await col().doc(id).set(value);
      for (const id of deletes) await col().doc(id).delete();
      await col().doc('meta').set({ ts: newTs });
    },
    putPhoto: (id, dataUrl) => col().doc('foto-' + id).set({ d: dataUrl }),
    async getPhoto(id) {
      const snap = await col().doc('foto-' + id).get();
      return snap.exists ? snap.data().d : null;
    },
    removePhoto: (id) => col().doc('foto-' + id).delete(),
  };
}
