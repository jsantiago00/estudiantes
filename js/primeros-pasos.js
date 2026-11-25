/* =========================================================
   Estudiemos (profe): que empezar sea fácil.

   - Configuración inicial (la primera vez), en tres pantallas cortas que arman de paso el
     perfil del buscador: nombre; materias y niveles; precio, dónde y zona.
   - Alumno nuevo = nombre y WhatsApp. Y carga de varios a la vez (uno por renglón).
   - "Completá la ficha": lo que falta de cada alumno se pregunta después, de a una
     pregunta y con un toque, en su ficha (alumno.porCompletar).

   Script clásico: comparte el ámbito global con app.html (db, saveDB, openSheet, ic...).
   Se carga antes que el script principal: acá arriba solo se declaran funciones.
   ========================================================= */

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

const pp = {paso: 0, nombre: '', tarifa: '', alumnos: false};
const PP_TOTAL = 3;

function abrirPrimerosPasos(){
  pp.paso = 0;
  pp.nombre = db.config.nombreProfe || (firebaseUser && firebaseUser.displayName) || '';
  pp.tarifa = db.config.configInicial ? (db.config.tarifaHabitual || '') : '';
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
  const p = perfilCfg();
  const dots = Array.from({length: PP_TOTAL}, (_, i)=>`<span class="${i===pp.paso?'on':''}"></span>`).join('');
  let cuerpo = '', pie = '';
  const atras = `<button type="button" class="btn secondary" onclick="ppAtras()">Atrás</button>`;
  if(pp.paso === 0){
    cuerpo = `
      <div class="pp-ic">${ic('sparkles')}</div>
      <h2>¡Hola! Armemos tu espacio</h2>
      <p>Son tres pasos cortos. Todo se puede cambiar después.</p>
      <label for="pp_nombre">¿Cómo te llamás?</label>
      <input type="text" id="pp_nombre" value="${escapeAttr(pp.nombre)}" placeholder="Ej: Profe Juli" autocomplete="name" onkeydown="if(event.key==='Enter') ppSiguiente()">
      <div class="hint">Así te ven tus alumnos y los estudiantes en el buscador.</div>
      ${firebaseUser ? '' : `<button type="button" class="link-btn" style="margin-top:18px;" onclick="iniciarSesionGoogle()">${ic('cloud')}¿Ya usabas la app en otro dispositivo? Iniciá sesión</button>`}`;
    pie = `<button type="button" class="btn primary" onclick="ppSiguiente()">Siguiente</button>`;
  }else if(pp.paso === 1){
    cuerpo = `
      <div class="pp-ic">${ic('book')}</div>
      <h2>¿Qué das y a quién?</h2>
      <p>Tocá las materias y los niveles.</p>
      <div id="catalogoMaterias" data-toggle="ppToggleMateria">${catalogoMateriasHtml('ppToggleMateria')}</div>
      <div id="otrasMaterias">${otrasMateriasHtml()}</div>
      <label>Niveles</label>
      <div id="perfilNiveles">${chipsHtml(Plataforma.NIVELES, p.niveles, 'ppToggleNivel')}</div>`;
    pie = atras + `<button type="button" class="btn primary" onclick="ppSiguiente()">Siguiente</button>`;
  }else{
    const lugares = Plataforma.LUGARES.map(l=>({id: l.id, nombre: l.corto}));
    cuerpo = `
      <div class="pp-ic">${ic('cash')}</div>
      <h2>¿Cuánto y dónde?</h2>
      <label for="pp_tarifa" style="margin-top:4px;">Cuánto cobrás la hora</label>
      <input type="number" id="pp_tarifa" class="pp-grande" inputmode="numeric" min="0" step="500" value="${escapeAttr(pp.tarifa)}" placeholder="10000">
      <label>Dónde das las clases</label>
      <div id="perfilLugares">${chipsHtml(lugares, p.lugares, 'ppToggleLugar')}</div>
      <label>Zona de Mendoza</label>
      <div id="perfilZonas">${chipsHtml(Plataforma.ZONAS.filter(z=>z.gran), p.zonas, 'ppToggleZona')}
        <details class="more" style="margin-top:6px;" ${(p.zonas||[]).some(z=>!(Plataforma.zona(z)||{}).gran) ? 'open' : ''}><summary>${ic('chevron-right')}Resto de la provincia</summary>${chipsHtml(Plataforma.ZONAS.filter(z=>!z.gran), p.zonas, 'ppToggleZona')}</details>
      </div>
      <label class="switch-row" style="margin-top:12px;">
        <span>Ya tengo alumnos<small>Al terminar los cargás todos juntos</small></span>
        <input type="checkbox" class="switch" id="pp_alumnos" ${pp.alumnos?'checked':''}>
      </label>`;
    pie = atras + `<button type="button" class="btn primary" onclick="ppTerminar()">Empezar</button>`;
  }
  el.innerHTML = `
    <div class="pp-card">
      <div class="pp-dots">${dots}</div>
      <div class="pp-body">${cuerpo}</div>
      <div class="pp-pie">${pie}</div>
    </div>`;
  const foco = el.querySelector('#pp_nombre');
  if(foco) setTimeout(()=>foco.focus(), 60);
}

function ppLeerPaso(){
  if(pp.paso === 0) pp.nombre = document.getElementById('pp_nombre').value.trim();
  if(pp.paso === 2){
    pp.tarifa = document.getElementById('pp_tarifa').value;
    pp.alumnos = document.getElementById('pp_alumnos').checked;
  }
}
function ppSiguiente(){ ppLeerPaso(); pp.paso = Math.min(PP_TOTAL - 1, pp.paso + 1); pintarPrimerosPasos(); }
function ppAtras(){ ppLeerPaso(); pp.paso = Math.max(0, pp.paso - 1); pintarPrimerosPasos(); }
function ppToggleMateria(catId){
  const t = db.temas.find(x=>x.catId === catId);
  if(t) borrarMateria(t.id); else agregarMateria(catId);
  refrescarMaterias('ppToggleMateria');
}
function ppToggleNivel(id){ toggleEnLista('niveles', id); pintarSinPerder(); }
function ppToggleLugar(id){ toggleEnLista('lugares', id); pintarSinPerder(); }
function ppToggleZona(id){ toggleEnLista('zonas', id); pintarSinPerder(); }
/** Vuelve a pintar el paso sin perder lo que ya escribió. */
function pintarSinPerder(){ ppLeerPaso(); pintarPrimerosPasos(); }

function ppTerminar(){
  ppLeerPaso();
  const cfg = db.config;
  if(pp.nombre) cfg.nombreProfe = pp.nombre;
  const tarifa = Math.round(parseFloat(pp.tarifa) || 0);
  if(tarifa > 0) cfg.tarifaHabitual = tarifa;
  cfg.configInicial = true;
  cfg.tutorialVisto = true;
  saveDB();
  cerrarPrimerosPasos();
  goTo('clases');
  if(pp.alumnos) abrirCargaRapida();
  else showToast('¡Listo! Ya podés empezar');
}

/* ---------- Alumnos: alta rápida y de a varios ---------- */

/** Un alumno con lo mínimo; lo que falta queda en porCompletar para preguntarlo después. */
function crearAlumnoRapido(nombre, telefono){
  const cfg = db.config;
  const lugares = (cfg.perfil && cfg.perfil.lugares) || ['casa_mia'];
  const lugar = lugares.length === 1 ? lugares[0] : 'varios';
  const porCompletar = ['contacto'];
  if(lugar === 'varios' || lugar === 'casa_alumno') porCompletar.push('lugar');
  if(db.temas.length > 1) porCompletar.push('materias');
  if(!(cfg.perfil && cfg.perfil.niveles && cfg.perfil.niveles.length === 1)) porCompletar.push('nivel');
  const a = {
    id: uid(), nombre, telefono: telefono || '', tarifa: cfg.tarifaHabitual || 0,
    tipo: 'nino', contacto: '', direccion: '', mensajes: [],
    color: COLOR_SWATCHES[db.alumnos.length % COLOR_SWATCHES.length],
    temasIds: db.temas.length === 1 ? [db.temas[0].id] : [], activo: true,
    nivel: (cfg.perfil && cfg.perfil.niveles && cfg.perfil.niveles.length === 1) ? cfg.perfil.niveles[0] : '',
    modalidad: lugar === 'varios' ? 'casa_mia' : lugar, temario: [],
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
    const lugaresPerfil = (db.config.perfil && db.config.perfil.lugares) || [];
    if(fichaSub === 'lugar:' + id || (lugaresPerfil.length === 1 && lugaresPerfil[0] === 'casa_alumno')){
      pregunta = `¿Cuál es la dirección de ${nombre}?`;
      respuesta = `<div class="row2"><input type="text" id="f_fc_dir" placeholder="Para el botón «Cómo llego»" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();fichaDireccion('${id}');}">
        <button type="button" class="btn primary" onclick="fichaDireccion('${id}')">Listo</button></div>`;
    }else{
      pregunta = `¿Dónde son las clases con ${nombre}?`;
      respuesta = `<div class="pill-select">
        <button type="button" onclick="fichaLugar('${id}','casa_mia')">${ic('home')}En mi casa</button>
        <button type="button" onclick="fichaLugar('${id}','casa_alumno')">${ic('bus')}A domicilio</button>
        <button type="button" onclick="fichaLugar('${id}','virtual')">${ic('globe')}Virtual</button></div>`;
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
  // sus próximas clases sin cobrar cambian de lugar (y suman o no el extra a domicilio)
  cambiarLugarProximasClases(id, modalidad);
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
