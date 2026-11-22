# Estudiemos: guía para seguir trabajando

Leé primero el [README](README.md). Texto visible en español rioplatense (voseo).

- **Sin build.** `index.html` carga, en orden: `js/comun.js`, `js/profe-aula.js` (scripts clásicos que
  comparten el ámbito global con el script principal) y al final el módulo `js/nube-profe.js`, que
  cuelga todo de `window.nube` / `window.firebase*`. `profe-aula.js` se carga ANTES del script
  principal: arriba de todo solo declara funciones, no toca `db`.
- **Firebase compartido con la Pizarra** (`pizarra-d6457`). `firestore.rules` es idéntico en los dos
  repos: si lo cambiás, copialo a `../pizarra` (o al clon) y publicá con
  `firebase deploy --only firestore:rules` desde acá. No toques la sección de la pizarra.
- La pizarra entra como usuario **anónimo**: en Estudiemos un anónimo cuenta como «sin sesión»
  (`usuarioActual()`), y las reglas de Estudiemos exigen `conCuenta()`.
- **Nombres:** en los datos, `db.tps` son las *actividades para resolver* (así se llaman en la interfaz);
  `db.trabajos` son los *trabajos prácticos* que el profe cobra (Billetera). No mezclarlos.
- Los estilos están en `css/base.css` (el sistema de diseño). Componentes: `ic()`, `confirmar()`,
  `openSheet()` con `.sheet-footer`, `.card-head`, `.switch-row`, `.list-item.tap`, `.badge`.
- Las reseñas de la app se copian a `db.resenas` con id `app:<aula>:<uid>` (las borradas quedan en
  `config.resenasOcultas`); la página pública muestra las que tienen `enPagina`.
- **Qué ve el estudiante** lo decide `Comun.construirAula()` (y tiene tests): nunca publicar `notas`,
  `direccion`, `contacto`, `mensajes`, la `clave` de la pizarra, ni montos si `mostrarMontos` es falso.
- Las horas de las clases son de Argentina (UTC-3): para comparar en el servidor, `Comun.instanteArg`.
- **Antes de commitear:** `npm test` y `npm run test:ui` (necesitan terminar en `… 0 fallas`). Si tocaste
  las reglas, `npm run test:reglas` (necesita Java en el PATH para el emulador).
- Commits con autor `jsantiago00 <juansantiagososa00@gmail.com>`. Se publica con push a `main`
  (GitHub Pages: santiagososa.com.ar/estudiantes).
