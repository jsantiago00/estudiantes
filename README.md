# Estudiemos

Plataforma para dar clases particulares, estilo «aula virtual» pero simple. Antes se llamaba EstudiAntes.

- **Profe** (`index.html`): agenda semana/mes, alumnos, cobros (Billetera), tareas y temas,
  **trabajos prácticos**, WhatsApp con plantillas, **pizarra por clase**, avisos, reseñas y
  notificaciones. Funciona sin cuenta (todo en el dispositivo); con Google se respalda en la nube y
  se habilita lo de los alumnos.
- **Estudiante o familia** (`estudiante.html`), opcional: el profe lo invita desde la ficha del
  alumno con un link. Ve sus clases, si debe alguna (o el monto, si el profe lo permite), los
  resúmenes y las pizarras de cada clase, las tareas, y resuelve las actividades estilo juego (corrección
  al toque, como efecen). Puede contar qué le interesa estudiar y dejar una reseña.
- **Reseñas** (`resenas.html?p=…`): página pública del profe con las reseñas que elige mostrar,
  para la bio de Instagram (se eligen en Reseñas → «A tu página»). Cada reseña se puede exportar
  como imagen 1080×1350. Las reseñas llegan por `review.html` (sin cuenta) o desde la app del alumno.

HTML, CSS y JS sin build. Firebase (Auth con Google, Firestore, Cloud Messaging) en el mismo
proyecto que la [Pizarra](https://github.com/jsantiago00/pizarra).

## Archivos

| | |
|---|---|
| `index.html` | App del profe (el script principal sigue adentro) |
| `js/profe-aula.js` | Profe: alumnos en la app, actividades, pizarra, notificaciones y reseñas de la app |
| `review.html` | Formulario de reseña sin cuenta (vuelve por WhatsApp) |
| `js/nube-profe.js` | Profe: puente con Firebase (respaldo, publicar aulas, escuchas, salas) |
| `estudiante.html`, `js/estudiante.js` | App del estudiante |
| `js/firebase.js` | Firebase compartido (sesión, notificaciones, push) |
| `js/comun.js` | Lógica pura compartida (formato de preguntas, corrección, qué se publica, recordatorios) |
| `firebase-messaging-sw.js` | Recibe los push con la app cerrada |
| `css/base.css` | Sistema de diseño (3 paletas, claro/oscuro), compartido por todas las páginas |
| `css/aula.css`, `css/estudiante.css` | Lo nuevo del aula y la app del estudiante |
| `firestore.rules` | Reglas (compartidas con la Pizarra) |
| `scripts/notificador.mjs` + `.github/workflows/notificador.yml` | Recordatorios y push, cada 10 min |
| `tests/` | `npm test`, `npm run test:reglas`, `npm run test:ui` |

## Cómo se guardan los datos

- `users/{uid}`: todo lo del profe, en un solo documento privado (como siempre).
- `aulas/{id}`: por cada alumno invitado, una copia **solo de lo suyo** (sin notas privadas,
  dirección ni plantillas; montos solo si el profe lo activa). La publica la app del profe cada vez
  que guarda. Los miembros (estudiante y familia) solo pueden escribir sus entregas, su reseña y sus
  intereses.
- `notifs/{id}`: notificaciones dentro de la app; el notificador las manda también como push.

Ver [docs/PUESTA_EN_MARCHA.md](docs/PUESTA_EN_MARCHA.md) para activar los push y para el dominio propio.
