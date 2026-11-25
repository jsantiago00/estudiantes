/* =========================================================
   Estudiemos: el chat entre un estudiante y un profe (lo usan app.html y estudiante.html).

   chats/{c_<profeUid>_<estUid>}   {profeUid, estUid, miembros, nombres, fotos, ultimo, leido, bloqueadoPor}
     mensajes/{id}                {de, tipo: 'texto'|'foto'|'reserva'|'sistema', texto, foto, reserva, en}

   Una reserva es un mensaje: el estudiante pide un horario libre del profe
   ({fecha, hora, duracion, semanal, estado: 'pendiente'}); el profe la acepta (y se agenda
   en su app) o la rechaza. Las fotos van achicadas (sin Storage), como en las entregas.
   La pantalla del chat ocupa toda la pantalla y se abre encima de lo que haya.
   ========================================================= */
import {
  db, usuarioActual, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, notificarChat, fechaDe
} from './firebase.js';

const P = window.Plataforma;
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ICONS = {
  'chevron-left':'<path d="m15 18-6-6 6-6"/>',
  send:'<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5Z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  calendar:'<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-4 3.7-6 7.5-6s6.7 2 7.5 6"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function fechaLinda(iso){
  const f = new Date(iso + 'T12:00:00');
  return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}
function horaDe(ts){ const f = fechaDe(ts); return f ? f.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'}) : ''; }
function diaDe(ts){ const f = fechaDe(ts); return f ? f.toLocaleDateString('es-AR', {weekday: 'long', day: 'numeric', month: 'long'}) : ''; }

/* ---------- Datos ---------- */

export function chatRef(chatId){ return doc(db, 'chats', chatId); }

/** Mis conversaciones, las más recientes primero. */
export function escucharMisChats(cb){
  const u = usuarioActual();
  if(!u) return ()=>{};
  return onSnapshot(query(collection(db, 'chats'), where('miembros', 'array-contains', u.uid)), s=>{
    const lista = s.docs.map(d=>({id: d.id, ...d.data({serverTimestamps: 'estimate'})}));
    lista.sort((a, b)=>ms(b.ultimo && b.ultimo.en) - ms(a.ultimo && a.ultimo.en));
    cb(lista);
  }, e=>console.warn('Chats', e.code || e));
}
function ms(ts){ const f = fechaDe(ts); return f ? f.getTime() : 0; }

export function sinLeer(chat, uid){
  const u = chat.ultimo;
  if(!u || u.de === uid) return false;
  return ms(u.en) > ms((chat.leido || {})[uid]);
}

/** Abre (o crea) el chat de un estudiante con un profe. Devuelve el id. */
export async function asegurarChat(profeUid, estUid, nombres, fotos){
  const id = P.chatId(profeUid, estUid);
  const ref = chatRef(id);
  const s = await getDoc(ref).catch(()=>null);
  if(s && s.exists()) return id;
  await setDoc(ref, {
    profeUid, estUid, miembros: [profeUid, estUid],
    nombres: {[profeUid]: String(nombres.profe || '').slice(0, 60), [estUid]: String(nombres.est || '').slice(0, 60)},
    fotos: {[profeUid]: String((fotos && fotos.profe) || '').slice(0, 500), [estUid]: String((fotos && fotos.est) || '').slice(0, 500)},
    leido: {}, ultimo: null, bloqueadoPor: null, creado: serverTimestamp()
  });
  return id;
}

/** Manda un mensaje. datos: {tipo, texto, foto, reserva}. Actualiza el último y avisa al otro. */
export async function enviar(chat, datos){
  const u = usuarioActual();
  const msg = {de: u.uid, tipo: datos.tipo || 'texto', texto: String(datos.texto || '').slice(0, 2000), en: serverTimestamp()};
  if(datos.foto) msg.foto = datos.foto;
  if(datos.reserva) msg.reserva = datos.reserva;
  const ref = doc(collection(db, 'chats', chat.id, 'mensajes'));
  await setDoc(ref, msg);
  const resumen = msg.tipo === 'foto' ? '📷 Foto' : msg.tipo === 'reserva' ? '📅 Pidió un horario' : msg.texto;
  await updateDoc(chatRef(chat.id), {ultimo: {texto: resumen.slice(0, 140), de: u.uid, en: serverTimestamp()}, ['leido.' + u.uid]: serverTimestamp()});
  const otro = (chat.miembros || []).find(x=>x !== u.uid);
  const url = otro === chat.profeUid ? 'app.html?chat=' + chat.id : 'estudiante.html?chat=' + chat.id;
  notificarChat(chat.id, otro, '💬 ' + ((chat.nombres || {})[u.uid] || u.displayName || 'Mensaje nuevo'), resumen.slice(0, 200), url, {tipo: msg.tipo === 'reserva' ? 'reserva' : 'chat'});
  return ref.id;
}

export function marcarLeido(chatId){
  const u = usuarioActual();
  if(!u) return;
  updateDoc(chatRef(chatId), {['leido.' + u.uid]: serverTimestamp()}).catch(()=>{});
}

/** El profe acepta o rechaza; el estudiante puede cancelar la suya mientras está pendiente. */
export function responderReserva(chatId, msgId, reserva, estado){
  return updateDoc(doc(db, 'chats', chatId, 'mensajes', msgId), {reserva: {...reserva, estado}});
}

export function bloquear(chatId, si){
  const u = usuarioActual();
  return updateDoc(chatRef(chatId), {bloqueadoPor: si ? u.uid : null});
}

/** Achica una foto (lado mayor 1280 px, JPEG, menos de ~250 KB) para guardarla sin Storage. */
export async function comprimirFoto(file){
  const url = URL.createObjectURL(file);
  try{
    const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = rej; i.src = url; });
    let lado = 1280, calidad = 0.75, out = '';
    for(let intento = 0; intento < 6; intento++){
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      out = c.toDataURL('image/jpeg', calidad);
      if(out.length <= 250000) return out;
      lado = Math.round(lado * 0.8); calidad = Math.max(0.5, calidad - 0.08);
    }
    if(out.length > 300000) throw new Error('foto-grande');
    return out;
  }finally{ URL.revokeObjectURL(url); }
}

/* ---------- Pantalla del chat ---------- */

let abierta = null;   // {chatId, soltar}

export function chatAbierto(){ return abierta ? abierta.chatId : null; }

/**
 * Abre la pantalla de un chat.
 * opciones: {rol: 'profe'|'estudiante', menu: [{id, texto, peligro}], onMenu(id, chat),
 *            onReserva(accion, msg, chat)  (accion: 'aceptar'|'rechazar'|'cancelar'),
 *            botonExtra: {texto, onClick(chat)}, alCerrar()}
 */
export function abrirPantalla(chatId, opciones){
  cerrarPantalla();
  const o = opciones || {};
  const u = usuarioActual();
  let el = document.getElementById('chatPantalla');
  if(!el){
    el = document.createElement('div');
    el.id = 'chatPantalla';
    el.className = 'chat-pantalla';
    document.body.appendChild(el);
  }
  el.hidden = false;
  document.body.style.overflow = 'hidden';
  el.innerHTML = `
    <div class="chat-top">
      <button type="button" class="icon-btn" data-ch="volver" aria-label="Volver">${ic('chevron-left')}</button>
      <div class="chat-quien"><span class="chat-avatar" id="chAvatar"></span><div><b id="chNombre">…</b><small id="chSub"></small></div></div>
      ${o.botonExtra ? `<button type="button" class="btn sm outline" data-ch="extra">${ic('calendar')}<span>${esc(o.botonExtra.texto)}</span></button>` : ''}
      ${(o.menu || []).length ? `<button type="button" class="icon-btn" data-ch="menu" aria-label="Más opciones">${ic('more')}</button>` : ''}
    </div>
    <div class="chat-menu" id="chMenu" hidden>${(o.menu || []).map(m=>`<button type="button" data-menu="${esc(m.id)}" class="${m.peligro ? 'peligro' : ''}">${esc(m.texto)}</button>`).join('')}</div>
    <div class="chat-msgs" id="chMsgs"><div class="chat-vacio">Cargando…</div></div>
    <div class="chat-bloqueado" id="chBloq" hidden></div>
    <form class="chat-escribir" id="chForm">
      <label class="icon-btn" aria-label="Mandar una foto">${ic('image')}<input type="file" accept="image/*" id="chFoto" hidden></label>
      <textarea id="chTexto" rows="1" placeholder="Escribí un mensaje" maxlength="2000"></textarea>
      <button type="submit" class="icon-btn filled enviar" aria-label="Enviar">${ic('send')}</button>
    </form>`;
  let chat = null, mensajes = [];
  const $ = id => el.querySelector('#' + id);

  const pintarCab = ()=>{
    if(!chat) return;
    const otro = (chat.miembros || []).find(x=>x !== u.uid);
    const nombre = (chat.nombres || {})[otro] || 'Chat';
    const foto = (chat.fotos || {})[otro];
    $('chNombre').textContent = nombre;
    $('chSub').textContent = otro === chat.profeUid ? 'Profe' : 'Estudiante';
    $('chAvatar').innerHTML = foto ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : esc(nombre.slice(0, 1).toUpperCase());
    const bloq = chat.bloqueadoPor;
    $('chBloq').hidden = !bloq;
    $('chBloq').textContent = bloq === u.uid ? 'Bloqueaste este chat. Desbloquealo desde el menú para volver a escribir.' : bloq ? 'Este chat está cerrado.' : '';
    $('chForm').hidden = !!bloq;
  };

  const pintarMsgs = ()=>{
    const box = $('chMsgs');
    const abajo = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if(!mensajes.length){
      box.innerHTML = `<div class="chat-vacio">${o.rol === 'estudiante' ? 'Contale qué necesitás: la materia, el nivel, y cuándo podrías.' : 'Todavía no hay mensajes.'}</div>`;
      return;
    }
    let dia = '', html = '';
    mensajes.forEach(m=>{
      const d = diaDe(m.en);
      if(d && d !== dia){ dia = d; html += `<div class="chat-dia">${esc(d)}</div>`; }
      const mio = m.de === u.uid;
      if(m.tipo === 'sistema'){ html += `<div class="chat-sistema">${esc(m.texto)}</div>`; return; }
      if(m.tipo === 'reserva' && m.reserva){ html += reservaHtml(m, mio); return; }
      html += `<div class="burbuja ${mio ? 'mia' : ''}">
        ${m.foto && /^data:image\//.test(m.foto) ? `<img src="${m.foto}" alt="Foto" class="chat-foto">` : ''}
        ${m.texto ? `<div class="txt">${linkificar(esc(m.texto))}</div>` : ''}
        <span class="hora">${horaDe(m.en)}</span>
      </div>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-res]').forEach(b=>b.addEventListener('click', ()=>{
      const m = mensajes.find(x=>x.id === b.dataset.msg);
      if(m && o.onReserva) o.onReserva(b.dataset.res, m, chat);
    }));
    box.querySelectorAll('.chat-foto').forEach(img=>img.addEventListener('click', ()=>{
      const w = window.open('', '_blank');
      if(w && w.document) w.document.write(`<title>Foto</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${img.src}" style="max-width:100%;max-height:100vh">`);
    }));
    if(abajo || box.dataset.primera !== '1'){ box.scrollTop = box.scrollHeight; box.dataset.primera = '1'; }
  };

  const reservaHtml = (m, mio)=>{
    const r = m.reserva;
    const est = {pendiente: 'Esperando respuesta', aceptada: 'Confirmada', rechazada: 'No se pudo', cancelada: 'Cancelada'}[r.estado] || r.estado;
    let botones = '';
    if(r.estado === 'pendiente'){
      if(o.rol === 'profe') botones = `<button type="button" class="btn sm primary" data-res="aceptar" data-msg="${m.id}">${ic('check')}Aceptar</button><button type="button" class="btn sm outline" data-res="rechazar" data-msg="${m.id}">No puedo</button>`;
      else if(mio) botones = `<button type="button" class="btn sm outline" data-res="cancelar" data-msg="${m.id}">Cancelar el pedido</button>`;
    }
    return `<div class="chat-reserva ${mio ? 'mia' : ''} ${esc(r.estado)}">
      <div class="r-tit">${ic('calendar')}${r.recupero ? 'Recuperar una clase' : r.semanal ? 'Clase todas las semanas' : 'Clase'}</div>
      <div class="r-cuando">${esc(r.semanal ? 'Los ' + DIAS[new Date(r.fecha + 'T12:00:00').getDay()] + ' a las ' + r.hora + ', desde el ' + fechaLinda(r.fecha) : fechaLinda(r.fecha) + ' a las ' + r.hora)}</div>
      <div class="r-est">${esc(est)}${r.duracion ? ' · ' + r.duracion + ' min' : ''}</div>
      ${r.nota ? `<div class="r-nota">${esc(r.nota)}</div>` : ''}
      ${botones ? `<div class="r-botones">${botones}</div>` : ''}
      <span class="hora">${horaDe(m.en)}</span>
    </div>`;
  };

  const soltarChat = onSnapshot(chatRef(chatId), s=>{
    if(!s.exists()) return;
    chat = {id: chatId, ...s.data({serverTimestamps: 'estimate'})};
    pintarCab();
  }, e=>console.warn(e));
  const soltarMsgs = onSnapshot(query(collection(db, 'chats', chatId, 'mensajes'), orderBy('en', 'desc'), limit(200)), s=>{
    mensajes = s.docs.map(d=>({id: d.id, ...d.data({serverTimestamps: 'estimate'})})).sort((a, b)=>ms(a.en) - ms(b.en));
    pintarMsgs();
    if(!document.hidden) marcarLeido(chatId);
  }, e=>{ console.warn(e); $('chMsgs').innerHTML = '<div class="chat-vacio">No se pudo abrir el chat.</div>'; });
  abierta = {chatId, soltar: ()=>{ soltarChat(); soltarMsgs(); }, alCerrar: o.alCerrar};
  marcarLeido(chatId);

  el.querySelector('[data-ch="volver"]').addEventListener('click', cerrarPantalla);
  const bExtra = el.querySelector('[data-ch="extra"]');
  if(bExtra) bExtra.addEventListener('click', ()=>chat && o.botonExtra.onClick(chat));
  const bMenu = el.querySelector('[data-ch="menu"]');
  if(bMenu) bMenu.addEventListener('click', ()=>{ $('chMenu').hidden = !$('chMenu').hidden; });
  el.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click', ()=>{ $('chMenu').hidden = true; if(chat && o.onMenu) o.onMenu(b.dataset.menu, chat); }));

  const ta = $('chTexto');
  ta.addEventListener('input', ()=>{ ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', e=>{ if(e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches){ e.preventDefault(); $('chForm').requestSubmit(); } });
  $('chForm').addEventListener('submit', async e=>{
    e.preventDefault();
    const texto = ta.value.trim();
    if(!texto || !chat) return;
    ta.value = ''; ta.style.height = 'auto';
    try{ await enviar(chat, {tipo: 'texto', texto}); }
    catch(err){ console.error(err); ta.value = texto; aviso('No se pudo mandar'); }
  });
  $('chFoto').addEventListener('change', async ev=>{
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if(!f || !chat) return;
    try{ await enviar(chat, {tipo: 'foto', foto: await comprimirFoto(f), texto: ta.value.trim()}); ta.value = ''; }
    catch(err){ console.error(err); aviso('No se pudo mandar la foto'); }
  });
  setTimeout(()=>ta.focus(), 100);
}

export function cerrarPantalla(){
  if(!abierta) return;
  const a = abierta;
  abierta = null;
  a.soltar();
  const el = document.getElementById('chatPantalla');
  if(el){ el.hidden = true; el.innerHTML = ''; }
  document.body.style.overflow = '';
  if(a.alCerrar) a.alCerrar();
}

function aviso(t){ if(window.showToast) window.showToast(t); else { const x = document.getElementById('toast'); if(x){ x.textContent = t; x.classList.add('show'); setTimeout(()=>x.classList.remove('show'), 2200); } } }

function linkificar(html){
  return html.replace(/\bhttps?:\/\/[^\s<]+/g, u=>`<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

/** Item de la lista de conversaciones. */
export function itemChatHtml(chat, uid){
  const otro = (chat.miembros || []).find(x=>x !== uid);
  const nombre = (chat.nombres || {})[otro] || 'Chat';
  const foto = (chat.fotos || {})[otro];
  const nuevo = sinLeer(chat, uid);
  return `<div class="list-item tap chat-item ${nuevo ? 'nuevo' : ''}" data-chat="${esc(chat.id)}">
    <span class="chat-avatar">${foto ? `<img src="${esc(foto)}" alt="" referrerpolicy="no-referrer">` : esc(nombre.slice(0, 1).toUpperCase())}</span>
    <div class="item-main"><div class="item-title">${esc(nombre)}</div><div class="item-sub">${esc(chat.ultimo ? (chat.ultimo.de === uid ? 'Vos: ' : '') + chat.ultimo.texto : 'Sin mensajes todavía')}</div></div>
    ${nuevo ? '<span class="punto-nuevo" aria-label="Sin leer"></span>' : `<span class="item-sub" style="font-size:12px;">${chat.ultimo ? horaDe(chat.ultimo.en) : ''}</span>`}
  </div>`;
}
