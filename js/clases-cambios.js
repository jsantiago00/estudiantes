/* =========================================================
   Estudiemos (profe): cancelar una clase, proponer otro horario y recuperar.

   Las reglas son las del profe (Ajustes → Tu perfil → «Si alguien cancela»), de
   Plataforma.REGLAS, y se muestran en su perfil antes de arreglar la clase:
   - Cancela el alumno con tiempo: no paga y le queda la clase para recuperar (30 días).
   - Cancela tarde (o no viene): se cobra lo que diga la regla. El profe siempre puede no cobrarla.
   - Cancela el profe: nunca se cobra, y al alumno le queda para recuperar.

   c.cancelada = {por, en, cobro, aTiempo, montoAntes, viaticoAntes}: el monto de la clase pasa
   a ser lo que se cobra (0, la mitad o completa), así la Billetera cuenta bien sin cambios.
   alumno.recuperos = [{id, claseId, fechaOriginal, vence, usado}]

   Si el alumno usa la app, desde ahí cancela (aulas/{id}/solicitudes) y se aplica sola la regla,
   con la hora en que avisó; y acepta o no el horario que le propone el profe (c.propuesta).
   Script clásico: comparte el ámbito global con app.html. Acá arriba solo se declaran funciones.
   ========================================================= */

function reglaProfe(){ return (db.config.perfil || {}).regla || Plataforma.REGLA_DEFAULT; }

function textoCobro(cobro){ return cobro >= 1 ? 'se cobra completa' : cobro > 0 ? 'se cobra la mitad' : 'no se cobra'; }

/** Aplica la cancelación a la clase. Devuelve un texto con lo que pasó. */
function aplicarCancelacion(c, quien, cuando, cobroForzado){
  const ev = Plataforma.evaluarCancelacion(c, reglaProfe(), quien, cuando);
  const cobro = cobroForzado != null ? cobroForzado : ev.cobro;
  const montoAntes = Number(c.monto) || 0, viaticoAntes = Number(c.viatico) || 0;
  c.cancelada = {por: quien, en: (cuando || new Date()).toISOString(), cobro, aTiempo: ev.aTiempo, montoAntes, viaticoAntes};
  c.monto = Math.round(montoAntes * cobro);
  c.viatico = 0;
  delete c.propuesta;
  const a = getAlumno(c.alumnoId);
  // si no se cobra, la clase se recupera (si cancela el profe, o el alumno con tiempo, o el profe la perdona)
  let recupera = false;
  if(a && cobro === 0){
    a.recuperos = (a.recuperos || []).filter(r=>r.claseId !== c.id);
    a.recuperos.push({id: uid(), claseId: c.id, fechaOriginal: c.fecha, vence: Plataforma.vencimientoRecupero(hoyIso()), usado: false});
    recupera = true;
  }
  const quienTxt = quien === 'profe' ? 'Cancelaste' : 'Canceló';
  const horas = Math.max(0, Math.round(ev.horasAntes));
  return `${quienTxt} la clase del ${nombreDiaFecha(c.fecha)} ${Number(c.fecha.slice(8))}/${Number(c.fecha.slice(5, 7))}`
    + (quien === 'alumno' ? ` con ${horas} h de aviso` : '') + `: ${textoCobro(cobro)}` + (recupera ? ' y queda para recuperar.' : '.');
}

function deshacerCancelacion(claseId){
  const c = db.clases.find(x=>x.id === claseId);
  if(!c || !c.cancelada) return;
  c.monto = c.cancelada.montoAntes;
  c.viatico = c.cancelada.viaticoAntes || 0;
  delete c.cancelada;
  const a = getAlumno(c.alumnoId);
  if(a) a.recuperos = (a.recuperos || []).filter(r=>r.claseId !== c.id || r.usado);
  saveDB();
  closeSheet();
  renderAll();
  showToast('La clase vuelve a estar agendada');
}

/* ---------- Desde el formulario de la clase ---------- */

function accionesCambioHtml(c){
  if(c.cancelada){
    const cb = c.cancelada;
    return `<div class="note">${ic('info')}<div><b>Cancelada</b> por ${cb.por === 'profe' ? 'vos' : 'el alumno'}: ${textoCobro(cb.cobro)}.
      <button type="button" class="link-btn" onclick="deshacerCancelacion('${c.id}')">Deshacer</button></div></div>`;
  }
  if(claseYaOcurrida(c, new Date())) return `<button type="button" class="btn outline" onclick="abrirCancelarClase('${c.id}')">${ic('x')}No vino / se canceló</button>`;
  return `<div class="btn-row">
    <button type="button" class="btn outline" onclick="abrirCancelarClase('${c.id}')">${ic('x')}Cancelar clase</button>
    <button type="button" class="btn outline" onclick="abrirProponerHorario('${c.id}')">${ic('repeat')}Otro horario</button>
  </div>
  ${c.propuesta ? `<div class="propuesta-box">Le propusiste pasarla al <b>${escapeHtml(nombreDiaFecha(c.propuesta.fecha))} ${fmtFecha(c.propuesta.fecha).slice(0, 5)} a las ${c.propuesta.hora}</b>. Falta que acepte.
    <button type="button" class="link-btn" onclick="quitarPropuesta('${c.id}')">Sacar la propuesta</button></div>` : ''}`;
}

let cancelForm = {quien: 'alumno', perdonar: false};

function abrirCancelarClase(claseId){
  const c = db.clases.find(x=>x.id === claseId);
  if(!c) return;
  cancelForm = {quien: 'alumno', perdonar: false, claseId};
  openSheet(`
    <h3>Cancelar la clase</h3>
    <p class="sheet-sub">${escapeHtml(alumnoNombre(c.alumnoId))} · ${escapeHtml(nombreDiaFecha(c.fecha))} ${fmtFecha(c.fecha).slice(0, 5)} a las ${c.horaEntrada}</p>
    <label>¿Quién cancela?</label>
    <div class="segmented" id="cancQuien" style="margin:0;">
      <button type="button" class="active" onclick="setCancelQuien('alumno')">${escapeHtml(alumnoNombre(c.alumnoId).split(' ')[0])}</button>
      <button type="button" onclick="setCancelQuien('profe')">Yo</button>
    </div>
    <div id="cancResultado"></div>
    <div class="sheet-footer"><button type="button" class="btn danger" onclick="confirmarCancelacion()">Cancelar la clase</button></div>
  `);
  pintarCancelResultado();
}
function setCancelQuien(q){
  cancelForm.quien = q;
  document.querySelectorAll('#cancQuien button').forEach((b, i)=>b.classList.toggle('active', (i === 0) === (q === 'alumno')));
  pintarCancelResultado();
}
function pintarCancelResultado(){
  const c = db.clases.find(x=>x.id === cancelForm.claseId);
  const ev = Plataforma.evaluarCancelacion(c, reglaProfe(), cancelForm.quien, new Date());
  const r = Plataforma.regla(reglaProfe());
  let txt;
  if(cancelForm.quien === 'profe') txt = `No se cobra y ${escapeHtml(alumnoNombre(c.alumnoId).split(' ')[0])} la puede recuperar en los próximos ${Plataforma.DIAS_RECUPERO} días.`;
  else if(ev.aTiempo) txt = `Avisó con más de ${r.horas} h: no se cobra y la puede recuperar.`;
  else txt = `Avisó con menos de ${r.horas} h (regla ${r.nombre.toLowerCase()}): ${textoCobro(ev.cobro)}.`;
  document.getElementById('cancResultado').innerHTML = `
    <div class="note" style="margin-top:12px;">${ic('info')}<div>${txt}</div></div>
    ${cancelForm.quien === 'alumno' && ev.cobro > 0 ? `<label class="switch-row"><span>No cobrarla esta vez<small>Queda para recuperar, como si hubiera avisado a tiempo</small></span>
      <input type="checkbox" class="switch" ${cancelForm.perdonar ? 'checked' : ''} onchange="cancelForm.perdonar = this.checked"></label>` : ''}`;
}
function confirmarCancelacion(){
  const c = db.clases.find(x=>x.id === cancelForm.claseId);
  if(!c) return;
  const texto = aplicarCancelacion(c, cancelForm.quien, new Date(), cancelForm.perdonar ? 0 : null);
  if(c.pagoId) recalcularPago(c.pagoId);
  notificarAlumno(c.alumnoId, '❌ Clase cancelada', texto.replace(/^Cancelaste/, 'Tu profe canceló').replace(/^Canceló/, 'Cancelaste'), {tipo: 'clase'});
  saveDB();
  closeSheet();
  renderAll();
  showToast('Clase cancelada');
}

function abrirProponerHorario(claseId){
  const c = db.clases.find(x=>x.id === claseId);
  if(!c) return;
  const a = getAlumno(c.alumnoId);
  const enApp = a && a.aulaId;
  openSheet(`
    <h3>Pasarla a otro horario</h3>
    <p class="sheet-sub">${enApp ? `${escapeHtml(a.nombre)} lo ve en su app y lo acepta (o no). Hasta que acepte, la clase sigue donde está.` : 'Como no usa la app, se cambia directamente.'}</p>
    <div class="field-row">
      <div><label for="f_pr_fecha">Día</label><input type="date" id="f_pr_fecha" value="${c.fecha}"></div>
      <div style="flex:0 0 112px;"><label for="f_pr_hora">Hora</label><select id="f_pr_hora">${opcionesHoraClase(c.horaEntrada)}</select></div>
    </div>
    <div class="sheet-footer"><button type="button" class="btn primary" onclick="guardarPropuesta('${c.id}')">${enApp ? 'Proponer' : 'Cambiar'}</button></div>
  `);
}
function guardarPropuesta(claseId){
  const c = db.clases.find(x=>x.id === claseId);
  const fecha = document.getElementById('f_pr_fecha').value, hora = document.getElementById('f_pr_hora').value;
  if(!c || !fecha || !hora) return;
  const a = getAlumno(c.alumnoId);
  if(a && a.aulaId){
    c.propuesta = {fecha, hora, en: new Date().toISOString()};
    notificarAlumno(c.alumnoId, '🔁 ¿Cambiamos el horario?', `Tu profe propone pasar la clase del ${nombreDiaFecha(c.fecha)} al ${nombreDiaFecha(fecha)} a las ${hora}. Aceptalo en tu app.`, {tipo: 'clase'});
    showToast('Propuesta enviada');
  }else{
    moverClase(c, fecha, hora);
    showToast('Clase cambiada');
  }
  saveDB();
  closeSheet();
  renderAll();
}
function quitarPropuesta(claseId){
  const c = db.clases.find(x=>x.id === claseId);
  if(c){ delete c.propuesta; saveDB(); openClaseForm(claseId); renderAll(); }
}
function moverClase(c, fecha, hora){
  c.fecha = fecha;
  c.horaEntrada = hora;
  c.horaSalida = sumarMinutos(hora, c.duracionMin || 60);
  delete c.propuesta;
}

/* ---------- Pedidos que llegan desde la app del alumno ---------- */

const solicitudesEnCurso = new Set();

/** Procesa los pedidos pendientes de las aulas (los llama js/profe-aula.js cuando cambian). */
function procesarSolicitudes(){
  if(!nubeLista()) return;
  let cambio = false;
  db.alumnos.forEach(a=>{
    if(!a.aulaId) return;
    const v = nube.vivo(a.aulaId);
    ((v && v.solicitudes) || []).forEach(s=>{
      if(solicitudesEnCurso.has(s.id)) return;
      solicitudesEnCurso.add(s.id);
      const c = db.clases.find(x=>x.id === s.claseId && x.alumnoId === a.id);
      let estado = 'hecha', resultado = '';
      if(!c){ estado = 'rechazada'; resultado = 'Esa clase ya no está.'; }
      else if(s.tipo === 'cancelar'){
        if(c.cancelada){ resultado = 'Ya estaba cancelada.'; }
        else{
          const cuando = nube.fechaDe(s.creada) || new Date();
          resultado = aplicarCancelacion(c, 'alumno', cuando, null);
          if(c.pagoId) recalcularPago(c.pagoId);
          cambio = true;
          avisarEnLaApp('❌ ' + a.nombre + ' canceló una clase', resultado.replace(/^Canceló/, 'Canceló'));
        }
      }else if(s.tipo === 'aceptar'){
        if(c.propuesta){ moverClase(c, c.propuesta.fecha, c.propuesta.hora); cambio = true; resultado = 'Clase cambiada.'; avisarEnLaApp('✅ ' + a.nombre + ' aceptó el cambio', `La clase pasó al ${nombreDiaFecha(c.fecha)} a las ${c.horaEntrada}.`); }
        else{ estado = 'rechazada'; resultado = 'Ya no había una propuesta.'; }
      }else if(s.tipo === 'rechazar'){
        if(c.propuesta){ delete c.propuesta; cambio = true; avisarEnLaApp('↩️ ' + a.nombre + ' no puede en el horario que propusiste', 'La clase queda donde estaba. Escribile para buscar otro.'); }
        resultado = 'Queda en su horario.';
      }else{ estado = 'rechazada'; }
      nube.responderSolicitud(a.aulaId, s.id, estado, resultado).catch(e=>{ console.error(e); solicitudesEnCurso.delete(s.id); });
    });
  });
  if(cambio){ saveDB(); renderAll(); }
}

/** Un aviso para el profe en esta pantalla (la notificación del alumno ya le llegó a la campanita). */
function avisarEnLaApp(titulo, texto){ showToast(titulo); }

/* ---------- Recuperos en la ficha ---------- */

function recuperosPendientes(a){
  const hoy = hoyIso();
  return (a.recuperos || []).filter(r=>!r.usado && r.vence >= hoy);
}

function recuperosHtml(a){
  const rs = recuperosPendientes(a);
  if(!rs.length) return '';
  return `<div class="note" style="margin-top:10px;">${ic('repeat')}<div>Le ${rs.length === 1 ? 'queda 1 clase' : `quedan ${rs.length} clases`} para recuperar (hasta el ${fmtFecha(rs[0].vence).slice(0, 5)}).
    <button type="button" class="link-btn" onclick="agendarRecupero('${a.id}', '${rs[0].id}')">Agendarla</button></div></div>`;
}

let recuperoAgendando = null;
function agendarRecupero(alumnoId, recId){
  recuperoAgendando = {alumnoId, recId};
  openClaseForm(null, null, null, alumnoId);
}
/** Lo llama guardarClase cuando se agenda una clase nueva. */
function alAgendarClase(c){
  if(!recuperoAgendando || recuperoAgendando.alumnoId !== c.alumnoId) { recuperoAgendando = null; return; }
  const a = getAlumno(c.alumnoId);
  const r = a && (a.recuperos || []).find(x=>x.id === recuperoAgendando.recId);
  if(r){ r.usado = true; c.recupero = r.id; }
  recuperoAgendando = null;
}
