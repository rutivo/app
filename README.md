# Rutivo · Gestor Transfer

App para conductores de transfer: caja diaria, servicios, gasolina, facturas en PDF y hucha.
**Enlace de la app: https://rutivo.github.io/app/**

Es una **PWA**: se instala en el móvil desde el navegador y funciona sin conexión.
Los datos se guardan en el móvil y, si se activa la nube, en la cuenta de cada
usuario (Firebase). Para activarla, sigue **CONFIGURAR-NUBE.md**.

## Publicarla

No necesita compilación. Sube la carpeta tal cual (por ejemplo, arrastrándola a
app.netlify.com/drop). Más detalles en `LEEME.txt`.

Para probarla en el ordenador hace falta un servidor (los módulos JavaScript no
funcionan abriendo el archivo con doble clic):

```bash
npm start      # http://localhost:8080
npm test       # pruebas de la lógica (Node 20 o superior, sin dependencias)
```

## Estructura

```
index.html            estructura de las pantallas
css/styles.css        estilos (modo claro/oscuro, factura A4, impresión)
sw.js                 service worker (sin conexión). Sube CACHE al añadir archivos
js/
  main.js             arranque y navegación entre pestañas
  config.js           datos del proyecto de Firebase (null = sin nube)
  store.js            estado y guardado en el móvil, copia de seguridad
  cloud.js            sincronización con la nube y migración de datos del móvil
  backend/            conexión con Firebase y con Claude
  utils.js            formato de importes y fechas
  money.js            IVA, totales de factura, numeración, caja y hucha
  agency.js           lectura del texto del servicio de la agencia
  welcome.js          mensaje de bienvenida por WhatsApp
  logo.js             iconos y logo en SVG
  reminders.js        avisos de recogida, bienvenida y hucha
  license.js          prueba de 15 días y código de activación
  dom.js              ayudas de interfaz (avisos, confirmación en dos toques, guardar archivos)
  views/              una pantalla por archivo: caja, transfer, gasolina, facturas, hucha,
                      cuenta (registro/entrada) y tips (avisos de instalar y de copia)
tests/                pruebas de money, agency, welcome y license
firestore.rules       reglas de seguridad de la base de datos
```

`utils`, `money`, `agency` y `welcome` no tocan la pantalla, por eso se pueden probar en Node.

## Compatibilidad de datos

Se mantienen la clave `cajaTransfer` de localStorage y el formato de los datos de
versiones anteriores: al actualizar, cada usuario conserva lo que tenía. Por eso
los campos usan nombres cortos (`mov`, `srv`, `f`, `i`…); su significado está
documentado en `js/store.js`.

No cambies `LICENSE_SECRET` ni `licenseCode()` en `js/license.js`: invalidaría los
códigos de activación ya entregados.


## Licencia

© 2026 Alejandro Antonio Fernández Moyano. Todos los derechos reservados.
Software propietario: prohibida su copia, modificación o distribución sin autorización. Ver [LICENSE](LICENSE).
