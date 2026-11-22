/* =========================================================
   Estudiemos (profe): puente entre el script principal de index.html y Firebase.
   Los módulos no exponen funciones globales, así que todo se cuelga de window.

   Firestore:
     users/{uid}                 todos los datos del profe (privado, como siempre)
     aulas/{aulaId}              lo que ve cada estudiante invitado (lo publica esta app)
       entregas/{tpId}           lo que resolvió el estudiante, y la devolución del profe
       resenas/{uid}             la reseña de cada miembro (estudiante o familia)
       alumno/perfil             lo que le interesa estudiar
     perfiles/{uid}              perfil público del profe y reseñas elegidas para mostrar
     notifs/{id}                 notificaciones dentro de la app (y push)
     tokens/{uid}                tokens de push de cada dispositivo
     rooms/{code}                salas de la Pizarra (mismo proyecto)
   ========================================================= */
import {
  auth, db, usuarioActual, alCambiarSesion, entrarConGoogle, salir,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, serverTimestamp, writeBatch,
  arrayRemove, deleteField,
  notificar, escucharNotifs, marcarLeidas, borrarNotif,
  activarPush, renovarPushSiCorresponde, pushDisponible, estadoPermisoPush, linkSala, fechaDe
} from './firebase.js';

const Comun = window.Comun;

/* ---------- Sesión y respaldo (lo que ya existía) ---------- */

window.firebaseSignIn = function(){
  return entrarConGoogle().catch(err=>{
    console.error('Error al iniciar sesión con Google', err);
    if(err && err.code === 'auth/popup-closed-by-user') return;
    if(window.showToast) window.showToast('No se pudo iniciar sesión');
  });
};
window.firebaseSignOutUser = function(){
  cortarEscuchas();
  return salir();
};
window.firebaseFetchUserDoc = async function(uid){
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
};

let guardadoPendiente = null;
window.firebaseQueueSave = function(data){
  if(!usuarioActual()) return;
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(()=>{
    const u = usuarioActual();
    if(!u) return;
    const copia = JSON.parse(JSON.stringify(data));
    setDoc(doc(db, 'users', u.uid), copia)
      .catch(err=>console.error('Error guardando en la nube', err));
    publicarAulas(copia);
    publicarPerfil(copia);
  }, 800);
};

alCambiarSesion(user=>{
  if(!user) cortarEscuchas();
  if(window.onFirebaseAuthChange) window.onFirebaseAuthChange(user);
  if(user){
    renovarPushSiCorresponde(alRecibirPush);
    escucharMisNotifs();
  }
});

/* ---------- Aulas ---------- */

const publicado = {};   // aulaId -> JSON de lo último publicado, para no reescribir igual

async function publicarAulas(data){
  const u = usuarioActual();
  if(!u) return;
  const ahora = new Date();
  for(const alumno of (data.alumnos || [])){
    if(!alumno.aulaId) continue;
    const proy = Comun.construirAula(data, alumno, ahora);
    const json = JSON.stringify(proy);
    if(publicado[alumno.aulaId] === json) continue;
    try{
      await setDoc(doc(db, 'aulas', alumno.aulaId), {...proy, ownerUid: u.uid, actualizado: serverTimestamp()}, {merge: true});
      publicado[alumno.aulaId] = json;
    }catch(e){
      console.error('No se pudo publicar el aula de', alumno.nombre, e);
    }
  }
}

let perfilPublicado = null;
async function publicarPerfil(data){
  const u = usuarioActual();
  if(!u) return;
  const cfg = data.config || {};
  // Las reseñas elegidas para la página pública ("A tu página"), firmadas igual que en la app:
  // firmaResena (index.html) respeta a quien no quiso aparecer con su nombre
  const firma = r => (typeof window.firmaResena === 'function') ? window.firmaResena(r) : (r.autor || '');
  const pub = {
    nombre: cfg.nombreProfe || u.displayName || '',
    bio: cfg.bioProfe || '',
    materias: (data.temas || []).map(t=>t.nombre).slice(0, 30),
    resenas: (data.resenas || []).filter(r=>r.enPagina && !r.privada).slice(0, 60).map(r=>({
      estrellas: Number(r.estrellas) || 5, texto: String(r.texto || '').slice(0, 1200), autor: firma(r), fecha: r.fecha || ''
    }))
  };
  const json = JSON.stringify(pub);
  if(json === perfilPublicado) return;
  try{
    await setDoc(doc(db, 'perfiles', u.uid), {...pub, actualizado: serverTimestamp()});
    perfilPublicado = json;
  }catch(e){ console.error('No se pudo publicar el perfil', e); }
}

window.nube = {
  usuario: ()=>usuarioActual(),

  /** Crea el aula de un alumno y devuelve su id (el que va en el link de invitación). */
  async crearAula(data, alumno){
    const u = usuarioActual();
    if(!u) throw new Error('sin-sesion');
    const aulaId = Comun.nuevoIdLargo(20);
    const proy = Comun.construirAula(data, alumno, new Date());
    await setDoc(doc(db, 'aulas', aulaId), {
      ...proy, ownerUid: u.uid, miembros: [], miembrosInfo: {}, invitacionAbierta: true,
      creada: serverTimestamp(), actualizado: serverTimestamp()
    });
    publicado[aulaId] = JSON.stringify(proy);
    return aulaId;
  },

  async borrarAula(aulaId){
    // Las subcolecciones quedan huérfanas pero nadie puede leerlas sin el aula
    await deleteDoc(doc(db, 'aulas', aulaId));
    delete publicado[aulaId];
    soltarAula(aulaId);
  },

  setInvitacionAbierta(aulaId, abierta){
    return updateDoc(doc(db, 'aulas', aulaId), {invitacionAbierta: !!abierta});
  },

  quitarMiembro(aulaId, uid){
    return updateDoc(doc(db, 'aulas', aulaId), {miembros: arrayRemove(uid), ['miembrosInfo.' + uid]: deleteField()});
  },

  linkInvitacion(aulaId){
    return new URL('estudiante.html?aula=' + aulaId, location.href).href;
  },

  /** Escucha en vivo el aula: miembros, entregas, reseñas e intereses. */
  escucharAulas(aulaIds){
    aulaIds.forEach(escucharAula);
    Object.keys(escuchas).forEach(id=>{ if(!aulaIds.includes(id)) soltarAula(id); });
  },
  vivo: (aulaId)=>vivo[aulaId] || null,

  guardarDevolucion(aulaId, tpId, devolucion, nota){
    return updateDoc(doc(db, 'aulas', aulaId, 'entregas', tpId), {
      devolucion: String(devolucion || '').slice(0, 4000), nota: String(nota || '').slice(0, 40),
      estado: 'corregida', corregidaEn: serverTimestamp()
    });
  },

  /** Notifica a todos los miembros del aula (estudiante y familia). */
  notificarAula(aulaId, titulo, cuerpo, extra){
    const v = vivo[aulaId];
    const miembros = v && v.aula ? (v.aula.miembros || []) : [];
    return notificar(aulaId, miembros, titulo, cuerpo, 'estudiante.html?aula=' + aulaId, extra);
  },

  /* Notificaciones del profe */
  notifs: ()=>misNotifs,
  marcarLeidas, borrarNotif,

  /* Push */
  async activarPush(){ return activarPush(alRecibirPush); },
  pushDisponible, estadoPermisoPush,

  /* Pizarra */
  crearSala: crearSalaPizarra,
  linkSala,
  fechaDe
};

/* ---------- Escuchas en vivo de cada aula ---------- */

const escuchas = {};  // aulaId -> [unsubscribe]
const vivo = {};      // aulaId -> {aula, entregas:{}, resenas:[], perfil}

function avisarCambio(aulaId){
  if(window.onAulaVivoCambio) window.onAulaVivoCambio(aulaId);
}

function escucharAula(aulaId){
  if(escuchas[aulaId] || !usuarioActual()) return;
  vivo[aulaId] = {aula: null, entregas: {}, resenas: [], perfil: null};
  const err = e=>console.warn('Aula', aulaId, e.code || e);
  escuchas[aulaId] = [
    onSnapshot(doc(db, 'aulas', aulaId), s=>{
      vivo[aulaId].aula = s.exists() ? s.data() : null;
      avisarCambio(aulaId);
    }, err),
    onSnapshot(collection(db, 'aulas', aulaId, 'entregas'), s=>{
      const m = {};
      s.docs.forEach(d=>{ m[d.id] = d.data({serverTimestamps: 'estimate'}); });
      vivo[aulaId].entregas = m;
      avisarCambio(aulaId);
    }, err),
    onSnapshot(collection(db, 'aulas', aulaId, 'resenas'), s=>{
      vivo[aulaId].resenas = s.docs.map(d=>({uid: d.id, aulaId, ...d.data({serverTimestamps: 'estimate'})}));
      avisarCambio(aulaId);
    }, err),
    onSnapshot(doc(db, 'aulas', aulaId, 'alumno', 'perfil'), s=>{
      vivo[aulaId].perfil = s.exists() ? s.data() : null;
      avisarCambio(aulaId);
    }, err)
  ];
}

function soltarAula(aulaId){
  (escuchas[aulaId] || []).forEach(f=>f());
  delete escuchas[aulaId];
  delete vivo[aulaId];
}

let soltarNotifs = null;
let misNotifs = [];
function escucharMisNotifs(){
  if(soltarNotifs) soltarNotifs();
  soltarNotifs = escucharNotifs(lista=>{
    misNotifs = lista;
    if(window.onNotifsCambio) window.onNotifsCambio(lista);
  });
}

function cortarEscuchas(){
  Object.keys(escuchas).forEach(soltarAula);
  if(soltarNotifs){ soltarNotifs(); soltarNotifs = null; }
  misNotifs = [];
  if(window.onNotifsCambio) window.onNotifsCambio([]);
}

function alRecibirPush(d){
  if(window.showToast) window.showToast('🔔 ' + (d.titulo || 'Nueva notificación'));
}

/* ---------- Pizarra: crear la sala de una clase ----------
   Mismo lote que arma la Pizarra al crear una sala (ver pizarra/src/firebase/rooms.ts):
   la sala, la clave de administración, quien la crea como admin, su primera hoja y su
   entrada en participantes. Las reglas exigen que vayan juntos. */

async function crearSalaPizarra(titulo, nombre){
  const u = auth.currentUser;
  if(!u || u.isAnonymous) throw new Error('sin-sesion');
  for(let intento = 0; intento < 4; intento++){
    const codigo = Comun.nuevoCodigoSala();
    const clave = Comun.nuevoIdLargo(20);
    const pageId = Comun.nuevoIdLargo(10);
    const lote = writeBatch(db);
    lote.set(doc(db, 'rooms', codigo), {
      title: String(titulo || 'Clase').slice(0, 120), editMode: 'all', editors: {}, banned: {},
      pageIds: [pageId], createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    lote.set(doc(db, 'rooms', codigo, 'secret', 'admin'), {key: clave});
    lote.set(doc(db, 'rooms', codigo, 'admins', u.uid), {key: clave});
    lote.set(doc(db, 'rooms', codigo, 'pages', pageId), {
      width: 1240, height: 1754,
      background: {type: 'grid', spacing: 42, color: '#c4c8ce', paper: '#ffffff'},
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    lote.set(doc(db, 'rooms', codigo, 'members', u.uid), {
      name: String(nombre || u.displayName || 'Profe').slice(0, 40), admin: true,
      joinedAt: serverTimestamp(), lastSeen: serverTimestamp()
    });
    try{
      await lote.commit();
      return {codigo, clave};
    }catch(e){
      // Si el código ya existía las reglas lo rechazan: pruebo con otro
      if(e.code !== 'permission-denied' || intento === 3) throw e;
    }
  }
}
