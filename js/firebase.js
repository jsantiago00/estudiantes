/* =========================================================
   Estudiemos: Firebase compartido por la app del profe y la del estudiante.

   Usa el MISMO proyecto que la Pizarra (pizarra-d6457): así una clase puede crear su
   sala de pizarra directamente, y como ambas apps viven en el mismo dominio, la sesión
   de Google se comparte. La pizarra entra como usuario anónimo cuando no hay cuenta:
   acá un anónimo cuenta como "sin sesión", y al entrar con Google se lo vincula
   (igual que hace la pizarra) para no perderle las salas que administraba.
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  linkWithPopup, signInWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, addDoc, serverTimestamp, writeBatch, arrayUnion, arrayRemove, deleteField,
  orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging, getToken, onMessage, isSupported as messagingSupported
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

export const firebaseConfig = {
  apiKey: "AIzaSyA-nc9CsjlyY2gaNf5IFHgfC4YdJGStvDM",
  authDomain: "pizarra-d6457.firebaseapp.com",
  projectId: "pizarra-d6457",
  storageBucket: "pizarra-d6457.firebasestorage.app",
  messagingSenderId: "433602034958",
  appId: "1:433602034958:web:f205eb87d4e419d3052b5f"
};

/** Dónde está publicada la pizarra (las salas se abren en /sala/CODIGO). */
export const PIZARRA_URL = "https://santiagososa.com.ar/pizarra";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, addDoc,
  serverTimestamp, writeBatch, arrayUnion, arrayRemove, deleteField, orderBy, limit, getDocs
};

/* ---------- Sesión ---------- */

/** Usuario con cuenta de Google, o null (sin sesión o anónimo de la pizarra). */
export function usuarioActual(){
  const u = auth.currentUser;
  return u && !u.isAnonymous ? u : null;
}

export function alCambiarSesion(cb){
  return onAuthStateChanged(auth, u => cb(u && !u.isAnonymous ? u : null));
}

export async function entrarConGoogle(){
  const u = auth.currentUser;
  if(u && u.isAnonymous){
    try{
      return await linkWithPopup(u, googleProvider);
    }catch(e){
      // Esa cuenta de Google ya existe en el proyecto: entro con ella directamente
      const cred = GoogleAuthProvider.credentialFromError(e);
      if(e.code === 'auth/credential-already-in-use' && cred) return signInWithCredential(auth, cred);
      throw e;
    }
  }
  return signInWithPopup(auth, googleProvider);
}

export function salir(){ return signOut(auth); }

/* ---------- Notificaciones dentro de la app ----------
   notifs/{id}: {para, de, deNombre, aulaId, titulo, cuerpo, url, leida, creada, pushPendiente}
   El notificador (GitHub Actions) manda como push las que tienen pushPendiente. */

/** extra: {tipo: 'tp'|'entrega'|'resena'|'aviso'|'clase'|'miembro'|..., tpId} */
export function notificar(aulaId, paraUids, titulo, cuerpo, url, extra){
  const u = usuarioActual();
  if(!u || !paraUids || !paraUids.length) return Promise.resolve();
  const lote = writeBatch(db);
  paraUids.filter(p=>p !== u.uid).forEach(para=>{
    lote.set(doc(collection(db, 'notifs')), {
      para, de: u.uid, deNombre: u.displayName || '', aulaId,
      tipo: (extra && extra.tipo) || '', tpId: (extra && extra.tpId) || '',
      titulo: String(titulo).slice(0, 120), cuerpo: String(cuerpo || '').slice(0, 500), url: url || '',
      leida: false, pushPendiente: true, creada: serverTimestamp()
    });
  });
  return lote.commit().catch(e=>console.error('No se pudo notificar', e));
}

/** Notificación de un chat (sin aula): las reglas piden que los dos sean del chat. */
export function notificarChat(chatId, paraUid, titulo, cuerpo, url, extra){
  const u = usuarioActual();
  if(!u || !paraUid || paraUid === u.uid) return Promise.resolve();
  return setDoc(doc(collection(db, 'notifs')), {
    para: paraUid, de: u.uid, deNombre: u.displayName || '', aulaId: '', chatId,
    tipo: (extra && extra.tipo) || 'chat', tpId: '',
    titulo: String(titulo).slice(0, 120), cuerpo: String(cuerpo || '').slice(0, 500), url: url || '',
    leida: false, pushPendiente: true, creada: serverTimestamp()
  }).catch(e=>console.error('No se pudo notificar', e));
}

export function escucharNotifs(cb){
  const u = usuarioActual();
  if(!u) return ()=>{};
  // Sin orderBy para no necesitar un índice compuesto: se ordenan acá, y el notificador
  // borra las de más de 45 días, así que nunca son muchas
  const q = query(collection(db, 'notifs'), where('para', '==', u.uid));
  return onSnapshot(q, snap=>{
    const lista = snap.docs.map(d=>({id: d.id, ...d.data({serverTimestamps: 'estimate'})}));
    lista.sort((a,b)=> (fechaMs(b.creada) - fechaMs(a.creada)));
    cb(lista.slice(0, 60));
  }, err=>console.error('Notificaciones', err));
}

export function marcarLeidas(ids){
  if(!ids.length) return Promise.resolve();
  const lote = writeBatch(db);
  ids.forEach(id=>lote.update(doc(db, 'notifs', id), {leida: true}));
  return lote.commit().catch(e=>console.error(e));
}

export function borrarNotif(id){ return deleteDoc(doc(db, 'notifs', id)).catch(e=>console.error(e)); }

/* ---------- Push (Firebase Cloud Messaging) ----------
   tokens/{uid}: {lista: [{token, ua, actualizado}]}. En iPhone solo funciona con la app
   agregada a la pantalla de inicio (iOS 16.4 o más). */

export async function pushDisponible(){
  try{ return ('serviceWorker' in navigator) && ('Notification' in window) && await messagingSupported(); }
  catch(e){ return false; }
}

export function estadoPermisoPush(){
  return ('Notification' in window) ? Notification.permission : 'unsupported';
}

let mensajeriaIniciada = false;
export async function activarPush(alRecibir){
  const u = usuarioActual();
  if(!u) throw new Error('sin-sesion');
  if(!await pushDisponible()) throw new Error('no-soportado');
  const permiso = await Notification.requestPermission();
  if(permiso !== 'granted') throw new Error('denegado');
  const reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js', {scope: './'});
  await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {serviceWorkerRegistration: reg});
  if(!token) throw new Error('sin-token');
  const ref = doc(db, 'tokens', u.uid);
  const snap = await getDoc(ref);
  const lista = (snap.exists() && Array.isArray(snap.data().lista) ? snap.data().lista : [])
    .filter(t=>t.token !== token).slice(-4);
  lista.push({token, ua: navigator.userAgent.slice(0, 120), actualizado: Date.now()});
  await setDoc(ref, {lista});
  if(!mensajeriaIniciada){
    mensajeriaIniciada = true;
    // Con la app abierta el sistema no muestra la notificación: la avisamos nosotros
    onMessage(messaging, m=>{ if(alRecibir) alRecibir(m.data || {}); });
  }
  return token;
}

/** Si ya había dado permiso, renueva el token en silencio (cambia cada tanto). */
export async function renovarPushSiCorresponde(alRecibir){
  if(estadoPermisoPush() !== 'granted') return;
  try{ await activarPush(alRecibir); }catch(e){ console.warn('Push', e.message); }
}

/* ---------- Utilidades ---------- */

export function fechaDe(ts){
  if(!ts) return null;
  if(typeof ts.toDate === 'function') return ts.toDate();
  if(typeof ts === 'number') return new Date(ts);
  return null;
}

function fechaMs(ts){ const d = fechaDe(ts); return d ? d.getTime() : 0; }

export function linkSala(codigo, clave){
  return `${PIZARRA_URL}/sala/${codigo}` + (clave ? `#admin=${clave}` : '');
}
