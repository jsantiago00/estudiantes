# Estudiemos como plataforma: el plan

Lo que se decidió con Santi (noviembre 2026) para pasar de «app del profe» a una plataforma de
profes y estudiantes en Mendoza, tomando ideas del mapa de talleres de cerámica (el mapa y los
filtros) y de Florar (el chat, la disponibilidad y los cambios de turno).

## Decisiones

- **Solo Mendoza.** Las zonas son los 18 departamentos (lista fija), más «Virtual».
- **La portada es el buscador** (`index.html`): se ve sin cuenta. El panel del profe pasa a
  `app.html`; quien abría la dirección de siempre (o la app instalada) sigue yendo a su panel.
- **Un profe aparece apenas arma su perfil** (nombre, materias y zona o virtual) y entra con Google.
  Para cuidar la plataforma: denuncias, bloquear chats y ocultar profes (administración).
- **Para chatear, el estudiante entra con Google.** Para mirar profes no hace falta cuenta.
- **El WhatsApp lo muestra cada profe si quiere.** Por defecto, el contacto es por el chat.
- **Catálogos fijos**: materias, niveles y zonas (`js/plataforma.js`). Si falta una materia, el
  profe la escribe como «otra»: se ve en su perfil pero no es un filtro.
- **Sin pasajes fijos.** Un precio por hora; un extra opcional a domicilio (apagado de entrada) y
  un detalle libre en el perfil («a domicilio cobro el pasaje»). Lo de antes se migra solo.
- **Billetera = quién pagó, quién debe y cuánto viene.** Los trabajos que se cobraban aparte son
  «Otros cobros».
- **Actividades** con cuatro tipos: ejercicio (se corrige al toque, se puede rehacer), tarea,
  trabajo práctico (texto, hasta 3 fotos achicadas o un link) y evaluación (una sola vez, con
  tiempo opcional y sin las respuestas en el aula del alumno). Devolución con nota, comentario por
  pregunta y «para rehacer».
- **Fotos sin pagar almacenamiento**: se achican en el celular y van dentro del documento.
- **Reservas**: el profe marca su disponibilidad; el estudiante elige un hueco libre y lo pide por
  el chat; el profe lo acepta (y se agenda, una vez o todas las semanas) o no.
- **Cambios y cancelaciones**: cada profe elige una regla (flexible 12 h y la mitad, normal 24 h y
  completa, estricta 48 h y completa), que se ve en su perfil antes de arreglar.
  - El alumno cancela con tiempo: no paga y la recupera dentro de 30 días.
  - Cancela tarde: se aplica la regla; el profe siempre puede no cobrarla.
  - Cancela el profe: nunca se cobra, y queda para recuperar.
  - Cualquiera propone otro horario; hasta que el otro acepta, la clase sigue donde estaba.

## Etapas (hechas)

1. Simplificar al profe (pasajes, catálogos, precio, configuración en 3 pasos, Billetera).
2. Actividades con cuatro tipos y devolución completa.
3. Páginas: buscador en `index.html`, panel en `app.html`, perfil público en `profe.html`.
4. Perfil público del profe (`perfiles/{uid}`, armado por `Plataforma.perfilPublico`).
5. Buscador con lista y mapa (zona, nunca dirección), filtros y «Cerca mío».
6. Chat (`js/chat.js`) con «Sumar como alumno».
7. Reservas, cancelaciones, propuestas de otro horario y recuperos.
8. Denuncias, bloqueo de chats y moderación.

## Ideas para después

- Pagos dentro de la app (Mercado Pago, como en Florar), si los profes lo piden.
- Fotos y archivos de verdad (Firebase Storage, plan pago) si las fotos achicadas no alcanzan.
- Verificar profes (título, DNI) y mostrarlo en el perfil.
- Avisos de chat más rápidos que el notificador cada 10 minutos (Cloud Functions, plan pago).
