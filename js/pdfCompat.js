// © 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados. Ver LICENSE.
// Compatibilidad de pdf.js 6 con iPhone anteriores a iOS 17.4: la versión
// «legacy» trae sustitutos para casi todo, pero no para Promise.withResolvers.
// Este es el comportamiento estándar del lenguaje (ES2024).
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new this((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
