/* Tests de las reglas de Firestore (Estudiemos + Pizarra), contra el emulador:
     npm run test:reglas
   (necesita Java para el emulador). */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc,
  serverTimestamp, arrayUnion, arrayRemove, writeBatch, deleteField
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const env = await initializeTestEnvironment({
  projectId: 'demo-estudiemos',
  firestore: {rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080}
});

const google = {firebase: {sign_in_provider: 'google.com'}};
const profe = env.authenticatedContext('profe', google).firestore();
const alumno = env.authenticatedContext('alumno', google).firestore();
const mama = env.authenticatedContext('mama', google).firestore();
const extrano = env.authenticatedContext('extrano', google).firestore();
const anonimo = env.authenticatedContext('anon', {firebase: {sign_in_provider: 'anonymous'}}).firestore();
const nadie = env.unauthenticatedContext().firestore();

let pasaron = 0, fallaron = 0;
async function caso(nombre, fn){
  try{ await fn(); pasaron++; }
  catch(e){ fallaron++; console.log('✗', nombre, '\n   ', e.message.split('\n')[0]); }
}

const AULA = 'aulaDePruebaXYZ123456';
const aulaBase = {
  ownerUid: 'profe', miembros: [], miembrosInfo: {}, invitacionAbierta: true,
  alumnoNombre: 'Sofi', clases: [], tareas: [], tps: [], avisos: [], temas: []
};
const info = (nombre, rol)=>({nombre, email: nombre + '@x.com', rol});

/* ---------- Aulas ---------- */
await caso('el profe crea un aula', ()=>assertSucceeds(setDoc(doc(profe, 'aulas', AULA), aulaBase)));
await caso('no se crea un aula a nombre de otro', ()=>assertFails(setDoc(doc(extrano, 'aulas', 'otraAula1234567890'), aulaBase)));
await caso('no se crea un aula con miembros ya puestos', ()=>assertFails(setDoc(doc(profe, 'aulas', 'otraAula1234567890'), {...aulaBase, miembros: ['alumno']})));
await caso('un anónimo (pizarra) no crea aulas', ()=>assertFails(setDoc(doc(anonimo, 'aulas', 'otraAula1234567890'), {...aulaBase, ownerUid: 'anon'})));
await caso('un extraño no lee el aula', ()=>assertFails(getDoc(doc(extrano, 'aulas', AULA))));
await caso('sin sesión no se lee el aula', ()=>assertFails(getDoc(doc(nadie, 'aulas', AULA))));

await caso('el estudiante se suma con el link', ()=>assertSucceeds(updateDoc(doc(alumno, 'aulas', AULA), {miembros: arrayUnion('alumno'), 'miembrosInfo.alumno': info('Sofi', 'alumno')})));
await caso('volver a abrir el link (ya es miembro) no falla', ()=>assertSucceeds(updateDoc(doc(alumno, 'aulas', AULA), {miembros: arrayUnion('alumno'), 'miembrosInfo.alumno': info('Sofi', 'alumno')})));
await caso('la mamá se suma', ()=>assertSucceeds(updateDoc(doc(mama, 'aulas', AULA), {miembros: arrayUnion('mama'), 'miembrosInfo.mama': info('Ana', 'familia')})));
await caso('nadie se suma a otro', ()=>assertFails(updateDoc(doc(extrano, 'aulas', AULA), {miembros: arrayUnion('extrano', 'otro'), 'miembrosInfo.extrano': info('X', 'alumno')})));
await caso('al sumarse no se tocan los datos de otro miembro', ()=>assertFails(updateDoc(doc(extrano, 'aulas', AULA), {miembros: arrayUnion('extrano'), 'miembrosInfo.alumno': info('X', 'alumno')})));
await caso('un rol inventado no vale', ()=>assertFails(updateDoc(doc(extrano, 'aulas', AULA), {miembros: arrayUnion('extrano'), 'miembrosInfo.extrano': info('X', 'admin')})));
await caso('un anónimo no se suma', ()=>assertFails(updateDoc(doc(anonimo, 'aulas', AULA), {miembros: arrayUnion('anon'), 'miembrosInfo.anon': info('X', 'alumno')})));
await caso('el estudiante lee su aula', ()=>assertSucceeds(getDoc(doc(alumno, 'aulas', AULA))));
await caso('el estudiante lista sus aulas', ()=>assertSucceeds(getDocs(query(collection(alumno, 'aulas'), where('miembros', 'array-contains', 'alumno')))));
await caso('nadie lista todas las aulas', ()=>assertFails(getDocs(collection(alumno, 'aulas'))));
await caso('el estudiante no cambia lo publicado', ()=>assertFails(updateDoc(doc(alumno, 'aulas', AULA), {clases: [{id: 'falsa', pagada: true}]})));
await caso('el estudiante cambia su rol', ()=>assertSucceeds(updateDoc(doc(alumno, 'aulas', AULA), {'miembrosInfo.alumno': info('Sofi G', 'alumno')})));
await caso('el estudiante no cambia el rol de la mamá', ()=>assertFails(updateDoc(doc(alumno, 'aulas', AULA), {'miembrosInfo.mama': info('Ana', 'alumno')})));
await caso('el estudiante no saca a otro miembro', ()=>assertFails(updateDoc(doc(alumno, 'aulas', AULA), {miembros: arrayRemove('mama')})));
await caso('el profe publica clases (merge)', ()=>assertSucceeds(setDoc(doc(profe, 'aulas', AULA), {clases: [{id: 'c1', pagada: false}], ownerUid: 'profe'}, {merge: true})));
await caso('el profe no suma miembros por su cuenta', ()=>assertFails(updateDoc(doc(profe, 'aulas', AULA), {miembros: arrayUnion('extrano')})));
await caso('el profe no regala el aula', ()=>assertFails(updateDoc(doc(profe, 'aulas', AULA), {ownerUid: 'extrano'})));

await caso('el profe cierra la invitación', ()=>assertSucceeds(updateDoc(doc(profe, 'aulas', AULA), {invitacionAbierta: false})));
await caso('con la invitación cerrada no se suma nadie', ()=>assertFails(updateDoc(doc(extrano, 'aulas', AULA), {miembros: arrayUnion('extrano'), 'miembrosInfo.extrano': info('X', 'alumno')})));
await caso('con la invitación cerrada, un miembro sigue pudiendo reabrir su link', ()=>assertSucceeds(updateDoc(doc(alumno, 'aulas', AULA), {miembros: arrayUnion('alumno'), 'miembrosInfo.alumno': info('Sofi G', 'alumno')})));

/* ---------- Entregas ---------- */
const entrega = {respuestas: {p1: 1, p2: 'hola'}, puntaje: {ok: 1, total: 1, abiertas: 1}, comentario: '', estado: 'enviada', enviadaEn: serverTimestamp(), por: 'alumno', porNombre: 'Sofi'};
const refEntrega = db => doc(db, 'aulas', AULA, 'entregas', 'tp1');
await caso('el estudiante entrega', ()=>assertSucceeds(setDoc(refEntrega(alumno), entrega, {merge: true})));
await caso('la entrega no se firma a nombre de otro', ()=>assertFails(setDoc(doc(alumno, 'aulas', AULA, 'entregas', 'tp2'), {...entrega, por: 'mama'})));
await caso('el estudiante no se pone nota', ()=>assertFails(setDoc(doc(alumno, 'aulas', AULA, 'entregas', 'tp3'), {...entrega, nota: '10'})));
await caso('un extraño no entrega', ()=>assertFails(setDoc(doc(extrano, 'aulas', AULA, 'entregas', 'tp4'), {...entrega, por: 'extrano'})));
await caso('un extraño no lee entregas', ()=>assertFails(getDoc(refEntrega(extrano))));
await caso('la mamá ve la entrega', ()=>assertSucceeds(getDoc(refEntrega(mama))));
await caso('el profe corrige', ()=>assertSucceeds(updateDoc(refEntrega(profe), {devolucion: '¡Muy bien!', nota: '9', estado: 'corregida', corregidaEn: serverTimestamp()})));
await caso('el profe no cambia las respuestas', ()=>assertFails(updateDoc(refEntrega(profe), {respuestas: {p1: 0}})));
await caso('el estudiante no cambia la nota', ()=>assertFails(updateDoc(refEntrega(alumno), {nota: '10'})));
await caso('el estudiante vuelve a entregar (la devolución queda)', ()=>assertSucceeds(setDoc(refEntrega(alumno), {...entrega, respuestas: {p1: 0}}, {merge: true})));

/* ---------- Reseñas e intereses ---------- */
const resena = {estrellas: 5, texto: 'Las clases son geniales', autor: 'Sofi', rol: 'alumno', permitePublicar: true, creada: serverTimestamp(), actualizada: serverTimestamp()};
await caso('el estudiante deja su reseña', ()=>assertSucceeds(setDoc(doc(alumno, 'aulas', AULA, 'resenas', 'alumno'), resena)));
await caso('no se deja una reseña a nombre de otro', ()=>assertFails(setDoc(doc(alumno, 'aulas', AULA, 'resenas', 'mama'), resena)));
await caso('no hay 6 estrellas', ()=>assertFails(setDoc(doc(mama, 'aulas', AULA, 'resenas', 'mama'), {...resena, estrellas: 6})));
await caso('un extraño no deja reseñas', ()=>assertFails(setDoc(doc(extrano, 'aulas', AULA, 'resenas', 'extrano'), resena)));
await caso('el profe lee las reseñas', ()=>assertSucceeds(getDocs(collection(profe, 'aulas', AULA, 'resenas'))));
await caso('la mamá no lee la reseña del estudiante', ()=>assertFails(getDoc(doc(mama, 'aulas', AULA, 'resenas', 'alumno'))));
await caso('el estudiante cuenta qué le interesa', ()=>assertSucceeds(setDoc(doc(alumno, 'aulas', AULA, 'alumno', 'perfil'), {intereses: 'Fracciones', por: 'alumno', actualizado: serverTimestamp()})));
await caso('el profe lo lee', ()=>assertSucceeds(getDoc(doc(profe, 'aulas', AULA, 'alumno', 'perfil'))));
await caso('otros documentos en alumno/ no', ()=>assertFails(setDoc(doc(alumno, 'aulas', AULA, 'alumno', 'otro'), {intereses: 'x', por: 'alumno', actualizado: serverTimestamp()})));

/* ---------- Notificaciones ---------- */
const notif = (de, para)=>({para, de, deNombre: '', aulaId: AULA, tipo: 'tp', tpId: '', titulo: 'Hola', cuerpo: 'x', url: '', leida: false, pushPendiente: true, creada: serverTimestamp()});
await caso('el estudiante notifica al profe', ()=>assertSucceeds(addDoc(collection(alumno, 'notifs'), notif('alumno', 'profe'))));
await caso('el estudiante no notifica a cualquiera', ()=>assertFails(addDoc(collection(alumno, 'notifs'), notif('alumno', 'extrano'))));
await caso('el profe notifica a un miembro', ()=>assertSucceeds(setDoc(doc(profe, 'notifs', 'n1'), notif('profe', 'alumno'))));
await caso('el profe no notifica a un extraño', ()=>assertFails(addDoc(collection(profe, 'notifs'), notif('profe', 'extrano'))));
await caso('un extraño no notifica al profe', ()=>assertFails(addDoc(collection(extrano, 'notifs'), notif('extrano', 'profe'))));
await caso('no se firma una notificación como otro', ()=>assertFails(addDoc(collection(alumno, 'notifs'), notif('profe', 'mama'))));
await caso('el estudiante lee sus notificaciones', ()=>assertSucceeds(getDocs(query(collection(alumno, 'notifs'), where('para', '==', 'alumno')))));
await caso('no se leen las de otro', ()=>assertFails(getDocs(query(collection(alumno, 'notifs'), where('para', '==', 'profe')))));
await caso('las marca como leídas', ()=>assertSucceeds(updateDoc(doc(alumno, 'notifs', 'n1'), {leida: true})));
await caso('no les cambia el texto', ()=>assertFails(updateDoc(doc(alumno, 'notifs', 'n1'), {titulo: 'otro'})));
await caso('las borra', ()=>assertSucceeds(deleteDoc(doc(alumno, 'notifs', 'n1'))));

/* ---------- Perfil público, datos del profe, tokens ---------- */
const perfil = {nombre: 'Profe Ana', bio: '', materias: ['Mate'], resenas: [], actualizado: serverTimestamp()};
await caso('el profe publica su perfil', ()=>assertSucceeds(setDoc(doc(profe, 'perfiles', 'profe'), perfil)));
await caso('cualquiera (sin sesión) lee el perfil', ()=>assertSucceeds(getDoc(doc(nadie, 'perfiles', 'profe'))));
await caso('nadie escribe el perfil de otro', ()=>assertFails(setDoc(doc(extrano, 'perfiles', 'profe'), perfil)));
await caso('el profe guarda sus datos', ()=>assertSucceeds(setDoc(doc(profe, 'users', 'profe'), {alumnos: [], clases: []})));
await caso('nadie lee los datos del profe', ()=>assertFails(getDoc(doc(alumno, 'users', 'profe'))));
await caso('cada uno guarda su token', ()=>assertSucceeds(setDoc(doc(alumno, 'tokens', 'alumno'), {lista: []})));
await caso('nadie lee el token de otro', ()=>assertFails(getDoc(doc(extrano, 'tokens', 'alumno'))));
await caso('nadie escribe en enviados', ()=>assertFails(setDoc(doc(profe, 'enviados', 'x'), {en: 1})));

/* ---------- Pizarra: el lote con el que Estudiemos crea la sala de una clase ---------- */
await caso('el profe crea la sala de pizarra de una clase', ()=>{
  const b = writeBatch(profe);
  const code = 'ABC234', pageId = 'pagina1';
  b.set(doc(profe, 'rooms', code), {title: 'Clase con Sofi', editMode: 'all', editors: {}, banned: {}, pageIds: [pageId], createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
  b.set(doc(profe, 'rooms', code, 'secret', 'admin'), {key: 'clave-larga-de-veinte-caracteres'});
  b.set(doc(profe, 'rooms', code, 'admins', 'profe'), {key: 'clave-larga-de-veinte-caracteres'});
  b.set(doc(profe, 'rooms', code, 'pages', pageId), {width: 1240, height: 1754, background: {type: 'grid', spacing: 42, color: '#c4c8ce', paper: '#ffffff'}, createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
  b.set(doc(profe, 'rooms', code, 'members', 'profe'), {name: 'Profe Ana', admin: true, joinedAt: serverTimestamp(), lastSeen: serverTimestamp()});
  return assertSucceeds(b.commit());
});
await caso('el estudiante entra a la sala', ()=>assertSucceeds(getDoc(doc(alumno, 'rooms', 'ABC234'))));
await caso('la pizarra sigue igual: un anónimo crea su sala', ()=>{
  const b = writeBatch(anonimo);
  const code = 'XYZ789';
  b.set(doc(anonimo, 'rooms', code), {title: 'Mía', editMode: 'some', editors: {}, banned: {}, pageIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp()});
  b.set(doc(anonimo, 'rooms', code, 'secret', 'admin'), {key: 'otra-clave-larga-de-veinte'});
  b.set(doc(anonimo, 'rooms', code, 'admins', 'anon'), {key: 'otra-clave-larga-de-veinte'});
  return assertSucceeds(b.commit());
});
await caso('«Mis pizarras» sigue siendo privado', async ()=>{
  await assertSucceeds(setDoc(doc(anonimo, 'users', 'anon', 'boards', 'XYZ789'), {title: 'Mía'}));
  await assertFails(getDoc(doc(alumno, 'users', 'anon', 'boards', 'XYZ789')));
});

/* ---------- Borrar el aula ---------- */
await caso('el estudiante no borra el aula', ()=>assertFails(deleteDoc(doc(alumno, 'aulas', AULA))));
await caso('el profe quita a un miembro', ()=>assertSucceeds(updateDoc(doc(profe, 'aulas', AULA), {miembros: arrayRemove('mama'), 'miembrosInfo.mama': deleteField()})));
await caso('el miembro quitado ya no lee el aula', ()=>assertFails(getDoc(doc(mama, 'aulas', AULA))));
await caso('el profe borra el aula', ()=>assertSucceeds(deleteDoc(doc(profe, 'aulas', AULA))));

await env.cleanup();
console.log(`${pasaron + fallaron} chequeos, ${fallaron} fallas`);
process.exit(fallaron ? 1 : 0);
