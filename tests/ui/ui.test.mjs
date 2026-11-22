/* Tests de interfaz con Chrome (puppeteer-core), con un Firebase de mentira en memoria:
     npm run test:ui            (CHROME=ruta\chrome.exe si no está en el lugar de siempre)
   Recorre la app del profe y la del estudiante de punta a punta y saca capturas en
   tests/ui/capturas/ (no se suben al repo). */
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const Comun = require('../../js/comun.js');
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const capturas = join(raiz, 'tests', 'ui', 'capturas');
await mkdir(capturas, {recursive: true});

const TIPOS = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml'};
const server = http.createServer(async (req, res)=>{
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if(p === '/') p = '/index.html';
  if(p === '/js/firebase.js') p = '/tests/ui/firebase-falso.js';
  try{
    const buf = await readFile(join(raiz, p));
    res.writeHead(200, {'Content-Type': TIPOS[extname(p)] || 'application/octet-stream'});
    res.end(buf);
  }catch(e){ res.writeHead(404); res.end('no'); }
});
await new Promise(r=>server.listen(5199, r));
const BASE = 'http://localhost:5199/';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox']
});

let chequeos = 0, fallas = 0;
function ok(cond, msg){ chequeos++; if(!cond){ fallas++; console.log('✗', msg); } }
const esperar = ms => new Promise(r=>setTimeout(r, ms));

async function pagina(url, falso, extraLocal, ancho){
  const page = await browser.newPage();
  await page.setViewport({width: ancho || 390, height: 844, deviceScaleFactor: 2});
  const errores = [];
  page.on('pageerror', e=>errores.push(e.message));
  page.on('console', m=>{ if(m.type() === 'error' && !/favicon|fonts\.g|ERR_|net::|cdnjs/.test(m.text())) errores.push(m.text()); });
  await page.evaluateOnNewDocument((f, local)=>{
    window.__FALSO = f;
    window.__abiertas = [];
    window.open = (u)=>{ window.__abiertas.push(u || '(vacía)'); return {location: {set href(v){ window.__abiertas.push(v); }}, close(){}}; };
    try{ Object.entries(local || {}).forEach(([k, v])=>localStorage.setItem(k, v)); }catch(e){}
  }, falso, extraLocal || {});
  await page.goto(BASE + url, {waitUntil: 'networkidle2'});
  await esperar(400);
  return {page, errores};
}
const click = (page, sel)=>page.$eval(sel, el=>el.click());
const clickTexto = (page, texto, sel = 'button')=>page.evaluate((t, s)=>{
  const el = [...document.querySelectorAll(s)].find(b=>b.textContent.includes(t) && b.offsetParent !== null);
  if(!el) throw new Error('No encontré "' + t + '"');
  el.click();
}, texto, sel);
const texto = (page, sel)=>page.$eval(sel, el=>el.innerText);
/* el diálogo propio de confirmación (confirmar()) */
const aceptarDialogo = page=>page.evaluate(()=>{ if(document.getElementById('dialogOverlay').classList.contains('show')) document.getElementById('dlgOk').click(); });

/* ---------- Datos de prueba ---------- */
const hoy = new Date();
const iso = d=>Comun.isoLocal(d);
const ayer = new Date(hoy.getTime() - 86400000);
const hh = d=>String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
const haceMedia = new Date(hoy.getTime() - 30*60000);
const enMedia = new Date(hoy.getTime() + 30*60000);
const datosProfe = {
  alumnos: [{id:'a1', nombre:'Sofi', tarifa:9000, tipo:'nino', contacto:'Laura', telefono:'2611234567', direccion:'', color:'#3b82f6', temasIds:['t1'], mensajes:[], activo:true, nivel:'secundario', modalidad:'casa_alumno', temario:[], pasajes:2}],
  temas: [{id:'t1', nombre:'Matemática'}],
  clases: [
    {id:'c1', serieId:null, alumnoId:'a1', fecha: iso(ayer), horaEntrada:'10:00', horaSalida:'11:00', duracionMin:60, monto:9000, viatico:3360, modalidad:'casa_alumno', pagada:false, notas:'privado'},
    {id:'c2', serieId:null, alumnoId:'a1', fecha: iso(haceMedia), horaEntrada: hh(haceMedia), horaSalida: hh(enMedia), duracionMin:60, monto:9000, viatico:0, modalidad:'casa_mia', pagada:false, notas:''}
  ],
  tareas: [{id:'k1', alumnoId:'a1', temaId:'t1', claseId:null, texto:'Ejercicios 1 a 5', hecha:false}],
  resenas: [{id:'r0', alumnoId:null, alumnoNombre:'Tomi', autor:'Carla', relacion:'mamá', estrellas:5, texto:'Muy buena profe', fecha:'2026-10-01', publicar:true}],
  config: {tarifaMin:7000, tarifaMax:15000, paleta:'terracota', tema:'light', tutorialVisto:true, nombreProfe:'Ana Pérez', telefonoProfe:'5492615550000'}
};

/* =========================================================
   PROFE
   ========================================================= */
{
  const {page, errores} = await pagina('index.html', {
    usuario: {uid:'profe', displayName:'Ana Pérez', email:'ana@x.com'},
    docs: {'users/profe': datosProfe}
  });
  await esperar(600);
  ok(await page.title() === 'Estudiemos', 'el título es Estudiemos');
  ok(!(await page.$eval('#notifToggle', b=>b.hidden)), 'con sesión se ve la campanita');
  ok((await texto(page, '#nextClassActions')).includes('Pizarra'), 'la clase en curso ofrece la pizarra');
  await page.screenshot({path: join(capturas, 'profe-1-agenda.png')});

  // Ficha del alumno → invitar a la app
  await page.evaluate(()=>{ goTo('alumnos'); abrirDetalleAlumno('a1'); });
  await esperar(200);
  ok((await texto(page, '#detalleAula')).includes('Invitar a la app'), 'la ficha ofrece invitar a la app');
  await clickTexto(page, 'Invitar a la app');
  await esperar(500);
  const aulaId = await page.evaluate(()=>db.alumnos[0].aulaId);
  ok(/^[a-z0-9]{20}$/.test(aulaId || ''), 'se creó el acceso del alumno');
  ok(await page.evaluate(id=>window.__docs.has('aulas/' + id), aulaId), 'quedó en la nube');
  const abiertas = await page.evaluate(()=>window.__abiertas);
  ok(abiertas.some(u=>u.includes('wa.me/2611234567') && u.includes(encodeURIComponent('estudiante.html?aula=' + aulaId))), 'se abre WhatsApp con el link de invitación');
  const aula0 = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  ok(aula0 && !JSON.stringify(aula0).includes('privado'), 'no se publican las notas privadas');
  ok(aula0.profeNombre === 'Ana Pérez', 'se publica el nombre del profe');

  // La mamá se sumó y contó qué le interesa
  await page.evaluate(id=>{
    const a = window.__docs.get('aulas/' + id);
    a.miembros = ['mama']; a.miembrosInfo = {mama: {nombre:'Laura', email:'laura@x.com', rol:'familia'}};
    window.__docs.set('aulas/' + id, a);
    window.__docs.set('aulas/' + id + '/alumno/perfil', {intereses: 'Quiere preparar el ingreso'});
    db.alumnos[0].mostrarMontos = true; saveDB();
  }, aulaId);
  await esperar(1500);
  const aulaTxt = await texto(page, '#detalleAula');
  ok(aulaTxt.includes('Laura') && aulaTxt.includes('Familia'), 'la ficha muestra quién se sumó');
  ok(aulaTxt.includes('Quiere preparar el ingreso'), 'la ficha muestra lo que le interesa');
  await page.screenshot({path: join(capturas, 'profe-2-ficha.png'), fullPage: true});

  // Aviso
  await page.type('#f_aviso', 'El jueves no hay clase');
  await page.keyboard.press('Enter');
  await esperar(2200);
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.para==='mama' && v.tipo==='aviso')), 'el aviso le llega como notificación a la familia');

  // Actividad
  await page.evaluate(()=>openTpForm(null, 'a1'));
  await page.type('#f_tp_titulo', 'Repaso de tablas');
  await page.evaluate(()=>insertarEjemploTp());
  ok((await texto(page, '#tpPreview')).includes('4 preguntas'), 'la vista previa cuenta las preguntas');
  await page.screenshot({path: join(capturas, 'profe-3-actividad.png'), fullPage: true});
  await clickTexto(page, 'Guardar', '#sheetContent button');
  await esperar(2500);
  const aula1 = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  ok(aula1.tps.length === 1 && aula1.tps[0].preguntas.length === 4, 'la actividad llega al alumno');
  ok(aula1.clases.find(c=>c.id==='c1').monto === 12360, 'con "mostrar montos" el alumno ve el total con pasajes');
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.tipo==='tp' && v.para==='mama')), 'se notifica la actividad nueva');

  // Entrega simulada y corrección
  const tpId = aula1.tps[0].id;
  await page.evaluate((id, tp)=>{
    window.__docs.set('aulas/' + id + '/entregas/' + tp, {respuestas:{p1:1, p2:true, p3:'7', p4:'Una parte de un entero'}, estado:'enviada', enviadaEn:{__ts: Date.now()}, por:'mama', porNombre:'Laura', comentario:'La 4 me costó'});
    db.alumnos[0].mostrarMontos = false; saveDB();
  }, aulaId, tpId);
  await esperar(1500);
  ok((await texto(page, '#detalleTps')).includes('Para corregir'), 'la actividad entregada aparece para corregir');
  await click(page, '#detalleTps .list-item');
  await esperar(300);
  const ver = await texto(page, '#sheetContent');
  ok(ver.includes('3/3') && ver.includes('La 4 me costó'), 'se ve el puntaje y el comentario de la entrega');
  await page.screenshot({path: join(capturas, 'profe-4-corregir.png'), fullPage: true});
  await page.type('#f_devolucion', '¡Excelente!');
  await page.type('#f_nota', '10');
  await clickTexto(page, 'Enviar devolución');
  await esperar(300);
  const ent = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, tpId);
  ok(ent.estado === 'corregida' && ent.nota === '10' && ent.devolucion === '¡Excelente!', 'la devolución se guarda');

  // Clase: resumen y pizarra
  await page.evaluate(()=>openClaseForm('c1'));
  await esperar(200);
  ok(!!(await page.$('#f_resumen')), 'el formulario de clase tiene el resumen para el alumno');
  await clickTexto(page, 'Abrir una pizarra para esta clase');
  await esperar(500);
  const c1 = await page.evaluate(()=>db.clases.find(c=>c.id==='c1'));
  ok(c1.pizarra && /^[A-HJKMNP-Z2-9]{6}$/.test(c1.pizarra.codigo), 'la clase quedó con su pizarra');
  ok(await page.evaluate(code=>window.__docs.has('rooms/' + code) && window.__docs.has('rooms/' + code + '/admins/profe'), c1.pizarra.codigo), 'se creó la sala con el profe como admin');
  ok((await page.evaluate(()=>window.__abiertas)).some(u=>u.includes('/sala/' + c1.pizarra.codigo + '#admin=')), 'se abre la pizarra con el enlace de administración');
  await page.evaluate(()=>{ document.querySelector('details.more').open = true; document.getElementById('f_resumen').value = 'Vimos fracciones equivalentes'; });
  await page.screenshot({path: join(capturas, 'profe-5-clase.png'), fullPage: true});
  await clickTexto(page, 'Guardar cambios', '#sheetContent button');
  await esperar(2500);
  const c1pub = (await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId)).clases.find(c=>c.id==='c1');
  ok(c1pub.resumen === 'Vimos fracciones equivalentes' && c1pub.pizarra && !c1pub.pizarra.clave, 'el alumno recibe el resumen y la pizarra (sin la clave)');

  // Reseña que llega desde la app → se suma a la lista de reseñas
  await page.evaluate(id=>{
    window.__docs.set('aulas/' + id + '/resenas/mama', {estrellas:5, texto:'Sofi ama las clases. Explica con mucha paciencia y siempre trae ejemplos nuevos.', autor:'Laura', rol:'familia', permitePublicar:true, creada:{__ts: Date.now()}});
    saveDB();
  }, aulaId);
  await esperar(1500);
  const rs = await page.evaluate(()=>db.resenas.map(r=>r.id));
  ok(rs.length === 2 && rs.some(id=>id.startsWith('app:')), 'la reseña de la app se suma a las reseñas');
  await page.evaluate(()=>abrirResenas());
  await esperar(200);
  await clickTexto(page, 'A tu página');
  await esperar(1500);
  const perfil = await page.evaluate(()=>window.__docs.get('perfiles/profe'));
  ok(perfil && perfil.resenas.length === 1 && perfil.resenas[0].autor.includes('Laura') && perfil.nombre === 'Ana Pérez', 'la reseña elegida se publica en la página del profe');
  await page.screenshot({path: join(capturas, 'profe-6-resenas.png'), fullPage: true});
  await page.evaluate(()=>{ navigator.canShare = undefined; window.__descargas = 0; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ if(this.download) window.__descargas++; else o.call(this); }; });
  await clickTexto(page, 'Imagen');
  await esperar(1500);
  ok(!!(await page.$('#sheetContent img')), 'se muestra la imagen para Instagram');
  await page.screenshot({path: join(capturas, 'profe-7-instagram.png'), fullPage: true});
  await clickTexto(page, 'Descargar', '#sheetContent button');
  ok(await page.evaluate(()=>window.__descargas) === 1, 'la imagen se descarga');
  // borrar la reseña de la app no la vuelve a traer
  await page.evaluate(()=>{ eliminarResena(db.resenas.find(r=>r.id.startsWith('app:')).id); });
  await esperar(150); await aceptarDialogo(page); await esperar(300);
  await page.evaluate(()=>saveDB());
  await esperar(1500);
  ok(await page.evaluate(()=>!db.resenas.some(r=>r.id.startsWith('app:'))), 'una reseña de la app borrada no vuelve');

  // Ajustes: notificaciones
  await page.evaluate(()=>abrirAjustes());
  await clickTexto(page, 'Notificaciones y recordatorios');
  await esperar(300);
  ok(!!(await page.$('#f_n_antes')), 'ajustes de recordatorios');
  await page.screenshot({path: join(capturas, 'profe-8-notif-ajustes.png'), fullPage: true});
  await page.select('#f_n_antes', '60');
  await clickTexto(page, 'Guardar', '#sheetContent button');
  ok(await page.evaluate(()=>db.config.notif.antesMin) === 60, 'se guardan los recordatorios');

  // Campanita
  await page.evaluate(()=>{ closeSheet(); window.__docs.set('notifs/x1', {para:'profe', titulo:'📥 Entregó una actividad', cuerpo:'Sofi entregó', leida:false, aulaId: db.alumnos[0].aulaId, tipo:'entrega', creada:{__ts: Date.now()}}); saveDB(); });
  await esperar(1500);
  ok((await page.$eval('#notifCount', e=>!e.hidden && e.textContent)) === '1', 'la campanita cuenta 1 sin leer');
  await click(page, '#notifToggle');
  await esperar(300);
  ok((await texto(page, '#sheetContent')).includes('Entregó una actividad'), 'la lista de notificaciones la muestra');
  await page.screenshot({path: join(capturas, 'profe-9-notifs.png')});

  ok(errores.length === 0, 'la app del profe no tiró errores: ' + errores.join(' | '));
  globalThis.__aula = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  globalThis.__aulaId = aulaId;
  globalThis.__entrega = ent;
  globalThis.__tpId = tpId;
  await page.close();
}

/* En computadora (menú lateral) */
{
  const {page, errores} = await pagina('index.html', {usuario: {uid:'profe', displayName:'Ana', email:'a@x.com'}, docs: {'users/profe': datosProfe}}, {}, 1280);
  await esperar(600);
  await page.evaluate(()=>abrirDetalleAlumno('a1'));
  await esperar(300);
  await page.screenshot({path: join(capturas, 'profe-10-compu.png')});
  ok(errores.length === 0, 'en computadora no hay errores: ' + errores.join(' | '));
  await page.close();
}

/* Sin sesión: la app del profe sigue funcionando como siempre */
{
  const {page, errores} = await pagina('index.html', {usuario: null, docs: {}}, {estudiantes_app_data_v1: JSON.stringify(datosProfe)});
  await esperar(400);
  ok(await page.$eval('#notifToggle', b=>b.hidden), 'sin sesión no hay campanita');
  await page.evaluate(()=>abrirDetalleAlumno('a1'));
  await clickTexto(page, 'Invitar a la app');
  await esperar(200);
  ok(await page.$eval('#dialogOverlay', d=>d.classList.contains('show')) && (await texto(page, '#dlgTitle')).includes('Iniciá sesión'), 'sin sesión, invitar pide iniciar sesión');
  ok(errores.length === 0, 'sin sesión no hay errores: ' + errores.join(' | '));
  await page.close();
}

/* =========================================================
   ESTUDIANTE / FAMILIA
   ========================================================= */
{
  const aulaId = globalThis.__aulaId;
  const aula = globalThis.__aula;
  aula.miembros = ['mama'];
  aula.invitacionAbierta = true;

  {
    const {page, errores} = await pagina('estudiante.html?aula=' + aulaId, {usuario: null, docs: {['aulas/' + aulaId]: aula}});
    const t = await texto(page, '#view-entrada');
    ok(t.includes('¡Tu profe te invitó!') && t.includes('Soy de la familia'), 'la invitación pregunta quién sos');
    await page.screenshot({path: join(capturas, 'est-0-invitacion.png')});
    ok(errores.length === 0, 'invitación sin errores: ' + errores.join(' | '));
    await page.close();
  }

  const {page, errores} = await pagina('estudiante.html?aula=' + aulaId, {
    usuario: {uid:'sofi', displayName:'Sofía Gómez', email:'sofi@x.com'},
    docs: {['aulas/' + aulaId]: aula, ['aulas/' + aulaId + '/entregas/' + globalThis.__tpId]: globalThis.__entrega}
  });
  await esperar(500);
  const unida = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  ok(unida.miembros.includes('sofi') && unida.miembrosInfo.sofi.rol === 'alumno', 'el estudiante se sumó');
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.tipo==='miembro' && v.para==='profe')), 'se le avisa al profe');
  ok(!(await page.$eval('#tabs', t=>t.hidden)), 'se ve la barra de abajo');
  const inicio = await texto(page, '#view-inicio');
  ok(/1 clase por abonar/.test(inicio), 'el inicio muestra las clases por abonar');
  ok(!inicio.includes('$'), 'sin "mostrar montos" no aparecen montos');
  ok(inicio.includes('El jueves no hay clase'), 'se ve el aviso');
  ok(inicio.includes('Repaso de tablas'), 'aparece la corrección nueva');
  ok(page.url().endsWith('estudiante.html'), 'se limpia el link de invitación');
  await page.screenshot({path: join(capturas, 'est-1-inicio.png'), fullPage: true});

  await click(page, '#tabs button[data-view="clases"]');
  const clases = await texto(page, '#view-clases');
  ok(clases.includes('Vimos fracciones equivalentes') && clases.includes('Pizarra'), 'en Clases se ve el resumen y la pizarra');
  ok(!clases.includes('privado'), 'no se ven las notas privadas');
  await page.screenshot({path: join(capturas, 'est-2-clases.png'), fullPage: true});

  await click(page, '#tabs button[data-view="tps"]');
  ok((await texto(page, '#view-tps')).includes('Corregida'), 'la actividad aparece corregida');
  await click(page, '#view-tps [data-tp]');
  await esperar(200);
  ok((await texto(page, '#sheetContent')).includes('¡Excelente!'), 'se ve la devolución del profe');
  await page.screenshot({path: join(capturas, 'est-3-devolucion.png'), fullPage: true});
  // Sin la entrega, para resolverla desde cero
  await page.evaluate(async (id, tp)=>{
    window.__docs.delete('aulas/' + id + '/entregas/' + tp);
    const m = await import('./js/firebase.js');
    await m.setDoc(m.doc(m.db, 'x', 'z'), {a: 1});
  }, aulaId, globalThis.__tpId);
  await page.evaluate(()=>document.querySelector('[data-cerrar]').click());
  await esperar(300);
  ok((await texto(page, '#view-tps')).includes('Por hacer'), 'sin entrega queda por hacer');
  await page.screenshot({path: join(capturas, 'est-4-actividades.png'), fullPage: true});
  await click(page, '#view-tps [data-tp]');
  await clickTexto(page, 'Empezar', '#sheetContent button');
  await esperar(200);
  ok(!(await page.$eval('#jugar', j=>j.hidden)), 'se abre la pantalla de juego');
  await page.evaluate(()=>document.querySelector('.opcion[data-k="0"]').click());
  await clickTexto(page, 'Comprobar');
  ok((await texto(page, '.feedback')).includes('56'), 'si me equivoco me muestra la correcta');
  await esperar(400);
  await page.screenshot({path: join(capturas, 'est-5-juego.png')});
  await clickTexto(page, 'Continuar');
  await clickTexto(page, 'Verdadero');
  await clickTexto(page, 'Comprobar');
  ok(await page.$eval('.feedback', f=>f.classList.contains('bien')), 'V/F bien');
  await clickTexto(page, 'Continuar');
  await page.type('#respNum', '7');
  await clickTexto(page, 'Comprobar');
  ok(await page.$eval('.feedback', f=>f.classList.contains('bien')), 'numérica bien');
  await clickTexto(page, 'Continuar');
  await page.type('#respTexto', 'Es una parte de un todo');
  await clickTexto(page, 'Siguiente');
  ok((await texto(page, '#jugar')).includes('2 de 3 bien'), 'el final muestra el puntaje');
  await page.screenshot({path: join(capturas, 'est-6-final.png')});
  await clickTexto(page, 'Enviar a mi profe');
  await esperar(400);
  const entrega = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, globalThis.__tpId);
  ok(entrega && entrega.estado === 'enviada' && entrega.respuestas.p4 === 'Es una parte de un todo' && entrega.puntaje.ok === 2, 'la entrega se guarda con las respuestas');
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.tipo==='entrega' && v.para==='profe')), 'se le avisa al profe de la entrega');

  await click(page, '#tabs button[data-view="yo"]');
  await page.type('#f_intereses', 'Me cuestan las fracciones');
  await click(page, '#btnIntereses');
  await page.evaluate(()=>document.querySelector('#estrellasInput [data-n="4"]').click());
  await page.type('#f_resena', 'Me gustan mucho las clases');
  await click(page, '#btnResena');
  await esperar(300);
  const res = await page.evaluate(id=>window.__docs.get('aulas/' + id + '/resenas/sofi'), aulaId);
  ok(res && res.estrellas === 4 && res.permitePublicar === true && res.rol === 'alumno', 'la reseña se guarda');
  ok((await page.evaluate(id=>window.__docs.get('aulas/' + id + '/alumno/perfil'), aulaId)).intereses === 'Me cuestan las fracciones', 'los intereses se guardan');
  await page.screenshot({path: join(capturas, 'est-7-yo.png'), fullPage: true});

  ok(errores.length === 0, 'la app del estudiante no tiró errores: ' + errores.join(' | '));
  await page.close();
}

/* Página pública de reseñas */
{
  const {page, errores} = await pagina('resenas.html?p=profe', {usuario: null, docs: {'perfiles/profe': {nombre:'Ana Pérez', bio:'Clases de matemática', materias:['Matemática'], resenas:[{estrellas:5, texto:'Excelente profe', autor:'Laura, familiar de Sofi'}]}}});
  const t = await texto(page, 'body');
  ok(t.includes('Ana Pérez') && t.includes('Excelente profe'), 'la página pública muestra las reseñas');
  await page.screenshot({path: join(capturas, 'resenas-publica.png'), fullPage: true});
  ok(errores.length === 0, 'la página de reseñas no tiró errores: ' + errores.join(' | '));
  await page.close();
}

await browser.close();
server.close();
console.log(`${chequeos} chequeos, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
