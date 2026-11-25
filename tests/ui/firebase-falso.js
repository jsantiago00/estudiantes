/* Reemplazo de js/firebase.js para los tests de interfaz (tests/ui/ui.test.mjs):
   misma API, pero con una "base" en memoria y un usuario fijo, sin red.
   El estado inicial viene de window.__FALSO = {usuario, docs: {ruta: datos}}. */

const F = window.__FALSO || {usuario: null, docs: {}};
const docs = new Map(Object.entries(F.docs || {}));
const oyentes = new Set();
window.__docs = docs;
window.__escrituras = [];

export const firebaseConfig = {projectId: 'falso'};
export const PIZARRA_URL = 'https://pizarra.test';
export const app = {}; export const auth = {get currentUser(){ return usuario; }}; export const db = {};

let usuario = F.usuario ? {...F.usuario, isAnonymous: false} : null;
const cbSesion = [];
export function usuarioActual(){ return usuario; }
export function alCambiarSesion(cb){ cbSesion.push(cb); setTimeout(()=>cb(usuario), 0); return ()=>{}; }
export async function entrarConGoogle(){ usuario = {uid: 'nuevo', displayName: 'Nueva Persona', email: 'nueva@x.com', isAnonymous: false}; cbSesion.forEach(cb=>cb(usuario)); }
export async function salir(){ usuario = null; cbSesion.forEach(cb=>cb(null)); }

const TS = ()=>({__ts: Date.now()});
export const serverTimestamp = ()=>({__op: 'ts'});
export const arrayUnion = (...v)=>({__op: 'union', v});
export const arrayRemove = (...v)=>({__op: 'remove', v});
export const deleteField = ()=>({__op: 'del'});

export function doc(_db, ...segs){
  if(_db && _db.__col) return {path: _db.path + '/' + (segs[0] || Math.random().toString(36).slice(2, 12)), id: segs[0]};
  const path = segs.join('/');
  return {path, id: segs[segs.length - 1]};
}
export function collection(_db, ...segs){ return {path: segs.join('/'), __col: true}; }
export const where = (campo, op, valor)=>({campo, op, valor});
export const orderBy = ()=>null; export const limit = ()=>null;
export function query(col, ...filtros){ return {path: col.path, __col: true, filtros: filtros.filter(Boolean)}; }

function aplicar(valor, previo){
  if(valor && valor.__op === 'ts') return TS();
  if(valor && valor.__op === 'union') return [...(previo || []), ...valor.v.filter(x=>!(previo || []).includes(x))];
  if(valor && valor.__op === 'remove') return (previo || []).filter(x=>!valor.v.includes(x));
  return valor;
}
function escribir(path, datos, merge){
  const prev = docs.get(path);
  const base = merge && prev ? structuredClone(prev) : {};
  for(const [k, v] of Object.entries(datos)){
    const partes = k.split('.');
    let o = base;
    for(let i = 0; i < partes.length - 1; i++){ o[partes[i]] = o[partes[i]] || {}; o = o[partes[i]]; }
    const ult = partes[partes.length - 1];
    if(v && v.__op === 'del') delete o[ult];
    else o[ult] = aplicar(v, o[ult]);
  }
  docs.set(path, base);
  window.__escrituras.push({path, datos});
  avisar();
}
export async function setDoc(ref, datos, opts){ escribir(ref.path, datos, opts && opts.merge); }
export async function updateDoc(ref, datos){
  if(!docs.has(ref.path)){ const e = new Error('no existe'); e.code = 'not-found'; throw e; }
  escribir(ref.path, datos, true);
}
export async function deleteDoc(ref){ docs.delete(ref.path); window.__escrituras.push({path: ref.path, borrado: true}); avisar(); }
export async function addDoc(col, datos){ const r = doc(col); escribir(r.path, datos, false); return r; }
export function writeBatch(){
  const ops = [];
  return {
    set: (ref, d, o)=>ops.push(()=>escribir(ref.path, d, o && o.merge)),
    update: (ref, d)=>ops.push(()=>escribir(ref.path, d, true)),
    delete: ref=>ops.push(()=>{ docs.delete(ref.path); }),
    commit: async ()=>{ ops.forEach(f=>f()); }
  };
}

function snapDoc(path){
  const d = docs.get(path);
  return {id: path.split('/').pop(), exists: ()=>d !== undefined, data: ()=>d && structuredClone(d)};
}
function snapCol(q){
  const prof = q.path.split('/').length + 1;
  const lista = [...docs.keys()].filter(p=>p.startsWith(q.path + '/') && p.split('/').length === prof)
    .filter(p=>(q.filtros || []).every(f=>{
      const v = docs.get(p)[f.campo];
      if(f.op === '==') return v === f.valor;
      if(f.op === 'array-contains') return Array.isArray(v) && v.includes(f.valor);
      return true;
    }))
    .map(p=>({id: p.split('/').pop(), data: ()=>structuredClone(docs.get(p)), ref: {path: p}}));
  return {docs: lista, empty: !lista.length, size: lista.length};
}
export async function getDoc(ref){ return snapDoc(ref.path); }
export async function getDocs(q){ return snapCol(q); }
export function onSnapshot(ref, cb){
  const f = ()=>cb(ref.__col ? snapCol(ref) : snapDoc(ref.path));
  oyentes.add(f);
  setTimeout(f, 0);
  return ()=>oyentes.delete(f);
}
let pendiente = false;
function avisar(){
  if(pendiente) return;
  pendiente = true;
  setTimeout(()=>{ pendiente = false; oyentes.forEach(f=>f()); }, 0);
}

export function notificar(aulaId, paras, titulo, cuerpo, url, extra){
  paras.filter(p=>p !== (usuario && usuario.uid)).forEach(para=>addDoc(collection(db, 'notifs'), {
    para, de: usuario.uid, aulaId, titulo, cuerpo, url: url || '', tipo: (extra && extra.tipo) || '', tpId: (extra && extra.tpId) || '',
    leida: false, pushPendiente: true, creada: {__op: 'ts'}
  }));
  return Promise.resolve();
}
export function notificarChat(chatId, para, titulo, cuerpo, url, extra){
  if(!para || para === (usuario && usuario.uid)) return Promise.resolve();
  return addDoc(collection(db, 'notifs'), {para, de: usuario.uid, aulaId: '', chatId, titulo, cuerpo, url: url || '', tipo: (extra && extra.tipo) || 'chat', tpId: '',
    leida: false, pushPendiente: true, creada: {__op: 'ts'}});
}
export function escucharNotifs(cb){
  return onSnapshot(query(collection(db, 'notifs'), where('para', '==', usuario && usuario.uid)), s=>cb(s.docs.map(d=>({id: d.id, ...d.data()}))));
}
export async function marcarLeidas(ids){ ids.forEach(id=>escribir('notifs/' + id, {leida: true}, true)); }
export async function borrarNotif(id){ docs.delete('notifs/' + id); avisar(); }
export async function pushDisponible(){ return true; }
export function estadoPermisoPush(){ return 'default'; }
export async function activarPush(){ return 'token-falso'; }
export async function renovarPushSiCorresponde(){}
export function fechaDe(ts){ return ts && ts.__ts ? new Date(ts.__ts) : (ts && ts.toDate ? ts.toDate() : null); }
export function linkSala(codigo, clave){ return `${PIZARRA_URL}/sala/${codigo}` + (clave ? `#admin=${clave}` : ''); }
