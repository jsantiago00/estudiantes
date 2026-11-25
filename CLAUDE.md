# Estudiemos: guía para seguir trabajando

Leé primero el [README](README.md). Texto visible en español rioplatense (voseo).

- **Sin build.** `index.html` es el **buscador** (portada pública) y `app.html` es el **panel del profe**.
  `app.html` carga, en orden: `js/comun.js`, `js/plataforma.js`, `js/perfil-profe.js`, `js/profe-aula.js`,
  `js/primeros-pasos.js`, `js/profe-chat.js`, `js/clases-cambios.js` (scripts clásicos que comparten el
  ámbito global con el script principal) y al final el módulo `js/nube-profe.js`, que cuelga todo de
  `window.nube` / `window.chatNube` / `window.firebase*`. Los scripts clásicos se cargan ANTES del script
  principal: arriba de todo solo declaran funciones, no tocan `db`.
- Los módulos (`estudiante.js`, `nube-profe.js`, `buscador.js`, `perfil-publico.js`) solo importan
  `./firebase.js` y `./chat.js`.
- **Catálogos fijos** en `js/plataforma.js`: materias, niveles, zonas (departamentos de Mendoza), lugares,
  reglas de cancelación y tipos de actividad. El buscador filtra por esos ids: no agregar campos libres
  que deberían ser del catálogo. `db.temas` son las materias del profe, con `catId` del catálogo (o null).
- **Qué se publica del perfil** lo decide `Plataforma.perfilPublico()` (con tests): nunca alumnos, notas,
  direcciones ni montos de clases. Las horas ocupadas van sin nombres.
- **Firebase compartido con la Pizarra** (`pizarra-d6457`). `firestore.rules` es idéntico en los dos
  repos: si lo cambiás, copialo a `../pizarra` (o al clon) y publicá con
  `firebase deploy --only firestore:rules` desde acá. No toques la sección de la pizarra.
- La pizarra entra como usuario **anónimo**: en Estudiemos un anónimo cuenta como «sin sesión»
  (`usuarioActual()`), y las reglas de Estudiemos exigen `conCuenta()`.
- **Nombres:** `db.tareas` son los *pendientes* del profe (privados, no se publican); `db.tps` son las
  *actividades* del alumno (`tipo`: ejercicio, tarea, tp, evaluacion; texto + preguntas opcionales);
  `db.trabajos` son los *otros cobros* de la Billetera (lo que se cobra aparte de las clases). Un pendiente se
  cierra con "Listo" o con "Mandar" (se vuelve actividad, `pendiente.tpId`). En las evaluaciones el aula no
  lleva las respuestas correctas (`Comun.sinRespuesta`): las corrige el profe.
- **Sin pasajes fijos:** un precio por hora (`config.tarifaHabitual`) y un extra opcional a domicilio
  (`config.extraDomicilio`, 0 = nada). En la clase queda en `viatico`.
- **Cancelaciones:** `clase.cancelada = {por, cobro, aTiempo, montoAntes, …}` y el `monto` pasa a ser lo que
  se cobra (así la Billetera no cambia). Una cancelada no ocupa horario, no se recuerda y no se debe si
  `cobro` es 0. Los recuperos van en `alumno.recuperos` (vencen a los 30 días).
- **Simple primero:** alumno nuevo = nombre y WhatsApp; lo demás va en `alumno.porCompletar` y se pregunta
  en la ficha ("Completá la ficha"). La configuración inicial y todo eso está en `js/primeros-pasos.js`.
  Antes de agregar un campo obligatorio a un formulario, preguntarse si puede ir ahí.
- Los estilos están en `css/base.css` (el sistema de diseño). Componentes: `ic()`, `confirmar()`,
  `openSheet()` con `.sheet-footer`, `.card-head`, `.switch-row`, `.list-item.tap`, `.badge`.
- Las reseñas de la app se copian a `db.resenas` con id `app:<aula>:<uid>` (las borradas quedan en
  `config.resenasOcultas`); la página pública muestra las que tienen `enPagina`.
- **Qué ve el estudiante** lo decide `Comun.construirAula()` (y tiene tests): nunca publicar `notas`,
  `direccion`, `contacto`, `mensajes`, la `clave` de la pizarra, ni montos si `mostrarMontos` es falso.
- Las horas de las clases son de Argentina (UTC-3): para comparar en el servidor, `Comun.instanteArg`.
- **Antes de commitear:** `npm test` y `npm run test:ui` (necesitan terminar en `… 0 fallas`;
  `CHROME=/ruta/a/chrome` si Chrome no está en el lugar de siempre). Si tocaste
  las reglas, `npm run test:reglas` (necesita Java en el PATH para el emulador).
- Commits con autor `jsantiago00 <juansantiagososa00@gmail.com>`. Se publica con push a `main`
  (GitHub Pages: santiagososa.com.ar/estudiantes).
