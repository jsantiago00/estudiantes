/* =========================================================
   Estudiemos (profe): que empezar sea fácil.

   - Configuración inicial (la primera vez): nombre, materias, cuánto cobrás y dónde,
     y la lista de alumnos. Cuatro pantallas cortas, todas salteables.
   - Alumno nuevo = nombre y WhatsApp. Y carga de varios a la vez (uno por renglón).
   - "Completá la ficha": lo que falta de cada alumno se pregunta después, de a una
     pregunta y con un toque, en su ficha (alumno.porCompletar).

   Script clásico: comparte el ámbito global con index.html (db, saveDB, openSheet, ic...).
   Se carga antes que el script principal: acá arriba solo se declaran funciones.
   ========================================================= */

const MATERIAS_SUGERIDAS = ['Matemática', 'Física', 'Química', 'Biología', 'Lengua', 'Inglés', 'Historia', 'Geografía', 'Contabilidad', 'Programación', 'Música', 'Apoyo escolar'];

/** Pone el foco en un campo al abrir una hoja, salvo que la persona ya esté escribiendo en otro. */
function enfocarSiLibre(id){
  setTimeout(()=>{
    const el = document.getElementById(id);
    const activo = document.activeElement;
    if(el && (!activo || activo === document.body || !activo.matches('input, textarea, select'))) el.focus();
  }, 250);
}

/* ---------- Configuración inicial ---------- */

function necesitaPrimerosPasos(){
  return !db.config.configInicial && db.alumnos.length === 0 && db.clases.length === 0;
}

const pp = {paso: 0, nombre: '', materias: [], tarifa: '', lugar: 'casa_mia', alumnos: ''};

function abrirPrimerosPasos(){
  pp.paso = 0;
  pp.nombre = db.config.nombreProfe || '';
  pp.materias = db.temas.map(t=>t.nombre);
  pp.tarifa = db.config.tarifaHabitual || '';
  pp.lugar = db.config.modalidadHabitual || 'casa_mia';
  let el = document.getElementById('primerosPasos');
  if(!el){
    el = document.createElement('div');
    el.id = 'primerosPasos';
    el.className = 'pp';
    document.body.appendChild(el);
  }
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  pintarPrimerosPasos();
}

function cerrarPrimerosPasos(){
  const el = document.getElementById('primerosPasos');
  if(el) el.hidden = true;
  document.body.style.overflow = '';
}

function pintarPrimerosPasos(){
  const el = document.getElementById('primerosPasos');
  const total = 4;
  const dots = Array.from({length: total}, (_, i)=>`<span class="${i===pp.paso?'on':''}"></span>`).join('');
  let cuerpo = '', pie = '';
  if(pp.paso === 0){
    cuerpo = `
      <div class="pp-ic">${ic('sparkles')}</div>
      <h2>¡Hola! Armemos tu espacio</h2>
      <p>Son cuatro preguntas cortas. Todo se puede cambiar después.</p>
      <label for="pp_nombre">¿Cómo te llamás?</label>
      <input type="text" id="pp_nombre" value="${escapeAttr(pp.nombre)}" placeholder="Ej: Profe Juli" autocomplete="name" onkeydown="if(event.key==='Enter') ppSiguiente()">
      <div class="hint">Así te ven tus alumnos y aparece en tus reseñas.</div>
      <button type="button" class="link-btn" style="margin-top:18px;" onclick="iniciarSesionGoogle()">${ic('cloud')}¿Ya usabas la app en otro dispositivo? Iniciá sesión</button>`;
    pie = `<button type="button" class="btn primary" onclick="ppSiguiente()">Siguiente</button>`;
  }else if(pp.paso === 1){
    const todas = MATERIAS_SUGERIDAS.concat(pp.materias.filter(m=>!MATERIAS_SUGERIDAS.includes(m)));
    cuerpo = `
      <div class="pp-ic">${ic('book')}</div>
      <h2>¿Qué materias das?</h2>
      <p>Tocá las que correspondan.</p>
      <div class="dias-chips pp-chips">${todas.map(m=>`<button type="button" class="dia-chip ${pp.materias.includes(m)?'sel':''}" onclick="ppToggleMateria(this, '${jsArg(m)}')">${pp.materias.includes(m) ? ic('check') : ''}${escapeHtml(m)}</button>`).join('')}</div>
      <div class="row2" style="margin-top:12px;">
        <input type="text" id="pp_otraMateria" placeholder="Otra materia" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();ppAgregarMateria();}">
        <button type="button" class="btn secondary" onclick="ppAgregarMateria()" aria-label="Agregar materia">${ic('plus')}</button>
      </div>`;
    pie = `<button type="button" class="btn secondary" onclick="ppAtras()">Atrás</button><button type="button" class="btn primary" onclick="ppSiguiente()">Siguiente</button>`;
  }else if(pp.paso === 2){
    cuerpo = `
      <div class="pp-ic">${ic('cash')}</div>
      <h2>¿Cuánto cobrás la hora?</h2>
      <p>Más o menos: después lo podés cambiar para cada alumno.</p>
      <input type="number" id="pp_tarifa" class="pp-grande" inputmode="numeric" min="0" step="500" value="${escapeAttr(pp.tarifa)}" placeholder="10000">
      <label>¿Dónde das las clases?</label>
      <div class="pill-select" id="pp_lugar">
        ${[['casa_mia','home','En mi casa'],['casa_alumno','bus','En la casa del alumno'],['ambas','repeat','Las dos']].map(([v, icono, t])=>
          `<button type="button" class="${pp.lugar===v?'sel':''}" onclick="ppLugar('${v}')">${ic(icono)}${t}</button>`).join('')}
      </div>`;
    pie = `<button type="button" class="btn secondary" onclick="ppAtras()">Atrás</button><button type="button" class="btn primary" onclick="ppSiguiente()">Siguiente</button>`;
  }else{
    cuerpo = `
      <div class="pp-ic">${ic('users')}</div>
      <h2>¿Quiénes son tus alumnos?</h2>
      <p>Escribí o pegá un nombre por renglón. Si querés, el WhatsApp al lado.</p>
      <textarea id="pp_alumnos" class="pp-lista" placeholder="Sofi 2611234567&#10;Tomi&#10;Juli Pérez, 2615550000" oninput="ppContarAlumnos()">${escapeHtml(pp.alumnos)}</textarea>
      <div class="hint" id="pp_cuenta"></div>`;
    pie = `<button type="button" class="btn secondary" onclick="ppTerminar(false)">Lo hago después</button><button type="button" class="btn primary" onclick="ppTerminar(true)">Empezar</button>`;
  }
  el.innerHTML = `
    <div class="pp-card">
      <div class="pp-dots">${dots}</div>
      <div class="pp-body">${cuerpo}</div>
      <div class="pp-pie">${pie}</div>
    </div>`;
  if(pp.paso === 3) ppContarAlumnos();
  const foco = el.querySelector('#pp_nombre, #pp_tarifa, #pp_alumnos');
  if(foco && pp.paso !== 1) setTimeout(()=>foco.focus(), 60);
}

function ppLeerPaso(){
  if(pp.paso === 0) pp.nombre = document.getElementById('pp_nombre').value.trim();
  if(pp.paso === 2) pp.tarifa = document.getElementById('pp_tarifa').value;
  if(pp.paso === 3) pp.alumnos = document.getElementById('pp_alumnos').value;
}
function ppSiguiente(){ ppLeerPaso(); pp.paso = Math.min(3, pp.paso + 1); pintarPrimerosPasos(); }
function ppAtras(){ ppLeerPaso(); pp.paso = Math.max(0, pp.paso - 1); pintarPrimerosPasos(); }
function ppToggleMateria(btn, m){
  const i = pp.materias.indexOf(m);
  if(i >= 0) pp.materias.splice(i, 1); else pp.materias.push(m);
  btn.classList.toggle('sel', i < 0);
  btn.innerHTML = (i < 0 ? ic('check') : '') + escapeHtml(m);
}
function ppAgregarMateria(){
  const input = document.getElementById('pp_otraMateria');
  const m = input.value.trim();
  if(!m) return;
  if(!pp.materias.some(x=>x.toLowerCase() === m.toLowerCase())) pp.materias.push(m);
  pintarPrimerosPasos();
}
function ppLugar(v){
  pp.lugar = v;
  document.querySelectorAll('#pp_lugar button').forEach((b, i)=>b.classList.toggle('sel', ['casa_mia','casa_alumno','ambas'][i] === v));
}
function ppContarAlumnos(){
  const ta = document.getElementById('pp_alumnos');
  const n = Comun.parsearListaAlumnos(ta.value).length;
  document.getElementById('pp_cuenta').textContent = n ? `Se van a agregar ${n} alumno${n!==1?'s':''}. Lo demás de cada uno te lo vamos preguntando después.` : '';
}

function ppTerminar(conAlumnos){
  ppLeerPaso();
  const cfg = db.config;
  if(pp.nombre) cfg.nombreProfe = pp.nombre;
  pp.materias.forEach(m=>{
    if(!db.temas.some(t=>t.nombre.toLowerCase() === m.toLowerCase())) db.temas.push({id: uid(), nombre: m});
  });
  const tarifa = Math.round(parseFloat(pp.tarifa) || 0);
  if(tarifa > 0){
    cfg.tarifaHabitual = tarifa;
    cfg.tarifaMin = Math.min(cfg.tarifaMin || tarifa, Math.max(1000, Math.floor(tarifa * 0.6 / 1000) * 1000));
    cfg.tarifaMax = Math.max(cfg.tarifaMax || tarifa, Math.ceil(tarifa * 1.5 / 1000) * 1000);
  }
  cfg.modalidadHabitual = pp.lugar;
  cfg.configInicial = true;
  cfg.tutorialVisto = true;
  let n = 0;
  if(conAlumnos) n = agregarAlumnosDeLista(pp.alumnos);
  saveDB();
  cerrarPrimerosPasos();
  goTo(n ? 'alumnos' : 'clases');
  showToast(n ? `¡Listo! Agregaste ${n} alumno${n!==1?'s':''}` : '¡Listo! Ya podés empezar');
}

/* ---------- Alumnos: alta rápida y de a varios ---------- */

/** Un alumno con lo mínimo; lo que falta queda en porCompletar para preguntarlo después. */
function crearAlumnoRapido(nombre, telefono){
  const cfg = db.config;
  const lugar = cfg.modalidadHabitual || 'casa_mia';
  const porCompletar = ['contacto'];
  if(lugar === 'ambas' || lugar === 'casa_alumno') porCompletar.push('lugar');
  if(db.temas.length > 1) porCompletar.push('materias');
  porCompletar.push('nivel');
  const a = {
    id: uid(), nombre, telefono: telefono || '', tarifa: cfg.tarifaHabitual || cfg.tarifaMin,
    tipo: 'nino', contacto: '', direccion: '', mensajes: [],
    color: COLOR_SWATCHES[db.alumnos.length % COLOR_SWATCHES.length],
    temasIds: db.temas.length === 1 ? [db.temas[0].id] : [], activo: true,
    nivel: '', modalidad: lugar === 'casa_alumno' ? 'casa_alumno' : 'casa_mia', temario: [], pasajes: 2,
    aulaId: null, avisos: [], mostrarMontos: false, porCompletar
  };
  db.alumnos.push(a);
  return a;
}

/** Agrega los alumnos de una lista (uno por renglón); devuelve cuántos. Saltea los que ya están. */
function agregarAlumnosDeLista(texto){
  const existentes = new Set(db.alumnos.map(a=>a.nombre.trim().toLowerCase()));
  let n = 0;
  Comun.parsearListaAlumnos(texto).forEach(x=>{
    if(existentes.has(x.nombre.toLowerCase())) return;
    crearAlumnoRapido(x.nombre, x.telefono);
    n++;
  });
  return n;
}

function abrirAlumnoRapido(){
  openSheet(`
    <h3>Nuevo alumno</h3>
    <p class="sheet-sub">Con el nombre alcanza. Lo demás te lo pregunta su ficha cuando haga falta.</p>
    <label for="f_ar_nombre">Nombre</label>
    <input type="text" id="f_ar_nombre" placeholder="Ej: Sofi" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('f_ar_tel').focus();}">
    <label for="f_ar_tel">WhatsApp <span style="font-weight:400;">(opcional)</span></label>
    <input type="tel" id="f_ar_tel" inputmode="tel" placeholder="Ej: 2611234567" onkeydown="if(event.key==='Enter'){event.preventDefault();guardarAlumnoRapido();}">
    <div class="btn-stack" style="margin-top:14px;">
      <button type="button" class="btn ghost" onclick="abrirCargaRapida()">${ic('users')}¿Tenés varios? Cargalos todos juntos</button>
      <button type="button" class="btn ghost" onclick="openAlumnoFormCompleto()">${ic('edit')}Completar todos los datos ahora</button>
    </div>
    <div class="sheet-footer"><button type="button" class="btn primary" onclick="guardarAlumnoRapido()">Agregar alumno</button></div>
  `);
  enfocarSiLibre('f_ar_nombre');
}

function guardarAlumnoRapido(){
  const nombre = document.getElementById('f_ar_nombre').value.trim();
  const tel = document.getElementById('f_ar_tel').value.trim();
  if(!nombre){ showToast('Poné un nombre'); return; }
  const a = crearAlumnoRapido(nombre.slice(0, 80), tel);
  saveDB();
  closeSheet();
  abrirDetalleAlumno(a.id);
  showToast(`${a.nombre} agregado`);
}

function abrirCargaRapida(){
  openSheet(`
    <h3>Agregar varios alumnos</h3>
    <p class="sheet-sub">Un nombre por renglón. Si querés, el WhatsApp al lado. Lo demás de cada uno lo completás después.</p>
    <textarea id="f_cr_lista" class="pp-lista" placeholder="Sofi 2611234567&#10;Tomi&#10;Juli Pérez, 2615550000" oninput="contarCargaRapida()"></textarea>
    <div class="hint" id="f_cr_cuenta"></div>
    <div class="sheet-footer"><button type="button" class="btn primary" onclick="guardarCargaRapida()">Agregar</button></div>
  `);
  enfocarSiLibre('f_cr_lista');
}
function contarCargaRapida(){
  const lista = Comun.parsearListaAlumnos(document.getElementById('f_cr_lista').value);
  const existentes = new Set(db.alumnos.map(a=>a.nombre.trim().toLowerCase()));
  const nuevos = lista.filter(x=>!existentes.has(x.nombre.toLowerCase())).length;
  const repetidos = lista.length - nuevos;
  document.getElementById('f_cr_cuenta').textContent = lista.length
    ? `${nuevos} alumno${nuevos!==1?'s':''} nuevo${nuevos!==1?'s':''}` + (repetidos ? ` · ${repetidos} ya estaba${repetidos!==1?'n':''} cargado${repetidos!==1?'s':''}` : '')
    : '';
}
function guardarCargaRapida(){
  const n = agregarAlumnosDeLista(document.getElementById('f_cr_lista').value);
  if(!n){ showToast('Escribí al menos un nombre nuevo'); return; }
  saveDB();
  closeSheet();
  goTo('alumnos');
  showToast(`Agregaste ${n} alumno${n!==1?'s':''}`);
}

/* ---------- "Completá la ficha": de a una pregunta, con un toque ---------- */

let fichaSub = null;   // segunda parte de una pregunta (ej: el nombre del contacto)

function renderCompletarFicha(alumno){
  const el = document.getElementById('detalleCompletar');
  if(!el) return;
  const items = (alumno.porCompletar || []).filter(x=>['contacto','lugar','materias','nivel'].includes(x));
  if(!items.length || (items[0] === 'materias' && !db.temas.length && items.length === 1)){ el.hidden = true; return; }
  el.hidden = false;
  const item = items[0];
  const id = alumno.id;
  const nombre = escapeHtml(alumno.nombre.split(' ')[0]);
  let pregunta = '', respuesta = '';
  if(item === 'contacto'){
    if(fichaSub === 'contacto:' + id){
      pregunta = `¿Cómo se llama su mamá, papá o quien esté a cargo?`;
      respuesta = `<div class="row2"><input type="text" id="f_fc_contacto" placeholder="Ej: Marta" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();fichaContactoNombre('${id}');}">
        <button type="button" class="btn primary" onclick="fichaContactoNombre('${id}')">Listo</button></div>`;
    }else{
      pregunta = `¿A quién le escribís por WhatsApp?`;
      respuesta = `<div class="pill-select">
        <button type="button" onclick="fichaContacto('${id}','adulto')">${ic('user')}A ${nombre}</button>
        <button type="button" onclick="fichaContacto('${id}','nino')">${ic('users')}A su familia</button></div>`;
    }
  }else if(item === 'lugar'){
    if(fichaSub === 'lugar:' + id || db.config.modalidadHabitual === 'casa_alumno'){
      pregunta = `¿Cuál es la dirección de ${nombre}?`;
      respuesta = `<div class="row2"><input type="text" id="f_fc_dir" placeholder="Para el botón «Cómo llego»" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();fichaDireccion('${id}');}">
        <button type="button" class="btn primary" onclick="fichaDireccion('${id}')">Listo</button></div>`;
    }else{
      pregunta = `¿Dónde son las clases con ${nombre}?`;
      respuesta = `<div class="pill-select">
        <button type="button" onclick="fichaLugar('${id}','casa_mia')">${ic('home')}En mi casa</button>
        <button type="button" onclick="fichaLugar('${id}','casa_alumno')">${ic('bus')}En su casa</button></div>`;
    }
  }else if(item === 'materias'){
    pregunta = `¿Qué materias le das a ${nombre}?`;
    respuesta = `<div class="dias-chips">${db.temas.map(t=>{
      const sel = (alumno.temasIds||[]).includes(t.id);
      return `<button type="button" class="dia-chip ${sel?'sel':''}" onclick="fichaMateria('${id}','${t.id}')">${sel ? ic('check') : ''}${escapeHtml(t.nombre)}</button>`;
    }).join('')}</div>
      <button type="button" class="btn primary sm" style="margin-top:10px;" onclick="fichaListo('${id}','materias')">Listo</button>`;
  }else if(item === 'nivel'){
    pregunta = `¿En qué nivel está ${nombre}?`;
    respuesta = `<div class="pill-select compact">${NIVELES.map(n=>`<button type="button" onclick="fichaNivel('${id}','${n.id}')">${n.corto}</button>`).join('')}</div>`;
  }
  el.innerHTML = `
    <div class="card-head"><h2>Completá la ficha</h2><span class="hint" style="margin:0;">${items.length === 1 ? 'Última' : `Faltan ${items.length}`}</span></div>
    <div class="completar-q">${pregunta}</div>
    ${respuesta}
    <button type="button" class="link-btn" style="margin-top:8px;color:var(--text-dim);" onclick="fichaListo('${id}','${item}')">Saltear</button>`;
  const input = el.querySelector('input');
  if(input && fichaSub) setTimeout(()=>input.focus(), 50);
}

function fichaListo(id, item){
  const a = getAlumno(id);
  if(!a) return;
  a.porCompletar = (a.porCompletar || []).filter(x=>x !== item);
  fichaSub = null;
  saveDB();
  renderDetalleAlumno();
}
function fichaContacto(id, tipo){
  const a = getAlumno(id);
  if(!a) return;
  a.tipo = tipo;
  if(tipo === 'nino'){ fichaSub = 'contacto:' + id; saveDB(); renderDetalleAlumno(); return; }
  fichaListo(id, 'contacto');
}
function fichaContactoNombre(id){
  const a = getAlumno(id);
  if(!a) return;
  a.contacto = document.getElementById('f_fc_contacto').value.trim().slice(0, 60);
  fichaListo(id, 'contacto');
}
function fichaLugar(id, modalidad){
  const a = getAlumno(id);
  if(!a) return;
  a.modalidad = modalidad;
  // sus próximas clases sin cobrar pasan a tener (o no) pasajes
  const ahora = new Date();
  db.clases.forEach(c=>{
    if(c.alumnoId === id && !c.pagada && !claseYaOcurrida(c, ahora)){
      c.modalidad = modalidad;
      c.pasajeCant = a.pasajes || 2;
      c.pasajePrecio = modalidad === 'casa_alumno' ? precioPasaje() : null;
      c.viatico = viaticoPorModalidad(modalidad, a.pasajes || 2);
    }
  });
  if(modalidad === 'casa_alumno'){ fichaSub = 'lugar:' + id; saveDB(); renderDetalleAlumno(); return; }
  fichaListo(id, 'lugar');
}
function fichaDireccion(id){
  const a = getAlumno(id);
  if(!a) return;
  a.direccion = document.getElementById('f_fc_dir').value.trim().slice(0, 140);
  if(a.modalidad !== 'casa_alumno') a.modalidad = 'casa_alumno';
  fichaListo(id, 'lugar');
}
function fichaMateria(id, temaId){
  const a = getAlumno(id);
  if(!a) return;
  a.temasIds = a.temasIds || [];
  const i = a.temasIds.indexOf(temaId);
  if(i >= 0) a.temasIds.splice(i, 1); else a.temasIds.push(temaId);
  saveDB();
  renderDetalleAlumno();
}
function fichaNivel(id, nivel){
  const a = getAlumno(id);
  if(!a) return;
  a.nivel = nivel;
  fichaListo(id, 'nivel');
}
