/* =========================================================
   Estudiemos (profe): los mensajes con estudiantes y los pedidos de horario.

   - Mensajes: la lista de chats (js/chat.js, vía window.chatNube que arma js/nube-profe.js).
   - "Sumar como alumno": desde un chat se crea el alumno (nombre y nada más, como siempre)
     y se lo invita a la app con su link, en el mismo chat.
   - Pedidos de horario: el estudiante elige un hueco libre; al aceptarlo se agenda la clase
     (o todas las semanas). Si era para recuperar una clase cancelada, se usa el recupero.

   Script clásico: comparte el ámbito global con app.html (db, saveDB, openSheet, ic...).
   Se carga antes que el script principal: acá arriba solo se declaran funciones.
   ========================================================= */

let misChatsProfe = [];

window.onChatsCambio = function(lista){
  misChatsProfe = lista || [];
  const uidYo = firebaseUser ? firebaseUser.uid : '';
  const n = misChatsProfe.filter(c=>window.chatNube && chatNube.sinLeer(c, uidYo)).length;
  document.querySelectorAll('[data-view="mensajes"]').forEach(b=>{
    let badge = b.querySelector('.nav-count');
    if(!badge){ badge = document.createElement('span'); badge.className = 'nav-count'; b.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.hidden = n === 0;
  });
  if(typeof vistaActual !== 'undefined' && vistaActual === 'mensajes') renderMensajes();
  abrirChatDeLaUrl();
};

function renderMensajes(){
  const cont = document.getElementById('listaChats');
  if(!cont) return;
  if(!firebaseUser){
    cont.innerHTML = `<div class="card empty"><div class="em-ic">${ic('message')}</div><h3>Tus mensajes</h3>
      <p>Iniciá sesión con Google para que los estudiantes te encuentren en el buscador y te escriban.</p>
      <button type="button" class="btn primary" onclick="iniciarSesionGoogle()">${ic('cloud')}Iniciar sesión con Google</button></div>`;
    return;
  }
  const uidYo = firebaseUser.uid;
  const falta = Plataforma.faltaEnPerfil(db);
  const aviso = falta.length || (db.config.perfil && db.config.perfil.visible === false)
    ? `<div class="note">${ic('info')}<div>${escapeHtml(textoEstadoPerfil())}. <button type="button" class="link-btn" onclick="abrirAjustes(); abrirPerfilPublico();">Completar mi perfil</button></div></div>` : '';
  cont.innerHTML = aviso + (misChatsProfe.length
    ? `<div class="card list">${misChatsProfe.map(c=>chatNube.itemChatHtml(c, uidYo)).join('')}</div>`
    : `<div class="card empty"><div class="em-ic">${ic('message')}</div><h3>Todavía no te escribió nadie</h3>
        <p>Cuando un estudiante te encuentre en el buscador y te escriba, lo ves acá.</p>
        <button type="button" class="btn outline" onclick="compartirMiPerfil()">${ic('share')}Compartir mi perfil</button></div>`);
  cont.querySelectorAll('[data-chat]').forEach(el=>el.addEventListener('click', ()=>abrirChatProfe(el.dataset.chat)));
}

function compartirMiPerfil(){
  const url = urlPerfilPublico();
  if(!url){ iniciarSesionGoogle(); return; }
  if(navigator.share) navigator.share({title: db.config.nombreProfe || 'Mi perfil', url}).catch(()=>{});
  else copiarTexto(url);
}

let chatDeLaUrlAbierto = false;
function abrirChatDeLaUrl(){
  if(chatDeLaUrlAbierto) return;
  const id = new URLSearchParams(location.search).get('chat');
  if(!id || !misChatsProfe.some(c=>c.id === id)) return;
  chatDeLaUrlAbierto = true;
  history.replaceState(null, '', location.pathname);
  goTo('mensajes');
  abrirChatProfe(id);
}

/** El alumno que corresponde a un chat: el vinculado, o el del aula donde está ese estudiante. */
function alumnoDeChat(chat){
  let a = db.alumnos.find(x=>x.chatId === chat.id);
  if(a) return a;
  if(window.nube){
    a = db.alumnos.find(x=>{
      const v = x.aulaId && nube.vivo(x.aulaId);
      return v && v.aula && (v.aula.miembros || []).includes(chat.estUid);
    });
    if(a){ a.chatId = chat.id; saveDB(); }
  }
  return a || null;
}

function abrirChatProfe(chatId){
  const chat = misChatsProfe.find(c=>c.id === chatId);
  if(!chat || !window.chatNube) return;
  const a = alumnoDeChat(chat);
  chatNube.abrirPantalla(chatId, {
    rol: 'profe',
    botonExtra: a ? {texto: 'Ficha', onClick: ()=>{ chatNube.cerrarPantalla(); abrirDetalleAlumno(a.id); }}
      : {texto: 'Sumar alumno', onClick: c=>sumarComoAlumno(c, true)},
    menu: [
      {id: 'bloquear', texto: chat.bloqueadoPor === firebaseUser.uid ? 'Desbloquear' : 'Bloquear', peligro: chat.bloqueadoPor !== firebaseUser.uid},
      {id: 'denunciar', texto: 'Denunciar', peligro: true}
    ],
    onMenu: menuChatProfe,
    onReserva: responderReservaProfe,
    alCerrar: ()=>{ if(vistaActual === 'mensajes') renderMensajes(); }
  });
}

async function menuChatProfe(id, chat){
  if(id === 'bloquear'){
    const desbloquear = chat.bloqueadoPor === firebaseUser.uid;
    if(!desbloquear){
      const ok = await confirmar({titulo: '¿Bloquear este chat?', mensaje: 'No te va a poder escribir más. Lo podés desbloquear después.', ok: 'Bloquear', peligro: true});
      if(!ok) return;
    }
    await chatNube.bloquear(chat.id, !desbloquear);
    showToast(desbloquear ? 'Chat desbloqueado' : 'Chat bloqueado');
  }else if(id === 'denunciar'){
    chatNube.cerrarPantalla();
    abrirDenuncia({sobre: chat.estUid, chatId: chat.id, nombre: (chat.nombres || {})[chat.estUid] || 'esta persona'});
  }
}

/** Crea el alumno del chat (si no estaba) y lo invita a la app. Devuelve el alumno. */
async function sumarComoAlumno(chat, conAviso){
  let a = alumnoDeChat(chat);
  if(!a){
    const nombre = ((chat.nombres || {})[chat.estUid] || 'Alumno nuevo').slice(0, 80);
    a = crearAlumnoRapido(nombre, '');
    a.chatId = chat.id;
    a.porCompletar = (a.porCompletar || []).filter(x=>x !== 'contacto');
    a.tipo = 'adulto';
    saveDB();
  }
  if(!a.aulaId && nubeLista()){
    try{
      a.aulaId = await nube.crearAula(db, a);
      saveDB();
      refrescarEscuchasAulas();
      await chatNube.enviar(chat, {tipo: 'texto', texto: `¡Te sumé como alumno! Acá vas a ver tus clases, las actividades y lo que vemos: ${nube.linkInvitacion(a.aulaId)}`});
    }catch(e){ console.error(e); }
  }
  renderAll();
  if(conAviso){
    showToast(`${a.nombre} ya es tu alumno`);
    chatNube.cerrarPantalla();
    abrirChatProfe(chat.id);
  }
  return a;
}

async function responderReservaProfe(accion, msg, chat){
  const r = msg.reserva;
  if(accion === 'rechazar'){
    const ok = await confirmar({titulo: '¿No podés en ese horario?', mensaje: 'Le avisamos en el chat. Si querés, después le proponés otro.', ok: 'No puedo'});
    if(!ok) return;
    await chatNube.responderReserva(chat.id, msg.id, r, 'rechazada');
    await chatNube.enviar(chat, {tipo: 'sistema', texto: `No se pudo el ${chatNube.fechaLinda(r.fecha)} a las ${r.hora}. Elegí otro horario o escribile.`});
    return;
  }
  if(accion !== 'aceptar') return;
  // ¿Ya hay otra clase en ese horario?
  const dur = Number(r.duracion) || 60;
  const choca = db.clases.some(c=>!c.cancelada && c.fecha === r.fecha && horaAMin(c.horaEntrada) < horaAMin(r.hora) + dur && finClaseMin(c) > horaAMin(r.hora));
  if(choca){
    const ok = await confirmar({titulo: 'Ya tenés una clase en ese horario', mensaje: '¿La agendo igual?', ok: 'Agendar igual'});
    if(!ok) return;
  }
  const a = await sumarComoAlumno(chat, false);
  const n = agendarDesdeReserva(a, r);
  await chatNube.responderReserva(chat.id, msg.id, r, 'aceptada');
  await chatNube.enviar(chat, {tipo: 'sistema', texto: r.semanal
    ? `¡Listo! Quedaron agendadas ${n} clases, los ${nombreDiaFecha(r.fecha).split(' ')[0].toLowerCase()} a las ${r.hora}.`
    : `¡Listo! Quedó agendada la clase del ${chatNube.fechaLinda(r.fecha)} a las ${r.hora}.`});
  showToast(n > 1 ? `Se agendaron ${n} clases` : 'Clase agendada');
  if(chatNube.chatAbierto() === chat.id) abrirChatProfe(chat.id);   // ahora con el botón de la ficha
}

/** Agenda la clase (o la serie semanal) de una reserva aceptada. Devuelve cuántas clases creó. */
function agendarDesdeReserva(a, r){
  const dur = Number(r.duracion) || Number((db.config.perfil || {}).duracion) || 60;
  const monto = redondearA100((Number(a.tarifa) || Number(db.config.tarifaHabitual) || 0) * dur / 60);
  const modalidad = a.modalidad || 'casa_mia';
  const base = {alumnoId: a.id, duracionMin: dur, monto, viatico: viaticoPorModalidad(modalidad), modalidad,
    temarioIds: [], notas: '', resumen: '', links: [], pizarra: null, pagada: false, pagoId: null};
  let fechas = [{fecha: r.fecha, horaEntrada: r.hora}];
  let serieId = null;
  if(r.semanal){
    serieId = uid();
    fechas = generarOcurrenciasRecurrentes(r.fecha, {[new Date(r.fecha + 'T12:00:00').getDay()]: r.hora}, 12);
  }
  fechas.forEach(o=>db.clases.push({...base, id: uid(), serieId, fecha: o.fecha, horaEntrada: o.horaEntrada, horaSalida: sumarMinutos(o.horaEntrada, dur)}));
  if(r.recupero){
    const rec = (a.recuperos || []).find(x=>x.id === r.recupero);
    if(rec) rec.usado = true;
  }
  if(r.mover){
    // cambiar una clase de horario: la de antes deja de estar
    const vieja = db.clases.find(c=>c.id === r.mover && c.alumnoId === a.id);
    if(vieja && !vieja.pagada) db.clases = db.clases.filter(c=>c !== vieja);
  }
  saveDB();
  renderAll();
  return fechas.length;
}

/* ---------- Denuncias ---------- */

function abrirDenuncia(d){
  openSheet(`
    <h3>Denunciar</h3>
    <p class="sheet-sub">Lo revisa la administración de Estudiemos. ${escapeHtml(d.nombre)} no se entera de quién lo denunció.</p>
    <label>¿Qué pasó?</label>
    <div class="pill-select compact" id="denMotivo">${[['spam','Spam o publicidad'],['acoso','Acoso o maltrato'],['falso','Datos falsos'],['otro','Otra cosa']].map(([v, t])=>`<button type="button" data-v="${v}" onclick="document.querySelectorAll('#denMotivo button').forEach(b=>b.classList.toggle('sel', b===this))">${t}</button>`).join('')}</div>
    <label for="f_den_texto">Contanos un poco más (opcional)</label>
    <textarea id="f_den_texto" maxlength="1000"></textarea>
    <div class="sheet-footer"><button type="button" class="btn danger" onclick="enviarDenuncia('${jsArg(d.sobre)}', '${jsArg(d.chatId || '')}')">Denunciar</button></div>
  `);
}
async function enviarDenuncia(sobre, chatId){
  const sel = document.querySelector('#denMotivo button.sel');
  if(!sel){ showToast('Elegí qué pasó'); return; }
  try{
    await nube.denunciar({sobre, chatId, motivo: sel.dataset.v, texto: document.getElementById('f_den_texto').value.trim()});
    closeSheet();
    showToast('Gracias: lo vamos a revisar');
  }catch(e){ console.error(e); showToast('No se pudo enviar'); }
}

/* ---------- Moderación (solo administración) ---------- */

async function abrirModeracion(){
  openSheet(`${volverAjustesHtml()}<h3>Moderación</h3><div id="modLista"><p class="hint">Cargando…</p></div>`);
  try{
    const [dens, mods] = await Promise.all([nube.denuncias(), nube.moderacion()]);
    const ocultos = new Set(mods.filter(m=>m.oculto).map(m=>m.uid));
    const abiertas = dens.filter(d=>d.estado !== 'revisada').sort((a, b)=>(nube.fechaDe(b.creada) || 0) - (nube.fechaDe(a.creada) || 0));
    const perfiles = {};
    await Promise.all([...new Set(abiertas.map(d=>d.sobre))].map(async u=>{ perfiles[u] = await nube.perfil(u).catch(()=>null); }));
    const motivo = {spam: 'Spam o publicidad', acoso: 'Acoso o maltrato', falso: 'Datos falsos', otro: 'Otra cosa'};
    document.getElementById('modLista').innerHTML = `
      <div class="section-label">Denuncias sin revisar (${abiertas.length})</div>
      ${abiertas.length ? abiertas.map(d=>{
        const p = perfiles[d.sobre];
        return `<div class="card" style="margin:8px 0;">
          <div class="item-title">${escapeHtml(p ? p.nombre : 'Estudiante')} ${p ? '<span class="badge neutral">Profe</span>' : ''} ${ocultos.has(d.sobre) ? '<span class="badge cancelada">Oculto</span>' : ''}</div>
          <div class="item-sub">${escapeHtml(motivo[d.motivo] || d.motivo)}${d.texto ? ' · ' + escapeHtml(d.texto) : ''}</div>
          <div class="btn-row" style="margin-top:8px;">
            ${p ? `<a class="btn sm outline" href="profe.html?p=${encodeURIComponent(d.sobre)}" target="_blank" rel="noopener">Ver perfil</a>
            <button type="button" class="btn sm ${ocultos.has(d.sobre) ? 'outline' : 'danger'}" onclick="moderarProfe('${jsArg(d.sobre)}', ${!ocultos.has(d.sobre)})">${ocultos.has(d.sobre) ? 'Volver a mostrar' : 'Ocultar del buscador'}</button>` : ''}
            <button type="button" class="btn sm secondary" onclick="cerrarDenunciaMod('${jsArg(d.id)}')">Ya la revisé</button>
          </div>
        </div>`;
      }).join('') : '<div class="empty-msg">No hay denuncias nuevas.</div>'}
      <div class="section-label">Profes ocultos (${ocultos.size})</div>
      ${[...ocultos].map(u=>`<div class="list-item"><div class="item-main"><a href="profe.html?p=${encodeURIComponent(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a></div><button type="button" class="btn sm outline" onclick="moderarProfe('${jsArg(u)}', false)">Mostrar</button></div>`).join('') || '<div class="empty-msg">Ninguno.</div>'}`;
  }catch(e){
    console.error(e);
    document.getElementById('modLista').innerHTML = '<p class="hint">No se pudo cargar. ¿Tu cuenta figura en plataforma/config?</p>';
  }
}
async function moderarProfe(uidProfe, ocultar){
  await nube.ocultarProfe(uidProfe, ocultar, ocultar ? 'Por denuncias' : '');
  showToast(ocultar ? 'Oculto del buscador' : 'Vuelve a aparecer');
  abrirModeracion();
}
async function cerrarDenunciaMod(id){ await nube.cerrarDenuncia(id); abrirModeracion(); }
