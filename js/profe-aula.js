/* =========================================================
   Estudiemos (profe): alumnos en la app (aulas), tareas para el alumno,
   pizarra por clase, notificaciones y reseñas que llegan desde la app.

   Es un script clásico que comparte el ámbito global con el script principal de
   index.html (db, saveDB, openSheet, confirmar, ic, escapeHtml, getAlumno, ...).
   Se carga ANTES que él: acá arriba solo se declaran funciones, nada toca db.
   Lo de Firebase lo hace js/nube-profe.js y queda en window.nube (puede tardar
   en cargar, o no estar si no hay conexión).

   No redefinir funciones del script principal (las suyas pisan a las de acá):
   copiarTexto, abrirResenas, abrirPerfil, firmaResena, etc.
   ========================================================= */

function nubeLista(){ return !!(window.nube && nube.usuario()); }

async function pedirSesion(motivo){
  const ok = await confirmar({titulo:'Iniciá sesión con Google', mensaje: motivo + ' Tus datos siguen también en este dispositivo.', ok:'Iniciar sesión'});
  if(ok) iniciarSesionGoogle();
}

function renderMate(el){
  if(el && window.renderMathInElement){
    try{
      renderMathInElement(el, {delimiters:[
        {left:'$$', right:'$$', display:true}, {left:'$', right:'$', display:false}
      ], throwOnError:false});
    }catch(e){}
  }
}

function hace(fecha){
  if(!fecha) return '';
  const min = Math.round((Date.now() - fecha.getTime())/60000);
  if(min < 1) return 'recién';
  if(min < 60) return `hace ${min} min`;
  const h = Math.round(min/60);
  if(h < 24) return `hace ${h} h`;
  const d = Math.round(h/24);
  if(d < 30) return `hace ${d} día${d!==1?'s':''}`;
  return fecha.toLocaleDateString('es-AR');
}

function recortarTexto(s, n){ s = String(s||''); return s.length > n ? s.slice(0, n) + '…' : s; }

/* ---------- Sesión ---------- */

function alCambiarSesionProfe(user){
  document.getElementById('notifToggle').hidden = !user;
  if(!user) renderContadorNotifs([]);
}

function alSincronizarProfe(user){
  // En un dispositivo nuevo el tutorial arranca antes de que lleguen los datos de la nube
  if(db.config.tutorialVisto) document.getElementById('tutorialOverlay').classList.remove('show');
  if(db.alumnos.length || db.config.configInicial) cerrarPrimerosPasos();
  if(!db.config.nombreProfe && user.displayName){ db.config.nombreProfe = user.displayName; saveDB(); }
  else if(window.firebaseQueueSave) window.firebaseQueueSave(db);   // publica aulas y perfil
  refrescarEscuchasAulas();
  renderAll();
}

function refrescarEscuchasAulas(){
  if(!nubeLista()) return;
  nube.escucharAulas(db.alumnos.filter(a=>a.aulaId).map(a=>a.aulaId));
}

let reRenderAulaPendiente = false;
window.onAulaVivoCambio = function(){
  if(reRenderAulaPendiente) return;
  reRenderAulaPendiente = true;
  requestAnimationFrame(()=>{
    reRenderAulaPendiente = false;
    if(sincronizarResenasDeLaApp()){ saveDB(); renderAll(); }
    renderTps();
    if(currentAlumnoDetalleId){
      const a = getAlumno(currentAlumnoDetalleId);
      if(a){ renderDetalleAula(a); renderDetalleTps(a); }
    }
  });
};

function notificarAlumno(alumnoId, titulo, cuerpo, extra){
  const a = getAlumno(alumnoId);
  if(!a || !a.aulaId || !nubeLista()) return;
  // Un rato después, para que el aula ya esté publicada cuando el alumno la abra
  setTimeout(()=>nube.notificarAula(a.aulaId, titulo, cuerpo, extra), 1500);
}

function alumnoPorAula(aulaId){ return db.alumnos.find(a=>a.aulaId===aulaId); }

/* =========================================================
   EL ALUMNO EN LA APP (ficha)
   ========================================================= */

function renderDetalleAula(alumno){
  const cont = document.getElementById('detalleAula');
  if(!cont) return;
  if(!alumno.aulaId){
    cont.innerHTML = `
      <div class="card-head"><h2>En la app</h2></div>
      <p class="ajustes-desc">Si quiere, ${escapeHtml(alumno.nombre)}${alumno.tipo==='adulto' ? '' : ' (o su familia)'} puede entrar a Estudiemos y ver sus clases, si debe alguna, los resúmenes, las pizarras, las tareas que le mandes. No es obligatorio.</p>
      <button type="button" class="btn outline" onclick="invitarAlumnoApp('${alumno.id}')">${ic('send')}Invitar a la app</button>`;
    return;
  }
  const v = nubeLista() ? nube.vivo(alumno.aulaId) : null;
  const aula = v && v.aula;
  const miembros = aula ? (aula.miembros || []) : [];
  const info = aula ? (aula.miembrosInfo || {}) : {};
  const miembrosHtml = !nubeLista()
    ? '<div class="empty-msg">Iniciá sesión para ver quién entró.</div>'
    : !aula ? '<div class="empty-msg">Cargando…</div>'
    : miembros.length === 0 ? '<div class="empty-msg">Todavía no entró nadie con el link.</div>'
    : miembros.map(uid=>{
        const m = info[uid] || {};
        return `<div class="list-item">
          <div class="row-ic">${ic(m.rol==='familia' ? 'users' : 'user')}</div>
          <div class="item-main"><div class="item-title">${escapeHtml(m.nombre || 'Sin nombre')}</div><div class="item-sub">${m.rol==='familia' ? 'Familia · ' : ''}${escapeHtml(m.email || '')}</div></div>
          <button type="button" class="icon-btn sm" style="color:var(--text-mute);" onclick="quitarMiembroAula('${alumno.id}','${uid}')" aria-label="Quitar">${ic('x')}</button>
        </div>`;
      }).join('');

  const perfil = v && v.perfil;
  const avisos = (alumno.avisos || []).slice(-3).reverse();
  cont.innerHTML = `
    <div class="card-head"><h2>En la app</h2><span class="badge pagada">${ic('check')}Invitado</span></div>
    ${miembrosHtml}
    ${perfil && perfil.intereses ? `<div class="note">${ic('info')}<div><b>Le interesa estudiar:</b> ${escapeHtml(perfil.intereses)}</div></div>` : ''}
    <div class="btn-row" style="margin-top:4px;">
      <button type="button" class="btn whatsapp" onclick="compartirInvitacion('${alumno.id}')">${ic('message')}Mandar link</button>
      <button type="button" class="btn secondary" onclick="copiarTexto(nube.linkInvitacion('${alumno.aulaId}'))">${ic('copy')}Copiar</button>
    </div>
    <label class="switch-row">
      <span>Se puede entrar con el link<small>Apagalo cuando ya entraron todos</small></span>
      <input type="checkbox" class="switch" ${!aula || aula.invitacionAbierta!==false ? 'checked':''} ${aula?'':'disabled'} onchange="toggleInvitacion('${alumno.id}', this.checked)">
    </label>
    <label class="switch-row">
      <span>Mostrarle los montos<small>Si no, solo ve si está al día o cuántas clases debe</small></span>
      <input type="checkbox" class="switch" ${alumno.mostrarMontos?'checked':''} onchange="toggleMostrarMontos('${alumno.id}', this.checked)">
    </label>

    <label for="f_aviso">Aviso por la app</label>
    <div class="row2">
      <input type="text" id="f_aviso" placeholder="Ej: el jueves no hay clase" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();enviarAvisoAula('${alumno.id}');}">
      <button type="button" class="btn secondary" onclick="enviarAvisoAula('${alumno.id}')" aria-label="Enviar aviso">${ic('send')}</button>
    </div>
    ${avisos.length ? avisos.map(av=>`<div class="checkbox-line compact"><span class="item-main">${escapeHtml(av.texto)} <span class="hint">· ${new Date(av.fecha).toLocaleDateString('es-AR')}</span></span><button type="button" class="icon-btn sm" style="color:var(--text-mute);" onclick="borrarAviso('${alumno.id}','${av.id}')" aria-label="Borrar aviso">${ic('x')}</button></div>`).join('') : ''}

    <button type="button" class="link-btn danger" style="margin-top:10px;" onclick="desvincularAula('${alumno.id}')">${ic('log-out')}Dejar de compartir con la app</button>
  `;
}

async function invitarAlumnoApp(alumnoId){
  if(!nubeLista()){ pedirSesion('Para invitar a un alumno, lo que ve se guarda en la nube.'); return; }
  const a = getAlumno(alumnoId);
  if(!a) return;
  try{
    showToast('Preparando su acceso…');
    a.aulaId = await nube.crearAula(JSON.parse(JSON.stringify(db)), a);
    saveDB();
    refrescarEscuchasAulas();
    renderDetalleAlumno();
    compartirInvitacion(alumnoId);
  }catch(e){
    console.error(e);
    showToast('No se pudo crear el acceso');
  }
}

function textoInvitacion(a){
  const link = nube.linkInvitacion(a.aulaId);
  const profe = db.config.nombreProfe ? ` con ${db.config.nombreProfe}` : '';
  if(a.tipo === 'adulto'){
    return `¡Hola ${a.nombre}! Te paso el link para que veas tus clases${profe}, los resúmenes y las tareas en Estudiemos: ${link}\nSe entra con una cuenta de Google.`;
  }
  const saludo = a.contacto ? `¡Hola ${a.contacto}!` : '¡Hola!';
  return `${saludo} Les paso el link para que ${a.nombre} (y ustedes) vean sus clases${profe}, los resúmenes y las tareas en Estudiemos: ${link}\nSe entra con una cuenta de Google.`;
}

function compartirInvitacion(alumnoId){
  const a = getAlumno(alumnoId);
  if(!a || !a.aulaId || !window.nube) return;
  window.open(waUrl(a.telefono, textoInvitacion(a)), '_blank');
}

function toggleInvitacion(alumnoId, abierta){
  const a = getAlumno(alumnoId);
  if(!a || !nubeLista()) return;
  nube.setInvitacionAbierta(a.aulaId, abierta).then(()=>showToast(abierta ? 'El link vuelve a funcionar' : 'Ya no se puede entrar con el link'), ()=>showToast('No se pudo cambiar'));
}

async function quitarMiembroAula(alumnoId, uid){
  const a = getAlumno(alumnoId);
  if(!a || !nubeLista()) return;
  const ok = await confirmar({titulo:'¿Quitar a esta persona?', mensaje:'Ya no va a poder ver las clases ni las tareas.', ok:'Quitar', peligro:true});
  if(!ok) return;
  nube.quitarMiembro(a.aulaId, uid).then(()=>showToast('Listo'), ()=>showToast('No se pudo quitar'));
}

function toggleMostrarMontos(alumnoId, mostrar){
  const a = getAlumno(alumnoId);
  if(!a) return;
  a.mostrarMontos = mostrar;
  saveDB();
}

function enviarAvisoAula(alumnoId){
  const a = getAlumno(alumnoId);
  const texto = document.getElementById('f_aviso').value.trim();
  if(!a || !texto){ showToast('Escribí el aviso'); return; }
  a.avisos.push({id: uid(), texto: texto.slice(0, 600), fecha: new Date().toISOString()});
  saveDB();
  notificarAlumno(alumnoId, '📣 Aviso de tu profe', texto.slice(0, 140), {tipo:'aviso'});
  renderDetalleAlumno();
  showToast('Aviso enviado');
}

function borrarAviso(alumnoId, avisoId){
  const a = getAlumno(alumnoId);
  if(!a) return;
  a.avisos = a.avisos.filter(x=>x.id!==avisoId);
  saveDB();
  renderDetalleAlumno();
}

async function desvincularAula(alumnoId){
  const a = getAlumno(alumnoId);
  if(!a || !a.aulaId) return;
  const ok = await confirmar({titulo:'¿Dejar de compartir con la app?', mensaje:`${a.nombre} y su familia ya no van a poder entrar, y se borran sus entregas de la nube. Tus datos no se tocan.`, ok:'Dejar de compartir', peligro:true});
  if(!ok) return;
  const aulaId = a.aulaId;
  a.aulaId = null;
  saveDB();
  if(nubeLista()) nube.borrarAula(aulaId).catch(e=>console.error(e));
  renderDetalleAlumno();
}

/* =========================================================
   PIZARRA DE LA CLASE
   ========================================================= */

function pizarraClaseHtml(c){
  if(c.pizarra && c.pizarra.codigo){
    return `<div class="total-box pizarra-box">
      <span>${ic('pen')} Pizarra de la clase<br><small>Código ${Comun.formatoCodigoSala(c.pizarra.codigo)}</small></span>
      <span style="display:flex;gap:6px;">
        <button type="button" class="btn sm outline" onclick="copiarLinkPizarraAlumno('${c.id}')">${ic('copy')}Link</button>
        <button type="button" class="btn sm primary" onclick="abrirPizarraClase('${c.id}')">Abrir</button>
      </span>
    </div>`;
  }
  return `<button type="button" class="btn outline" onclick="abrirPizarraClase('${c.id}')">${ic('pen')}Abrir una pizarra para esta clase</button>`;
}

async function abrirPizarraClase(claseId){
  const c = db.clases.find(x=>x.id===claseId);
  if(!c) return;
  if(c.pizarra && c.pizarra.codigo){
    if(!window.nube){ showToast('Todavía está cargando, probá en un momento'); return; }
    window.open(nube.linkSala(c.pizarra.codigo, c.pizarra.clave), '_blank');
    return;
  }
  if(!nubeLista()){ pedirSesion('Las pizarras se guardan en la nube, así el alumno las puede ver después.'); return; }
  // La ventana se abre ya: si se abre después de esperar, el celular la bloquea
  const ventana = window.open('', '_blank');
  try{
    const a = getAlumno(c.alumnoId);
    const titulo = `Clase con ${a ? a.nombre : ''} · ${nombreDiaFecha(c.fecha)}`;
    const sala = await nube.crearSala(titulo, db.config.nombreProfe || 'Profe');
    c.pizarra = {codigo: sala.codigo, clave: sala.clave};
    saveDB();
    const url = nube.linkSala(sala.codigo, sala.clave);
    if(ventana) ventana.location.href = url; else window.open(url, '_blank');
    notificarAlumno(c.alumnoId, '🖍 Pizarra de la clase', `Ya está la pizarra de la clase del ${nombreDiaFecha(c.fecha)}. Entrá desde la app.`, {tipo:'pizarra'});
    if(overlay.classList.contains('show') && document.getElementById('f_resumen')) openClaseForm(c.id);
    renderAll();
  }catch(e){
    console.error(e);
    if(ventana) ventana.close();
    showToast('No se pudo crear la pizarra');
  }
}

function copiarLinkPizarraAlumno(claseId){
  const c = db.clases.find(x=>x.id===claseId);
  if(!c || !c.pizarra || !window.nube) return;
  copiarTexto(nube.linkSala(c.pizarra.codigo));
}

/* =========================================================
   TAREAS PARA EL ALUMNO (en los datos: db.tps)
   Una tarea es "qué tiene que hacer" y, si querés, preguntas que se arman tocando
   botones (escrita, con opciones, verdadero o falso, número). El alumno la marca como
   hecha o responde las preguntas; las que tienen respuesta se corrigen solas.
   Tus pendientes (db.tareas, en index.html) se convierten en tarea con "Mandar".
   ========================================================= */

function entregaDe(tp){
  const a = getAlumno(tp.alumnoId);
  if(!a || !a.aulaId || !nubeLista()) return null;
  const v = nube.vivo(a.aulaId);
  return v && v.entregas ? (v.entregas[tp.id] || null) : null;
}

function tienePreguntas(tp){ return (tp.preguntas || []).length > 0; }

function estadoTp(tp){
  const e = entregaDe(tp);
  if(e && e.estado === 'corregida') return {clase:'pagada', texto:'Corregida', orden:4};
  if(e && !tienePreguntas(tp)) return {clase:'pagada', texto:'Hecha', orden:3};
  if(e) return {clase:'pendiente', texto:'Para corregir', orden:0};
  if(tp.fechaEntrega && tp.fechaEntrega < hoyIso()) return {clase:'neutral', texto:'Vencida', orden:1};
  return {clase:'neutral', texto:'Sin hacer', orden:2};
}

function tituloTp(tp){ return tp.titulo || Comun.tituloDeTexto(tp.consigna) || 'Tarea'; }

function tpItemHtml(tp, conAlumno){
  const est = estadoTp(tp);
  const n = (tp.preguntas||[]).length;
  const partes = [];
  if(conAlumno) partes.push(escapeHtml(alumnoNombre(tp.alumnoId)));
  if(n) partes.push(`${n} pregunta${n!==1?'s':''}`);
  if(tp.fechaEntrega) partes.push('para el ' + fechaCorta(tp.fechaEntrega).toLowerCase());
  return `<div class="list-item tap" onclick="verTp('${tp.id}')">
    ${conAlumno ? avatarHtml(getAlumno(tp.alumnoId), 'sm') : `<div class="row-ic">${ic(n ? 'file' : 'list')}</div>`}
    <div class="item-main">
      <div class="item-title">${escapeHtml(tituloTp(tp))}</div>
      ${partes.length ? `<div class="item-sub">${partes.join(' · ')}</div>` : ''}
    </div>
    <span class="badge ${est.clase}">${est.texto}</span>
  </div>`;
}

function ordenTps(a, b){
  return estadoTp(a).orden - estadoTp(b).orden || String(b.creado||'').localeCompare(String(a.creado||''));
}

function renderTps(){
  const cont = document.getElementById('listaTps');
  if(!cont) return;
  let lista = db.tps.slice();
  if(typeof filtroTareasAlumno !== 'undefined' && filtroTareasAlumno !== 'todos') lista = lista.filter(t=>t.alumnoId===filtroTareasAlumno);
  lista.sort(ordenTps);
  cont.innerHTML = lista.length ? lista.slice(0, 30).map(tp=>tpItemHtml(tp, true)).join('')
    : '<div class="empty-msg" style="padding-bottom:14px;">Las tareas que les mandes a tus alumnos aparecen acá, con lo que hicieron. Si un alumno usa la app, la recibe en su celular.</div>';
}

function renderDetalleTps(alumno){
  const cont = document.getElementById('detalleTps');
  if(!cont) return;
  const lista = db.tps.filter(t=>t.alumnoId===alumno.id).sort(ordenTps);
  cont.innerHTML = lista.length ? lista.map(tp=>tpItemHtml(tp, false)).join('') : '<div class="empty-msg" style="padding-bottom:12px;">Todavía no le mandaste tareas.</div>';
}

/* ---------- "Mandar" un pendiente: se convierte en tarea ---------- */

function botonMandarPendiente(t){
  if(t.hecha || !t.alumnoId) return '';
  return `<button type="button" class="btn sm outline" onclick="event.stopPropagation(); mandarPendiente('${t.id}')" title="Mandárselo como tarea">${ic('send')}Mandar</button>`;
}

function mandarPendiente(pendienteId){
  const p = db.tareas.find(t=>t.id===pendienteId);
  if(!p) return;
  openTpForm(null, p.alumnoId, {consigna: p.texto, temaId: p.temaId, claseId: p.claseId, pendienteId: p.id});
}

/* ---------- Formulario de tarea ---------- */

let formTp = null;   // {id, pendienteId, preguntas:[{tipo, enunciado, opciones, correcta, tolerancia}]}

function openTpForm(id, alumnoIdPreset, prefill){
  if(db.alumnos.length===0){ showToast('Primero agregá un alumno'); return; }
  const tp = id ? db.tps.find(t=>t.id===id) : null;
  const pre = prefill || {};
  const ordenados = db.alumnos.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const alumnoId = tp ? tp.alumnoId : (alumnoIdPreset || (typeof filtroTareasAlumno!=='undefined' && filtroTareasAlumno!=='todos' ? filtroTareasAlumno : ordenados[0].id));
  formTp = {
    id: tp ? tp.id : null,
    pendienteId: pre.pendienteId || null,
    temaId: tp ? tp.temaId : (pre.temaId || null),
    claseId: tp ? tp.claseId : (pre.claseId || null),
    preguntas: tp ? JSON.parse(JSON.stringify(tp.preguntas || [])) : []
  };
  const consigna = tp ? (tp.consigna || tp.titulo || '') : (pre.consigna || '');
  const hayEntrega = tp && entregaDe(tp);
  openSheet(`
    <h3>${tp ? 'Editar tarea' : 'Mandar una tarea'}</h3>
    <label for="f_tp_alumno">Para</label>
    <select id="f_tp_alumno" onchange="actualizarTpForm()">${ordenados.map(a=>`<option value="${a.id}" ${a.id===alumnoId?'selected':''}>${escapeHtml(a.nombre)}</option>`).join('')}</select>

    <label for="f_tp_consigna">¿Qué tiene que hacer?</label>
    <textarea id="f_tp_consigna" placeholder="Ej: Hacer los ejercicios 1 al 5 de la página 30">${escapeHtml(consigna)}</textarea>

    <label for="f_tp_fecha">Para cuándo <span style="font-weight:400;">(opcional)</span></label>
    <input type="date" id="f_tp_fecha" value="${tp && tp.fechaEntrega ? tp.fechaEntrega : ''}">

    <div class="section-label" style="margin-top:22px;">Preguntas <span style="text-transform:none;letter-spacing:0;font-weight:500;">(opcional)</span></div>
    <div id="tpPreguntas"></div>
    <button type="button" class="btn outline" onclick="agregarPreguntaTp()">${ic('plus')}Agregar una pregunta</button>
    ${hayEntrega ? `<div class="note">${ic('info')}<div>Ya hay una entrega: si cambiás o reordenás las preguntas, sus respuestas pueden dejar de coincidir.</div></div>` : ''}
    <details class="more">
      <summary>${ic('chevron-right')}Pegar varias preguntas de una vez</summary>
      <p class="hint">Si tenés preguntas escritas (o te las armó una IA), pegalas así: <b>?</b> abre una pregunta, <b>*</b> marca la opción correcta, <b>-</b> las incorrectas, <b>= V</b> o <b>= F</b> para verdadero o falso, <b>= 42</b> para un número. Sin nada, es una pregunta escrita.</p>
      <textarea id="f_tp_pegar" class="tp-preguntas" placeholder="? ¿Cuánto es 7 × 8?&#10;- 54&#10;* 56&#10;- 58"></textarea>
      <button type="button" class="btn secondary sm" style="margin-top:8px;" onclick="pegarPreguntasTp()">${ic('plus')}Agregarlas</button>
    </details>

    <div class="sheet-footer">
      ${tp ? `<button type="button" class="btn danger" onclick="eliminarTp('${tp.id}')" aria-label="Eliminar">${ic('trash')}</button>` : ''}
      <button type="button" class="btn primary" onclick="guardarTp()">${tp ? 'Guardar' : 'Mandar tarea'}</button>
    </div>
  `);
  pintarPreguntasTp();
  if(!tp && !consigna) enfocarSiLibre('f_tp_consigna');
}

function actualizarTpForm(){ /* el alumno solo cambia el destino de la tarea */ }

const TIPOS_PREG = [['texto','Escrita'], ['opcion','Opciones'], ['vf','V o F'], ['numero','Número']];

function pintarPreguntasTp(){
  const box = document.getElementById('tpPreguntas');
  if(!box || !formTp) return;
  box.innerHTML = formTp.preguntas.map((p, i)=>{
    let extra = '';
    if(p.tipo === 'opcion'){
      extra = `<div class="preg-opciones">${(p.opciones||[]).map((o, k)=>`
        <div class="preg-op ${p.correcta===k?'ok':''}">
          <button type="button" class="preg-marca" onclick="marcarCorrectaTp(${i}, ${k})" aria-label="Es la correcta">${ic('check')}</button>
          <input type="text" value="${escapeAttr(o)}" placeholder="Opción ${k+1}" oninput="formTp.preguntas[${i}].opciones[${k}] = this.value">
          <button type="button" class="icon-btn sm" style="color:var(--text-mute);" onclick="quitarOpcionTp(${i}, ${k})" aria-label="Quitar opción">${ic('x')}</button>
        </div>`).join('')}
        <button type="button" class="link-btn" onclick="agregarOpcionTp(${i})">${ic('plus')}Otra opción</button>
        <div class="hint" style="margin-top:2px;">Tocá el ✓ de la correcta.</div>
      </div>`;
    }else if(p.tipo === 'vf'){
      extra = `<div class="segmented" style="margin:10px 0 0;">
        <button type="button" class="${p.correcta===true?'active':''}" onclick="formTp.preguntas[${i}].correcta = true; pintarPreguntasTp();">Es verdadero</button>
        <button type="button" class="${p.correcta===false?'active':''}" onclick="formTp.preguntas[${i}].correcta = false; pintarPreguntasTp();">Es falso</button>
      </div>`;
    }else if(p.tipo === 'numero'){
      extra = `<div class="field-row">
        <div><label>Respuesta</label><input type="text" inputmode="decimal" value="${p.correcta ?? ''}" placeholder="Ej: 42" oninput="formTp.preguntas[${i}].correcta = this.value"></div>
        <div style="flex:0 0 120px;"><label>Margen</label><input type="text" inputmode="decimal" value="${p.tolerancia || ''}" placeholder="0" oninput="formTp.preguntas[${i}].tolerancia = this.value"></div>
      </div>`;
    }else{
      extra = '<div class="hint">La corregís vos cuando la entregue.</div>';
    }
    return `<div class="preg-card">
      <div class="preg-head"><b>Pregunta ${i+1}</b><button type="button" class="icon-btn sm" style="color:var(--text-mute);" onclick="quitarPreguntaTp(${i})" aria-label="Quitar pregunta">${ic('trash')}</button></div>
      <textarea class="preg-enunciado" rows="2" placeholder="Escribí la pregunta" oninput="formTp.preguntas[${i}].enunciado = this.value">${escapeHtml(p.enunciado||'')}</textarea>
      <div class="segmented preg-tipo">${TIPOS_PREG.map(([t, l])=>`<button type="button" class="${p.tipo===t?'active':''}" onclick="cambiarTipoTp(${i}, '${t}')">${l}</button>`).join('')}</div>
      ${extra}
    </div>`;
  }).join('');
}

function agregarPreguntaTp(){
  formTp.preguntas.push({tipo:'opcion', enunciado:'', opciones:['', ''], correcta:null});
  pintarPreguntasTp();
  const cards = document.querySelectorAll('#tpPreguntas .preg-enunciado');
  if(cards.length) setTimeout(()=>cards[cards.length-1].focus(), 50);
}
function quitarPreguntaTp(i){ formTp.preguntas.splice(i, 1); pintarPreguntasTp(); }
function cambiarTipoTp(i, tipo){
  const p = formTp.preguntas[i];
  p.tipo = tipo;
  if(tipo === 'opcion'){ if(!Array.isArray(p.opciones) || !p.opciones.length) p.opciones = ['', '']; if(typeof p.correcta !== 'number') p.correcta = null; }
  if(tipo === 'vf' && typeof p.correcta !== 'boolean') p.correcta = null;
  if(tipo === 'numero' && (typeof p.correcta === 'boolean' || p.correcta === null)) p.correcta = '';
  pintarPreguntasTp();
}
function agregarOpcionTp(i){ formTp.preguntas[i].opciones.push(''); pintarPreguntasTp(); }
function quitarOpcionTp(i, k){
  const p = formTp.preguntas[i];
  p.opciones.splice(k, 1);
  if(p.correcta === k) p.correcta = null; else if(p.correcta > k) p.correcta--;
  pintarPreguntasTp();
}
function marcarCorrectaTp(i, k){ formTp.preguntas[i].correcta = k; pintarPreguntasTp(); }

function pegarPreguntasTp(){
  const ta = document.getElementById('f_tp_pegar');
  const {preguntas, errores} = Comun.parsearPreguntas(ta.value);
  if(errores.length){ showToast(errores[0]); return; }
  if(!preguntas.length){ showToast('No encontré preguntas'); return; }
  formTp.preguntas.push(...preguntas);
  ta.value = '';
  ta.closest('details').open = false;
  pintarPreguntasTp();
  showToast(`Agregaste ${preguntas.length} pregunta${preguntas.length!==1?'s':''}`);
}

/** Las preguntas del formulario, listas para guardar; o un error para mostrar. */
function leerPreguntasTp(){
  const out = [];
  for(const [i, p] of formTp.preguntas.entries()){
    const n = i + 1;
    const enunciado = String(p.enunciado || '').trim();
    if(!enunciado) return {error: `A la pregunta ${n} le falta el texto`};
    if(p.tipo === 'opcion'){
      const opciones = (p.opciones || []).map(o=>String(o).trim());
      const llenas = opciones.filter(Boolean);
      if(llenas.length < 2) return {error: `La pregunta ${n} necesita al menos dos opciones`};
      if(typeof p.correcta !== 'number' || !opciones[p.correcta]) return {error: `Marcá con ✓ la opción correcta de la pregunta ${n}`};
      const correctaTexto = opciones[p.correcta];
      out.push({tipo:'opcion', enunciado, opciones: llenas, correcta: llenas.indexOf(correctaTexto)});
    }else if(p.tipo === 'vf'){
      if(typeof p.correcta !== 'boolean') return {error: `Elegí si la pregunta ${n} es verdadera o falsa`};
      out.push({tipo:'vf', enunciado, correcta: p.correcta});
    }else if(p.tipo === 'numero'){
      const v = parseFloat(String(p.correcta ?? '').replace(',', '.'));
      if(isNaN(v)) return {error: `Poné la respuesta (un número) de la pregunta ${n}`};
      const tol = parseFloat(String(p.tolerancia || '0').replace(',', '.')) || 0;
      out.push({tipo:'numero', enunciado, correcta: v, tolerancia: Math.abs(tol)});
    }else{
      out.push({tipo:'texto', enunciado});
    }
  }
  out.forEach((p, i)=>{ p.id = 'p' + (i + 1); });
  return {preguntas: out};
}

function guardarTp(){
  const alumnoId = document.getElementById('f_tp_alumno').value;
  const consigna = document.getElementById('f_tp_consigna').value.trim();
  const fechaEntrega = document.getElementById('f_tp_fecha').value || null;
  const r = leerPreguntasTp();
  if(!alumnoId){ showToast('Elegí un alumno'); return; }
  if(r.error){ showToast(r.error); return; }
  if(!consigna && !r.preguntas.length){ showToast('Escribí qué tiene que hacer'); return; }
  const a = getAlumno(alumnoId);
  const temaId = formTp.temaId || ((a && a.temasIds && a.temasIds.length === 1) ? a.temasIds[0] : null);
  const titulo = Comun.tituloDeTexto(consigna) || Comun.tituloDeTexto(r.preguntas[0].enunciado);

  let tp = formTp.id ? db.tps.find(t=>t.id===formTp.id) : null;
  const nueva = !tp;
  if(tp){
    Object.assign(tp, {alumnoId, titulo, consigna, fechaEntrega, temaId, preguntas: r.preguntas, publicado: true});
  }else{
    tp = {id: uid(), alumnoId, titulo, consigna, temaId, claseId: formTp.claseId, fechaEntrega, preguntas: r.preguntas,
      publicado: true, publicadoEn: new Date().toISOString(), creado: new Date().toISOString()};
    db.tps.push(tp);
  }
  // si venía de un pendiente, ese pendiente queda resuelto
  if(formTp.pendienteId){
    const p = db.tareas.find(t=>t.id===formTp.pendienteId);
    if(p){ p.hecha = true; p.tpId = tp.id; }
  }
  if(nueva) notificarAlumno(alumnoId, '📝 Nueva tarea', titulo + (fechaEntrega ? ` · para el ${fmtFecha(fechaEntrega)}` : ''), {tipo:'tp', tpId: tp.id});
  saveDB();
  closeSheet();
  renderAll();
  if(nueva && a && !a.aulaId){
    // no usa la app: se la mandamos por WhatsApp
    confirmar({titulo:'¿Se la mandás por WhatsApp?', mensaje:`${a.nombre} no usa la app, así que no le va a llegar sola.`, ok:'Mandar por WhatsApp'})
      .then(ok=>{ if(ok) mandarTpPorWhatsapp(tp.id); });
  }else{
    showToast(nueva ? (a && a.aulaId ? 'Tarea enviada: le llega a su app' : 'Tarea guardada') : 'Tarea guardada');
  }
}

function mandarTpPorWhatsapp(tpId){
  const tp = db.tps.find(t=>t.id===tpId);
  const a = tp && getAlumno(tp.alumnoId);
  if(!a) return;
  const quien = a.tipo === 'adulto' ? a.nombre : (a.contacto || '');
  const preguntas = (tp.preguntas||[]).map((p, i)=>{
    const ops = p.tipo === 'opcion' ? '\n' + p.opciones.map((o, k)=>`   ${String.fromCharCode(97+k)}) ${o}`).join('\n') : p.tipo === 'vf' ? ' (¿verdadero o falso?)' : '';
    return `${i+1}. ${p.enunciado}${ops}`;
  }).join('\n');
  const link = a.aulaId && window.nube ? `\n\nTambién la tenés en la app: ${nube.linkInvitacion(a.aulaId)}` : '';
  const msg = `¡Hola${quien ? ' ' + quien : ''}! Tarea${a.tipo === 'adulto' ? '' : ' para ' + a.nombre}${tp.fechaEntrega ? ` (para el ${fmtFecha(tp.fechaEntrega)})` : ''}:\n${tp.consigna || ''}${preguntas ? '\n\n' + preguntas : ''}${link}`;
  window.open(waUrl(a.telefono, msg), '_blank');
}

async function eliminarTp(id){
  const ok = await confirmar({titulo:'¿Eliminar esta tarea?', ok:'Eliminar', peligro:true});
  if(!ok) return;
  db.tps = db.tps.filter(t=>t.id!==id);
  saveDB();
  closeSheet();
  renderAll();
  showToast('Tarea eliminada');
}

function duplicarTp(id){
  const tp = db.tps.find(t=>t.id===id);
  const destino = document.getElementById('f_tp_dup').value;
  if(!tp || !destino) return;
  openTpForm(null, destino, {consigna: tp.consigna || tp.titulo, temaId: null});
  formTp.preguntas = JSON.parse(JSON.stringify(tp.preguntas || []));
  pintarPreguntasTp();
}

function textoRespuesta(p, r){
  if(r === undefined || r === null || r === '') return '<i class="hint">Sin responder</i>';
  if(p.tipo === 'opcion') return escapeHtml(p.opciones[Number(r)] ?? '?');
  if(p.tipo === 'vf') return (r === true || r === 'true') ? 'Verdadero' : 'Falso';
  return escapeHtml(String(r));
}
function textoCorrecta(p){
  if(p.tipo === 'opcion') return escapeHtml(p.opciones[p.correcta] ?? '');
  if(p.tipo === 'vf') return p.correcta ? 'Verdadero' : 'Falso';
  if(p.tipo === 'numero') return p.correcta + (p.tolerancia ? ' ± ' + p.tolerancia : '');
  return '';
}

function verTp(id){
  const tp = db.tps.find(t=>t.id===id);
  if(!tp) return;
  const a = getAlumno(tp.alumnoId);
  const e = entregaDe(tp);
  const est = estadoTp(tp);
  let entregaHtml, footer = '';
  if(!a || !a.aulaId){
    entregaHtml = `<div class="note">${ic('info')}<div>${escapeHtml(a ? a.nombre : 'El alumno')} no usa la app: mandásela por WhatsApp. Si lo invitás desde su ficha, le llega sola y ves acá lo que hizo.</div></div>`;
  }else if(!e){
    entregaHtml = '<p class="sheet-sub">Todavía no la hizo.</p>';
  }else if(!tienePreguntas(tp)){
    const env = nube.fechaDe(e.enviadaEn);
    entregaHtml = `<div class="note">${ic('check')}<div>La marcó como hecha ${env ? hace(env) : ''}${e.porNombre ? ' (' + escapeHtml(e.porNombre) + ')' : ''}.${e.comentario ? `<br><b>Te dejó:</b> ${escapeHtml(e.comentario)}` : ''}</div></div>`;
  }else{
    const r = e.respuestas || {};
    const pt = Comun.puntaje(tp.preguntas, r);
    const env = nube.fechaDe(e.enviadaEn);
    entregaHtml = `
      <div class="section-label">Lo que respondió</div>
      <div class="note">${ic('check')}<div>Entregada ${env ? hace(env) : ''}${e.porNombre ? ' por ' + escapeHtml(e.porNombre) : ''}${pt.total ? ` · <b>${pt.ok}/${pt.total}</b> bien` : ''}${pt.abiertas ? ` · ${pt.abiertas} para que corrijas vos` : ''}</div></div>
      ${(tp.preguntas||[]).map((p, i)=>{
        const ok = Comun.corregir(p, r[p.id]);
        const marca = p.tipo === 'texto' ? ic('edit') : ok === true ? ic('check') : ic('x');
        return `<div class="entrega-preg ${p.tipo==='texto'?'abierta':ok?'bien':'mal'}">
          <div class="enunciado">${i+1}. ${escapeHtml(p.enunciado)}</div>
          <div class="resp">${marca}<span>${textoRespuesta(p, r[p.id])}</span></div>
          ${p.tipo !== 'texto' && ok !== true ? `<div class="hint" style="margin-top:2px;">Correcta: ${textoCorrecta(p)}</div>` : ''}
        </div>`;
      }).join('')}
      ${e.comentario ? `<div class="note">${ic('message')}<div><b>Comentario:</b> ${escapeHtml(e.comentario)}</div></div>` : ''}
      <label for="f_devolucion">Tu devolución</label>
      <textarea id="f_devolucion" placeholder="¡Muy bien! Repasá la 3…">${escapeHtml(e.devolucion||'')}</textarea>
      <label for="f_nota">Nota <span style="font-weight:400;">(opcional)</span></label>
      <input type="text" id="f_nota" value="${escapeAttr(e.nota||'')}" placeholder="Ej: 9, Muy bien">`;
    footer = `<button type="button" class="btn primary" onclick="enviarDevolucion('${tp.id}')">${e.estado==='corregida' ? 'Actualizar devolución' : 'Enviar devolución'}</button>`;
  }
  const otros = db.alumnos.filter(x=>x.id!==tp.alumnoId).sort((x,y)=>x.nombre.localeCompare(y.nombre,'es'));
  openSheet(`
    <h3>${escapeHtml(tituloTp(tp))}</h3>
    <p class="sheet-sub">${escapeHtml(alumnoNombre(tp.alumnoId))} · <span class="badge ${est.clase}">${est.texto}</span>${tp.fechaEntrega ? ' · para el ' + fmtFecha(tp.fechaEntrega) : ''}</p>
    ${tp.consigna && tp.consigna !== tituloTp(tp) ? `<div class="tp-consigna">${escapeHtml(tp.consigna)}</div>` : ''}
    ${entregaHtml}
    <div class="btn-row">
      <button type="button" class="btn outline" onclick="openTpForm('${tp.id}')">${ic('edit')}Editar</button>
      <button type="button" class="btn outline" onclick="mandarTpPorWhatsapp('${tp.id}')">${ic('message')}WhatsApp</button>
    </div>
    ${otros.length ? `
      <details class="more">
        <summary>${ic('chevron-right')}Mandársela también a otro alumno</summary>
        <div class="row2" style="margin-top:8px;">
          <select id="f_tp_dup">${otros.map(o=>`<option value="${o.id}">${escapeHtml(o.nombre)}</option>`).join('')}</select>
          <button type="button" class="btn secondary" onclick="duplicarTp('${tp.id}')">${ic('send')}Seguir</button>
        </div>
      </details>` : ''}
    ${footer ? `<div class="sheet-footer">${footer}</div>` : ''}
  `);
  renderMate(document.getElementById('sheetContent'));
}

function enviarDevolucion(tpId){
  const tp = db.tps.find(t=>t.id===tpId);
  const a = tp && getAlumno(tp.alumnoId);
  if(!a || !a.aulaId || !nubeLista()) return;
  const dev = document.getElementById('f_devolucion').value.trim();
  const nota = document.getElementById('f_nota').value.trim();
  nube.guardarDevolucion(a.aulaId, tpId, dev, nota).then(()=>{
    nube.notificarAula(a.aulaId, '✅ Corrección lista', `Tu profe corrigió "${tituloTp(tp)}"${nota ? ' · ' + nota : ''}.`, {tipo:'correccion', tpId});
    showToast('Devolución enviada');
    closeSheet();
  }, e=>{ console.error(e); showToast('No se pudo enviar'); });
}

/* =========================================================
   NOTIFICACIONES (campanita)
   ========================================================= */

let notifSheetAbierta = false;

window.onNotifsCambio = function(lista){
  renderContadorNotifs(lista);
  if(notifSheetAbierta && overlay.classList.contains('show') && document.getElementById('notifLista')) renderListaNotifs(lista);
};

function renderContadorNotifs(lista){
  const sinLeer = (lista||[]).filter(n=>!n.leida).length;
  const el = document.getElementById('notifCount');
  if(!el) return;
  el.hidden = sinLeer === 0;
  el.textContent = sinLeer > 9 ? '9+' : String(sinLeer);
}

function abrirNotifs(){
  if(!nubeLista()) return;
  const lista = nube.notifs();
  notifSheetAbierta = true;
  openSheet(`
    <h3>Notificaciones</h3>
    <div id="notifPushBox"></div>
    <div id="notifLista" style="margin-top:6px;"></div>
  `);
  renderListaNotifs(lista);
  renderPushBox('notifPushBox');
  const sinLeer = lista.filter(n=>!n.leida).map(n=>n.id);
  if(sinLeer.length) setTimeout(()=>nube.marcarLeidas(sinLeer), 1200);
}

function iconoNotif(n){
  return ({entrega:'file', resena:'star', miembro:'user', tp:'file', aviso:'message', clase:'calendar'})[n.tipo] || 'bell';
}

function renderListaNotifs(lista){
  const cont = document.getElementById('notifLista');
  if(!cont) return;
  cont.innerHTML = lista.length ? lista.map(n=>`
    <div class="list-item tap notif-item ${n.leida?'':'nueva'}" onclick="abrirNotif('${n.id}')">
      <div class="row-ic">${ic(iconoNotif(n))}</div>
      <div class="item-main">
        <div class="item-title">${escapeHtml(n.titulo||'')}</div>
        <div class="item-sub">${escapeHtml(n.cuerpo||'')}</div>
        <div class="item-sub" style="font-size:12px;color:var(--text-mute);">${hace(nube.fechaDe(n.creada))}</div>
      </div>
      <button type="button" class="icon-btn sm" style="color:var(--text-mute);" onclick="event.stopPropagation(); nube.borrarNotif('${n.id}')" aria-label="Borrar">${ic('x')}</button>
    </div>`).join('') : `<div class="empty" style="padding:16px 4px;">
      <div class="em-ic">${ic('bell')}</div>
      <h3>Sin novedades</h3>
      <p>Te avisamos acá cuando un alumno hace una tarea, te deja una reseña o se suma a la app.</p>
    </div>`;
}

function abrirNotif(id){
  const n = nube.notifs().find(x=>x.id===id);
  if(!n) return;
  const a = n.aulaId ? alumnoPorAula(n.aulaId) : null;
  closeSheet();
  if(n.tpId && db.tps.some(t=>t.id===n.tpId)){ verTp(n.tpId); return; }
  if(n.tipo === 'resena'){ abrirResenas(); return; }
  if(a) abrirDetalleAlumno(a.id);
}

async function renderPushBox(contId){
  const box = document.getElementById(contId);
  if(!box || !window.nube) return;
  const disponible = await nube.pushDisponible();
  const permiso = nube.estadoPermisoPush();
  if(!disponible){
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    box.innerHTML = `<div class="note">${ic('info')}<div>${ios
      ? 'En iPhone, para recibir notificaciones agregá Estudiemos a la pantalla de inicio (Compartir → «Agregar a inicio») y abrila desde ahí.'
      : 'Este navegador no permite notificaciones push.'}</div></div>`;
    return;
  }
  if(permiso === 'granted'){ box.innerHTML = `<div class="note">${ic('bell')}<div>Las notificaciones de este dispositivo están activadas.</div></div>`; return; }
  if(permiso === 'denied'){ box.innerHTML = `<div class="note">${ic('info')}<div>Bloqueaste las notificaciones de este sitio. Se habilitan desde los ajustes del navegador.</div></div>`; return; }
  box.innerHTML = `<button type="button" class="btn primary" onclick="activarNotificacionesPush('${contId}')">${ic('bell')}Activar notificaciones en este dispositivo</button>`;
}

async function activarNotificacionesPush(contId){
  try{
    await nube.activarPush();
    showToast('¡Listo! Te vamos a avisar');
  }catch(e){
    console.error(e);
    showToast(e.message === 'denegado' ? 'No diste permiso para notificaciones' : 'No se pudieron activar las notificaciones');
  }
  renderPushBox(contId);
}

/* ---------- Ajustes: notificaciones y página de reseñas ---------- */

function abrirAjustesNotif(){
  if(!firebaseUser){ pedirSesion('Las notificaciones y los recordatorios necesitan tu cuenta.'); return; }
  const n = db.config.notif;
  const opt = (vals, sel, fmt) => vals.map(v=>`<option value="${v}" ${Number(sel)===v?'selected':''}>${fmt(v)}</option>`).join('');
  openSheet(`
    ${volverAjustesHtml()}
    <h3>Notificaciones y recordatorios</h3>
    <div id="ajNotifPush" style="margin-top:8px;"></div>
    <label for="f_n_antes">Avisarme antes de cada clase</label>
    <select id="f_n_antes">${opt([0,15,30,60,120], n.antesMin, v=>v===0?'No avisar':v<60?`${v} minutos antes`:`${v/60} hora${v>60?'s':''} antes`)}</select>
    <label class="switch-row">
      <span>Al terminar una clase sin cobrar<small>Te recuerda mandar el resumen y el cobro</small></span>
      <input type="checkbox" class="switch" id="f_n_fin" ${n.finClase?'checked':''}>
    </label>
    <label for="f_n_alumnos">Avisarles a los alumnos que usan la app</label>
    <select id="f_n_alumnos">${opt([0,1,2,3,24], n.alumnosHoras, v=>v===0?'No avisar':v===24?'El día anterior (24 h antes)':`${v} hora${v>1?'s':''} antes de su clase`)}</select>
    <div class="hint">Los recordatorios llegan con unos minutos de margen.</div>
    <div class="sheet-footer"><button type="button" class="btn primary" onclick="guardarRecordatorios()">Guardar</button></div>
  `);
  renderPushBox('ajNotifPush');
}

function guardarRecordatorios(){
  db.config.notif = {
    antesMin: parseInt(document.getElementById('f_n_antes').value)||0,
    finClase: document.getElementById('f_n_fin').checked,
    alumnosHoras: parseInt(document.getElementById('f_n_alumnos').value)||0
  };
  saveDB();
  showToast('Recordatorios guardados');
  abrirAjustes();
}

function linkPaginaResenas(){
  return new URL('resenas.html?p=' + (firebaseUser ? firebaseUser.uid : ''), location.href).href;
}

function abrirPaginaResenas(){
  if(!firebaseUser){ pedirSesion('Tu página de reseñas se publica con tu cuenta.'); return; }
  const n = db.resenas.filter(r=>r.enPagina).length;
  openSheet(`
    ${volverAjustesHtml()}
    <h3>Tu página de reseñas</h3>
    <p class="sheet-sub">Una página con tu nombre, tu presentación y las reseñas que elijas. Ideal para el link de tu Instagram.</p>
    <div class="note">${ic('star')}<div>${n ? `Tiene <b>${n}</b> reseña${n!==1?'s':''}.` : 'Todavía no elegiste reseñas.'} Las elegís en Alumnos → Reseñas, con «A tu página».</div></div>
    <div class="btn-row">
      <button type="button" class="btn outline" onclick="window.open(linkPaginaResenas(), '_blank')">${ic('globe')}Verla</button>
      <button type="button" class="btn outline" onclick="copiarTexto(linkPaginaResenas())">${ic('copy')}Copiar link</button>
    </div>
    <button type="button" class="btn ghost" onclick="abrirAjustesDatosProfe()">${ic('edit')}Editar tu nombre y presentación</button>
  `);
}

/* =========================================================
   RESEÑAS QUE LLEGAN DESDE LA APP
   Se suman a db.resenas (la lista de siempre) con id "app:<aula>:<uid>"; si la persona la
   edita en la app, se actualiza. Si no autorizó publicarla, queda privada.
   ========================================================= */

function sincronizarResenasDeLaApp(){
  if(!nubeLista()) return false;
  let cambio = false;
  db.alumnos.forEach(a=>{
    if(!a.aulaId) return;
    const v = nube.vivo(a.aulaId);
    (v ? v.resenas : []).forEach(r=>{
      const id = `app:${a.aulaId}:${r.uid}`;
      if((db.config.resenasOcultas || []).includes(id)) return;
      const f = nube.fechaDe(r.actualizada || r.creada);
      const datos = {
        alumnoId: a.id, alumnoNombre: a.nombre, nivel: a.nivel || '',
        autor: String(r.autor || '').slice(0, 80),
        relacion: r.rol === 'familia' ? 'familiar' : 'alumno/a',
        estrellas: Number(r.estrellas) || 5, texto: String(r.texto || ''),
        fecha: f ? toIsoCalendario(f) : hoyIso(),
        publicar: r.permitePublicar !== false, privada: r.permitePublicar === false, origen: 'app'
      };
      const existente = db.resenas.find(x=>x.id===id);
      if(!existente){ db.resenas.push({id, enPagina: false, ...datos}); cambio = true; return; }
      const antes = JSON.stringify(existente);
      Object.assign(existente, datos);
      if(existente.privada) existente.enPagina = false;
      if(JSON.stringify(existente) !== antes) cambio = true;
    });
  });
  return cambio;
}

function togglePublicarResena(id){
  const r = db.resenas.find(x=>x.id===id);
  if(!r || r.privada) return;
  if(!firebaseUser){ pedirSesion('Tu página de reseñas se publica con tu cuenta.'); return; }
  r.enPagina = !r.enPagina;
  saveDB();
  showToast(r.enPagina ? 'Ahora aparece en tu página' : 'Ya no aparece en tu página');
  abrirResenas();
}

/* Imagen 1080×1350 (vertical de Instagram) con los colores de la paleta */
async function compartirResena(id){
  const r = db.resenas.find(x=>x.id===id);
  if(!r) return;
  try{ await document.fonts.load('600 48px Inter'); }catch(e){}
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const primario = css.getPropertyValue('--primary').trim() || '#bd5d34';
  const oscuro = css.getPropertyValue('--primary-dark').trim() || '#9d4823';
  const fuente = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';

  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, primario); grad.addColorStop(1, oscuro);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.07)';
  g.beginPath(); g.arc(W-80, 120, 260, 0, Math.PI*2); g.fill();
  g.beginPath(); g.arc(90, H-90, 200, 0, Math.PI*2); g.fill();

  const m = 80, top = 160, alto = H - 2*top + 30;
  g.fillStyle = '#ffffff';
  redondeado(g, m, top, W-2*m, alto, 44); g.fill();

  g.textAlign = 'center';
  g.fillStyle = '#e5a823';
  g.font = `64px ${fuente}`;
  const n = Math.round(r.estrellas || 5);
  g.fillText('★'.repeat(n) + '☆'.repeat(5-n), W/2, top + 130);

  g.fillStyle = '#221b16';
  let tam = 52, lineas;
  do{
    g.font = `500 ${tam}px ${fuente}`;
    lineas = partirLineas(g, '«' + String(r.texto||'') + '»', W - 2*m - 120);
    tam -= 3;
  }while(lineas.length * tam * 1.42 > alto - 400 && tam > 24);
  tam += 3;
  const altoTexto = lineas.length * tam * 1.42;
  let y = top + 200 + Math.max(0, (alto - 430 - altoTexto)/2) + tam;
  lineas.forEach(l=>{ g.fillText(l, W/2, y); y += tam * 1.42; });

  g.fillStyle = oscuro;
  g.font = `700 36px ${fuente}`;
  g.fillText('— ' + firmaResena(r), W/2, top + alto - 90, W - 2*m - 60);

  g.fillStyle = '#ffffff';
  g.font = `700 44px ${fuente}`;
  g.fillText(db.config.nombreProfe || 'Clases particulares', W/2, 100);
  g.globalAlpha = .85;
  g.font = `600 28px ${fuente}`;
  g.fillText('Estudiemos', W/2, H - 54);
  g.globalAlpha = 1;

  cv.toBlob(blob=>{
    // Se muestra primero: compartir necesita un toque "fresco" (en iPhone sobre todo)
    if(imagenResena && imagenResena.url) URL.revokeObjectURL(imagenResena.url);
    imagenResena = {archivo: new File([blob], 'resena.png', {type: 'image/png'}), url: URL.createObjectURL(blob)};
    const puedeCompartir = !!(navigator.canShare && navigator.canShare({files: [imagenResena.archivo]}));
    openSheet(`
      <button type="button" class="link-btn sheet-back" onclick="abrirResenas()">${ic('chevron-left')}Reseñas</button>
      <h3>Imagen para Instagram</h3>
      <img src="${imagenResena.url}" alt="Reseña" style="width:100%;border-radius:14px;margin-top:8px;box-shadow:var(--shadow);">
      <div class="sheet-footer">
        <button type="button" class="btn ${puedeCompartir ? 'outline' : 'primary'}" onclick="descargarImagenResena()">${ic('download')}Descargar</button>
        ${puedeCompartir ? `<button type="button" class="btn primary" onclick="compartirImagenResena()">${ic('share')}Compartir</button>` : ''}
      </div>
    `);
  }, 'image/png');
}

let imagenResena = null;
async function compartirImagenResena(){
  if(!imagenResena) return;
  try{ await navigator.share({files: [imagenResena.archivo]}); }
  catch(e){ if(e.name !== 'AbortError') descargarImagenResena(); }
}
function descargarImagenResena(){
  if(!imagenResena) return;
  const a = document.createElement('a');
  a.href = imagenResena.url; a.download = 'resena.png';
  document.body.appendChild(a); a.click(); a.remove();
  showToast('Imagen descargada');
}

function redondeado(g, x, y, w, h, r){
  g.beginPath();
  g.moveTo(x+r, y); g.arcTo(x+w, y, x+w, y+h, r); g.arcTo(x+w, y+h, x, y+h, r);
  g.arcTo(x, y+h, x, y, r); g.arcTo(x, y, x+w, y, r); g.closePath();
}

function partirLineas(g, texto, ancho){
  const out = [];
  texto.split(/\n/).forEach(parrafo=>{
    let linea = '';
    parrafo.split(/\s+/).forEach(p=>{
      const prueba = linea ? linea + ' ' + p : p;
      if(g.measureText(prueba).width > ancho && linea){ out.push(linea); linea = p; }
      else linea = prueba;
    });
    if(linea) out.push(linea);
  });
  return out;
}
