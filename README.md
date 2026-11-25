# Estudiemos

Plataforma de profes particulares y estudiantes en **Mendoza**. Antes se llamaba EstudiAntes.
El plan y las decisiones están en [docs/PLAN.md](docs/PLAN.md).

- **Buscador** (`index.html`, la portada, sin cuenta): profes por materia, nivel, zona (los
  departamentos de Mendoza), modalidad y precio, en lista y en mapa (se ve la zona, nunca una
  dirección). Ideas tomadas del mapa de talleres de cerámica.
- **Perfil del profe** (`profe.html?p=…`): materias, precio, dónde, horarios, regla de cancelación
  y reseñas. Desde ahí se le escribe por chat o se elige un horario libre. `resenas.html` redirige acá.
- **Profe** (`app.html`): agenda semana/mes, alumnos, **actividades** (ejercicio, tarea, trabajo
  práctico, evaluación, con devolución), **mensajes** con estudiantes y sus pedidos de horario,
  Billetera (quién pagó, quién debe y cuánto viene), pizarra por clase, avisos, reseñas y
  notificaciones. Funciona sin cuenta (todo en el dispositivo); con Google se respalda en la nube,
  aparece en el buscador y se habilita lo de los alumnos.
- **Estudiante o familia** (`estudiante.html`): sus clases, lo que debe, los resúmenes y las
  pizarras, las actividades (las resuelve ahí y ve la devolución), cancelar o cambiar una clase
  según la regla del profe, recuperar las canceladas a tiempo, y los chats con profes.
- **Reseñas**: llegan por `review.html` (sin cuenta) o desde la app del alumno; se exportan como
  imagen 1080×1350.

HTML, CSS y JS sin build. Firebase (Auth con Google, Firestore, Cloud Messaging) en el mismo
proyecto que la [Pizarra](https://github.com/jsantiago00/pizarra).

## Archivos

| | |
|---|---|
| `index.html`, `js/buscador.js` | Buscador de profes (portada), con Leaflet |
| `profe.html`, `js/perfil-publico.js` | Perfil público de un profe |
| `app.html` | App del profe (el script principal sigue adentro) |
| `js/plataforma.js` | Lógica pura de la plataforma: catálogos (materias, niveles, zonas), reglas de cancelación, horarios libres, qué se publica del perfil, filtros del buscador |
| `js/perfil-profe.js` | Profe: materias del catálogo y su perfil público |
| `js/primeros-pasos.js` | Configuración inicial (3 pasos), alumno rápido, carga de varios y «Completá la ficha» |
| `js/profe-aula.js` | Profe: alumnos en la app, actividades, pizarra, notificaciones y reseñas de la app |
| `js/profe-chat.js` | Profe: mensajes, aceptar pedidos de horario, «Sumar como alumno», denuncias y moderación |
| `js/clases-cambios.js` | Profe: cancelar con la regla, proponer otro horario, recuperos, pedidos desde la app |
| `js/chat.js` | El chat (lo usan el profe y el estudiante) |
| `review.html` | Formulario de reseña sin cuenta (vuelve por WhatsApp) |
| `js/nube-profe.js` | Profe: puente con Firebase (respaldo, publicar aulas y perfil, escuchas, chats, moderación) |
| `estudiante.html`, `js/estudiante.js` | App del estudiante |
| `js/firebase.js` | Firebase compartido (sesión, notificaciones, push) |
| `js/comun.js` | Lógica pura compartida (formato de preguntas, corrección, qué se publica del aula, recordatorios) |
| `firebase-messaging-sw.js` | Recibe los push con la app cerrada |
| `css/base.css` | Sistema de diseño (paletas, claro/oscuro), compartido por todas las páginas |
| `css/aula.css`, `css/estudiante.css`, `css/plataforma.css` | Aula, app del estudiante, y lo de la plataforma (buscador, perfil, chat, actividades) |
| `firestore.rules` | Reglas (compartidas con la Pizarra) |
| `scripts/notificador.mjs` + `.github/workflows/notificador.yml` | Recordatorios y push, cada 10 min |
| `tests/` | `npm test`, `npm run test:reglas`, `npm run test:ui` |

## Cómo se guardan los datos

- `users/{uid}`: todo lo del profe, en un solo documento privado (como siempre).
- `aulas/{id}`: por cada alumno invitado, una copia **solo de lo suyo** (sin notas privadas,
  dirección ni plantillas; montos solo si el profe lo activa). La publica la app del profe cada vez
  que guarda. Los miembros (estudiante y familia) solo pueden escribir sus entregas, su reseña y sus
  intereses.
- `aulas/{id}/solicitudes/{id}`: pedidos del estudiante (cancelar una clase, aceptar o no otro
  horario). La app del profe los aplica con su regla y la hora en que se avisó.
- `perfiles/{uid}`: lo público del profe para el buscador. Lo arma `Plataforma.perfilPublico`
  (tiene tests): nunca alumnos, notas, direcciones ni montos de clases.
- `chats/{c_<profe>_<estudiante>}/mensajes/{id}`: el chat; los pedidos de horario son mensajes.
- `denuncias/{id}`, `moderacion/{uid}`, `plataforma/config` (`admins`): moderación.
- `notifs/{id}`: notificaciones dentro de la app (de un aula o de un chat); el notificador las
  manda también como push.

Ver [docs/PUESTA_EN_MARCHA.md](docs/PUESTA_EN_MARCHA.md) para activar los push y para el dominio propio.
