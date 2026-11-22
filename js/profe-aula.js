/* =========================================================
   Estudiemos (profe): alumnos en la app (aulas), actividades para resolver,
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
      <p class="ajustes-desc">Si quiere, ${escapeHtml(alumno.nombre)}${alumno.tipo==='adulto' ? '' : ' (o su familia)'} puede entrar a Estudiemos y ver sus clases, si debe alguna, los resúmenes, las pizarras, las tareas y las actividades que le cargues. No es obligatorio.</p>
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
    return `¡Hola ${a.nombre}! Te paso el link para que veas tus clases${profe}, los resúmenes, las tareas y las actividades en Estudiemos: ${link}\nSe entra con una cuenta de Google.`;
  }
  const saludo = a.contacto ? `¡Hola ${a.contacto}!` : '¡Hola!';
  return `${saludo} Les paso el link para que ${a.nombre} (y ustedes) vean sus clases${profe}, los resúmenes, las tareas y las actividades en Estudiemos: ${link}\nSe entra con una cuenta de Google.`;
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
  const ok = await confirmar({titulo:'¿Quitar a esta persona?', mensaje:'Ya no va a poder ver las clases ni las actividades.', ok:'Quitar', peligro:true});
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
   ACTIVIDADES PARA RESOLVER
   (en los datos se llaman "tps"; en la interfaz "actividades", porque "trabajo
   práctico" en la Billetera es un trabajo que se cobra)
   ========================================================= */

const EJEMPLO_PREGUNTAS = `? ¿Cuánto es 7 × 8?
- 54
* 56
- 58

? Todo número par es divisible por 2.
= V

? Si $x + 3 = 10$, ¿cuánto vale $x$?
= 7

? Explicá con tus palabras qué es una fracción.`;

function entregaDe(tp){
  const a = getAlumno(tp.alumnoId);
  if(!a || !a.aulaId || !nubeLista()) return null;
  const v = nube.vivo(a.aulaId);
  return v && v.entregas ? (v.entregas[tp.id] || null) : null;
}

function estadoTp(tp){
  if(!tp.publicado) return {clase:'neutral', texto:'Borrador', orden:3};
  const e = entregaDe(tp);
  if(e && e.estado === 'corregida') return {clase:'pagada', texto:'Corregida', orden:4};
  if(e) return {clase:'pendiente', texto:'Para corregir', orden:0};
  if(tp.fechaEntrega && tp.fechaEntrega < hoyIso()) return {clase:'neutral', texto:'Vencida', orden:1};
  return {clase:'neutral', texto:'Sin entregar', orden:2};
}

function tpItemHtml(tp, conAlumno){
  const est = estadoTp(tp);
  const n = (tp.preguntas||[]).length;
  const partes = [];
  if(tp.temaId) partes.push(escapeHtml(temaNombre(tp.temaId)));
  partes.push(`${n} pregunta${n!==1?'s':''}`);
  if(tp.fechaEntrega) partes.push('para el ' + fechaCorta(tp.fechaEntrega).toLowerCase());
  return `<div class="list-item tap" onclick="verTp('${tp.id}')">
    ${conAlumno ? avatarHtml(getAlumno(tp.alumnoId), 'sm') : `<div class="row-ic">${ic('file')}</div>`}
    <div class="item-main">
      <div class="item-title">${escapeHtml(tp.titulo)}</div>
      <div class="item-sub">${conAlumno ? escapeHtml(alumnoNombre(tp.alumnoId)) + ' · ' : ''}${partes.join(' · ')}</div>
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
  cont.innerHTML = lista.length ? lista.map(tp=>tpItemHtml(tp, true)).join('')
    : '<div class="empty-msg" style="padding-bottom:14px;">Armá preguntas para que tus alumnos resuelvan desde el celular. Las de opción múltiple, verdadero o falso y numéricas se corrigen solas; las abiertas las corregís vos.</div>';
}

function renderDetalleTps(alumno){
  const cont = document.getElementById('detalleTps');
  if(!cont) return;
  const lista = db.tps.filter(t=>t.alumnoId===alumno.id).sort(ordenTps);
  cont.innerHTML = lista.length ? lista.map(tp=>tpItemHtml(tp, false)).join('') : '<div class="empty-msg" style="padding-bottom:12px;">Sin actividades todavía.</div>';
}

function openTpForm(id, alumnoIdPreset){
  if(db.alumnos.length===0){ showToast('Primero agregá un alumno'); return; }
  const tp = id ? db.tps.find(t=>t.id===id) : null;
  const ordenados = db.alumnos.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const alumnoId = tp ? tp.alumnoId : (alumnoIdPreset || (typeof filtroTareasAlumno!=='undefined' && filtroTareasAlumno!=='todos' ? filtroTareasAlumno : ordenados[0].id));
  const hayEntrega = tp && entregaDe(tp);
  openSheet(`
    <h3>${tp ? 'Editar actividad' : 'Nueva actividad'}</h3>
    <p class="sheet-sub">Preguntas que el alumno resuelve desde su celular, con corrección al toque.</p>
    <label for="f_tp_alumno">Alumno</label>
    <select id="f_tp_alumno" onchange="actualizarTpForm()">${ordenados.map(a=>`<option value="${a.id}" ${a.id===alumnoId?'selected':''}>${escapeHtml(a.nombre)}</option>`).join('')}</select>
    <div id="tpSinAulaAviso"></div>

    <label for="f_tp_titulo">Título</label>
    <input type="text" id="f_tp_titulo" value="${tp ? escapeAttr(tp.titulo) : ''}" placeholder="Ej: Repaso de fracciones" autocomplete="off">

    <div class="field-row">
      <div>
        <label for="f_tp_tema">Materia</label>
        <select id="f_tp_tema">${temaOptionsSimple(alumnoId, tp ? tp.temaId : null)}</select>
      </div>
      <div>
        <label for="f_tp_fecha">Para cuándo</label>
        <input type="date" id="f_tp_fecha" value="${tp && tp.fechaEntrega ? tp.fechaEntrega : ''}">
      </div>
    </div>

    <label for="f_tp_preguntas">Preguntas</label>
    <textarea id="f_tp_preguntas" class="tp-preguntas" oninput="previewPreguntas()" placeholder="? ¿Cuánto es 2 + 2?&#10;- 3&#10;* 4&#10;- 5">${tp ? escapeHtml(Comun.preguntasATexto(tp.preguntas)) : ''}</textarea>
    <div id="tpPreview" class="tp-preview"></div>
    <details class="more" style="margin-top:8px;">
      <summary>${ic('chevron-right')}Cómo se escriben</summary>
      <div class="hint" style="font-size:13.5px;">
        <p><b>?</b> abre una pregunta · <b>*</b> opción correcta · <b>-</b> opción incorrecta · <b>= V</b> o <b>= F</b> verdadero o falso · <b>= 42</b> respuesta numérica (con <b>± 0.5</b> de margen si querés) · sin nada, pregunta abierta que corregís vos. Fórmulas entre <b>$…$</b>.</p>
        <p>Tip: pedile a una IA <i>«armame 10 preguntas sobre ecuaciones para 2.º año en este formato»</i>, pegale el ejemplo, y pegá acá lo que te devuelva.</p>
      </div>
      <button type="button" class="btn secondary sm" onclick="insertarEjemploTp()">${ic('plus')}Insertar ejemplo</button>
    </details>
    ${hayEntrega ? `<div class="note">${ic('info')}<div>Ya hay una entrega: si cambiás o reordenás las preguntas, sus respuestas pueden dejar de coincidir.</div></div>` : ''}

    <details class="more" ${tp && (tp.consigna || tp.claseId) ? 'open' : ''}>
      <summary>${ic('chevron-right')}Explicación y clase</summary>
      <label for="f_tp_consigna">Explicación antes de empezar</label>
      <textarea id="f_tp_consigna" placeholder="Lo que tiene que saber. Podés escribir fórmulas entre $...$">${tp ? escapeHtml(tp.consigna||'') : ''}</textarea>
      <label for="f_tp_clase">Clase asociada</label>
      <select id="f_tp_clase">${claseOptionsTodas(alumnoId, tp ? tp.claseId : null)}</select>
    </details>

    <label class="switch-row">
      <span>Mandársela al alumno<small>Si no, queda como borrador</small></span>
      <input type="checkbox" class="switch" id="f_tp_publicado" ${!tp || tp.publicado ? 'checked':''}>
    </label>

    <div class="sheet-footer">
      ${tp ? `<button type="button" class="btn danger" onclick="eliminarTp('${tp.id}')" aria-label="Eliminar">${ic('trash')}</button>` : ''}
      <button type="button" class="btn primary" onclick="guardarTp(${tp ? `'${tp.id}'` : 'null'})">Guardar</button>
    </div>
  `);
  actualizarTpForm(true);
  previewPreguntas();
}

function temaOptionsSimple(alumnoId, selectedId){
  return `<option value="">Ninguna</option>` + temasDeAlumno(alumnoId)
    .map(t=>`<option value="${t.id}" ${t.id===selectedId?'selected':''}>${escapeHtml(t.nombre)}</option>`).join('');
}

function claseOptionsTodas(alumnoId, selectedId){
  const clases = db.clases.filter(c=>c.alumnoId===alumnoId).sort((a,b)=>fechaHoraClase(b)-fechaHoraClase(a)).slice(0, 40);
  return `<option value="">Ninguna</option>` + clases
    .map(c=>`<option value="${c.id}" ${c.id===selectedId?'selected':''}>${fechaCorta(c.fecha)} · ${c.horaEntrada}</option>`).join('');
}

function actualizarTpForm(inicial){
  const alumnoId = document.getElementById('f_tp_alumno').value;
  const a = getAlumno(alumnoId);
  if(!inicial){
    document.getElementById('f_tp_tema').innerHTML = temaOptionsSimple(alumnoId, null);
    document.getElementById('f_tp_clase').innerHTML = claseOptionsTodas(alumnoId, null);
  }
  document.getElementById('tpSinAulaAviso').innerHTML = a && !a.aulaId
    ? `<div class="hint">${escapeHtml(a.nombre)} todavía no usa la app: invitalo desde su ficha para que la resuelva desde el celular.</div>` : '';
}

function insertarEjemploTp(){
  const ta = document.getElementById('f_tp_preguntas');
  ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + EJEMPLO_PREGUNTAS;
  previewPreguntas();
}

function previewPreguntas(){
  const ta = document.getElementById('f_tp_preguntas');
  const box = document.getElementById('tpPreview');
  if(!ta || !box) return;
  if(!ta.value.trim()){ box.innerHTML = ''; return; }
  const {preguntas, errores} = Comun.parsearPreguntas(ta.value);
  const cuenta = {opcion:0, vf:0, numero:0, texto:0};
  preguntas.forEach(p=>cuenta[p.tipo]++);
  const partes = [];
  if(cuenta.opcion) partes.push(`${cuenta.opcion} de opción`);
  if(cuenta.vf) partes.push(`${cuenta.vf} V/F`);
  if(cuenta.numero) partes.push(`${cuenta.numero} numérica${cuenta.numero!==1?'s':''}`);
  if(cuenta.texto) partes.push(`${cuenta.texto} abierta${cuenta.texto!==1?'s':''}`);
  box.innerHTML = (preguntas.length ? `<div class="ok">${ic('check')}${preguntas.length} pregunta${preguntas.length!==1?'s':''}: ${partes.join(', ')}</div>` : '')
    + errores.map(e=>`<div class="err">${ic('info')}${escapeHtml(e)}</div>`).join('');
}

function guardarTp(id){
  const alumnoId = document.getElementById('f_tp_alumno').value;
  const titulo = document.getElementById('f_tp_titulo').value.trim();
  const temaId = document.getElementById('f_tp_tema').value || null;
  const fechaEntrega = document.getElementById('f_tp_fecha').value || null;
  const claseId = document.getElementById('f_tp_clase').value || null;
  const consigna = document.getElementById('f_tp_consigna').value.trim();
  const publicado = document.getElementById('f_tp_publicado').checked;
  const {preguntas, errores} = Comun.parsearPreguntas(document.getElementById('f_tp_preguntas').value);

  if(!alumnoId){ showToast('Elegí un alumno'); return; }
  if(!titulo){ showToast('Poné un título'); return; }
  if(errores.length){ showToast('Revisá las preguntas marcadas'); return; }
  if(!preguntas.length && !consigna){ showToast('Agregá al menos una pregunta'); return; }

  let tp = id ? db.tps.find(t=>t.id===id) : null;
  const eraPublicado = tp ? tp.publicado : false;
  if(tp){
    Object.assign(tp, {alumnoId, titulo, temaId, fechaEntrega, claseId, consigna, preguntas, publicado});
  }else{
    tp = {id: uid(), alumnoId, titulo, temaId, fechaEntrega, claseId, consigna, preguntas, publicado, publicadoEn: null, creado: new Date().toISOString()};
    db.tps.push(tp);
  }
  if(publicado && !eraPublicado){
    tp.publicadoEn = new Date().toISOString();
    notificarAlumno(alumnoId, '📝 Nueva actividad', titulo + (fechaEntrega ? ` · para el ${fmtFecha(fechaEntrega)}` : ''), {tipo:'tp', tpId: tp.id});
  }
  saveDB();
  closeSheet();
  renderAll();
  showToast(publicado ? 'Actividad enviada' : 'Guardada como borrador');
}

async function eliminarTp(id){
  const ok = await confirmar({titulo:'¿Eliminar esta actividad?', ok:'Eliminar', peligro:true});
  if(!ok) return;
  db.tps = db.tps.filter(t=>t.id!==id);
  saveDB();
  closeSheet();
  renderAll();
  showToast('Actividad eliminada');
}

function duplicarTp(id){
  const tp = db.tps.find(t=>t.id===id);
  const destino = document.getElementById('f_tp_dup').value;
  if(!tp || !destino) return;
  const a = getAlumno(destino);
  const copia = JSON.parse(JSON.stringify(tp));
  Object.assign(copia, {id: uid(), alumnoId: destino, claseId: null, publicado: false, publicadoEn: null, creado: new Date().toISOString()});
  if(copia.temaId && !(a.temasIds||[]).includes(copia.temaId)) a.temasIds.push(copia.temaId);
  db.tps.push(copia);
  saveDB();
  renderAll();
  showToast(`Copiada para ${a.nombre} (como borrador)`);
  openTpForm(copia.id);
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
  if(!tp.publicado){
    entregaHtml = '<p class="sheet-sub">Es un borrador: el alumno todavía no la ve.</p>';
  }else if(!a || !a.aulaId){
    entregaHtml = '<p class="sheet-sub">El alumno todavía no usa la app, así que no hay entrega.</p>';
  }else if(!e){
    entregaHtml = '<p class="sheet-sub">Todavía no la entregó.</p>';
  }else{
    const r = e.respuestas || {};
    const pt = Comun.puntaje(tp.preguntas, r);
    const env = nube.fechaDe(e.enviadaEn);
    entregaHtml = `
      <div class="section-label">Entrega</div>
      <div class="note">${ic('check')}<div>Entregada ${env ? hace(env) : ''}${e.porNombre ? ' por ' + escapeHtml(e.porNombre) : ''}${pt.total ? ` · <b>${pt.ok}/${pt.total}</b> bien` : ''}${pt.abiertas ? ` · ${pt.abiertas} abierta${pt.abiertas!==1?'s':''} para corregir` : ''}</div></div>
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
      <label for="f_devolucion">Devolución</label>
      <textarea id="f_devolucion" placeholder="¡Muy bien! Repasá la 3...">${escapeHtml(e.devolucion||'')}</textarea>
      <label for="f_nota">Nota (opcional)</label>
      <input type="text" id="f_nota" value="${escapeAttr(e.nota||'')}" placeholder="Ej: 9, Muy bien, Aprobado">`;
    footer = `<button type="button" class="btn primary" onclick="enviarDevolucion('${tp.id}')">${e.estado==='corregida' ? 'Actualizar devolución' : 'Enviar devolución'}</button>`;
  }
  const otros = db.alumnos.filter(x=>x.id!==tp.alumnoId).sort((x,y)=>x.nombre.localeCompare(y.nombre,'es'));
  openSheet(`
    <h3>${escapeHtml(tp.titulo)}</h3>
    <p class="sheet-sub">${escapeHtml(alumnoNombre(tp.alumnoId))} · <span class="badge ${est.clase}">${est.texto}</span>${tp.fechaEntrega ? ' · para el ' + fmtFecha(tp.fechaEntrega) : ''}</p>
    ${tp.consigna ? `<div class="tp-consigna">${escapeHtml(tp.consigna)}</div>` : ''}
    ${entregaHtml}
    <div class="btn-row">
      <button type="button" class="btn outline" onclick="openTpForm('${tp.id}')">${ic('edit')}Editar</button>
      ${a && a.aulaId && tp.publicado ? `<button type="button" class="btn outline" onclick="avisarTpWhatsapp('${tp.id}')">${ic('message')}Avisar</button>` : ''}
    </div>
    ${otros.length ? `
      <label for="f_tp_dup">Usarla también con otro alumno</label>
      <div class="row2">
        <select id="f_tp_dup">${otros.map(o=>`<option value="${o.id}">${escapeHtml(o.nombre)}</option>`).join('')}</select>
        <button type="button" class="btn secondary" onclick="duplicarTp('${tp.id}')">${ic('copy')}Copiar</button>
      </div>` : ''}
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
    nube.notificarAula(a.aulaId, '✅ Corrección lista', `Tu profe corrigió "${tp.titulo}"${nota ? ' · ' + nota : ''}.`, {tipo:'correccion', tpId});
    showToast('Devolución enviada');
    closeSheet();
  }, e=>{ console.error(e); showToast('No se pudo enviar'); });
}

function avisarTpWhatsapp(tpId){
  const tp = db.tps.find(t=>t.id===tpId);
  const a = tp && getAlumno(tp.alumnoId);
  if(!a || !window.nube) return;
  const link = nube.linkInvitacion(a.aulaId);
  const quien = a.tipo === 'adulto' ? a.nombre : (a.contacto || '');
  const msg = `¡Hola${quien ? ' ' + quien : ''}! Te dejé una actividad nueva en Estudiemos: "${tp.titulo}"${tp.fechaEntrega ? `, para el ${fmtFecha(tp.fechaEntrega)}` : ''}. La encontrás acá: ${link}`;
  window.open(waUrl(a.telefono, msg), '_blank');
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
      <p>Te avisamos acá cuando un alumno entrega una actividad, te deja una reseña o se suma a la app.</p>
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
