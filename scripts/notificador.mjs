/* =========================================================
   Estudiemos: notificador. Lo corre GitHub Actions cada ~10 minutos
   (.github/workflows/notificador.yml) con una cuenta de servicio de Firebase.

   1. Recordatorios al profe: "en 30 min tenés clase con X" y, al terminar una clase sin
      cobrar, "acordate de mandar el resumen y el cobro".
   2. Recordatorios a estudiantes y familias que usan la app: "hoy a las 18 tenés clase".
   3. Manda como push las notificaciones de la app que quedaron pendientes
      (TP nuevo, entrega, reseña, aviso...) a todos los dispositivos de la persona.
   4. Limpieza: borra notificaciones viejas y el registro de enviados.

   Para que nada se mande dos veces, cada envío se registra en enviados/{clave} con
   create(), que falla si ya existe.
   ========================================================= */
import { createRequire } from 'node:module';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const Comun = require('../js/comun.js');

if(!process.env.FIREBASE_SERVICE_ACCOUNT){
  console.log('Falta el secreto FIREBASE_SERVICE_ACCOUNT: no hay nada que hacer (ver docs/PUESTA_EN_MARCHA.md).');
  process.exit(0);
}

admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db = admin.firestore();
const fcm = admin.messaging();

const BASE = (process.env.APP_URL || 'https://santiagososa.com.ar/estudiantes/').replace(/\/?$/, '/');
const AHORA = new Date();
const NOTIF_DEFAULT = {antesMin: 30, finClase: true, alumnosHoras: 2};
const VENTANA_FIN_MIN = 40;          // aviso de "terminó la clase" hasta 40 min después
const DIAS_NOTIFS = 45;              // las notificaciones se borran a los 45 días
const SECO = process.argv.includes('--seco');   // prueba: no manda ni escribe nada

const stats = {profe: 0, fin: 0, alumnos: 0, pendientes: 0, pushOk: 0, pushError: 0, tokensBorrados: 0};

/* ---------- Envío ---------- */

const cacheTokens = new Map();
async function tokensDe(uid){
  if(!cacheTokens.has(uid)){
    const s = await db.doc(`tokens/${uid}`).get();
    cacheTokens.set(uid, s.exists ? (s.data().lista || []).map(t=>t.token).filter(Boolean) : []);
  }
  return cacheTokens.get(uid);
}

async function push(uid, {titulo, cuerpo, url, tag}){
  const tokens = await tokensDe(uid);
  if(!tokens.length || SECO){ if(SECO) console.log('[seco] push a', uid, '·', titulo, '·', cuerpo); return; }
  const r = await fcm.sendEachForMulticast({
    tokens,
    data: {titulo: String(titulo||''), cuerpo: String(cuerpo||''), url: url || BASE, tag: tag || ''},
    webpush: {headers: {Urgency: 'high', TTL: '7200'}}
  });
  const invalidos = [];
  r.responses.forEach((x, i)=>{
    if(x.success){ stats.pushOk++; return; }
    stats.pushError++;
    const code = x.error && x.error.code;
    if(code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument'){
      invalidos.push(tokens[i]);
    }else console.warn('Push falló', uid, code);
  });
  if(invalidos.length){
    stats.tokensBorrados += invalidos.length;
    await db.runTransaction(async tx=>{
      const ref = db.doc(`tokens/${uid}`);
      const s = await tx.get(ref);
      if(!s.exists) return;
      tx.update(ref, {lista: (s.data().lista || []).filter(t=>!invalidos.includes(t.token))});
    });
    cacheTokens.set(uid, tokens.filter(t=>!invalidos.includes(t)));
  }
}

/** Corre fn una sola vez por clave, aunque el notificador corra muchas veces. */
async function unaVez(clave, fn){
  if(SECO){ await fn(); return; }
  try{
    await db.doc(`enviados/${clave}`).create({en: admin.firestore.Timestamp.now()});
  }catch(e){
    if(e.code === 6) return;   // ALREADY_EXISTS: ya se mandó
    throw e;
  }
  await fn();
}

/** Guarda la notificación en la app (ya enviada como push), para que aparezca en Novedades. */
async function registrarEnApp(para, aulaId, titulo, cuerpo, tipo){
  if(SECO) return;
  await db.collection('notifs').add({
    para, de: 'estudiemos', deNombre: 'Estudiemos', aulaId: aulaId || '', tipo: tipo || '', tpId: '',
    titulo, cuerpo, url: '', leida: false, pushPendiente: false, creada: admin.firestore.FieldValue.serverTimestamp()
  });
}

/* ---------- Textos ---------- */

function cuandoEs(c){
  const inicio = Comun.instanteArg(c.fecha, c.horaEntrada);
  const min = Math.round((inicio - AHORA) / 60000);
  if(min < 60) return `en ${min} min`;
  const hoy = Comun.isoLocal(enArgentina(AHORA));
  const manana = Comun.isoLocal(enArgentina(new Date(AHORA.getTime() + 86400000)));
  const hora = Comun.horaLinda(c.horaEntrada);
  if(c.fecha === hoy) return `hoy a las ${hora}`;
  if(c.fecha === manana) return `mañana a las ${hora}`;
  return `el ${c.fecha.split('-').reverse().slice(0,2).join('/')} a las ${hora}`;
}

/** Un Date cuyos getters locales dan la hora de Argentina, sin importar dónde corre. */
function enArgentina(d){ return new Date(d.getTime() - 3 * 3600000 + d.getTimezoneOffset() * 60000); }

function money(n){ return '$' + Number(n||0).toLocaleString('es-AR', {maximumFractionDigits: 0}); }

/* ---------- 1 y 2: recordatorios de clases ---------- */

const cacheAulas = new Map();
async function miembrosDe(aulaId){
  if(!cacheAulas.has(aulaId)){
    const s = await db.doc(`aulas/${aulaId}`).get();
    cacheAulas.set(aulaId, s.exists ? (s.data().miembros || []) : []);
  }
  return cacheAulas.get(aulaId);
}

async function recordatorios(){
  const profes = await db.collection('users').select('clases', 'alumnos', 'config').get();
  for(const p of profes.docs){
    const d = p.data();
    if(!Array.isArray(d.clases) || !d.clases.length) continue;
    const uid = p.id;
    const cfg = {...NOTIF_DEFAULT, ...((d.config && d.config.notif) || {})};
    const alumnos = new Map((d.alumnos || []).map(a=>[a.id, a]));
    const nombre = id => (alumnos.get(id) || {}).nombre || 'tu alumno';

    if(cfg.antesMin > 0){
      for(const c of Comun.clasesPorEmpezar(d.clases, AHORA, cfg.antesMin)){
        await unaVez(`p_${uid}_${c.id}_${c.fecha}_${c.horaEntrada.replace(':','')}`, async ()=>{
          const a = alumnos.get(c.alumnoId) || {};
          await push(uid, {
            titulo: `⏰ Clase con ${nombre(c.alumnoId)} ${cuandoEs(c)}`,
            cuerpo: `${c.horaEntrada}${c.horaSalida ? ' a ' + c.horaSalida : ''}${a.direccion ? ' · ' + a.direccion : ''}`,
            url: BASE + 'index.html', tag: 'clase-' + c.id
          });
          stats.profe++;
        });
      }
    }

    if(cfg.finClase){
      for(const c of Comun.clasesRecienTerminadas(d.clases.filter(c=>!c.pagada), AHORA, VENTANA_FIN_MIN)){
        await unaVez(`f_${uid}_${c.id}_${c.fecha}`, async ()=>{
          await push(uid, {
            titulo: `✅ Terminó la clase con ${nombre(c.alumnoId)}`,
            cuerpo: `Acordate de mandar el resumen y el cobro (${money(Number(c.monto || 0) + Number(c.viatico || 0))}).`,
            url: BASE + 'index.html', tag: 'fin-' + c.id
          });
          stats.fin++;
        });
      }
    }

    if(cfg.alumnosHoras > 0){
      const conAula = (d.alumnos || []).filter(a=>a.aulaId);
      for(const a of conAula){
        const suyas = d.clases.filter(c=>c.alumnoId === a.id);
        for(const c of Comun.clasesPorEmpezar(suyas, AHORA, cfg.alumnosHoras * 60)){
          const miembros = await miembrosDe(a.aulaId);
          if(!miembros.length) continue;
          await unaVez(`a_${a.aulaId}_${c.id}_${c.fecha}_${c.horaEntrada.replace(':','')}`, async ()=>{
            const titulo = `📚 Tenés clase ${cuandoEs(c)}`;
            const cuerpo = `${c.horaEntrada}${c.horaSalida ? ' a ' + c.horaSalida : ''}${(d.config && d.config.nombreProfe) ? ' con ' + d.config.nombreProfe : ''}`;
            for(const m of miembros){
              await push(m, {titulo, cuerpo, url: BASE + 'estudiante.html', tag: 'clase-' + c.id});
              await registrarEnApp(m, a.aulaId, titulo, cuerpo, 'clase');
            }
            stats.alumnos++;
          });
        }
      }
    }
  }
}

/* ---------- 3: push de las notificaciones pendientes ---------- */

async function pendientes(){
  const s = await db.collection('notifs').where('pushPendiente', '==', true).limit(300).get();
  const viejo = AHORA.getTime() - 24 * 3600000;
  for(const n of s.docs){
    const d = n.data();
    const creada = d.creada && d.creada.toDate ? d.creada.toDate().getTime() : AHORA.getTime();
    if(creada >= viejo){
      const url = d.url ? new URL(d.url, BASE).href : BASE;
      await push(d.para, {titulo: d.titulo, cuerpo: d.cuerpo, url, tag: n.id});
    }
    if(!SECO) await n.ref.update({pushPendiente: false});
    stats.pendientes++;
  }
}

/* ---------- 4: limpieza (una vez por hora, más o menos) ---------- */

async function limpiar(){
  if(AHORA.getUTCMinutes() >= 10 || SECO) return;
  const borrar = async q=>{
    const s = await q.limit(400).get();
    if(s.empty) return 0;
    const lote = db.batch();
    s.docs.forEach(d=>lote.delete(d.ref));
    await lote.commit();
    return s.size;
  };
  const limiteNotifs = admin.firestore.Timestamp.fromMillis(AHORA.getTime() - DIAS_NOTIFS * 86400000);
  const limiteEnviados = admin.firestore.Timestamp.fromMillis(AHORA.getTime() - 3 * 86400000);
  const n1 = await borrar(db.collection('notifs').where('creada', '<', limiteNotifs));
  const n2 = await borrar(db.collection('enviados').where('en', '<', limiteEnviados));
  if(n1 || n2) console.log(`Limpieza: ${n1} notificaciones y ${n2} registros de envío`);
}

try{
  await recordatorios();
  await pendientes();
  await limpiar();
  console.log(new Date().toISOString(), JSON.stringify(stats));
}catch(e){
  console.error(e);
  process.exit(1);
}
