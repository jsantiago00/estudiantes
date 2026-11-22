# Puesta en marcha de Estudiemos

Lo que ya quedó hecho y lo que falta (son pasos que solo podés hacer vos desde la consola).

## Ya hecho

- **Proyecto de Firebase unificado con la Pizarra** (`pizarra-d6457`). Estudiemos dejó de usar
  `estudiantes-f678f`. La Pizarra sigue igual: mismas salas, mismas «Mis pizarras».
- **Reglas de Firestore publicadas** (las de la Pizarra intactas + las de Estudiemos). El archivo
  `firestore.rules` es el mismo en los dos repos: si lo cambiás, copialo al otro.
- Google como forma de entrar y el dominio `santiagososa.com.ar` ya estaban habilitados en ese proyecto.

## Tus datos de antes

Tus datos siguen en el celular (localStorage). Abrí Estudiemos **en el dispositivo donde la venías
usando**, tocá 👤 y entrá con Google: como en el proyecto nuevo todavía no hay nada, se suben solos.
Antes, por las dudas, exportá un respaldo desde ⚙️ → Datos.

> Ojo: si entrás primero desde otro dispositivo que tenga datos viejos, esos son los que se suben.

## Falta: notificaciones push y recordatorios (5 minutos)

El notificador (`scripts/notificador.mjs`) corre cada 10 minutos en GitHub Actions. Sin una
credencial no hace nada. Para activarlo:

1. Entrá a https://console.firebase.google.com/project/pizarra-d6457/settings/serviceaccounts/adminsdk
2. Tocá **Generar nueva clave privada**. Se descarga un `.json`. **No lo subas al repo.**
3. En una terminal, dentro de esta carpeta:
   ```sh
   gh secret set FIREBASE_SERVICE_ACCOUNT < ruta/al/archivo.json
   ```
   (o en GitHub: repo `estudiantes` → Settings → Secrets and variables → Actions → New secret,
   nombre `FIREBASE_SERVICE_ACCOUNT`, y pegás el contenido del `.json`).
4. Borrá el `.json` descargado.
5. Probalo: repo → Actions → **Notificador** → Run workflow. En el log tiene que aparecer una línea
   con `{"profe":0,...}` sin errores.

Después, en la app: 👤 → Notificaciones → **Activar notificaciones en este dispositivo**.

- **iPhone:** las notificaciones solo llegan con la app agregada a la pantalla de inicio
  (Compartir → «Agregar a inicio»), con iOS 16.4 o más. Lo mismo para tus alumnos.
- GitHub pausa las tareas programadas de un repo sin commits durante 60 días. Si pasa, entrá a
  Actions y reactivala.

## Si comprás el dominio (por ejemplo estudiemos.com.ar)

1. Repo `estudiantes` → Settings → Pages → Custom domain → el dominio. Se crea un archivo `CNAME`.
2. DNS (en Cloudflare, como efecen): registros de GitHub Pages.
3. Firebase → Authentication → Settings → **Dominios autorizados** → agregar el dominio nuevo
   (si no, el login con Google falla).
4. En `scripts/notificador.mjs` (o como variable `APP_URL` del workflow) poné la URL nueva, para
   que las notificaciones abran el dominio nuevo.
5. La Pizarra sigue en `santiagososa.com.ar/pizarra` y funciona igual. La única diferencia: hoy, al
   estar en el mismo dominio, la sesión de Google se comparte entre las dos apps; con dominios
   distintos, en la pizarra hay que entrar con Google aparte (el enlace de administración que abre
   Estudiemos igual te da los permisos de profe).

## Probar

```sh
npm install
npm test               # lógica
npm run test:reglas    # reglas en el emulador (necesita Java)
npm run test:ui        # recorre las dos apps en Chrome con un Firebase falso
```
