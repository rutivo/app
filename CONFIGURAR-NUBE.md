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
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

6. Pulsa **Publicar**. Estas reglas hacen que cada usuario solo pueda ver sus propios datos.

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
