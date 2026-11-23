# Activar las cuentas y la nube (Firebase, gratis)

Mientras no hagas esto, la app funciona como siempre: sin cuentas y con los
datos solo en el móvil. Se hace una sola vez y lleva unos 10 minutos.
Se puede hacer desde el móvil, aunque es más cómodo con ordenador.

## 1. Crear el proyecto

1. Entra en **https://console.firebase.google.com** con tu cuenta de Google.
2. Pulsa **Crear un proyecto** (o "Create a project").
3. Nombre: `rutivo`. Pulsa **Continuar**.
4. Desactiva **Google Analytics** (no hace falta) y pulsa **Crear proyecto**.

El plan gratuito ("Spark") no pide tarjeta.

## 2. Activar el registro con email y contraseña

1. En el menú: **Compilación → Authentication** ("Build → Authentication").
2. Pulsa **Comenzar**.
3. En **Método de inicio de sesión**, elige **Correo electrónico/contraseña**.
4. Activa el **primer** interruptor (no hace falta el de "vínculo por correo") y pulsa **Guardar**.
5. Ve a la pestaña **Configuración → Dominios autorizados** y pulsa **Agregar dominio**: `rutivo.github.io`.
6. Opcional: en **Plantillas**, cambia el idioma de los emails a **Español**.

## 3. Crear la base de datos

1. En el menú: **Compilación → Firestore Database**.
2. Pulsa **Crear base de datos**.
3. Ubicación: **eur3 (europe-west)**. Pulsa **Siguiente**.
4. Elige **Iniciar en modo de producción** y pulsa **Crear**.
5. Ve a la pestaña **Reglas**, borra lo que hay y pega esto:

```
rules_version = '2';

// Reglas de seguridad de Rutivo (Firestore).
// - Cada usuario solo puede leer y escribir SUS datos (users/{su uid}/...).
// - Solo se aceptan los documentos que usa la app, con su forma y tamaño.
// - Todo lo demás está cerrado.
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    // Datos de la app troceados: "meta", "cfg", "mov-2026-11", "fac-2026", "prv-all"…
    match /users/{uid}/data/{part} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid)
        && part.matches('^(meta|cfg|(mov|srv|gas|huc|jor|prv|fac)-[0-9a-z-]{3,7})$')
        && request.resource.data.keys().hasOnly(['j', 'ts'])
        && (!('j' in request.resource.data) || (request.resource.data.j is string && request.resource.data.j.size() < 1000000))
        && (!('ts' in request.resource.data) || request.resource.data.ts is number);
    }

    // Fotos de los tickets de gasolina (imagen en texto, menos de 1 MB).
    match /users/{uid}/fotos/{id} {
      allow read, delete: if isOwner(uid);
      allow create, update: if isOwner(uid)
        && id.matches('^[A-Za-z0-9_-]{1,40}$')
        && request.resource.data.keys().hasOnly(['d'])
        && request.resource.data.d is string
        && request.resource.data.d.size() < 1000000;
    }

    // Enlaces para el cliente (Transfer → 🔗 Enlace). El cliente abre la página con un
    // código secreto de 20 letras y números (imposible de adivinar) y la lee SIN cuenta:
    //  - solo ese documento (no se pueden listar ni buscar enlaces) y solo hasta que caduca;
    //  - el enlace NO dice de quién es: el dueño se apunta aparte, en su zona privada
    //    (users/{uid}/enlaces/{código}), y solo él lo puede escribir, cambiar o borrar;
    //  - forma y tamaño fijos: datos en texto (< 4.000), foto JPEG (≤ 200.000, unos 150 KB),
    //    caducidad de como mucho 45 días y estado opcional («voy de camino», «ya estoy»…).
    // Enlaces antiguos (llevaban «o» = el uid del dueño): su dueño los puede pasar al formato
    // nuevo (se quita «o») o borrar.
    function validLink(x) {
      return x.keys().hasOnly(['d', 'ph', 'exp', 'st'])
        && x.keys().hasAll(['d', 'exp'])
        && x.d is string && x.d.size() < 4000
        && (!('ph' in x) || (x.ph is string && x.ph.size() <= 200000))
        && x.exp is timestamp && x.exp < request.time + duration.value(45, 'd')
        && (!('st' in x) || (x.st is string && x.st.size() < 20));
    }
    function linkMark(uid, id) {
      return /databases/$(database)/documents/users/$(uid)/enlaces/$(id);
    }
    function linkPath(id) {
      return /databases/$(database)/documents/enlaces/$(id);
    }
    match /enlaces/{id} {
      allow get: if id.matches('^[A-Za-z0-9]{20}$') && resource.data.exp > request.time;
      allow create, update: if request.auth != null && id.matches('^[A-Za-z0-9]{20}$')
        && validLink(request.resource.data) && existsAfter(linkMark(request.auth.uid, id));
      allow delete: if request.auth != null
        && (exists(linkMark(request.auth.uid, id)) || resource.data.get('o', '') == request.auth.uid);
    }
    // La marca «este enlace es mío»: solo en tu zona, vacía, y solo para un código libre
    // (o para un enlace antiguo tuyo). Nadie puede adueñarse del enlace de otro.
    match /users/{uid}/enlaces/{id} {
      allow read, delete: if isOwner(uid);
      allow create: if isOwner(uid) && id.matches('^[A-Za-z0-9]{20}$')
        && request.resource.data.keys().size() == 0
        && (!exists(linkPath(id)) || get(linkPath(id)).data.get('o', '') == uid);
      allow update: if isOwner(uid) && request.resource.data.keys().size() == 0;
    }

    // Cualquier otra ruta: prohibida.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

6. Pulsa **Publicar**. Estas reglas hacen que cada usuario solo pueda ver sus propios datos, y solo
   aceptan los documentos que usa la app (el archivo `firestore.rules` tiene siempre la versión al día).

## 4. Conectar la app

1. Pulsa el engranaje ⚙️ → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, pulsa el icono **`</>`** (Web).
3. Apodo: `Rutivo`. **No** marques Firebase Hosting. Pulsa **Registrar app**.
4. Aparece un bloque `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., ... }`.
5. Copia ese bloque y pégalo en `js/config.js` en lugar de `null`
   (o mándaselo a Claude y lo hace por ti).

Esos datos **no son secretos**: solo identifican tu proyecto. La seguridad la dan
las reglas del paso 3.

## Qué pasa después

- Al abrir la app, cada persona tendrá que **crear su cuenta** (email + contraseña) o entrar.
- Quien ya usaba la app: lo que tenía en el móvil **se sube a su cuenta** al registrarse.
- Puede entrar en otro móvil con el mismo email y tendrá todo.
- Si olvida la contraseña, la app le manda un email para cambiarla.
- **Cerrar sesión** borra los datos del móvil (siguen en la cuenta).
- Sin internet la app sigue funcionando y sube los cambios al volver la conexión.

## Límites del plan gratuito

Unos 50.000 lecturas y 20.000 escrituras al día, y 1 GB de datos: sobra para
cientos de conductores. En la consola, **Uso y facturación** muestra el consumo.

Para ver los usuarios registrados: **Authentication → Usuarios**. Desde ahí
también puedes desactivar o borrar una cuenta.
