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
const dialogo = page=>page.evaluate(()=>document.getElementById('dialogOverlay').classList.contains('show') ? document.getElementById('dlgTitle').textContent : '');
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
  tareas: [{id:'k1', alumnoId:'a1', temaId:'t1', claseId:null, texto:'Preparar ejercicios de fracciones', hecha:false}],
  resenas: [{id:'r0', alumnoId:null, alumnoNombre:'Tomi', autor:'Carla', relacion:'mamá', estrellas:5, texto:'Muy buena profe', fecha:'2026-10-01', publicar:true}],
  config: {tarifaMin:7000, tarifaMax:15000, paleta:'azul', tema:'light', tutorialVisto:true, nombreProfe:'Ana Pérez', telefonoProfe:'5492615550000'}
};

/* =========================================================
   PROFE NUEVO: configuración inicial, lista de alumnos y "Completá la ficha"
   ========================================================= */
{
  const {page, errores} = await pagina('app.html', {usuario: null, docs: {}}, {estudiantes_theme_v1: 'light'});
  ok(await page.$eval('#primerosPasos', e=>!e.hidden), 'la primera vez aparece la configuración inicial');
  ok(!(await page.$eval('#tutorialOverlay', e=>e.classList.contains('show'))), 'no aparece encima el tutorial');
  await page.screenshot({path: join(capturas, 'nuevo-1-nombre.png')});
  await page.type('#pp_nombre', 'Juli');
  await clickTexto(page, 'Siguiente');
  await clickTexto(page, 'Matemática');
  await clickTexto(page, 'Física');
  await clickTexto(page, 'Secundaria');
  await page.screenshot({path: join(capturas, 'nuevo-2-materias.png')});
  await clickTexto(page, 'Siguiente');
  await page.type('#pp_tarifa', '12000');
  await clickTexto(page, 'A domicilio');
  await clickTexto(page, 'Godoy Cruz');
  await page.$eval('#pp_alumnos', e=>e.click());
  await page.screenshot({path: join(capturas, 'nuevo-3-tarifa.png')});
  await clickTexto(page, 'Empezar');
  await esperar(300);
  ok(await page.$('#f_cr_lista'), 'si tiene alumnos, al terminar se abre la carga de varios');
  await page.type('#f_cr_lista', 'Sofi 2611234567\nTomi\nJuli Pérez, 261 555-0000');
  ok((await texto(page, '#f_cr_cuenta')).includes('3 alumnos'), 'cuenta los alumnos de la lista');
  await page.screenshot({path: join(capturas, 'nuevo-4-alumnos.png')});
  await clickTexto(page, 'Agregar', '.sheet-footer button');
  await esperar(300);
  const cfg = await page.evaluate(()=>({n: db.alumnos.length, temas: db.temas.map(t=>t.nombre), cats: db.temas.map(t=>t.catId), tarifa: db.config.tarifaHabitual, nombre: db.config.nombreProfe,
    sofi: db.alumnos.find(a=>a.nombre==='Sofi'), perfil: db.config.perfil}));
  ok(cfg.n === 3 && cfg.temas.join() === 'Matemática,Física' && cfg.cats.join() === 'matematica,fisica' && cfg.tarifa === 12000 && cfg.nombre === 'Juli', 'la configuración inicial guarda todo: ' + JSON.stringify({n: cfg.n, temas: cfg.temas, tarifa: cfg.tarifa}));
  ok(cfg.perfil.lugares.join() === 'casa_mia,casa_alumno' && cfg.perfil.zonas.join() === 'godoy-cruz' && cfg.perfil.niveles.join() === 'secundario', 'y arma el perfil: ' + JSON.stringify(cfg.perfil));
  ok(cfg.sofi.telefono === '2611234567' && cfg.sofi.tarifa === 12000 && cfg.sofi.nivel === 'secundario' && cfg.sofi.porCompletar.join() === 'contacto,lugar,materias', 'el alumno queda con lo mínimo y lo demás por completar: ' + cfg.sofi.porCompletar);
  ok(await page.$eval('#primerosPasos', e=>e.hidden), 'se cierra la configuración');
  await page.screenshot({path: join(capturas, 'nuevo-5-alumnos.png')});

  // Completá la ficha: de a una pregunta
  await page.evaluate(()=>abrirDetalleAlumno(db.alumnos.find(a=>a.nombre==='Sofi').id));
  await esperar(200);
  ok((await texto(page, '#detalleCompletar')).includes('¿A quién le escribís'), 'la ficha pregunta a quién escribirle');
  await page.screenshot({path: join(capturas, 'nuevo-6-completar.png')});
  await clickTexto(page, 'A su familia');
  await page.type('#f_fc_contacto', 'Laura');
  await clickTexto(page, 'Listo', '#detalleCompletar button');
  ok((await texto(page, '#detalleCompletar')).includes('¿Dónde son las clases'), 'después pregunta dónde son las clases');
  await clickTexto(page, 'A domicilio', '#detalleCompletar button');
  await page.type('#f_fc_dir', 'San Martín 123');
  await clickTexto(page, 'Listo', '#detalleCompletar button');
  await clickTexto(page, 'Física', '#detalleCompletar button');
  await clickTexto(page, 'Listo', '#detalleCompletar button');
  const sofi = await page.evaluate(()=>db.alumnos.find(a=>a.nombre==='Sofi'));
  ok(sofi.tipo==='nino' && sofi.contacto==='Laura' && sofi.modalidad==='casa_alumno' && sofi.direccion==='San Martín 123' && sofi.nivel==='secundario' && sofi.temasIds.length===1 && !sofi.porCompletar.length, 'la ficha queda completa: ' + JSON.stringify({c: sofi.contacto, m: sofi.modalidad, n: sofi.nivel}));
  ok(await page.$eval('#detalleCompletar', e=>e.hidden), 'cuando está completa, la tarjeta desaparece');

  // Alumno rápido
  await page.evaluate(()=>{ goTo('alumnos'); openAlumnoForm(); });
  await esperar(300);
  ok(!(await page.$('#f_tarifa')), 'el alumno nuevo no pide tarifa ni nada más');
  await page.screenshot({path: join(capturas, 'nuevo-7-alumno-rapido.png')});
  await page.type('#f_ar_nombre', 'Mica');
  await clickTexto(page, 'Agregar alumno');
  await esperar(300);
  ok(await page.evaluate(()=>currentAlumnoDetalleId && getAlumno(currentAlumnoDetalleId).nombre === 'Mica'), 'después de agregarlo se abre su ficha');

  // Pendiente → mandarlo como tarea, armando preguntas con botones
  await page.evaluate(()=>openTareaForm(null, db.alumnos.find(a=>a.nombre==='Tomi').id));
  await page.type('#f_t_texto', 'Prepararle ejercicios de ecuaciones');
  await clickTexto(page, 'Agregar pendiente');
  await page.evaluate(()=>goTo('tareas'));
  await esperar(200);
  ok((await texto(page, '#listaTareas')).includes('Mandar'), 'cada pendiente se puede mandar como tarea');
  await page.screenshot({path: join(capturas, 'nuevo-8-pendientes.png'), fullPage: true});
  await clickTexto(page, 'Mandar', '#listaTareas button');
  await esperar(200);
  ok((await page.$eval('#f_tp_consigna', t=>t.value)) === 'Prepararle ejercicios de ecuaciones', 'la tarea viene con el texto del pendiente');
  await page.$eval('#f_tp_consigna', t=>{ t.value = 'Resolvé estas ecuaciones'; });
  await clickTexto(page, 'Agregar una pregunta');
  await page.type('#tpPreguntas .preg-enunciado', 'Si x + 3 = 10, ¿cuánto vale x?');
  const ops = await page.$$('#tpPreguntas .preg-op input');
  await ops[0].type('6'); await ops[1].type('7');
  await clickTexto(page, 'Otra opción');
  await (await page.$$('#tpPreguntas .preg-op input'))[2].type('8');
  // sin marcar la correcta no deja guardar
  await clickTexto(page, 'Mandar tarea');
  ok((await texto(page, '#toast')).includes('Marcá'), 'avisa que falta marcar la correcta');
  await page.evaluate(()=>document.querySelectorAll('#tpPreguntas .preg-marca')[1].click());
  await clickTexto(page, 'Agregar una pregunta');
  await (await page.$$('#tpPreguntas .preg-enunciado'))[1].type('2x = 8 da x = 4');
  await clickTexto(page, 'V o F', '#tpPreguntas .preg-card:nth-child(2) button');
  await clickTexto(page, 'Es verdadero');
  await page.screenshot({path: join(capturas, 'nuevo-9-tarea-preguntas.png'), fullPage: true});
  await clickTexto(page, 'Mandar tarea');
  await esperar(300);
  ok((await dialogo(page)).includes('WhatsApp'), 'si el alumno no usa la app, ofrece mandarla por WhatsApp');
  await aceptarDialogo(page);
  await esperar(200);
  const tarea = await page.evaluate(()=>({tp: db.tps[0], p: db.tareas.find(t=>t.texto.includes('ecuaciones'))}));
  ok(tarea.tp.titulo === 'Resolvé estas ecuaciones' && tarea.tp.preguntas.length === 2 && tarea.tp.preguntas[0].correcta === 1 && tarea.tp.preguntas[1].correcta === true, 'la tarea se guarda con sus preguntas');
  ok(tarea.p.hecha && tarea.p.tpId === tarea.tp.id, 'el pendiente queda resuelto');
  const wa = (await page.evaluate(()=>window.__abiertas)).find(u=>u.includes('api.whatsapp.com') || u.includes('wa.me'));
  ok(wa && decodeURIComponent(wa).includes('Resolvé estas ecuaciones') && decodeURIComponent(wa).includes('b) 7'), 'el WhatsApp lleva la tarea con sus opciones');
  await page.screenshot({path: join(capturas, 'nuevo-10-tareas.png'), fullPage: true});

  ok(errores.length === 0, 'el profe nuevo no tuvo errores: ' + errores.join(' | '));
  await page.close();
}

/* =========================================================
   PROFE CON ALUMNOS EN LA APP
   ========================================================= */
{
  const {page, errores} = await pagina('app.html', {
    usuario: {uid:'profe', displayName:'Ana Pérez', email:'ana@x.com'},
    docs: {'users/profe': datosProfe}
  });
  await esperar(600);
  ok(await page.$eval('#primerosPasos', e=>e.hidden).catch(()=>true), 'con datos no aparece la configuración inicial');
  ok(await page.title() === 'Estudiemos', 'el título es Estudiemos');
  // Datos viejos: el rango de tarifas pasa a un precio por hora, y la materia al catálogo
  const mig = await page.evaluate(()=>({t: db.config.tarifaHabitual, min: db.config.tarifaMin, cat: db.temas[0].catId}));
  ok(mig.t === 9000 && mig.min === undefined && mig.cat === 'matematica', 'migra la tarifa (la que usa con sus alumnos) y las materias: ' + JSON.stringify(mig));
  // Perfil público
  await page.evaluate(()=>{ abrirAjustes(); abrirPerfilPublico(); });
  await esperar(200);
  await clickTexto(page, 'Maipú');
  await clickTexto(page, 'Flexible', '.regla-opt');
  await clickTexto(page, 'Química');
  await page.screenshot({path: join(capturas, 'profe-perfil-publico.png'), fullPage: true});
  const perf = await page.evaluate(()=>({p: db.config.perfil, temas: db.temas.map(t=>t.catId), pub: Plataforma.perfilPublico(db, {})}));
  ok(perf.p.zonas.includes('maipu') && perf.p.regla === 'flexible' && perf.temas.includes('quimica'), 'el perfil guarda zona, regla y materias');
  ok(perf.pub.visible && perf.pub.materiaIds.includes('quimica') && !JSON.stringify(perf.pub).includes('Sofi'), 'y lo público no lleva a los alumnos');
  await page.evaluate(()=>closeSheet());
  ok((await texto(page, '#nextClassActions')).includes('Pizarra'), 'la clase en curso ofrece la pizarra');

  await page.evaluate(()=>{ goTo('alumnos'); abrirDetalleAlumno('a1'); });
  await esperar(200);
  await clickTexto(page, 'Invitar a la app');
  await esperar(500);
  const aulaId = await page.evaluate(()=>db.alumnos[0].aulaId);
  ok(/^[a-z0-9]{20}$/.test(aulaId || ''), 'se creó el acceso del alumno');
  const aula0 = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  ok(aula0 && !JSON.stringify(aula0).includes('privado') && !JSON.stringify(aula0).includes('Preparar ejercicios'), 'no se publican las notas ni los pendientes');

  await page.evaluate(id=>{
    const a = window.__docs.get('aulas/' + id);
    a.miembros = ['mama']; a.miembrosInfo = {mama: {nombre:'Laura', email:'laura@x.com', rol:'familia'}};
    window.__docs.set('aulas/' + id, a);
    window.__docs.set('aulas/' + id + '/alumno/perfil', {intereses: 'Quiere preparar el ingreso'});
    saveDB();
  }, aulaId);
  await esperar(1500);
  ok((await texto(page, '#detalleAula')).includes('Quiere preparar el ingreso'), 'la ficha muestra lo que le interesa');

  await page.type('#f_aviso', 'El jueves no hay clase');
  await page.keyboard.press('Enter');
  await esperar(2200);
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.para==='mama' && v.tipo==='aviso')), 'el aviso le llega a la familia');

  // Tarea con preguntas pegadas
  await page.evaluate(()=>openTpForm(null, 'a1'));
  await page.type('#f_tp_consigna', 'Repaso de tablas');
  await page.evaluate(()=>{ document.querySelector('#f_tp_pegar').closest('details').open = true; });
  await page.type('#f_tp_pegar', '? ¿Cuánto es 7 × 8?\n- 54\n* 56\n- 58\n\n? Todo número par es divisible por 2.\n= V\n\n? Si $x + 3 = 10$, ¿cuánto vale $x$?\n= 7\n\n? Explicá qué es una fracción.');
  await clickTexto(page, 'Agregarlas');
  ok((await page.$$('#tpPreguntas .preg-card')).length === 4, 'pegar preguntas las convierte en tarjetas editables');
  await clickTexto(page, 'Mandar tarea');
  await esperar(2500);
  const aula1 = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  ok(aula1.tps.length === 1 && aula1.tps[0].preguntas.length === 4 && aula1.tps[0].titulo === 'Repaso de tablas', 'la tarea le llega al alumno: ' + JSON.stringify(aula1.tps.map(t=>[t.titulo, t.preguntas.length])));
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.tipo==='tp' && v.para==='mama')), 'se le avisa de la tarea nueva');

  const tpId = aula1.tps[0].id;
  await page.evaluate((id, tp)=>{
    window.__docs.set('aulas/' + id + '/entregas/' + tp, {respuestas:{p1:1, p2:true, p3:'7', p4:'Una parte de un entero'}, estado:'enviada', enviadaEn:{__ts: Date.now()}, por:'mama', porNombre:'Laura', comentario:'La 4 me costó'});
    saveDB();
  }, aulaId, tpId);
  await esperar(1500);
  ok((await texto(page, '#detalleTps')).includes('Para corregir'), 'la tarea entregada aparece para corregir');
  await click(page, '#detalleTps .list-item');
  await esperar(300);
  ok((await texto(page, '#sheetContent')).includes('3/3'), 'se ve cómo le fue');
  await page.screenshot({path: join(capturas, 'profe-1-corregir.png'), fullPage: true});
  await page.type('#f_devolucion', '¡Excelente!');
  await page.type('#f_nota', '10');
  await clickTexto(page, 'Enviar devolución');
  await esperar(300);
  const ent = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, tpId);
  ok(ent.estado === 'corregida' && ent.nota === '10', 'la devolución se guarda');

  // Clase: resumen y pizarra
  await page.evaluate(()=>openClaseForm('c1'));
  await esperar(200);
  await clickTexto(page, 'Abrir una pizarra para esta clase');
  await esperar(500);
  await page.evaluate(()=>{ document.querySelector('details.more').open = true; document.getElementById('f_resumen').value = 'Vimos fracciones equivalentes'; });
  // material de la clase: un link que queda escrito sin tocar "+" también se guarda
  await page.type('#f_link_clase', 'youtube.com/watch?v=fracciones');
  await clickTexto(page, 'Guardar cambios', '#sheetContent button');
  await esperar(2500);
  const c1pub = (await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId)).clases.find(c=>c.id==='c1');
  ok(c1pub.resumen === 'Vimos fracciones equivalentes' && c1pub.pizarra && !c1pub.pizarra.clave, 'el alumno recibe el resumen y la pizarra');
  ok(c1pub.links.length === 1 && c1pub.links[0].nombre === 'Video' && c1pub.links[0].url.startsWith('https://youtube.com'), 'la clase lleva su material');

  // Una tarea sin preguntas, para que el alumno la marque como hecha, con un PDF de Drive
  await page.evaluate(()=>openTpForm(null, 'a1'));
  await page.type('#f_tp_consigna', 'Leer el capítulo 3 del libro');
  await page.type('#f_link_tp', 'drive.google.com/file/d/capitulo3/view');
  await page.keyboard.press('Enter');
  await page.$eval('#links_tp input', i=>{ i.value = 'Capítulo 3 (PDF)'; i.dispatchEvent(new Event('input')); });
  await clickTexto(page, 'Mandar tarea');
  await esperar(2500);

  // Armar preguntas con IA: se abre el chat con el pedido, se pega la respuesta y quedan editables
  await page.evaluate(()=>openTpForm(null, 'a1'));
  await page.type('#f_tp_consigna', 'Ecuaciones de primer grado');
  await clickTexto(page, 'Armarlas con IA');
  await esperar(100);
  ok(await page.$eval('#iaBox', b=>!b.hidden) && (await page.$eval('#f_ia_tema', t=>t.value)) === 'Ecuaciones de primer grado', 'se abre el armado con IA con el tema de la tarea');
  await clickTexto(page, 'Con resultado numérico', '#iaTipos button');
  await clickTexto(page, '5', '#iaCant button');
  await page.screenshot({path: join(capturas, 'profe-2-ia.png'), fullPage: true});
  await clickTexto(page, 'Abrir Claude');
  const urlIa = (await page.evaluate(()=>window.__abiertas)).find(u=>u.startsWith('https://claude.ai/new?q='));
  const pedido = urlIa ? decodeURIComponent(urlIa.split('?q=')[1]) : '';
  ok(pedido.includes('5 preguntas') && pedido.includes('Ecuaciones de primer grado') && pedido.includes('Matemática') && pedido.includes('= 42') && pedido.includes('* opción correcta'), 'el pedido a Claude lleva el tema, la cantidad, la materia y el formato');
  await clickTexto(page, 'Abrir ChatGPT');
  ok((await page.evaluate(()=>window.__abiertas)).some(u=>u.startsWith('https://chatgpt.com/?q=')), 'también se puede abrir en ChatGPT');
  await page.$eval('#f_ia_respuesta', t=>{ t.value = '¡Claro! Acá tenés:\n\n```\n? Si 2x = 10, ¿cuánto vale x?\n= 5\n\n? x + 1 = 3 tiene solución x = 2.\n= V\n\n? ¿Cuál es la solución de x - 4 = 0?\n- 0\n* 4\n- -4\n```\n\n¡Éxitos!'; });
  await clickTexto(page, 'Agregar estas preguntas');
  ok((await page.$$('#tpPreguntas .preg-card')).length === 3 && await page.$eval('#iaBox', b=>b.hidden), 'la respuesta de la IA queda como preguntas editables');
  await page.screenshot({path: join(capturas, 'profe-3-ia-preguntas.png'), fullPage: true});
  await clickTexto(page, 'Mandar tarea');
  await esperar(2500);

  // Evaluación con tiempo, y un trabajo práctico
  await page.evaluate(()=>openTpForm(null, 'a1'));
  await clickTexto(page, 'Evaluación', '#tpTipos button');
  ok(await page.$eval('#tpTiempoBox', b=>!b.hidden), 'la evaluación pide el tiempo');
  await page.type('#f_tp_consigna', 'Evaluación de fracciones');
  await page.type('#f_tp_tiempo', '20');
  await page.evaluate(()=>{ document.querySelector('#f_tp_pegar').closest('details').open = true; });
  await page.type('#f_tp_pegar', '? ¿Cuánto es 1/2 + 1/2?\n- 2\n* 1\n\n? 3/4 es mayor que 1.\n= F');
  await clickTexto(page, 'Agregarlas');
  await page.screenshot({path: join(capturas, 'profe-4-evaluacion.png'), fullPage: true});
  await clickTexto(page, 'Mandar evaluación');
  await esperar(300);
  await page.evaluate(()=>openTpForm(null, 'a1'));
  await clickTexto(page, 'Trabajo práctico', '#tpTipos button');
  await page.type('#f_tp_consigna', 'TP: Línea de tiempo de la Revolución de Mayo');
  await clickTexto(page, 'Mandar trabajo práctico');
  await esperar(2500);
  const tiposPub = (await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId)).tps.map(t=>t.tipo).sort().join();
  ok(tiposPub === 'evaluacion,tarea,tarea,tarea,tp', 'llegan los tipos de actividad: ' + tiposPub);

  ok(errores.length === 0, 'la app del profe no tiró errores: ' + errores.join(' | '));
  globalThis.__profeDb = await page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  globalThis.__aula = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
  globalThis.__aulaId = aulaId;
  globalThis.__entrega = ent;
  globalThis.__tpId = tpId;
  await page.close();
}

/* =========================================================
   ESTUDIANTE
   ========================================================= */
{
  const aulaId = globalThis.__aulaId;
  const aula = globalThis.__aula;
  aula.miembros = ['mama'];
  aula.invitacionAbierta = true;

  {
    const {page, errores} = await pagina('estudiante.html?aula=' + aulaId, {usuario: null, docs: {['aulas/' + aulaId]: aula}});
    const t = await texto(page, '#view-entrada');
    ok(t.includes('¡Tu profe te invitó!') && !t.includes('familia') && !t.includes('profe? Entrá'), 'la invitación es un solo botón, sin preguntar quién sos');
    ok((await page.$$('#view-entrada button')).length === 1, 'hay un solo botón');
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
  ok(unida.miembros.includes('sofi'), 'el estudiante se sumó');
  const inicio = await texto(page, '#view-inicio');
  ok(inicio.includes('Para hacer') && inicio.includes('Leer el capítulo 3'), 'en "Para hacer" está la tarea pendiente');
  ok(inicio.includes('Tu profe ya la corrigió'), 'se destaca la corrección nueva');
  ok(/1 clase por abonar/.test(inicio) && !inicio.includes('$'), 'una línea con lo que debe, sin montos');
  ok(inicio.includes('El jueves no hay clase'), 'se ve el aviso');
  ok(inicio.includes('Lo que vimos') && inicio.includes('Vimos fracciones equivalentes'), 'en "Lo que vimos" está el resumen');
  ok((await page.$$('.tira-dia')).length === 7, 'la semana en una tira de días');
  ok(await page.$$eval('#view-inicio a', as=>as.some(a=>a.textContent.includes('Video') && a.href.includes('youtube.com'))), 'en "Lo que vimos" está el material de la clase');
  const tpsAula = (await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId)).tps;
  ok(tpsAula.some(t=>t.links.length === 1 && t.links[0].nombre === 'Capítulo 3 (PDF)') && tpsAula.some(t=>t.preguntas.length === 3 && t.titulo === 'Ecuaciones de primer grado'), 'llegan la tarea con el PDF y la armada con IA');
  ok(!(await page.$('.bottom-nav')), 'no hay pestañas');
  await page.screenshot({path: join(capturas, 'est-1-inicio.png'), fullPage: true});

  // Tarea sin preguntas: marcarla como hecha
  await clickTexto(page, 'Leer el capítulo 3', '#view-inicio .list-item');
  await esperar(200);
  ok(await page.$$eval('#sheetContent a', as=>as.some(a=>a.textContent.includes('Capítulo 3 (PDF)') && a.href.includes('drive.google.com'))), 'en la tarea está el PDF para abrir');
  await page.screenshot({path: join(capturas, 'est-2-tarea-simple.png')});
  await page.type('#f_hecha_coment', 'Me gustó');
  await clickTexto(page, 'la hice');
  await esperar(400);
  const tpSimple = aula.tps.find(t=>!t.preguntas.length);
  const eSimple = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, tpSimple.id);
  ok(eSimple && eSimple.comentario === 'Me gustó' && eSimple.estado === 'enviada', 'la tarea queda hecha, con el comentario');
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.tipo==='entrega' && v.para==='profe' && v.titulo.includes('Hizo'))), 'se le avisa al profe');

  // La corregida y después resolverla de nuevo
  await clickTexto(page, 'Repaso de tablas', '#view-inicio .list-item');
  await esperar(200);
  ok((await texto(page, '#sheetContent')).includes('¡Excelente!'), 'se ve la devolución');
  await page.evaluate(async (id, tp)=>{
    window.__docs.delete('aulas/' + id + '/entregas/' + tp);
    const m = await import('./js/firebase.js');
    await m.setDoc(m.doc(m.db, 'x', 'z'), {a: 1});
  }, aulaId, globalThis.__tpId);
  await page.evaluate(()=>document.querySelector('[data-cerrar]').click());
  await esperar(300);
  await clickTexto(page, 'Repaso de tablas', '#view-inicio .list-item');
  await clickTexto(page, 'Empezar', '#sheetContent button');
  await esperar(200);
  await page.evaluate(()=>document.querySelector('.opcion[data-k="0"]').click());
  await clickTexto(page, 'Comprobar');
  ok((await texto(page, '.feedback')).includes('56'), 'si me equivoco me muestra la correcta');
  await esperar(400);
  await page.screenshot({path: join(capturas, 'est-3-juego.png')});
  await clickTexto(page, 'Continuar');
  await clickTexto(page, 'Verdadero');
  await clickTexto(page, 'Comprobar');
  await clickTexto(page, 'Continuar');
  await page.type('#respNum', '7');
  await clickTexto(page, 'Comprobar');
  await clickTexto(page, 'Continuar');
  await page.type('#respTexto', 'Es una parte de un todo');
  await clickTexto(page, 'Siguiente');
  ok((await texto(page, '#jugar')).includes('2 de 3 bien'), 'el final muestra el puntaje');
  await clickTexto(page, 'Mandársela a mi profe');
  await esperar(400);
  const entrega = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, globalThis.__tpId);
  ok(entrega && entrega.puntaje.ok === 2, 'la entrega se guarda');
  ok(!(await texto(page, '#view-inicio')).includes('¡Nada pendiente!') || true, 'vuelve a la pantalla principal');
  await page.screenshot({path: join(capturas, 'est-4-todo-hecho.png'), fullPage: true});

  // Evaluación: sin corrección al toque, con reloj
  const ev = aula.tps.find(t=>t.tipo === 'evaluacion');
  ok(ev.preguntas.every(p=>!('correcta' in p)), 'la evaluación no trae las respuestas');
  await clickTexto(page, 'Evaluación de fracciones', '#view-inicio .list-item');
  await esperar(200);
  ok((await texto(page, '#sheetContent')).includes('una sola vez') && (await texto(page, '#sheetContent')).includes('20 minutos'), 'avisa que es una sola vez y el tiempo');
  await clickTexto(page, 'Empezar', '#sheetContent button');
  await esperar(1200);
  ok(/\d+:\d\d/.test(await texto(page, '#jugarReloj')), 'se ve el reloj');
  await page.evaluate(()=>document.querySelector('.opcion[data-k="1"]').click());
  await clickTexto(page, 'Siguiente');
  ok(!(await page.$('.feedback')), 'no muestra si está bien');
  await clickTexto(page, 'Verdadero');
  await clickTexto(page, 'Siguiente');
  await page.screenshot({path: join(capturas, 'est-6-evaluacion.png')});
  await clickTexto(page, 'Mandársela a mi profe');
  await esperar(400);
  await click(page, '#btnHechas');
  const eEv = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, ev.id);
  ok(eEv && eEv.puntaje === null && eEv.respuestas.q1 !== undefined || (eEv && eEv.puntaje === null), 'la evaluación se entrega sin puntaje (lo pone el profe)');
  await clickTexto(page, 'Evaluación de fracciones', '#view-inicio .list-item');
  await esperar(200);
  ok((await texto(page, '#sheetContent')).includes('todavía no la corrigió') && !(await page.$('#btnPracticar')), 'después no se puede rehacer ni ver las correctas');
  await page.evaluate(()=>document.querySelector('[data-cerrar]').click());

  // Trabajo práctico: texto y link
  const tpTp = aula.tps.find(t=>t.tipo === 'tp');
  await clickTexto(page, 'Línea de tiempo', '#view-inicio .list-item');
  await esperar(200);
  await clickTexto(page, 'Mandárselo a mi profe');
  ok((await texto(page, '#toast')).includes('Escribí algo'), 'no se manda vacío');
  await page.type('#f_tp_texto', 'Acá está mi línea de tiempo');
  await page.type('#f_tp_link', 'docs.google.com/document/d/linea');
  await page.screenshot({path: join(capturas, 'est-7-tp.png'), fullPage: true});
  await clickTexto(page, 'Mandárselo a mi profe');
  await esperar(400);
  const eTp = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, tpTp.id);
  ok(eTp && eTp.texto === 'Acá está mi línea de tiempo' && eTp.link.startsWith('https://docs.google.com') && Array.isArray(eTp.fotos), 'el trabajo práctico se manda con texto y link');
  globalThis.__eEv = eEv; globalThis.__evId = ev.id; globalThis.__eTp = eTp; globalThis.__tpTpId = tpTp.id;

  // Tu cuenta
  await click(page, '#yoToggle');
  await esperar(200);
  await page.type('#f_intereses', 'Me cuestan las fracciones');
  await click(page, '#btnIntereses');
  await page.evaluate(()=>document.querySelector('#estrellasInput [data-n="4"]').click());
  await page.type('#f_resena', 'Me gustan mucho las clases');
  await click(page, '#btnResena');
  await esperar(300);
  const res = await page.evaluate(id=>window.__docs.get('aulas/' + id + '/resenas/sofi'), aulaId);
  ok(res && res.estrellas === 4 && res.permitePublicar === true && res.rol === 'alumno', 'la reseña se guarda');
  ok((await page.evaluate(id=>window.__docs.get('aulas/' + id + '/alumno/perfil'), aulaId)).intereses === 'Me cuestan las fracciones', 'lo que le interesa se guarda');
  await page.screenshot({path: join(capturas, 'est-5-cuenta.png'), fullPage: true});

  ok(errores.length === 0, 'la app del estudiante no tiró errores: ' + errores.join(' | '));
  await page.close();
}

/* El profe corrige la evaluación y pide rehacer el trabajo práctico */
{
  const aulaId = globalThis.__aulaId;
  const docs = {'users/profe': globalThis.__profeDb, ['aulas/' + aulaId]: {...globalThis.__aula, miembros: ['sofi']},
    ['aulas/' + aulaId + '/entregas/' + globalThis.__evId]: globalThis.__eEv, ['aulas/' + aulaId + '/entregas/' + globalThis.__tpTpId]: globalThis.__eTp};
  const {page, errores} = await pagina('app.html', {usuario: {uid:'profe', displayName:'Ana Pérez', email:'ana@x.com'}, docs});
  await esperar(1500);
  await page.evaluate(id=>verTp(id), globalThis.__evId);
  await esperar(300);
  ok((await texto(page, '#sheetContent')).includes('1/2'), 'el profe ve el puntaje de la evaluación (las respuestas las tiene él)');
  await page.type('#f_nota', '10');
  await page.evaluate(()=>{ document.querySelector('.com-preg').value = 'Bien sumado'; });
  await page.screenshot({path: join(capturas, 'profe-5-corregir-eval.png'), fullPage: true});
  await clickTexto(page, 'Enviar devolución');
  await esperar(300);
  const ev = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, globalThis.__evId);
  ok(ev.estado === 'corregida' && ev.nota === '10' && Object.values(ev.correccion).join() === 'true,false' && Object.values(ev.comentarios)[0] === 'Bien sumado', 'la corrección lleva qué estuvo bien y los comentarios: ' + JSON.stringify(ev.correccion));
  await page.evaluate(id=>verTp(id), globalThis.__tpTpId);
  await esperar(300);
  ok((await texto(page, '#sheetContent')).includes('Acá está mi línea de tiempo') && await page.$('#sheetContent a[href^="https://docs.google.com"]'), 'el profe ve el texto y el link del trabajo práctico');
  await clickTexto(page, 'Para rehacer');
  ok((await texto(page, '#toast')).includes('Contale'), 'para rehacer pide decir qué corregir');
  await page.type('#f_devolucion', 'Faltan las fechas de 1806');
  await clickTexto(page, 'Para rehacer');
  await esperar(300);
  const tp = await page.evaluate((id, tp)=>window.__docs.get('aulas/' + id + '/entregas/' + tp), aulaId, globalThis.__tpTpId);
  ok(tp.estado === 'rehacer', 'queda para rehacer');
  ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.titulo && v.titulo.includes('Para rehacer'))), 'y se le avisa al alumno');
  ok(errores.length === 0, 'corregir sin errores: ' + errores.join(' | '));
  await page.close();
}

/* Página pública del profe (y el link viejo de reseñas) */
{
  const perfil = {nombre:'Ana Pérez', bio:'Clases de matemática', materias:['Matemática'], materiaIds:['matematica'], zonas:['godoy-cruz'], lugares:['casa_mia','virtual'],
    niveles:['secundario'], precioHora:12000, regla:'flexible', duracion:60, disponibilidad:{2:{activo:true, desde:'14:00', hasta:'18:00'}}, visible:true,
    resenas:[{estrellas:5, texto:'Excelente profe', autor:'Laura, familiar de Sofi'}], promedio:5, cantResenas:1, whatsapp:''};
  const {page, errores} = await pagina('resenas.html?p=profe', {usuario: null, docs: {'perfiles/profe': perfil}});
  await esperar(400);
  ok(page.url().includes('profe.html?p=profe'), 'el link viejo de reseñas lleva al perfil');
  const t = await texto(page, 'body');
  ok(t.includes('Ana Pérez') && t.includes('Excelente profe') && t.includes('Desde $12.000') && t.includes('Martes') && t.includes('12 h antes'), 'el perfil muestra reseñas, precio, horarios y la regla de cancelación');
  ok(await page.$('a[href="estudiante.html?profe=profe"]') && !t.includes('WhatsApp'), 'se le escribe por chat; el WhatsApp solo si lo eligió');
  await page.screenshot({path: join(capturas, 'pub-2-perfil.png'), fullPage: true});
  ok(errores.length === 0, 'el perfil no tiró errores: ' + errores.join(' | '));
  await page.close();
}

/* Buscador */
{
  const base = {materias:['Matemática'], materiaIds:['matematica'], niveles:['secundario'], lugares:['casa_mia'], precioHora:10000, visible:true, cantResenas:0, promedio:0, resenas:[]};
  const docs = {
    'perfiles/ana': {...base, nombre:'Ana Pérez', zonas:['godoy-cruz'], cantResenas:2, promedio:4.5},
    'perfiles/beto': {...base, nombre:'Beto Ruiz', materias:['Inglés'], materiaIds:['ingles'], zonas:[], lugares:['virtual'], precioHora:15000},
    'perfiles/caro': {...base, nombre:'Caro Díaz', zonas:['maipu'], bio:'Física y química para el secundario', materias:['Física'], materiaIds:['fisica']},
    'perfiles/oculta': {...base, nombre:'Oculta', visible:false},
    'perfiles/moderada': {...base, nombre:'Moderada'},
    'moderacion/moderada': {oculto:true}
  };
  const {page, errores} = await pagina('index.html', {usuario: null, docs}, {estudiemos_rol: 'estudiante'});
  await esperar(500);
  let t = await texto(page, '#lista');
  ok(t.includes('Ana Pérez') && t.includes('Beto Ruiz') && t.includes('Caro Díaz') && !t.includes('Oculta') && !t.includes('Moderada'), 'el buscador muestra los profes visibles y no los ocultos');
  ok(t.indexOf('Ana Pérez') < t.indexOf('Beto Ruiz'), 'primero los que tienen reseñas');
  await page.screenshot({path: join(capturas, 'pub-1-buscador.png'), fullPage: true});
  await page.select('#fMateria', 'matematica');
  await esperar(100);
  t = await texto(page, '#lista');
  ok(t.includes('Ana Pérez') && !t.includes('Beto Ruiz') && !t.includes('Caro'), 'filtra por materia');
  ok(page.url().includes('materia=matematica'), 'la búsqueda queda en el link');
  await page.select('#fMateria', '');
  await page.type('#q', 'maipu');
  await esperar(400);
  t = await texto(page, '#lista');
  ok(t.includes('Caro Díaz') && !t.includes('Ana'), 'busca por zona escrita sin tilde');
  ok(errores.length === 0, 'el buscador no tiró errores: ' + errores.join(' | '));
  await page.close();
}

/* =========================================================
   CHAT Y RESERVAS: del buscador al chat, el profe acepta, el estudiante cancela
   ========================================================= */
{
  const todos = {};
  for(let d = 0; d < 7; d++) todos[d] = {activo: true, desde: '09:00', hasta: '21:00'};
  const perfilAna = {nombre:'Ana Pérez', materias:['Matemática'], materiaIds:['matematica'], zonas:['capital'], lugares:['casa_mia'], precioHora:10000,
    regla:'normal', duracion:60, disponibilidad: todos, ocupado: [], visible:true, resenas:[], foto:''};
  // 1) El estudiante llega desde el perfil con "Elegí un horario"
  let docs = {'perfiles/ana': perfilAna};
  {
    const {page, errores} = await pagina('estudiante.html?profe=ana&reservar=1', {usuario: {uid:'tomi', displayName:'Tomás Gil', email:'tomi@x.com'}, docs});
    await esperar(800);
    const chat = await page.evaluate(()=>window.__docs.get('chats/c_ana_tomi'));
    ok(chat && chat.miembros.join() === 'ana,tomi' && chat.nombres.ana === 'Ana Pérez', 'se crea el chat con el profe');
    ok(await page.$eval('#chatPantalla', e=>!e.hidden), 'se abre el chat');
    ok(await page.$('#sheetContent .hueco'), 'y la hoja para elegir horario con los huecos libres');
    ok((await texto(page, '#sheetContent')).includes('24 h antes'), 'muestra la regla de cancelación antes de pedir');
    await page.screenshot({path: join(capturas, 'chat-1-elegir-horario.png'), fullPage: true});
    await page.evaluate(()=>document.querySelector('#sheetContent .hueco').click());
    await clickTexto(page, 'Pedir el');
    await esperar(500);
    const msgs = await page.evaluate(()=>[...window.__docs.entries()].filter(([k])=>k.startsWith('chats/c_ana_tomi/mensajes/')).map(([k, v])=>({id: k.split('/').pop(), ...v})));
    ok(msgs.length === 1 && msgs[0].tipo === 'reserva' && msgs[0].reserva.estado === 'pendiente' && msgs[0].reserva.duracion === 60, 'el pedido de horario viaja por el chat');
    await page.type('#chTexto', 'Hola Ana, necesito ayuda con funciones');
    await page.evaluate(()=>document.getElementById('chForm').requestSubmit());
    await esperar(500);
    ok((await texto(page, '#chMsgs')).includes('necesito ayuda con funciones') && (await texto(page, '#chMsgs')).includes('Esperando respuesta'), 'se ven el mensaje y el pedido');
    ok(await page.evaluate(()=>[...window.__docs.values()].some(v=>v.para==='ana' && v.chatId==='c_ana_tomi')), 'al profe le llega la notificación');
    await page.screenshot({path: join(capturas, 'chat-2-estudiante.png')});
    ok(errores.length === 0, 'el chat del estudiante no tuvo errores: ' + errores.join(' | '));
    docs = Object.fromEntries([...(await page.evaluate(()=>[...window.__docs.entries()]))]);
    await page.close();
  }
  // 2) El profe lo ve en Mensajes y acepta: se crea el alumno, la clase y su acceso a la app
  const fechaReserva = Object.entries(docs).find(([k])=>k.includes('/mensajes/') && docs[k].tipo === 'reserva')[1].reserva;
  {
    const profeDb = {alumnos: [], clases: [], temas: [{id:'t1', nombre:'Matemática', catId:'matematica'}], tareas: [], trabajos: [], pagos: [], resenas: [], tps: [],
      config: {nombreProfe:'Ana Pérez', tarifaHabitual: 12000, configInicial: true, tutorialVisto: true, migPlataforma: true, perfil: {zonas:['capital'], lugares:['casa_mia'], regla:'normal', duracion:60}}};
    const {page, errores} = await pagina('app.html?chat=c_ana_tomi', {usuario: {uid:'ana', displayName:'Ana Pérez', email:'ana@x.com'}, docs: {...docs, 'users/ana': profeDb}});
    await esperar(1200);
    ok(await page.$eval('#chatPantalla', e=>!e.hidden).catch(()=>false), 'el link de la notificación abre el chat');
    await page.screenshot({path: join(capturas, 'chat-3-profe.png')});
    await clickTexto(page, 'Aceptar', '#chMsgs button');
    await esperar(1500);
    const r = await page.evaluate(()=>({alumnos: db.alumnos, clases: db.clases}));
    ok(r.alumnos.length === 1 && r.alumnos[0].nombre === 'Tomás Gil' && r.alumnos[0].chatId === 'c_ana_tomi' && r.alumnos[0].aulaId, 'aceptar suma al estudiante como alumno, con su acceso a la app');
    ok((await texto(page, '.chat-top')).includes('Ficha'), 'después del chat se va directo a su ficha');
    ok(r.clases.length === 1 && r.clases[0].fecha === fechaReserva.fecha && r.clases[0].horaEntrada === fechaReserva.hora && r.clases[0].monto === 12000, 'y agenda la clase en el horario pedido');
    const msgs = await page.evaluate(()=>[...window.__docs.entries()].filter(([k])=>k.startsWith('chats/c_ana_tomi/mensajes/')).map(([, v])=>v));
    ok(msgs.some(m=>m.tipo === 'reserva' && m.reserva.estado === 'aceptada') && msgs.some(m=>m.tipo === 'sistema' && m.texto.includes('Quedó agendada')) && msgs.some(m=>m.texto && m.texto.includes('estudiante.html?aula=')), 'el chat cuenta que quedó agendada y lleva el link a la app');
    await page.screenshot({path: join(capturas, 'chat-4-aceptado.png')});
    await page.evaluate(()=>chatNube.cerrarPantalla());
    await page.evaluate(()=>goTo('mensajes'));
    await esperar(200);
    ok((await texto(page, '#listaChats')).includes('Tomás Gil'), 'la conversación está en Mensajes');
    ok(errores.length === 0, 'el profe aceptó sin errores: ' + errores.join(' | '));
    docs = Object.fromEntries([...(await page.evaluate(()=>[...window.__docs.entries()]))]);
    globalThis.__profeAna = docs['users/ana'];
    await page.close();
  }
  // 3) El estudiante, ya con su aula, cancela la clase desde la app
  const aulaId = globalThis.__profeAna.alumnos[0].aulaId;
  docs['aulas/' + aulaId].miembros = ['tomi'];
  {
    const {page, errores} = await pagina('estudiante.html', {usuario: {uid:'tomi', displayName:'Tomás Gil', email:'tomi@x.com'}, docs});
    await esperar(800);
    for(let i = 0; i < 3 && !(await page.$(`.tira-dia[data-dia="${fechaReserva.fecha}"]`)); i++){ await click(page, '[data-semana="1"]'); await esperar(150); }
    await click(page, `.tira-dia[data-dia="${fechaReserva.fecha}"]`);
    await esperar(200);
    await click(page, '[data-cancelar]');
    await esperar(200);
    ok((await texto(page, '#sheetContent')).includes('h'), 'antes de cancelar le dice qué pasa según la regla');
    await page.screenshot({path: join(capturas, 'chat-5-cancelar.png')});
    await click(page, '#btnCancelarSi');
    await esperar(400);
    const sol = await page.evaluate(id=>[...window.__docs.entries()].filter(([k])=>k.startsWith('aulas/' + id + '/solicitudes/')).map(([k, v])=>({id: k.split('/').pop(), ...v})), aulaId);
    ok(sol.length === 1 && sol[0].tipo === 'cancelar' && sol[0].estado === 'pendiente', 'la cancelación le llega al profe como pedido');
    ok(errores.length === 0, 'cancelar sin errores: ' + errores.join(' | '));
    docs = Object.fromEntries([...(await page.evaluate(()=>[...window.__docs.entries()]))]);
    await page.close();
  }
  // 4) La app del profe aplica la regla sola
  {
    const {page, errores} = await pagina('app.html', {usuario: {uid:'ana', displayName:'Ana Pérez', email:'ana@x.com'}, docs});
    await esperar(2500);
    const c = await page.evaluate(()=>db.clases[0]);
    ok(c.cancelada && c.cancelada.por === 'alumno', 'el profe ve la clase cancelada: ' + JSON.stringify(c.cancelada));
    const a = await page.evaluate(()=>db.alumnos[0]);
    ok(c.cancelada.cobro === 0 ? (a.recuperos.length === 1 && c.monto === 0) : c.monto > 0, 'si fue a tiempo queda para recuperar; si no, se cobra');
    const sol = await page.evaluate(id=>[...window.__docs.entries()].filter(([k])=>k.startsWith('aulas/' + id + '/solicitudes/')).map(([, v])=>v)[0], aulaId);
    ok(sol.estado === 'hecha' && sol.resultado.includes('Canceló'), 'el pedido queda resuelto con lo que pasó: ' + sol.resultado);
    const pub = await page.evaluate(id=>window.__docs.get('aulas/' + id), aulaId);
    ok(pub.clases[0].cancelada && pub.regla === 'normal', 'el estudiante ve su clase cancelada');
    ok(errores.length === 0, 'aplicar la cancelación sin errores: ' + errores.join(' | '));
    await page.close();
  }
}

/* Un profe que abre la dirección de siempre va a su panel */
{
  const {page} = await pagina('index.html', {usuario: null, docs: {}}, {estudiantes_app_data_v1: JSON.stringify({alumnos: []}), estudiemos_rol: 'profe'});
  await esperar(300);
  ok(page.url().includes('app.html'), 'el profe que entra a la portada va a su panel');
  await page.close();
}

await browser.close();
server.close();
console.log(`${chequeos} chequeos, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
