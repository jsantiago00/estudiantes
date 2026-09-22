# Portar funcionalidades de limpiArte a EstudiAntes

Este documento describe 5 funcionalidades ya probadas en producción en otra app (**limpiArte**, gestión de turnos de limpieza domiciliaria) que se quieren portar a **EstudiAntes**. Es una guía de implementación con código real extraído de la app original — adaptalo al stack, componentes y convenciones que ya existan en este proyecto (no asumas que EstudiAntes es vanilla JS; si es React/Vue/etc., traducí la lógica a ese patrón, no copies el DOM-string approach literalmente).

## Mapeo de terminología

| limpiArte | EstudiAntes |
|---|---|
| turno (shift) | clase |
| hogar (home/cliente) | profesor / materia (la entidad que agrupa clases recurrentes y tiene teléfono, dirección, mensajes) |
| `db.shifts` | `db.clases` |
| `db.homes` | `db.profesores` (o `db.materias`, según cómo esté modelado EstudiAntes ya) |

Antes de escribir código, revisá cómo EstudiAntes ya modela sus datos (¿hay ya un concepto de "clase" o "materia"? ¿usa localStorage, IndexedDB, o un backend?) y adaptá los nombres de campos de abajo a lo que exista, en vez de forzar el modelo de limpiArte.

---

## 1. Calendario semana/mes

Estado central: un objeto de estado de UI con modo (`week`/`month`), inicio de semana visible, fecha seleccionada y cursor de mes:

```js
var state = {
  agendaMode: 'week',            // 'week' | 'month'
  weekStart: startOfWeek(new Date()),
  selectedDate: todayStr(),
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
};
```

Helpers de fecha (agnósticos del dominio, se pueden copiar tal cual):

```js
function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function fromDateStr(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function todayStr() { return toDateStr(new Date()); }
function isToday(dateStr) { return dateStr === todayStr(); }
function startOfWeek(d) {
  var date = new Date(d);
  var day = (date.getDay() + 6) % 7; // semana arranca lunes
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d, n) { var r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
```

**Vista semana** — tira de 7 chips clickeables, cada uno con un punto si hay clases ese día:

```js
function renderDayStrip() {
  var strip = document.getElementById('dayStrip');
  var html = '';
  for (var i = 0; i < 7; i++) {
    var d = addDays(state.weekStart, i);
    var dateStr = toDateStr(d);
    var hasClases = db.clases.some(function(c) { return c.date === dateStr; });
    var classes = 'day-chip' + (dateStr === state.selectedDate ? ' selected' : '') + (isToday(dateStr) ? ' today' : '');
    html += '<button class="' + classes + '" data-date="' + dateStr + '">' +
      '<span class="dow">' + WEEKDAYS[i].slice(0, 1) + '</span>' +
      '<span class="dnum">' + d.getDate() + '</span>' +
      '<span class="dot' + (hasClases ? '' : ' hidden-dot') + '"></span>' +
    '</button>';
  }
  strip.innerHTML = html;
  strip.querySelectorAll('[data-date]').forEach(function(el) {
    el.addEventListener('click', function() {
      state.selectedDate = el.getAttribute('data-date');
      renderAgenda();
    });
  });
}
```

**Vista mes** — grilla de 42 celdas (6 semanas fijas), hasta 3 puntos por día:

```js
function renderMonthGrid() {
  var grid = document.getElementById('monthGrid');
  var firstOfMonth = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth(), 1);
  var gridStart = startOfWeek(firstOfMonth);
  var html = '<div class="month-grid">';
  WEEKDAYS.forEach(function(wd) { html += '<div class="mg-dow">' + wd.slice(0, 1) + '</div>'; });
  for (var i = 0; i < 42; i++) {
    var d = addDays(gridStart, i);
    var dateStr = toDateStr(d);
    var inMonth = d.getMonth() === state.monthCursor.getMonth();
    var dayClases = db.clases.filter(function(c) { return c.date === dateStr; });
    var classes = 'month-cell' + (inMonth ? '' : ' other-month') + (isToday(dateStr) ? ' today' : '') + (dateStr === state.selectedDate ? ' selected' : '');
    var dots = dayClases.slice(0, 3).map(function() { return '<span class="mc-dot"></span>'; }).join('');
    html += '<button type="button" class="' + classes + '" data-date="' + dateStr + '"><span>' + d.getDate() + '</span><span class="mc-dots">' + dots + '</span></button>';
  }
  html += '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('[data-date]').forEach(function(el) {
    el.addEventListener('click', function() {
      state.selectedDate = el.getAttribute('data-date');
      renderAgenda();
    });
  });
}
```

**Orquestador** — decide qué vista pintar y refresca el detalle del día:

```js
function renderAgenda() {
  document.getElementById('weekLabel').textContent = state.agendaMode === 'month' ? monthLabel() : weekLabel();
  if (state.agendaMode === 'month') renderMonthGrid(); else renderDayStrip();
  renderDayDetail();
}
function weekLabel() {
  var start = state.weekStart, end = addDays(start, 6);
  return fmtDisplayDate(start) + ' – ' + fmtDisplayDate(end);
}
function monthLabel() {
  return MONTH_NAMES[state.monthCursor.getMonth()] + ' ' + state.monthCursor.getFullYear();
}
```

Toggle semana/mes y navegación:

```js
document.querySelectorAll('#agendaModeToggle button').forEach(function(btn) {
  btn.addEventListener('click', function() {
    state.agendaMode = btn.getAttribute('data-mode');
    document.querySelectorAll('#agendaModeToggle button').forEach(function(b) { b.classList.toggle('active', b === btn); });
    document.getElementById('weekStripRow').hidden = state.agendaMode !== 'week';
    document.getElementById('monthNavRow').hidden = state.agendaMode !== 'month';
    renderAgenda();
  });
});
document.getElementById('prevWeek').addEventListener('click', function() {
  state.weekStart = addDays(state.weekStart, -7);
  renderAgenda();
});
document.getElementById('nextWeek').addEventListener('click', function() {
  state.weekStart = addDays(state.weekStart, 7);
  renderAgenda();
});
document.getElementById('prevMonth').addEventListener('click', function() { state.monthCursor = addMonths(state.monthCursor, -1); renderAgenda(); });
document.getElementById('nextMonth').addEventListener('click', function() { state.monthCursor = addMonths(state.monthCursor, 1); renderAgenda(); });
document.getElementById('goToday').addEventListener('click', function() {
  state.weekStart = startOfWeek(new Date());
  state.selectedDate = todayStr();
  state.monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderAgenda();
});
```

HTML base de referencia:

```html
<div class="week-row">
  <span class="week-label" id="weekLabel"></span>
  <button class="today-btn" id="goToday">Hoy</button>
</div>
<div class="agenda-mode-row">
  <div class="pill-group" id="agendaModeToggle">
    <button type="button" data-mode="week" class="active">Semana</button>
    <button type="button" data-mode="month">Mes</button>
  </div>
</div>
<div class="day-strip-row" id="weekStripRow">
  <button class="nav-arrow" id="prevWeek">‹</button>
  <div class="day-strip" id="dayStrip"></div>
  <button class="nav-arrow" id="nextWeek">›</button>
</div>
<div class="day-strip-row" id="monthNavRow" hidden>
  <button class="nav-arrow" id="prevMonth">‹</button>
  <div id="monthGrid" style="flex:1;"></div>
  <button class="nav-arrow" id="nextMonth">›</button>
</div>
<div class="day-detail" id="dayDetail"></div>
```

Constantes usadas arriba:
```js
var WEEKDAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
var MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
```

---

## 2. Acceso rápido a la próxima clase (banner)

Devuelve la próxima clase programada, con una ventana de tolerancia para seguir mostrando una que ya arrancó:

```js
function shiftStartMs(clase) {
  return new Date(clase.date + 'T' + (clase.startTime || '00:00')).getTime();
}
function nextUpcomingClase() {
  var now = Date.now();
  var windowMs = 1 * 3600000; // ej: 1h de tolerancia post-inicio; ajustar al caso de uso
  var upcoming = db.clases.filter(function(c) {
    if (c.status !== 'scheduled') return false;
    var dt = shiftStartMs(c);
    return dt >= now - windowMs;
  });
  upcoming.sort(function(a, b) { return shiftStartMs(a) - shiftStartMs(b); });
  return upcoming[0] || null;
}
```

Banner fijo arriba de todo (fuera de las tabs), con acciones contextuales:

```js
function renderNextBanner() {
  var root = document.getElementById('nextBanner');
  var clase = nextUpcomingClase();
  if (!clase) {
    root.innerHTML = '<div class="next-banner empty"><p class="label">Próxima clase</p><p class="title">No hay clases programadas</p></div>';
    return;
  }
  var prof = getProfesor(clase.profesorId);
  var dateLabel = isToday(clase.date) ? 'Hoy' : fmtDisplayDate(fromDateStr(clase.date));

  root.innerHTML =
    '<div class="next-banner">' +
      '<p class="label">Próxima clase</p>' +
      '<p class="title">' + escapeHtml(prof ? prof.name : '(sin datos)') + '</p>' +
      '<p class="meta">' + dateLabel + ' · ' + (clase.startTime || '') + (prof && prof.address ? ' · ' + escapeHtml(prof.address) : '') + '</p>' +
      '<div class="actions">' +
        (prof && prof.phone ? '<button data-wa="' + prof.id + '">💬 WhatsApp</button>' : '') +
        (prof ? '<button data-howto="' + prof.id + '">📍 Cómo llego</button>' : '') +
      '</div>' +
    '</div>';
  var waBtn = root.querySelector('[data-wa]');
  if (waBtn) waBtn.addEventListener('click', function() { openWhatsAppPicker(prof); });
  var howtoBtn = root.querySelector('[data-howto]');
  if (howtoBtn) howtoBtn.addEventListener('click', function() { window.open(mapsUrl(prof), '_blank'); });
}
```

Llamalo en cada re-render global (`renderAll()`) para que siempre refleje el estado más nuevo. El timer en vivo de "llevás X trabajando" de limpiArte es específico de un caso de facturación por hora — probablemente no aplica a EstudiAntes, así que se omitió; si sí querés un contador de "faltan X min para la clase", es trivial agregarlo con la misma `clase` ya resuelta acá.

---

## 3. "Cómo llego"

Versión simple, sin backend propio — es la que se recomienda para EstudiAntes salvo que ya tengan una API de rutas propia:

```js
function mapsUrl(entity) {
  if (entity.lat && entity.lon) {
    return 'https://www.google.com/maps/dir/?api=1&destination=' + entity.lat + ',' + entity.lon + '&travelmode=transit';
  }
  return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(entity.address || '') + '&travelmode=transit';
}
```

Se usa como `href` de un link o `window.open` de un botón — no requiere geolocalización ni claves de API. `travelmode=transit` asume transporte público; cambiar a `driving`/`walking`/`bicycling` según el público de EstudiAntes.

(La versión avanzada de limpiArte calcula combinaciones de colectivo en tiempo real contra una API propia de transporte de Mendoza — es específica de esa ciudad y no portable sin un backend equivalente. No se incluye acá; si en algún momento se necesita, avisá y se documenta aparte.)

---

## 4. Mensajes predeterminados (plantillas de WhatsApp)

Cada profesor/contacto guarda un array de plantillas:

```js
// profesor.messages = [{ id, label, text }]
```

Generador de link de WhatsApp:

```js
function waUrl(phone, text) {
  var digits = (phone || '').replace(/\D/g, '');
  var url = 'https://wa.me/' + digits;
  if (text) url += '?text=' + encodeURIComponent(text);
  return url;
}
```

Selector de plantilla al tocar "WhatsApp" (si no hay plantillas guardadas, abre el chat vacío directo):

```js
function openWhatsAppPicker(prof) {
  var msgs = prof.messages || [];
  if (msgs.length === 0) {
    window.open(waUrl(prof.phone), '_blank');
    return;
  }
  var html = '<h2>Enviar WhatsApp</h2>' +
    '<p>' + escapeHtml(prof.name) + '</p>' +
    '<div class="btn-row" style="flex-direction:column;">' +
      msgs.map(function(m) {
        return '<button class="btn btn-outline" data-wamsg="' + m.id + '">' + escapeHtml(m.label) + '</button>';
      }).join('') +
      '<button class="btn btn-secondary" id="waNoMsg">Sin mensaje (chat vacío)</button>' +
    '</div>';
  openModal(html);
  document.querySelectorAll('[data-wamsg]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var m = msgs.find(function(x) { return x.id === btn.getAttribute('data-wamsg'); });
      window.open(waUrl(prof.phone, m ? m.text : ''), '_blank');
      closeModal();
    });
  });
  document.getElementById('waNoMsg').addEventListener('click', function() {
    window.open(waUrl(prof.phone), '_blank');
    closeModal();
  });
}
```

CRUD de plantillas (dentro del form de edición de profesor/materia):

```js
function renderMessagesList(prof) {
  var msgs = prof.messages || [];
  if (msgs.length === 0) return '<div class="muted">Sin mensajes guardados todavía</div>';
  return msgs.map(function(m) {
    return '<div class="pay-list-item"><span>' + escapeHtml(m.label) + '</span>' +
      '<button class="del" data-delmsg="' + m.id + '">Quitar</button></div>';
  }).join('');
}
function wireMessageDeletes(prof) {
  document.querySelectorAll('#messagesList [data-delmsg]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      prof.messages = (prof.messages || []).filter(function(m) { return m.id !== btn.getAttribute('data-delmsg'); });
      save();
      document.getElementById('messagesList').innerHTML = renderMessagesList(prof);
      wireMessageDeletes(prof);
    });
  });
}
// Guardar uno nuevo:
document.getElementById('msgSave').addEventListener('click', function() {
  var label = document.getElementById('msgLabel').value.trim();
  var text = document.getElementById('msgText').value.trim();
  if (!label || !text) { return; }
  if (!prof.messages) prof.messages = [];
  prof.messages.push({ id: uid(), label: label, text: text });
  save();
  document.getElementById('messagesList').innerHTML = renderMessagesList(prof);
  wireMessageDeletes(prof);
});
```

Ejemplos de plantillas útiles para EstudiAntes: "Llego en 5 min", "¿Seguimos con la clase de hoy?", "Necesito reprogramar".

---

## 5. Vista sencilla (principio de diseño, no un componente)

No es código a copiar sino la filosofía que hace que limpiArte se sienta liviana:

- **Una sola pantalla con banner fijo arriba** (próxima clase) + **tabs simples abajo** (ej: Agenda / Contactos / algo tipo Deudas si aplica) — nunca más de 3-4 tabs.
- **Botón flotante (FAB) contextual**: una sola acción "+" cuyo comportamiento cambia según la tab activa (en Agenda crea una clase en la fecha seleccionada, en Contactos crea un contacto nuevo).
- **Todo CRUD vive en modales**, nunca en pantallas nuevas/rutas — reduce la sensación de navegación profunda.
- **Máximo 2 toques** para cualquier acción común: ver la próxima clase (0 toques, está en el banner), mandar un mensaje (1 toque + elegir plantilla), ver cómo llegar (1 toque, abre Maps).
- Si EstudiAntes ya usa un framework de componentes, el principio de arriba se traduce en: un layout con slot fijo para el banner + bottom-nav/tabs + FAB, y modales/sheets en vez de pantallas nuevas para crear/editar — no en copiar el patrón de `innerHTML` con strings de limpiArte, que es específico de su approach vanilla-JS sin build step.

---

## Notas generales de implementación

- No implementar nada de esto sin antes revisar el modelo de datos y el stack ya existentes en EstudiAntes — todo el código de arriba es ilustrativo/portable en lógica, no un patch literal.
- `escapeHtml`, `uid()`, `openModal`/`closeModal`, `save()` son utilidades genéricas que probablemente EstudiAntes ya tiene equivalentes; no dupliques si ya existen.
- Si EstudiAntes no usa `localStorage` sino un backend, reemplazá `db.clases`/`db.profesores` por las llamadas a la API correspondientes, pero mantené la forma de las funciones (`nextUpcomingClase()`, `renderAgenda()`, etc.) como puntos de entrada.
