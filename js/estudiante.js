/* =========================================================
   Estudiemos (estudiante / familia)

   Se entra con Google. El profe manda un link estudiante.html?aula=ID: al entrar con ese
   link, la persona se suma al aula (aulas/{ID}.miembros). Después ve todas las aulas de
   las que es miembro (puede tener más de un profe, o una familia con dos hijos).
   Lo que se ve lo publica la app del profe; acá solo se escriben las entregas de las
   actividades, la reseña y lo que le interesa estudiar.
   ========================================================= */
import {
  db, usuarioActual, alCambiarSesion, entrarConGoogle, salir,
  doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion,
  notificar, escucharNotifs, marcarLeidas, borrarNotif,
  activarPush, renovarPushSiCorresponde, pushDisponible, estadoPermisoPush, linkSala, fechaDe
} from './firebase.js';

const Comun = window.Comun;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const LS_AULA = 'estudiemos_aula_sel';
const LS_ROL = 'estudiemos_rol';

const estado = {
  usuario: null,
  aulas: [],          // [{id, ...}]
  aulaSel: null,
  entregas: {},       // tpId -> entrega del aula elegida
  miResena: null,
  perfilAlumno: null,
  notifs: [],
  vista: 'inicio',
  cargando: true,
  errorUnirse: null
};

const params = new URLSearchParams(location.search);
let aulaInvitacion = params.get('aula');

/* ---------- Íconos (los mismos trazos que la app del profe) ---------- */

const ICONS = {
  home:'<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1Z"/>',
  calendar:'<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  list:'<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-4 3.7-6 7.5-6s6.7 2 7.5 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18 14.7c2 .7 3.2 2.5 3.5 5.3"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cash:'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01" stroke-width="2.6"/>',
  message:'<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.6a8.5 8.5 0 1 1 15.9-4.3Z"/>',
  pen:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  file:'<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  star:'<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  send:'<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5Z"/>',
  'chevron-right':'<path d="m9 18 6-6-6-6"/>',
  'log-out':'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
  sparkles:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  repeat:'<path d="m17 2 3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  edit:'<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="m14 8 2 2"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  auto:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>'
};
function ic(name, cls){ return `<svg class="ic ${cls||''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||''}</svg>`; }
document.querySelectorAll('[data-ic]').forEach(el=>{ el.innerHTML = ic(el.dataset.ic); });
$('notifToggle').insertAdjacentHTML('afterbegin', ic('bell'));

/* ---------- Utilidades de UI (mismo comportamiento que la app del profe) ---------- */

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2200);
}
function abrirSheet(html){
  const sc = $('sheetContent');
  sc.innerHTML = `<div class="sheet-handle"></div>
    <button type="button" class="icon-btn sm filled sheet-close" data-cerrar aria-label="Cerrar">${ic('x')}</button>
    <div class="sheet-body">${html}</div>`;
  const footer = sc.querySelector('.sheet-body .sheet-footer');
  if(footer) sc.appendChild(footer);
  sc.querySelector('[data-cerrar]').addEventListener('click', cerrarSheet);
  $('overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function cerrarSheet(){ $('overlay').classList.remove('show'); $('sheetContent').innerHTML = ''; document.body.style.overflow = ''; }
$('overlay').addEventListener('click', e=>{ if(e.target === $('overlay')) cerrarSheet(); });
document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && $('overlay').classList.contains('show')) cerrarSheet(); });
window.addEventListener('scroll', ()=>$('appHeader').classList.toggle('scrolled', window.scrollY > 4), {passive:true});

function mate(el){
  if(el && window.renderMathInElement){
    try{ renderMathInElement(el, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}], throwOnError:false}); }catch(e){}
  }
}

const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso){ const f = new Date(iso+'T00:00:00'); return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`; }
function fechaCorta(iso){
  const hoy = Comun.isoLocal(new Date()), man = Comun.isoLocal(new Date(Date.now() + 86400000));
  if(iso === hoy) return 'Hoy';
  if(iso === man) return 'Mañana';
  const f = new Date(iso+'T00:00:00');
  return `${DIAS[f.getDay()].slice(0,3)} ${f.getDate()}/${f.getMonth()+1}`;
}
function money(n){
  n = Number(n)||0;
  return '$' + n.toLocaleString('es-AR', {maximumFractionDigits: 2});
}
function duracionCorta(ms){
  const tm = Math.max(0, Math.round(ms/60000)), d = Math.floor(tm/1440), h = Math.floor((tm%1440)/60), m = tm%60;
  if(d > 0) return `${d} d${h ? ' ' + h + ' h' : ''}`;
  if(h > 0) return `${h} h${m ? ' ' + m + ' min' : ''}`;
  return `${m} min`;
}
function hace(f){
  if(!f) return '';
  const min = Math.round((Date.now() - f.getTime())/60000);
  if(min < 1) return 'recién';
  if(min < 60) return `hace ${min} min`;
  const h = Math.round(min/60);
  if(h < 24) return `hace ${h} h`;
  const d = Math.round(h/24);
  return d < 30 ? `hace ${d} día${d!==1?'s':''}` : f.toLocaleDateString('es-AR');
}
const inicioClase = c => Comun.instanteArg(c.fecha, c.horaEntrada);
const finClase = c => Comun.instanteArg(c.fecha, c.horaSalida || c.horaEntrada);

/* ---------- Tema claro / oscuro ---------- */

function temaActual(){ try{ return localStorage.getItem('estudiantes_theme_v1') || 'auto'; }catch(e){ return 'auto'; } }
function aplicarTema(t){
  if(t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('modeToggle').innerHTML = ic(({auto:'auto', light:'sun', dark:'moon'})[t]);
  $('modeToggle').title = ({auto:'Automático', light:'Claro', dark:'Oscuro'})[t];
}
$('modeToggle').addEventListener('click', ()=>{
  const orden = ['auto','light','dark'];
  const t = orden[(orden.indexOf(temaActual())+1) % 3];
  try{ localStorage.setItem('estudiantes_theme_v1', t); }catch(e){}
  aplicarTema(t);
});
aplicarTema(temaActual());

/* ---------- Pestañas ---------- */

document.querySelectorAll('#tabs button').forEach(b=>b.addEventListener('click', ()=>irA(b.dataset.view)));
function irA(v){
  estado.vista = v;
  render();
  window.scrollTo(0, 0);
}

/* ---------- Sesión ---------- */

let soltar = [];
let soltarAula = [];
let aulaEscuchada = null;
function soltarTodo(){
  soltar.forEach(f=>f()); soltar = [];
  soltarAula.forEach(f=>f()); soltarAula = []; aulaEscuchada = null;
}

alCambiarSesion(async user=>{
  estado.usuario = user;
  soltarTodo();
  estado.aulas = []; estado.entregas = {}; estado.notifs = [];
  if(!user){
    estado.cargando = false;
    render();
    return;
  }
  estado.cargando = true;
  render();
  if(aulaInvitacion) await unirseAula(aulaInvitacion);
  escucharMisAulas();
  soltar.push(escucharNotifs(lista=>{ estado.notifs = lista; renderCampanita(); if(estado.vista==='inicio') render(); }));
  renovarPushSiCorresponde(alRecibirPush);
});

async function entrar(rol){
  if(rol){ try{ localStorage.setItem(LS_ROL, rol); }catch(e){} }
  try{ await entrarConGoogle(); }
  catch(e){ if(e.code !== 'auth/popup-closed-by-user') toast('No se pudo iniciar sesión'); console.error(e); }
}

function rolGuardado(){ try{ return localStorage.getItem(LS_ROL) || 'alumno'; }catch(e){ return 'alumno'; } }

async function unirseAula(aulaId){
  const u = usuarioActual();
  try{
    await updateDoc(doc(db, 'aulas', aulaId), {
      miembros: arrayUnion(u.uid),
      ['miembrosInfo.' + u.uid]: {nombre: (u.displayName || '').slice(0, 60), email: (u.email || '').slice(0, 100), rol: rolGuardado()}
    });
    const snap = await getDoc(doc(db, 'aulas', aulaId));
    const a = snap.data();
    estado.aulaSel = aulaId;
    try{ localStorage.setItem(LS_AULA, aulaId); }catch(e){}
    const clave = 'estudiemos_unido_' + aulaId;
    let yaAvisado = false;
    try{ yaAvisado = localStorage.getItem(clave) === '1'; localStorage.setItem(clave, '1'); }catch(e){}
    if(!yaAvisado && a && a.ownerUid){
      const quien = rolGuardado() === 'familia' ? `${u.displayName || 'Alguien'} (familia de ${a.alumnoNombre})` : (u.displayName || a.alumnoNombre);
      notificar(aulaId, [a.ownerUid], '👋 Se sumó a la app', `${quien} entró a Estudiemos.`, 'index.html', {tipo:'miembro'});
      toast('¡Listo! Ya estás adentro');
    }
    estado.errorUnirse = null;
  }catch(e){
    console.error('No se pudo unir', e);
    estado.errorUnirse = 'Este link ya no está habilitado. Pedile a tu profe que te mande uno nuevo.';
  }
  aulaInvitacion = null;
  history.replaceState(null, '', location.pathname);
}

function escucharMisAulas(){
  const u = usuarioActual();
  const q = query(collection(db, 'aulas'), where('miembros', 'array-contains', u.uid));
  soltar.push(onSnapshot(q, snap=>{
    estado.aulas = snap.docs.map(d=>({id: d.id, ...d.data()}));
    estado.cargando = false;
    let sel = estado.aulaSel;
    if(!sel){ try{ sel = localStorage.getItem(LS_AULA); }catch(e){} }
    if(!estado.aulas.some(a=>a.id===sel)) sel = estado.aulas[0] ? estado.aulas[0].id : null;
    if(sel !== aulaEscuchada) escucharAulaElegida(sel);
    estado.aulaSel = sel;
    render();
  }, e=>{ console.error(e); estado.cargando = false; render(); }));
}

function escucharAulaElegida(aulaId){
  soltarAula.forEach(f=>f()); soltarAula = [];
  aulaEscuchada = aulaId;
  estado.entregas = {}; estado.miResena = null; estado.perfilAlumno = null;
  if(!aulaId) return;
  const u = usuarioActual();
  soltarAula.push(onSnapshot(collection(db, 'aulas', aulaId, 'entregas'), s=>{
    const m = {}; s.docs.forEach(d=>m[d.id] = d.data({serverTimestamps:'estimate'}));
    estado.entregas = m; render();
  }, e=>console.warn(e)));
  soltarAula.push(onSnapshot(doc(db, 'aulas', aulaId, 'resenas', u.uid), s=>{
    estado.miResena = s.exists() ? s.data() : null; if(estado.vista==='yo') render();
  }, e=>console.warn(e)));
  soltarAula.push(onSnapshot(doc(db, 'aulas', aulaId, 'alumno', 'perfil'), s=>{
    estado.perfilAlumno = s.exists() ? s.data() : null; if(estado.vista==='yo') render();
  }, e=>console.warn(e)));
}

function elegirAula(id){
  estado.aulaSel = id;
  try{ localStorage.setItem(LS_AULA, id); }catch(e){}
  escucharAulaElegida(id);
  render();
}

function aula(){ return estado.aulas.find(a=>a.id===estado.aulaSel) || null; }

/* ---------- Render ---------- */

const TITULOS = {inicio:'Inicio', clases:'Clases', tps:'Actividades', yo:'Yo'};

function setHeader(titulo, sub){
  $('headerTitle').textContent = titulo;
  $('headerSub').textContent = sub || '';
  $('headerSub').style.display = sub ? '' : 'none';
}

function render(){
  const a = aula();
  const conAula = !!(estado.usuario && a);
  $('tabs').hidden = !conAula;
  $('notifToggle').hidden = !estado.usuario;
  document.body.style.paddingBottom = conAula ? '' : '32px';
  document.querySelectorAll('main section.view').forEach(s=>s.classList.remove('active'));
  if(!conAula){
    $('selectorAulas').hidden = true;
    setHeader('Estudiemos', '');
    $('view-entrada').classList.add('active');
    renderEntrada();
    return;
  }
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active', b.dataset.view===estado.vista));
  $('view-' + estado.vista).classList.add('active');
  setHeader(TITULOS[estado.vista], a.profeNombre ? `Con ${a.profeNombre}` : '');
  renderSelector();
  ({inicio: renderInicio, clases: renderClases, tps: renderTps, yo: renderYo})[estado.vista]();
  renderCampanita();
  mate($('view-' + estado.vista));
}

function renderEntrada(){
  const cont = $('view-entrada');
  if(estado.cargando){ cont.innerHTML = '<div class="card entrada"><p>Cargando…</p></div>'; return; }
  if(!estado.usuario){
    const invitado = !!aulaInvitacion;
    cont.innerHTML = `
      <div class="card entrada">
        <div class="em-ic">${ic(invitado ? 'send' : 'sparkles')}</div>
        <h2>${invitado ? '¡Tu profe te invitó!' : 'Tus clases, en un solo lugar'}</h2>
        <p>${invitado
          ? 'Entrá con tu cuenta de Google para ver tus clases, los resúmenes, las pizarras, las tareas y las actividades.'
          : 'Acá ves tus clases, los resúmenes, las pizarras, las tareas y las actividades que te carga tu profe. La primera vez se entra con el link que te manda.'}</p>
        ${invitado ? `
          <p class="pregunta">¿Quién sos?</p>
          <button type="button" class="btn primary" data-entrar="alumno">${ic('user')}Soy el/la estudiante</button>
          <button type="button" class="btn outline" data-entrar="familia">${ic('users')}Soy de la familia</button>
        ` : `<button type="button" class="btn primary" data-entrar="">Entrar con Google</button>`}
        <p class="hint" style="margin-top:18px;">¿Sos profe? <a href="index.html" style="color:var(--accent);font-weight:600;">Entrá por acá</a></p>
      </div>`;
    cont.querySelectorAll('[data-entrar]').forEach(b=>b.addEventListener('click', ()=>entrar(b.dataset.entrar)));
    return;
  }
  cont.innerHTML = `
    <div class="card entrada">
      <div class="em-ic">${ic('info')}</div>
      <h2>Todavía no tenés clases acá</h2>
      ${estado.errorUnirse ? `<p style="color:var(--danger);margin-bottom:10px;">${esc(estado.errorUnirse)}</p>` : ''}
      <p>Entraste como <b>${esc(estado.usuario.email || '')}</b>. Para sumarte, abrí con esta cuenta el link que te mandó tu profe (por WhatsApp, por ejemplo).</p>
      <button type="button" class="btn outline" id="btnSalir">${ic('log-out')}Usar otra cuenta</button>
    </div>`;
  $('btnSalir').addEventListener('click', ()=>salir());
}

function renderSelector(){
  const box = $('selectorAulas');
  if(estado.aulas.length < 2){ box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = estado.aulas.map(a=>`
    <button type="button" class="filter-chip ${a.id===estado.aulaSel?'active':''}" data-aula="${a.id}">
      ${esc(a.alumnoNombre)}${a.profeNombre ? ` · ${esc(a.profeNombre)}` : ''}
    </button>`).join('');
  box.querySelectorAll('[data-aula]').forEach(b=>b.addEventListener('click', ()=>elegirAula(b.dataset.aula)));
}

function claseActualOProxima(a){
  const ahora = new Date();
  const enCurso = (a.clases||[]).find(c=>c.horaSalida && inicioClase(c) <= ahora && finClase(c) > ahora);
  if(enCurso) return {c: enCurso, enCurso: true};
  const prox = (a.clases||[]).filter(c=>inicioClase(c) > ahora).sort((x,y)=>inicioClase(x)-inicioClase(y))[0];
  return prox ? {c: prox, enCurso: false} : null;
}

function proximaClaseHtml(a){
  const r = claseActualOProxima(a);
  if(!r) return '';
  const ahora = new Date();
  const acciones = [];
  if(r.c.pizarra) acciones.push(`<a href="${linkSala(r.c.pizarra.codigo)}" target="_blank" rel="noopener">${ic('pen')}Pizarra</a>`);
  if(a.telefonoProfe) acciones.push(`<a href="https://wa.me/${a.telefonoProfe.replace(/\D/g,'')}" target="_blank" rel="noopener">${ic('message')}Escribirle</a>`);
  return `<div class="next-card">
    <div class="next-top">
      <span class="next-eyebrow">${r.enCurso ? '<span class="live"></span>Clase en curso' : ic('clock') + 'Próxima clase'}</span>
      <span class="next-count">${r.enCurso ? 'Termina en ' + duracionCorta(finClase(r.c)-ahora) : 'En ' + duracionCorta(inicioClase(r.c)-ahora)}</span>
    </div>
    <div class="next-main">
      <span class="next-time">${r.c.horaEntrada}</span>
      <div style="min-width:0;">
        <div class="next-name">${fechaCorta(r.c.fecha)}</div>
        <div class="next-when">${fechaLarga(r.c.fecha)}${r.c.horaSalida ? ' · hasta las ' + r.c.horaSalida : ''}</div>
      </div>
    </div>
    ${acciones.length ? `<div class="next-actions">${acciones.join('')}</div>` : ''}
  </div>`;
}
setInterval(()=>{ if(aula() && estado.vista==='inicio' && !$('overlay').classList.contains('show') && $('jugar').hidden) render(); }, 60000);

function renderInicio(){
  const a = aula();
  const nombre = (estado.usuario.displayName || '').split(' ')[0];
  const cuenta = Comun.estadoCuenta(a.clases, new Date());
  const tpsPend = (a.tps||[]).filter(tp=>!estado.entregas[tp.id]);
  const tpsCorr = (a.tps||[]).filter(tp=>{ const e = estado.entregas[tp.id]; return e && e.estado === 'corregida' && !vistaDevolucion(tp.id, e); });
  const tareasPend = (a.tareas||[]).filter(t=>!t.hecha);
  const avisos = (a.avisos||[]).slice().reverse().slice(0, 3);
  const notifs = estado.notifs.slice(0, 5);
  const familia = rolGuardado() === 'familia';

  $('view-inicio').innerHTML = `
    <div class="saludo">Hola${nombre ? ', ' + esc(nombre) : ''}</div>
    <p class="saludo-sub">${familia ? `Las clases de ${esc(a.alumnoNombre)}` : 'Esto es lo que tenés'}${a.profeNombre ? ` con ${esc(a.profeNombre)}` : ''}.</p>

    ${proximaClaseHtml(a)}

    <div class="kpis">
      <button type="button" class="kpi ${tpsPend.length ? 'warn' : ''}" data-ir="tps"><div class="k-label">Actividades</div><div class="k-val">${tpsPend.length}<small> por hacer</small></div></button>
      <button type="button" class="kpi" data-ir="tps"><div class="k-label">Tareas</div><div class="k-val">${tareasPend.length}<small> pendiente${tareasPend.length!==1?'s':''}</small></div></button>
      <button type="button" class="kpi" data-ir="clases"><div class="k-label">Clases</div><div class="k-val">${(a.clases||[]).filter(c=>finClase(c) > new Date()).length}<small> agendadas</small></div></button>
    </div>

    <div class="card">
      <div class="cuenta ${cuenta.alDia ? 'al-dia' : 'debe'}">
        <div class="row-ic ${cuenta.alDia ? 'ok' : ''}">${ic(cuenta.alDia ? 'check' : 'cash')}</div>
        <div class="item-main">
          <div class="c-val">${cuenta.alDia ? 'Al día' : `${cuenta.clasesAdeudadas} clase${cuenta.clasesAdeudadas!==1?'s':''} por abonar`}</div>
          <div class="item-sub">${cuenta.alDia ? 'No hay clases pendientes de pago.' : (a.mostrarMontos ? `Total: <b>${money(cuenta.monto)}</b> · ` : '') + 'El detalle está en Clases.'}</div>
        </div>
      </div>
    </div>

    ${avisos.length ? `<div class="card"><div class="card-head"><h2>Avisos de tu profe</h2></div>${avisos.map(av=>`
      <div class="aviso">${esc(av.texto)}<div class="item-sub">${new Date(av.fecha).toLocaleDateString('es-AR', {day:'numeric', month:'long'})}</div></div>`).join('')}</div>` : ''}

    ${tpsCorr.length ? `<div class="card list"><div class="card-head"><h2>Correcciones nuevas</h2></div>${tpsCorr.map(tp=>`
      <div class="list-item tap" data-tp="${tp.id}">
        <div class="row-ic ok">${ic('check')}</div>
        <div class="item-main"><div class="item-title">${esc(tp.titulo)}</div><div class="item-sub">Tu profe ya la corrigió${estado.entregas[tp.id].nota ? ' · ' + esc(estado.entregas[tp.id].nota) : ''}</div></div>
        ${ic('chevron-right','chev')}
      </div>`).join('')}</div>` : ''}

    <div class="card list">
      <div class="card-head"><h2>Novedades</h2></div>
      ${notifs.length ? notifs.map(n=>`
        <div class="list-item tap notif-item ${n.leida?'':'nueva'}" data-notif="${n.id}">
          <div class="row-ic">${ic(iconoNotif(n))}</div>
          <div class="item-main"><div class="item-title">${esc(n.titulo)}</div><div class="item-sub">${esc(n.cuerpo)} · ${hace(fechaDe(n.creada))}</div></div>
        </div>`).join('') : '<div class="empty-msg" style="padding-bottom:12px;">Acá te avisamos cuando tu profe te carga una actividad, un resumen o una pizarra.</div>'}
      <div id="pushInicio" style="padding-bottom:12px;"></div>
    </div>
  `;
  enganchar($('view-inicio'));
  renderPushBox('pushInicio', true);
}

function iconoNotif(n){
  return ({tp:'file', correccion:'check', aviso:'message', clase:'calendar', pizarra:'pen', resumen:'file'})[n.tipo] || 'bell';
}

function enganchar(cont){
  cont.querySelectorAll('[data-ir]').forEach(b=>b.addEventListener('click', ()=>irA(b.dataset.ir)));
  cont.querySelectorAll('[data-tp]').forEach(b=>b.addEventListener('click', ()=>abrirTp(b.dataset.tp)));
  cont.querySelectorAll('[data-notif]').forEach(b=>b.addEventListener('click', ()=>abrirNotif(b.dataset.notif)));
}

/* Recuerda qué devoluciones ya vio, para destacar las nuevas */
function vistaDevolucion(tpId, e){
  const f = fechaDe(e.corregidaEn);
  try{ return localStorage.getItem('estudiemos_dev_' + estado.aulaSel + '_' + tpId) === String(f ? f.getTime() : ''); }catch(x){ return true; }
}
function marcarDevolucionVista(tpId, e){
  const f = fechaDe(e.corregidaEn);
  try{ localStorage.setItem('estudiemos_dev_' + estado.aulaSel + '_' + tpId, String(f ? f.getTime() : '')); }catch(x){}
}

function renderClases(){
  const a = aula();
  const ahora = new Date();
  const futuras = (a.clases||[]).filter(c=>finClase(c) > ahora).sort((x,y)=>inicioClase(x)-inicioClase(y));
  const pasadas = (a.clases||[]).filter(c=>finClase(c) <= ahora).sort((x,y)=>inicioClase(y)-inicioClase(x));
  const tpsDe = id => (a.tps||[]).filter(tp=>tp.claseId===id);
  const tareasDe = id => (a.tareas||[]).filter(t=>t.claseId===id);
  const item = (c, pasada)=>{
    const extras = [];
    if(c.pizarra) extras.push(`<a class="btn sm outline" href="${linkSala(c.pizarra.codigo)}" target="_blank" rel="noopener">${ic('pen')}Pizarra</a>`);
    tpsDe(c.id).forEach(tp=>extras.push(`<button type="button" class="btn sm outline" data-tp="${tp.id}">${ic('file')}${esc(tp.titulo)}</button>`));
    const tareas = tareasDe(c.id);
    return `<div class="clase-item ${pasada ? 'pasada' : ''}">
      <div class="clase-cab">
        <div>
          <div class="item-title">${fechaCorta(c.fecha)} · ${c.horaEntrada}${c.horaSalida ? '–' + c.horaSalida : ''}</div>
          <div class="item-sub">${fechaLarga(c.fecha)}${a.mostrarMontos && typeof c.monto === 'number' ? ' · ' + money(c.monto) : ''}</div>
        </div>
        ${pasada ? `<span class="badge ${c.pagada ? 'pagada' : 'pendiente'}">${c.pagada ? 'Abonada' : 'Por abonar'}</span>` : ''}
      </div>
      ${c.resumen ? `<div class="clase-resumen"><b>Resumen</b>${esc(c.resumen)}</div>` : ''}
      ${tareas.length ? tareas.map(t=>`<div class="checkbox-line compact ${t.hecha?'done':''}"><span>${t.hecha ? '✓' : '•'} ${esc(t.texto)}</span></div>`).join('') : ''}
      ${extras.length ? `<div class="clase-extras">${extras.join('')}</div>` : ''}
    </div>`;
  };
  $('view-clases').innerHTML = `
    <div class="card list"><div class="card-head"><h2>Próximas</h2></div>${futuras.length ? futuras.map(c=>item(c, false)).join('') : '<div class="empty-msg" style="padding-bottom:12px;">No hay clases agendadas.</div>'}</div>
    <div class="card list"><div class="card-head"><h2>Ya tuvimos</h2></div>${pasadas.length ? pasadas.map(c=>item(c, true)).join('') : '<div class="empty-msg" style="padding-bottom:12px;">Todavía no hay clases pasadas.</div>'}</div>
    ${a.temas && a.temas.length ? `<div class="card"><div class="card-head"><h2>Materias</h2></div><div class="dias-chips">${a.temas.map(t=>`<span class="dia-chip">${esc(t)}</span>`).join('')}</div></div>` : ''}
  `;
  enganchar($('view-clases'));
}

function estadoTpEst(tp){
  const e = estado.entregas[tp.id];
  if(e && e.estado === 'corregida') return {clase:'pagada', texto:'Corregida', orden:3};
  if(e) return {clase:'neutral', texto:'Entregada', orden:2};
  if(tp.fechaEntrega && tp.fechaEntrega < Comun.isoLocal(new Date())) return {clase:'pendiente', texto:'Vencida', orden:0};
  if(borrador(tp.id)) return {clase:'pendiente', texto:'A medias', orden:1};
  return {clase:'pendiente', texto:'Por hacer', orden:1};
}

function renderTps(){
  const a = aula();
  const tps = (a.tps||[]).slice().sort((x,y)=>estadoTpEst(x).orden - estadoTpEst(y).orden || String(y.publicadoEn||'').localeCompare(String(x.publicadoEn||'')));
  const tareas = (a.tareas||[]).slice().sort((x,y)=>x.hecha - y.hecha);
  $('view-tps').innerHTML = `
    <div class="card list">
      <div class="card-head"><h2>Para resolver</h2></div>
      ${tps.length ? tps.map(tp=>{
        const est = estadoTpEst(tp);
        const n = (tp.preguntas||[]).length;
        return `<div class="list-item tap" data-tp="${tp.id}">
          <div class="row-ic">${ic('file')}</div>
          <div class="item-main">
            <div class="item-title">${esc(tp.titulo)}</div>
            <div class="item-sub">${tp.tema ? esc(tp.tema) + ' · ' : ''}${n} pregunta${n!==1?'s':''}${tp.fechaEntrega ? ' · para el ' + fechaCorta(tp.fechaEntrega).toLowerCase() : ''}</div>
          </div>
          <span class="badge ${est.clase}">${est.texto}</span>
        </div>`;
      }).join('') : '<div class="empty-msg" style="padding-bottom:12px;">Tu profe todavía no te cargó actividades.</div>'}
    </div>
    <div class="card">
      <div class="card-head"><h2>Tareas</h2></div>
      ${tareas.length ? tareas.map(t=>`
        <div class="checkbox-line ${t.hecha?'done':''}" style="border-bottom:1px solid var(--border);">
          <span class="row-ic ${t.hecha?'ok':''}" style="width:28px;height:28px;border-radius:9px;">${ic(t.hecha?'check':'list')}</span>
          <div class="item-main"><div class="item-title" style="font-weight:500;">${esc(t.texto)}</div>${t.tema ? `<div class="item-sub">${esc(t.tema)}</div>` : ''}</div>
        </div>`).join('') : '<div class="empty-msg">No tenés tareas cargadas.</div>'}
      <div class="hint">Las tareas las marca como hechas tu profe.</div>
    </div>
  `;
  enganchar($('view-tps'));
}

function renderYo(){
  const a = aula();
  const u = estado.usuario;
  const r = estado.miResena;
  const familia = rolGuardado() === 'familia';
  $('view-yo').innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Tu cuenta</h2></div>
      <p class="ajustes-desc">Entraste como <b>${esc(u.email||'')}</b>.</p>
      <div class="segmented" style="margin:0;">
        <button type="button" class="${!familia?'active':''}" data-rol="alumno">Soy estudiante</button>
        <button type="button" class="${familia?'active':''}" data-rol="familia">Soy de la familia</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Lo que me interesa estudiar</h2></div>
      <p class="ajustes-desc">Contale a tu profe qué te gustaría aprender, repasar o preparar.</p>
      <textarea id="f_intereses" placeholder="Ej: quiero prepararme para el examen de ingreso, me cuestan las fracciones…">${esc(estado.perfilAlumno ? estado.perfilAlumno.intereses : '')}</textarea>
      <button type="button" class="btn secondary" id="btnIntereses">Guardar</button>
    </div>

    <div class="card">
      <div class="card-head"><h2>${r ? 'Tu reseña' : 'Dejale una reseña a tu profe'}</h2></div>
      <div class="estrellas-input" id="estrellasInput">${[1,2,3,4,5].map(n=>`<button type="button" data-n="${n}" class="${r && r.estrellas>=n ? 'on' : ''}" aria-label="${n} estrellas">★</button>`).join('')}</div>
      <textarea id="f_resena" placeholder="¿Cómo son las clases? ¿Qué te gusta?">${esc(r ? r.texto : '')}</textarea>
      <label for="f_autor">Cómo querés que aparezca tu nombre</label>
      <input type="text" id="f_autor" value="${esc(r ? r.autor : (u.displayName||'').split(' ')[0])}" placeholder="Ej: Sofi">
      <label class="switch-row">
        <span>Tu profe la puede compartir<small>En su página de reseñas y en sus redes</small></span>
        <input type="checkbox" class="switch" id="f_publicar" ${!r || r.permitePublicar ? 'checked' : ''}>
      </label>
      <button type="button" class="btn primary" id="btnResena">${r ? 'Actualizar reseña' : 'Enviar reseña'}</button>
    </div>

    <div class="section-label">Notificaciones</div>
    <div id="pushYo"></div>

    <div class="set-group" style="margin-top:20px;">
      <button type="button" class="set-row" id="btnSalirYo" style="color:var(--danger);">
        <div class="row-ic" style="background:var(--danger-bg);color:var(--danger);">${ic('log-out')}</div><div class="item-main">Cerrar sesión</div>
      </button>
    </div>
  `;
  let estrellas = r ? r.estrellas : 0;
  $('estrellasInput').querySelectorAll('button').forEach(b=>b.addEventListener('click', ()=>{
    estrellas = Number(b.dataset.n);
    $('estrellasInput').querySelectorAll('button').forEach(x=>x.classList.toggle('on', Number(x.dataset.n) <= estrellas));
  }));
  $('view-yo').querySelectorAll('[data-rol]').forEach(b=>b.addEventListener('click', ()=>cambiarRol(b.dataset.rol)));
  $('btnIntereses').addEventListener('click', guardarIntereses);
  $('btnResena').addEventListener('click', ()=>enviarResena(estrellas));
  $('btnSalirYo').addEventListener('click', ()=>salir());
  renderPushBox('pushYo', false);
}

async function cambiarRol(rol){
  try{ localStorage.setItem(LS_ROL, rol); }catch(e){}
  const u = usuarioActual();
  const a = aula();
  try{
    await updateDoc(doc(db, 'aulas', a.id), {['miembrosInfo.' + u.uid]: {nombre: (u.displayName||'').slice(0,60), email: (u.email||'').slice(0,100), rol}});
  }catch(e){ console.error(e); }
  render();
}

async function guardarIntereses(){
  const a = aula();
  const texto = $('f_intereses').value.trim().slice(0, 2000);
  try{
    await setDoc(doc(db, 'aulas', a.id, 'alumno', 'perfil'), {intereses: texto, por: usuarioActual().uid, actualizado: serverTimestamp()});
    toast('¡Guardado! Tu profe lo va a ver');
  }catch(e){ console.error(e); toast('No se pudo guardar'); }
}

async function enviarResena(estrellas){
  const a = aula();
  const u = usuarioActual();
  const texto = $('f_resena').value.trim();
  if(!estrellas){ toast('Elegí cuántas estrellas'); return; }
  if(texto.length < 5){ toast('Escribí unas palabras'); return; }
  const nueva = !estado.miResena;
  try{
    await setDoc(doc(db, 'aulas', a.id, 'resenas', u.uid), {
      estrellas, texto: texto.slice(0, 1200), autor: $('f_autor').value.trim().slice(0, 80) || (u.displayName||''),
      rol: rolGuardado(), permitePublicar: $('f_publicar').checked,
      creada: estado.miResena && estado.miResena.creada ? estado.miResena.creada : serverTimestamp(),
      actualizada: serverTimestamp()
    });
    if(nueva) notificar(a.id, [a.ownerUid], '⭐ Nueva reseña', `${'★'.repeat(estrellas)} «${texto.slice(0, 90)}»`, 'index.html', {tipo:'resena'});
    toast(nueva ? '¡Gracias por tu reseña!' : 'Reseña actualizada');
  }catch(e){ console.error(e); toast('No se pudo enviar'); }
}

/* ---------- Notificaciones ---------- */

function renderCampanita(){
  const sinLeer = estado.notifs.filter(n=>!n.leida).length;
  $('notifCount').hidden = sinLeer === 0;
  $('notifCount').textContent = sinLeer > 9 ? '9+' : String(sinLeer);
}
$('notifToggle').addEventListener('click', ()=>{
  abrirSheet(`
    <h3>Notificaciones</h3>
    <div id="pushSheet"></div>
    <div style="margin-top:6px;">
    ${estado.notifs.length ? estado.notifs.map(n=>`
      <div class="list-item tap notif-item ${n.leida?'':'nueva'}" data-notif="${n.id}">
        <div class="row-ic">${ic(iconoNotif(n))}</div>
        <div class="item-main"><div class="item-title">${esc(n.titulo)}</div><div class="item-sub">${esc(n.cuerpo)}</div><div class="item-sub" style="font-size:12px;color:var(--text-mute);">${hace(fechaDe(n.creada))}</div></div>
        <button type="button" class="icon-btn sm" style="color:var(--text-mute);" data-borrar="${n.id}" aria-label="Borrar">${ic('x')}</button>
      </div>`).join('') : '<div class="empty-msg">No tenés notificaciones.</div>'}
    </div>
  `);
  $('sheetContent').querySelectorAll('[data-borrar]').forEach(b=>b.addEventListener('click', ev=>{ ev.stopPropagation(); borrarNotif(b.dataset.borrar); b.closest('.list-item').remove(); }));
  $('sheetContent').querySelectorAll('[data-notif]').forEach(b=>b.addEventListener('click', ()=>{ cerrarSheet(); abrirNotif(b.dataset.notif); }));
  renderPushBox('pushSheet', true);
  const ids = estado.notifs.filter(n=>!n.leida).map(n=>n.id);
  if(ids.length) setTimeout(()=>marcarLeidas(ids), 1200);
});

function abrirNotif(id){
  const n = estado.notifs.find(x=>x.id===id);
  if(!n) return;
  if(!n.leida) marcarLeidas([n.id]);
  if(n.aulaId && n.aulaId !== estado.aulaSel && estado.aulas.some(a=>a.id===n.aulaId)) elegirAula(n.aulaId);
  if(n.tpId && aula() && (aula().tps||[]).some(t=>t.id===n.tpId)){ abrirTp(n.tpId); return; }
  if(n.tipo === 'tp' || n.tipo === 'correccion') irA('tps');
  else if(n.tipo === 'clase' || n.tipo === 'pizarra' || n.tipo === 'resumen') irA('clases');
}

async function renderPushBox(contId, compacto){
  const box = $(contId);
  if(!box) return;
  const disponible = await pushDisponible();
  const permiso = estadoPermisoPush();
  const nota = t => `<div class="note">${ic('info')}<div>${t}</div></div>`;
  if(permiso === 'granted'){ box.innerHTML = compacto ? '' : nota('Las notificaciones de este dispositivo están activadas.'); return; }
  if(!disponible){
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    box.innerHTML = ios ? nota('Para recibir avisos en iPhone, agregá esta página a la pantalla de inicio (Compartir → «Agregar a inicio») y abrila desde ahí.')
      : (compacto ? '' : nota('Este navegador no permite notificaciones push.'));
    return;
  }
  if(permiso === 'denied'){ box.innerHTML = compacto ? '' : nota('Bloqueaste las notificaciones de este sitio. Se habilitan desde los ajustes del navegador.'); return; }
  box.innerHTML = `<button type="button" class="btn ${compacto ? 'outline' : 'primary'}">${ic('bell')}Avisame cuando haya novedades</button>`;
  box.querySelector('button').addEventListener('click', async ()=>{
    try{ await activarPush(alRecibirPush); toast('¡Listo! Te vamos a avisar'); }
    catch(e){ console.error(e); toast(e.message === 'denegado' ? 'No diste permiso' : 'No se pudieron activar'); }
    renderPushBox(contId, compacto);
  });
}

function alRecibirPush(d){ toast(d.titulo || 'Novedad'); }

/* =========================================================
   RESOLVER UNA ACTIVIDAD (estilo efecen: de a una pregunta, con corrección al toque)
   ========================================================= */

const LS_BORRADOR = 'estudiemos_tp_';
function borrador(tpId){
  try{ return JSON.parse(localStorage.getItem(LS_BORRADOR + estado.aulaSel + '_' + tpId) || 'null'); }catch(e){ return null; }
}
function guardarBorrador(tpId, datos){
  try{ localStorage.setItem(LS_BORRADOR + estado.aulaSel + '_' + tpId, JSON.stringify(datos)); }catch(e){}
}
function borrarBorrador(tpId){ try{ localStorage.removeItem(LS_BORRADOR + estado.aulaSel + '_' + tpId); }catch(e){} }

function abrirTp(tpId){
  const a = aula();
  const tp = (a.tps||[]).find(t=>t.id===tpId);
  if(!tp) return;
  const e = estado.entregas[tpId];
  if(e) verEntrega(tp, e);
  else portadaTp(tp);
}

function portadaTp(tp){
  const b = borrador(tp.id);
  const n = (tp.preguntas||[]).length;
  abrirSheet(`
    <h3>${esc(tp.titulo)}</h3>
    <p class="sheet-sub">${tp.tema ? esc(tp.tema) + ' · ' : ''}${n} pregunta${n!==1?'s':''}${tp.fechaEntrega ? ' · para el ' + fechaLarga(tp.fechaEntrega).toLowerCase() : ''}</p>
    ${tp.consigna ? `<div class="tp-consigna">${esc(tp.consigna)}</div>` : ''}
    ${n ? (b ? '<button type="button" class="btn ghost" id="btnReiniciar">' + ic('repeat') + 'Empezar de cero</button>' : '')
        : `<label for="f_soloConsigna">Tu respuesta</label><textarea id="f_soloConsigna" placeholder="Escribí acá…">${esc(b && b.comentario || '')}</textarea>`}
    <div class="sheet-footer">
      ${n ? `<button type="button" class="btn primary" id="btnEmpezar">${b ? 'Seguir donde lo dejé' : 'Empezar'}</button>`
          : '<button type="button" class="btn primary" id="btnEnviarConsigna">Enviar a mi profe</button>'}
    </div>
  `);
  mate($('sheetContent'));
  if(n){
    $('btnEmpezar').addEventListener('click', ()=>{ cerrarSheet(); jugar(tp, b, true); });
    if(b) $('btnReiniciar').addEventListener('click', ()=>{ borrarBorrador(tp.id); cerrarSheet(); jugar(tp, null, true); });
  }else{
    $('btnEnviarConsigna').addEventListener('click', ()=>{
      const t = $('f_soloConsigna').value.trim();
      if(!t){ toast('Escribí tu respuesta'); return; }
      enviarEntrega(tp, {}, t).then(ok=>{ if(ok) cerrarSheet(); });
    });
  }
}

/**
 * Pantalla de juego. paraEntregar=false es "practicar de nuevo" (no se manda nada).
 * Las de opción, V/F y numéricas se corrigen al tocar "Comprobar"; las abiertas no.
 */
function jugar(tp, previo, paraEntregar){
  const pregs = tp.preguntas || [];
  const st = {
    i: previo ? Math.min(previo.i || 0, pregs.length) : 0,
    respuestas: previo ? (previo.respuestas || {}) : {},
    comprobada: false
  };
  const cont = $('jugar');
  cont.hidden = false;
  document.body.classList.add('jugando');

  const salirJuego = ()=>{
    cont.hidden = true; cont.innerHTML = '';
    document.body.classList.remove('jugando');
    render();
  };
  const guardar = ()=>{ if(paraEntregar) guardarBorrador(tp.id, {i: st.i, respuestas: st.respuestas}); };

  const pintar = ()=>{
    if(st.i >= pregs.length){ final(); return; }
    const p = pregs[st.i];
    const r = st.respuestas[p.id];
    const progreso = Math.round(st.i / pregs.length * 100);
    let cuerpo;
    if(p.tipo === 'opcion'){
      cuerpo = `<div class="opciones">${p.opciones.map((o, k)=>`<button type="button" class="opcion ${String(r)===String(k)?'sel':''}" data-k="${k}">${esc(o)}</button>`).join('')}</div>`;
    }else if(p.tipo === 'vf'){
      cuerpo = `<div class="opciones vf">
        <button type="button" class="opcion ${r===true?'sel':''}" data-v="true">Verdadero</button>
        <button type="button" class="opcion ${r===false?'sel':''}" data-v="false">Falso</button></div>`;
    }else if(p.tipo === 'numero'){
      cuerpo = `<input type="text" inputmode="decimal" class="resp-num" id="respNum" value="${esc(r ?? '')}" placeholder="Tu respuesta" autocomplete="off">`;
    }else{
      cuerpo = `<textarea class="resp-texto" id="respTexto" placeholder="Escribí tu respuesta…">${esc(r ?? '')}</textarea>
        <div class="hint">Esta la corrige tu profe.</div>`;
    }
    cont.innerHTML = `
      <div class="jugar-top">
        <button type="button" class="icon-btn filled" id="jugarCerrar" aria-label="Salir">${ic('x')}</button>
        <div class="barra"><div style="width:${progreso}%"></div></div>
        <span class="jugar-num">${st.i+1}/${pregs.length}</span>
      </div>
      <div class="jugar-cuerpo">
        <div class="jugar-tipo">${({opcion:'Elegí la correcta', vf:'¿Verdadero o falso?', numero:'Escribí el resultado', texto:'Respondé con tus palabras'})[p.tipo]}</div>
        <div class="jugar-enunciado">${esc(p.enunciado)}</div>
        ${cuerpo}
      </div>
      <div class="jugar-pie" id="jugarPie">
        ${st.i > 0 ? '<button type="button" class="btn secondary" id="jugarAtras" style="flex:0 0 auto;">Atrás</button>' : ''}
        <button type="button" class="btn primary" id="jugarSeguir">${p.tipo==='texto' ? 'Siguiente' : 'Comprobar'}</button>
      </div>`;
    mate(cont);
    st.comprobada = false;
    $('jugarCerrar').addEventListener('click', ()=>{ guardar(); salirJuego(); if(paraEntregar && Object.keys(st.respuestas).length) toast('Guardamos lo que hiciste'); });
    if($('jugarAtras')) $('jugarAtras').addEventListener('click', ()=>{ st.i--; guardar(); pintar(); });
    cont.querySelectorAll('.opcion').forEach(b=>b.addEventListener('click', ()=>{
      if(st.comprobada) return;
      st.respuestas[p.id] = b.dataset.k !== undefined ? Number(b.dataset.k) : b.dataset.v === 'true';
      cont.querySelectorAll('.opcion').forEach(x=>x.classList.toggle('sel', x === b));
    }));
    const num = $('respNum'), txt = $('respTexto');
    if(num){ num.addEventListener('input', ()=>{ st.respuestas[p.id] = num.value.trim(); }); num.addEventListener('keydown', e=>{ if(e.key==='Enter') $('jugarSeguir').click(); }); setTimeout(()=>num.focus(), 50); }
    if(txt) txt.addEventListener('input', ()=>{ st.respuestas[p.id] = txt.value; });
    $('jugarSeguir').addEventListener('click', ()=>{
      const resp = st.respuestas[p.id];
      if(p.tipo === 'texto'){ st.i++; guardar(); pintar(); return; }
      if(resp === undefined || resp === ''){ toast('Elegí o escribí una respuesta'); return; }
      st.comprobada = true;
      const ok = Comun.corregir(p, resp);
      cont.querySelectorAll('.opcion').forEach(b=>{
        const val = b.dataset.k !== undefined ? Number(b.dataset.k) : b.dataset.v === 'true';
        if(val === p.correcta) b.classList.add('correcta');
        else if(b.classList.contains('sel')) b.classList.add('incorrecta');
      });
      const correcta = p.tipo === 'opcion' ? p.opciones[p.correcta] : p.tipo === 'vf' ? (p.correcta ? 'Verdadero' : 'Falso') : String(p.correcta);
      $('jugarPie').innerHTML = `
        <div class="feedback ${ok ? 'bien' : 'mal'}">
          <div class="f-tit">${ok ? frase(FRASES_BIEN) : frase(FRASES_MAL)}</div>
          ${ok ? '' : `<div>La respuesta era: <b>${esc(correcta)}</b></div>`}
        </div>
        <button type="button" class="btn primary" id="jugarSeguir2">Continuar</button>`;
      mate($('jugarPie'));
      if(ok) chispas();
      guardar();
      $('jugarSeguir2').addEventListener('click', ()=>{ st.i++; guardar(); pintar(); });
    });
  };

  const final = ()=>{
    const pt = Comun.puntaje(pregs, st.respuestas);
    const sinResponder = pregs.filter(p=>st.respuestas[p.id] === undefined || st.respuestas[p.id] === '').length;
    const pct = pt.total ? pt.ok / pt.total : 1;
    cont.innerHTML = `
      <div class="jugar-top">
        <button type="button" class="icon-btn filled" id="jugarCerrar" aria-label="Salir">${ic('x')}</button>
        <div class="barra"><div style="width:100%"></div></div>
      </div>
      <div class="jugar-cuerpo final">
        <div class="final-ic">${ic(pct >= .5 ? 'check' : 'sparkles')}</div>
        <div class="jugar-enunciado" style="margin-bottom:6px;">${pct >= .8 ? '¡Muy bien!' : pct >= .5 ? '¡Bien ahí!' : '¡Terminaste!'}</div>
        ${pt.total ? `<div class="final-puntaje">${pt.ok} de ${pt.total} bien</div>` : ''}
        ${pt.abiertas ? `<p class="hint">${pt.abiertas} pregunta${pt.abiertas!==1?'s las corrige':' la corrige'} tu profe.</p>` : ''}
        ${sinResponder ? `<p class="hint" style="color:var(--warn);">Te quedaron ${sinResponder} sin responder.</p>` : ''}
        ${paraEntregar ? `
          <label for="f_comentario">¿Querés dejarle un comentario a tu profe? (opcional)</label>
          <textarea id="f_comentario" placeholder="Ej: la 3 no la entendí">${esc(previo && previo.comentario || '')}</textarea>` : '<p class="hint">Fue una práctica: no se mandó nada.</p>'}
      </div>
      <div class="jugar-pie">
        <button type="button" class="btn secondary" id="jugarRevisar">Revisar</button>
        ${paraEntregar ? '<button type="button" class="btn primary" id="jugarEnviar">Enviar a mi profe</button>' : '<button type="button" class="btn primary" id="jugarListo">Listo</button>'}
      </div>`;
    if(pct >= .8) chispas(true);
    $('jugarCerrar').addEventListener('click', ()=>{ guardar(); salirJuego(); });
    $('jugarRevisar').addEventListener('click', ()=>{ st.i = 0; pintar(); });
    if(paraEntregar){
      $('jugarEnviar').addEventListener('click', async ()=>{
        const btn = $('jugarEnviar');
        btn.disabled = true;
        const ok = await enviarEntrega(tp, st.respuestas, $('f_comentario').value.trim());
        if(ok){ borrarBorrador(tp.id); salirJuego(); }
        else btn.disabled = false;
      });
    }else{
      $('jugarListo').addEventListener('click', salirJuego);
    }
  };

  pintar();
}

const FRASES_BIEN = ['¡Bien!', '¡Excelente!', '¡Eso!', '¡Correcto!', '¡Perfecto!'];
const FRASES_MAL = ['Casi…', 'Uy, no era esa', 'No pasa nada', 'Esta no'];
const frase = l => l[Math.floor(Math.random() * l.length)];

function chispas(muchas){
  const n = muchas ? 36 : 12;
  for(let k = 0; k < n; k++){
    const s = document.createElement('span');
    s.className = 'chispa';
    s.textContent = ['✨','⭐','🎉','💛'][k % 4];
    s.style.left = (10 + Math.random()*80) + 'vw';
    s.style.animationDelay = (Math.random()*0.3) + 's';
    s.style.fontSize = (14 + Math.random()*16) + 'px';
    document.body.appendChild(s);
    setTimeout(()=>s.remove(), 1600);
  }
}

async function enviarEntrega(tp, respuestas, comentario){
  const a = aula();
  const u = usuarioActual();
  const limpias = {};
  Object.entries(respuestas || {}).forEach(([k, v])=>{
    if(v === undefined || v === '') return;
    limpias[k] = typeof v === 'string' ? v.slice(0, 3000) : v;
  });
  try{
    await setDoc(doc(db, 'aulas', a.id, 'entregas', tp.id), {
      respuestas: limpias, puntaje: Comun.puntaje(tp.preguntas, limpias), comentario: (comentario || '').slice(0, 1500),
      estado: 'enviada', enviadaEn: serverTimestamp(), por: u.uid, porNombre: (u.displayName || '').slice(0, 60)
    }, {merge: true});
    const pt = Comun.puntaje(tp.preguntas, limpias);
    notificar(a.id, [a.ownerUid], '📥 Entregó una actividad', `${a.alumnoNombre} entregó "${tp.titulo}"${pt.total ? ` · ${pt.ok}/${pt.total} bien` : ''}.`, 'index.html', {tipo:'entrega', tpId: tp.id});
    toast('¡Enviada a tu profe!');
    return true;
  }catch(e){
    console.error(e);
    toast('No se pudo enviar. Probá de nuevo.');
    return false;
  }
}

function verEntrega(tp, e){
  const r = e.respuestas || {};
  const pt = Comun.puntaje(tp.preguntas, r);
  if(e.estado === 'corregida') marcarDevolucionVista(tp.id, e);
  abrirSheet(`
    <h3>${esc(tp.titulo)}</h3>
    <p class="sheet-sub"><span class="badge ${e.estado==='corregida' ? 'pagada' : 'neutral'}">${e.estado==='corregida' ? 'Corregida' : 'Entregada'}</span>${pt.total ? ` · ${pt.ok}/${pt.total} bien` : ''}${e.estado!=='corregida' ? ' · falta que la corrija tu profe' : ''}</p>
    ${e.estado==='corregida' && (e.nota || e.devolucion) ? `<div class="devolucion">
      ${e.nota ? `<div class="nota">${esc(e.nota)}</div>` : ''}
      ${e.devolucion ? esc(e.devolucion) : ''}
    </div>` : ''}
    ${(tp.preguntas||[]).map((p, i)=>{
      const ok = Comun.corregir(p, r[p.id]);
      const resp = r[p.id] === undefined ? '<i class="hint">Sin responder</i>'
        : p.tipo === 'opcion' ? esc(p.opciones[r[p.id]] ?? '') : p.tipo === 'vf' ? (r[p.id] ? 'Verdadero' : 'Falso') : esc(r[p.id]);
      return `<div class="entrega-preg ${p.tipo==='texto'?'abierta':ok?'bien':'mal'}">
        <div class="enunciado">${i+1}. ${esc(p.enunciado)}</div>
        <div class="resp">${ic(p.tipo==='texto' ? 'edit' : ok ? 'check' : 'x')}<span>${resp}</span></div>
      </div>`;
    }).join('')}
    ${e.comentario ? `<div class="note">${ic('message')}<div><b>Tu comentario:</b> ${esc(e.comentario)}</div></div>` : ''}
    <div class="sheet-footer">
      ${(tp.preguntas||[]).length ? `<button type="button" class="btn outline grow" id="btnPracticar">${ic('repeat')}Practicar</button>` : ''}
      ${e.estado !== 'corregida' ? `<button type="button" class="btn outline grow" id="btnRehacer">${ic('edit')}Cambiar</button>` : ''}
    </div>
  `);
  mate($('sheetContent'));
  if($('btnPracticar')) $('btnPracticar').addEventListener('click', ()=>{ cerrarSheet(); jugar(tp, null, false); });
  if($('btnRehacer')) $('btnRehacer').addEventListener('click', ()=>{
    cerrarSheet();
    if((tp.preguntas||[]).length) jugar(tp, {i: 0, respuestas: r, comentario: e.comentario}, true);
    else{ guardarBorrador(tp.id, {comentario: e.comentario}); portadaTp(tp); }
  });
  render();
}

render();
