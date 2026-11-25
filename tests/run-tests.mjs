/* Tests de Estudiemos sin dependencias: node tests/run-tests.mjs
   Termina con "N chequeos, 0 fallas" (y código de salida 1 si algo falla). */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = require('../js/comun.js');

let chequeos = 0, fallas = 0;
function ok(cond, msg){
  chequeos++;
  if(!cond){ fallas++; console.log('✗', msg); }
}
function igual(a, b, msg){ ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n   esperaba ${JSON.stringify(b)}\n   obtuve   ${JSON.stringify(a)}`); }

/* ---------- Formato rápido de preguntas ---------- */
{
  const {preguntas, errores} = C.parsearPreguntas(`
# comentario
? ¿Cuánto es 7 × 8?
- 54
* 56
- 58

? La Tierra es plana.
= F

? Todo par es divisible por 2.
= verdadero

? ¿Cuánto vale π?
= 3,14 ± 0.01

? Un número entero
= -12

? Explicá qué es una fracción
con un ejemplo.
`);
  igual(errores, [], 'sin errores en el ejemplo');
  igual(preguntas.map(p=>p.tipo), ['opcion','vf','vf','numero','numero','texto'], 'tipos detectados');
  igual(preguntas[0].opciones, ['54','56','58'], 'opciones en orden');
  igual(preguntas[0].correcta, 1, 'índice de la correcta');
  igual(preguntas[1].correcta, false, '= F es falso');
  igual(preguntas[2].correcta, true, '= verdadero es verdadero');
  igual([preguntas[3].correcta, preguntas[3].tolerancia], [3.14, 0.01], 'número con coma y tolerancia');
  igual(preguntas[4].correcta, -12, 'número negativo');
  igual(preguntas[5].enunciado, 'Explicá qué es una fracción\ncon un ejemplo.', 'enunciado de varias líneas');
  igual(preguntas.map(p=>p.id), ['p1','p2','p3','p4','p5','p6'], 'ids correlativos');

  const vuelta = C.parsearPreguntas(C.preguntasATexto(preguntas)).preguntas;
  igual(vuelta, preguntas, 'texto → preguntas → texto → preguntas da lo mismo');
}
{
  const {errores} = C.parsearPreguntas('- huérfana\n\n? Dos correctas\n* a\n* b\n\n? Sin correcta\n- a\n- b\n\n? Rara\n= hola');
  ok(errores.length === 4, 'detecta 2 correctas, ninguna correcta, opción sin pregunta y "=" inválido: ' + JSON.stringify(errores));
}
igual(C.parsearPreguntas('').preguntas, [], 'texto vacío no da preguntas');

/* ---------- Corrección ---------- */
{
  const op = {id:'p1', tipo:'opcion', opciones:['a','b'], correcta:1};
  const vf = {id:'p2', tipo:'vf', correcta:false};
  const nu = {id:'p3', tipo:'numero', correcta:3.14, tolerancia:0.01};
  const nu0 = {id:'p4', tipo:'numero', correcta:7, tolerancia:0};
  const tx = {id:'p5', tipo:'texto'};
  ok(C.corregir(op, 1) === true && C.corregir(op, '1') === true && C.corregir(op, 0) === false, 'opción');
  ok(C.corregir(vf, false) === true && C.corregir(vf, 'true') === false, 'verdadero/falso');
  ok(C.corregir(nu, '3,145') === true && C.corregir(nu, 3.2) === false && C.corregir(nu, 'abc') === false, 'numérica con tolerancia');
  ok(C.corregir(nu0, '7') === true && C.corregir(nu0, '7.0') === true && C.corregir(nu0, 7.01) === false, 'numérica exacta');
  ok(C.corregir(tx, 'algo') === null, 'abierta no se corrige sola');
  ok(C.corregir(op, undefined) === null && C.corregir(op, '') === null, 'sin respuesta');
  igual(C.puntaje([op, vf, nu, tx], {p1: 1, p2: true, p3: '3.14', p5: 'x'}), {ok:2, total:3, abiertas:1}, 'puntaje');
}

/* ---------- Fechas (hora argentina) ---------- */
igual(C.instanteArg('2026-11-22', '18:30').toISOString(), '2026-11-22T21:30:00.000Z', 'las 18:30 en Argentina son 21:30 UTC');

/* ---------- Estado de cuenta ---------- */
{
  const ahora = new Date('2026-11-22T21:00:00Z');   // 18:00 en Argentina
  const clases = [
    {fecha:'2026-11-20', horaEntrada:'10:00', horaSalida:'11:00', pagada:false, monto:8000},
    {fecha:'2026-11-21', horaEntrada:'10:00', horaSalida:'11:00', pagada:true, monto:8000},
    {fecha:'2026-11-22', horaEntrada:'17:00', horaSalida:'18:30', pagada:false, monto:9000},   // en curso
    {fecha:'2026-11-25', horaEntrada:'10:00', horaSalida:'11:00', pagada:false, monto:8000}    // futura
  ];
  igual(C.estadoCuenta(clases, ahora), {clasesAdeudadas:1, monto:8000, alDia:false}, 'solo cuentan las ya terminadas sin pagar');
  igual(C.estadoCuenta([], ahora), {clasesAdeudadas:0, monto:0, alDia:true}, 'sin clases, al día');
}

/* ---------- Aula: qué se publica ---------- */
{
  const db = {
    alumnos: [{id:'a1', nombre:'Sofi', tipo:'nino', color:'#f00', tarifa:9000, temasIds:['t1'], aulaId:'X', mostrarMontos:false,
               avisos:[{id:'v1', texto:'no hay clase', fecha:'2026-11-01'}], contacto:'Mamá', telefono:'261', direccion:'Calle 1', mensajes:[{id:'m', label:'x', text:'y'}]},
              {id:'a2', nombre:'Otro', temasIds:[]}],
    temas: [{id:'t1', nombre:'Matemática'}],
    clases: [
      {id:'c1', alumnoId:'a1', fecha:'2026-11-20', horaEntrada:'10:00', horaSalida:'11:00', duracionMin:60, monto:9000, pagada:false, notas:'PRIVADO', resumen:'Fracciones', pizarra:{codigo:'ABCDEF', clave:'SECRETA'}},
      {id:'c2', alumnoId:'a2', fecha:'2026-11-20', horaEntrada:'12:00', horaSalida:'13:00', monto:1, pagada:false, notas:'de otro'}
    ],
    tareas: [{id:'k1', alumnoId:'a1', temaId:'t1', texto:'Ej. 3', hecha:false}, {id:'k2', alumnoId:'a2', texto:'de otro'}],
    tps: [
      {id:'tp1', alumnoId:'a1', titulo:'TP 1', publicado:true, preguntas:[{id:'p1', tipo:'texto', enunciado:'?'}], temaId:'t1'},
      {id:'tp2', alumnoId:'a1', titulo:'Borrador', publicado:false, preguntas:[]},
      {id:'tp3', alumnoId:'a2', titulo:'De otro', publicado:true, preguntas:[]}
    ],
    config: {perfil:{nombre:'Profe Ana', telefono:'2615555'}}
  };
  const aula = C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z'));
  const json = JSON.stringify(aula);
  ok(!json.includes('PRIVADO') && !json.includes('SECRETA'), 'no se publican las notas privadas ni la clave de la pizarra');
  ok(!json.includes('de otro') && !json.includes('De otro'), 'no se publica nada de otros alumnos');
  ok(!json.includes('Borrador'), 'los TPs en borrador no se publican');
  ok(!json.includes('Calle 1') && !json.includes('Mamá') && !('mensajes' in aula), 'no se publican dirección, contacto ni plantillas');
  ok(!('monto' in aula.clases[0]) && aula.tarifa === null, 'sin "mostrar montos" no van los montos');
  igual(aula.clases[0].pizarra, {codigo:'ABCDEF'}, 'la pizarra va solo con el código');
  igual(aula.clases[0].resumen, 'Fracciones', 'el resumen sí se publica');
  igual(aula.clases[0].links, [], 'una clase sin material publica una lista vacía');
  ok(!('tareas' in aula) && !json.includes('Ej. 3'), 'los pendientes del profe (db.tareas) no se publican');
  igual(aula.tps[0].tema, 'Matemática', 'la tarea lleva el nombre de la materia');
  igual(aula.temas, ['Matemática'], 'temas del alumno');
  igual(aula.profeNombre, 'Profe Ana', 'nombre del profe');
  db.alumnos[0].mostrarMontos = true;
  const conMontos = C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z'));
  ok(conMontos.clases[0].monto === 9000 && conMontos.tarifa === 9000, 'con "mostrar montos" van los montos');
  db.clases[0].viatico = 3360;
  igual(C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z')).clases[0].monto, 12360, 'el monto incluye los pasajes');
  db.config = {nombreProfe: 'Juli', telefonoProfe: '549261'};
  const nuevo = C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z'));
  igual([nuevo.profeNombre, nuevo.telefonoProfe], ['Juli', '549261'], 'toma el nombre y el WhatsApp de los datos del profe');
  // Actividades: tipo y evaluaciones sin respuestas
  igual(nuevo.tps[0].tipo, 'tarea', 'sin tipo, es una tarea');
  db.tps.push({id:'ev', alumnoId:'a1', titulo:'Evaluación', tipo:'evaluacion', tiempoMin:40, publicado:true,
    preguntas:[{id:'q1', tipo:'opcion', enunciado:'2+2', opciones:['3','4'], correcta:1}, {id:'q2', tipo:'numero', enunciado:'pi', correcta:3.14, tolerancia:0.01}, {id:'q3', tipo:'vf', enunciado:'x', correcta:true}]});
  const ev = C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z')).tps.find(t=>t.id==='ev');
  ok(ev.tipo === 'evaluacion' && ev.tiempoMin === 40, 'la evaluación lleva su tipo y su tiempo');
  ok(ev.preguntas.every(p=>!('correcta' in p) && !('tolerancia' in p)), 'y no lleva las respuestas correctas');
  igual(ev.preguntas[0].opciones, ['3','4'], 'pero sí las opciones');
  db.tps.push({id:'ej', alumnoId:'a1', titulo:'Ej', tipo:'ejercicio', tiempoMin:10, publicado:true, preguntas:[{id:'q', tipo:'vf', enunciado:'x', correcta:false}]});
  const ej = C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z')).tps.find(t=>t.id==='ej');
  ok(ej.preguntas[0].correcta === false && ej.tiempoMin === 0, 'un ejercicio sí lleva las respuestas (se corrige al toque) y no tiene tiempo');
  // Cancelaciones y recuperos
  db.clases[0].cancelada = {por: 'alumno', cobro: 0, en: '2026-11-19T10:00:00Z', aTiempo: true};
  db.clases[0].propuesta = {fecha: '2026-11-30', hora: '10:00'};
  db.alumnos[0].recuperos = [{id: 'r1', claseId: 'c1', vence: '2026-12-19', fechaOriginal: '2026-11-20'}, {id: 'r2', vence: '2026-11-01'}, {id: 'r3', vence: '2026-12-30', usado: true}];
  db.config.perfil = {regla: 'estricta'};
  const conCancel = C.construirAula(db, db.alumnos[0], new Date('2026-11-22T12:00:00Z'));
  igual(conCancel.clases[0].cancelada, {por: 'alumno', cobro: 0}, 'la clase cancelada lo dice (sin más detalles)');
  ok(!('propuesta' in conCancel.clases[0]), 'una cancelada no lleva propuesta');
  igual(conCancel.recuperos.map(r=>r.id), ['r1'], 'solo los recuperos sin usar y sin vencer');
  igual(conCancel.regla, 'estricta', 'la regla de cancelación del profe');
}
{
  const ahora = new Date('2026-11-22T12:00:00Z');
  const cl = [
    {fecha:'2026-11-20', horaEntrada:'10:00', horaSalida:'11:00', pagada:false, monto:0, cancelada:{cobro:0}},
    {fecha:'2026-11-20', horaEntrada:'12:00', horaSalida:'13:00', pagada:false, monto:4000, cancelada:{cobro:0.5}},
    {fecha:'2026-11-21', horaEntrada:'12:00', horaSalida:'13:00', pagada:false, monto:8000}
  ];
  igual(C.estadoCuenta(cl, ahora), {clasesAdeudadas:2, monto:12000, alDia:false}, 'la cancelada a tiempo no se debe; la tardía sí');
  const enRato = new Date('2026-11-20T12:40:00Z');   // 9:40 en Argentina
  igual(C.clasesPorEmpezar([{fecha:'2026-11-20', horaEntrada:'10:00', cancelada:{cobro:0}}], enRato, 30).length, 0, 'no se recuerda una clase cancelada');
}

/* ---------- Recordatorios ---------- */
{
  const ahora = new Date('2026-11-22T20:00:00Z');   // 17:00 en Argentina
  const clases = [
    {id:'1', fecha:'2026-11-22', horaEntrada:'17:20', horaSalida:'18:20'},
    {id:'2', fecha:'2026-11-22', horaEntrada:'17:40', horaSalida:'18:40'},
    {id:'3', fecha:'2026-11-22', horaEntrada:'16:00', horaSalida:'16:50'},
    {id:'4', fecha:'2026-11-22', horaEntrada:'15:00', horaSalida:'16:00'},
    {id:'5', fecha:'2026-11-22', horaEntrada:'17:00', horaSalida:'18:00'}
  ];
  igual(C.clasesPorEmpezar(clases, ahora, 30).map(c=>c.id), ['1'], 'por empezar en 30 min (la que empieza justo ahora no)');
  igual(C.clasesRecienTerminadas(clases, ahora, 30).map(c=>c.id), ['3'], 'terminadas hace menos de 30 min');
}

/* ---------- Carga rápida de alumnos y títulos ---------- */
igual(C.parsearListaAlumnos(`Sofi 2611234567
Juli Pérez, 261 555-0000

- Ana María
• Lu +54 9 261 4445566
2. Pedro
sofi
María José 15`), [
  {nombre:'Sofi', telefono:'2611234567'}, {nombre:'Juli Pérez', telefono:'2615550000'}, {nombre:'Ana María', telefono:''},
  {nombre:'Lu', telefono:'+5492614445566'}, {nombre:'Pedro', telefono:''}, {nombre:'María José 15', telefono:''}
], 'la lista de alumnos: nombres, WhatsApp, viñetas y repetidos');
igual(C.parsearListaAlumnos(''), [], 'lista vacía');
igual(C.tituloDeTexto('\n  Hacer los ejercicios 1 al 5\nde la página 30'), 'Hacer los ejercicios 1 al 5', 'el título es el primer renglón');
ok(C.tituloDeTexto('x'.repeat(100)).length === 68, 'el título se corta');

/* ---------- Material (links) ---------- */
igual(C.normalizarLink('drive.google.com/file/d/abc/view'), 'https://drive.google.com/file/d/abc/view', 'al link sin https se lo agrega');
igual([C.normalizarLink('hola'), C.normalizarLink('javascript:alert(1)'), C.normalizarLink(''), C.normalizarLink('ftp://x.com/a')], [null, null, null, null], 'lo que no es un link web no pasa');
igual([C.nombreDeLink('https://docs.google.com/x'), C.nombreDeLink('https://youtu.be/x'), C.nombreDeLink('https://www.khanacademy.org/a')], ['Archivo de Drive', 'Video', 'khanacademy.org'], 'nombres automáticos');
igual(C.limpiarLinks([{url:'youtube.com/watch?v=1', nombre:''}, {url:'nada'}, {url:'https://ej.com', nombre:'  Guía  '}]),
  [{url:'https://youtube.com/watch?v=1', nombre:'Video'}, {url:'https://ej.com/', nombre:'Guía'}], 'limpia los links');

/* ---------- Lo que suelen responder las IA ---------- */
{
  const {preguntas, errores} = C.parsearPreguntas('¡Claro! Acá tenés las preguntas:\n\n```\n**? ¿Cuánto es 2+2?**\n- 3\n* 4\n- 5\n\n? 3 es par.\n= F\n```\n\n¡Espero que te sirvan!');
  igual(errores, [], 'la introducción, los bloques de código y la despedida no son errores');
  igual(preguntas.map(p=>[p.tipo, p.enunciado]), [['opcion', '¿Cuánto es 2+2?'], ['vf', '3 es par.']], 'se toman solo las preguntas');
}

/* ---------- Códigos ---------- */
{
  const code = C.nuevoCodigoSala();
  ok(/^[A-HJKMNP-Z2-9]{6}$/.test(code), 'código de sala válido para las reglas de la pizarra: ' + code);
  ok(/^[a-z0-9]{20}$/.test(C.nuevoIdLargo(20)), 'id largo');
  igual(C.formatoCodigoSala('ABCDEF'), 'ABC-DEF', 'formato de código');
}


/* ---------- Plataforma: catálogos, perfil público, horarios, cancelaciones ---------- */
{
  const P = require('../js/plataforma.js');
  igual(P.materiaPorNombre('Matemáticas').id, 'matematica', 'materia escrita a mano → catálogo');
  igual(P.materiaPorNombre('  ingles ').id, 'ingles', 'sin tilde y con espacios');
  igual(P.materiaPorNombre('Lengua').id, 'lengua', 'alias de lengua');
  igual(P.materiaPorNombre('Astrología'), null, 'una que no está');
  ok(new Set(P.MATERIAS.map(m=>m.id)).size === P.MATERIAS.length, 'ids de materias únicos');
  ok(P.MATERIAS.every(m=>P.GRUPOS.some(g=>g.id === m.grupo)), 'cada materia tiene un grupo');
  igual(P.ZONAS.length, 18, 'los 18 departamentos de Mendoza');
  ok(P.ZONAS.every(z=>z.lat < -32 && z.lat > -36.5 && z.lng < -66.5 && z.lng > -70.5), 'las zonas caen en Mendoza');

  // Cancelaciones (clase el 10/12 a las 18 h, hora argentina)
  const clase = {fecha: '2026-12-10', horaEntrada: '18:00'};
  const h = horas => new Date(Date.parse('2026-12-10T18:00:00-03:00') - horas * 3600000);
  let r = P.evaluarCancelacion(clase, 'normal', 'alumno', h(30));
  ok(r.aTiempo && r.cobro === 0 && r.recuperar, 'normal: 30 h antes es a tiempo');
  r = P.evaluarCancelacion(clase, 'normal', 'alumno', h(5));
  ok(!r.aTiempo && r.cobro === 1 && !r.recuperar, 'normal: 5 h antes se cobra completa');
  r = P.evaluarCancelacion(clase, 'flexible', 'alumno', h(5));
  ok(r.cobro === 0.5, 'flexible: tarde se cobra la mitad');
  r = P.evaluarCancelacion(clase, 'flexible', 'alumno', h(13));
  ok(r.aTiempo, 'flexible: 13 h antes es a tiempo');
  r = P.evaluarCancelacion(clase, 'estricta', 'alumno', h(30));
  ok(!r.aTiempo && r.cobro === 1, 'estricta: 30 h antes ya es tarde');
  r = P.evaluarCancelacion(clase, 'estricta', 'profe', h(1));
  ok(r.cobro === 0 && r.recuperar, 'si cancela el profe nunca se cobra y se recupera');
  r = P.evaluarCancelacion(clase, 'inventada', 'alumno', h(23));
  ok(r.cobro === 1, 'regla desconocida = normal');
  igual(P.vencimientoRecupero('2026-12-10'), '2027-01-09', 'se recupera dentro de 30 días');
  ok(/12 h/.test(P.textoRegla('flexible')) && /mitad/.test(P.textoRegla('flexible')), 'texto de la regla');

  // Huecos libres: martes 14 a 17, clases de 1 h, con una clase tomada de 15 a 16
  const disp = {2: {activo: true, desde: '14:00', hasta: '17:00'}};
  const ahora = new Date('2026-12-01T09:00:00-03:00');   // martes 1/12, 9 h
  let hs = P.huecosLibres(disp, [{f: '2026-12-01', d: '15:00', h: '16:00'}], {desde: '2026-12-01', dias: 8, duracion: 60, paso: 30, ahora, anticipacionH: 2});
  igual(hs.filter(x=>x.fecha === '2026-12-01').map(x=>x.hora), ['14:00', '16:00'], 'el martes: antes y después de la clase tomada');
  igual(hs.filter(x=>x.fecha === '2026-12-08').map(x=>x.hora), ['14:00', '14:30', '15:00', '15:30', '16:00'], 'el martes siguiente, libre entero');
  ok(hs.every(x=>P.diaSemana(x.fecha) === 2), 'solo los días con disponibilidad');
  hs = P.huecosLibres(disp, [], {desde: '2026-12-01', dias: 1, duracion: 60, ahora: new Date('2026-12-01T14:10:00-03:00'), anticipacionH: 1});
  igual(hs.map(x=>x.hora), ['15:30', '16:00'], 'no ofrece turnos que empiezan en menos de la anticipación');
  igual(P.ahoraArg(new Date('2026-12-02T01:30:00Z')), {fecha: '2026-12-01', hora: '22:30'}, 'hora argentina a la noche');

  // Perfil público: no lleva nada privado
  const data = {
    config: {nombreProfe: 'Juli', bioProfe: 'Profe de mate', tarifaHabitual: 12000, telefonoProfe: '549261555',
      disponibilidad: {1: {activo: true, desde: '14:00', hasta: '20:00'}, 0: {activo: false, desde: '9:00', hasta: '12:00'}},
      perfil: {zonas: ['godoy-cruz', 'marte'], niveles: ['secundario'], lugares: ['casa_mia', 'virtual'], regla: 'flexible', mostrarWhatsapp: false, detalle: 'A domicilio cobro el pasaje'}},
    temas: [{id: 't1', nombre: 'Matemáticas'}, {id: 't2', nombre: 'Física', catId: 'fisica'}, {id: 't3', nombre: 'Ajedrez'}],
    alumnos: [{id: 'a', nombre: 'Sofi', direccion: 'Calle 123', notas: 'secreto'}],
    clases: [{id: 'c', alumnoId: 'a', fecha: '2026-12-02', horaEntrada: '15:00', horaSalida: '16:00', monto: 9999, notas: 'privado'},
      {id: 'c2', alumnoId: 'a', fecha: '2026-11-01', horaEntrada: '15:00', horaSalida: '16:00'}]
  };
  const pub = P.perfilPublico(data, {ahora, nombre: 'x', foto: 'https://foto'});
  const txt = JSON.stringify(pub);
  ok(!/Sofi|Calle 123|secreto|privado|9999/.test(txt), 'el perfil no lleva alumnos, direcciones, notas ni montos');
  igual(pub.materiaIds, ['matematica', 'fisica'], 'materias del catálogo');
  igual(pub.otras, ['Ajedrez'], 'las que no están en el catálogo van aparte');
  igual(pub.zonas, ['godoy-cruz'], 'solo zonas que existen');
  igual(pub.whatsapp, '', 'el WhatsApp no se muestra si no lo eligió');
  igual(P.perfilPublico({...data, config: {...data.config, perfil: {...data.config.perfil, mostrarWhatsapp: true}}}).whatsapp, '549261555', 'y sí si lo eligió');
  igual(pub.ocupado, [{f: '2026-12-02', d: '15:00', h: '16:00'}], 'lo ocupado: solo de hoy en adelante y sin nombres');
  igual(Object.keys(pub.disponibilidad), ['1'], 'solo los días activos');
  ok(pub.visible, 'visible con nombre y materias');
  ok(!P.perfilPublico({config: {perfil: {}}, temas: []}).visible, 'sin nombre ni materias no aparece');
  ok(!P.perfilPublico({...data, config: {...data.config, perfil: {visible: false}}}).visible, 'el profe puede ocultarse');
  igual(P.faltaEnPerfil(data), [], 'perfil completo');
  igual(P.faltaEnPerfil({config: {}, temas: []}), ['nombre', 'materias', 'zona', 'precio'], 'lo que falta');

  // Buscador
  const lista = [
    {uid: 'a', nombre: 'Ana', materiaIds: ['matematica'], materias: ['Matemática'], niveles: ['secundario'], zonas: ['capital'], lugares: ['casa_mia'], precioHora: 10000, cantResenas: 0},
    {uid: 'b', nombre: 'Beto', materiaIds: ['ingles'], materias: ['Inglés'], niveles: ['primario'], zonas: [], lugares: ['virtual'], precioHora: 20000, cantResenas: 3, promedio: 4.7},
    {uid: 'c', nombre: 'Caro', materiaIds: ['matematica', 'fisica'], materias: ['Matemática', 'Física'], niveles: ['secundario'], zonas: ['maipu'], lugares: ['casa_alumno'], precioHora: 15000, cantResenas: 1, promedio: 5},
    {uid: 'd', nombre: 'Dani', materiaIds: ['matematica'], visible: false}
  ];
  igual(P.filtrarProfes(lista, {}).map(p=>p.uid), ['c', 'b', 'a'], 'orden: con reseñas y mejor puntaje primero; ocultos afuera');
  igual(P.filtrarProfes(lista, {materia: 'matematica'}).map(p=>p.uid), ['c', 'a'], 'por materia');
  igual(P.filtrarProfes(lista, {zona: 'virtual'}).map(p=>p.uid), ['b'], 'virtual');
  igual(P.filtrarProfes(lista, {precioMax: 12000}).map(p=>p.uid), ['a'], 'precio máximo');
  igual(P.filtrarProfes(lista, {texto: 'fisica maipu'}).map(p=>p.uid), ['c'], 'texto libre, sin tildes');
  igual(P.filtrarProfes(lista, {ocultos: ['c']}).map(p=>p.uid), ['b', 'a'], 'ocultos por moderación');
  const pz = P.puntoEnZona('abc', 'capital');
  ok(P.distanciaKm(pz, [P.zona('capital').lat, P.zona('capital').lng]) < 2.5, 'el punto queda cerca del centro de la zona');
  igual(P.puntoEnZona('abc', 'capital'), pz, 'y siempre el mismo');
  ok(Math.abs(P.distanciaKm([-32.8895, -68.8458], [-32.9253, -68.8441]) - 4) < 0.5, 'Capital a Godoy Cruz, unos 4 km');
  igual(P.chatId('p1', 'e1'), 'c_p1_e1', 'id de chat');
  igual(P.tipoActividad('nada').id, 'tarea', 'tipo de actividad por defecto');
}

/* ---------- Archivos que referencian las páginas ---------- */
for(const pagina of ['app.html', 'index.html', 'profe.html', 'estudiante.html', 'resenas.html']){
  const html = readFileSync(join(raiz, pagina), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"?#]+)"/g)].map(m=>m[1]);
  refs.forEach(r=>ok(existsSync(join(raiz, r)), `${pagina} referencia ${r}, que no existe`));
}
{
  const js = readFileSync(join(raiz, 'js/estudiante.js'), 'utf8') + readFileSync(join(raiz, 'js/nube-profe.js'), 'utf8');
  ok(!/from ['"]\.\/(?!firebase\.js|chat\.js)/.test(js), 'los módulos solo importan ./firebase.js y ./chat.js');
}
{
  // Las funciones que se llaman desde onclick="..." en app.html tienen que existir
  const html = readFileSync(join(raiz, 'app.html'), 'utf8');
  const todo = html + ['js/profe-aula.js', 'js/primeros-pasos.js', 'js/perfil-profe.js', 'js/profe-chat.js', 'js/clases-cambios.js'].map(f=>readFileSync(join(raiz, f), 'utf8')).join('\n');
  const llamadas = new Set([...todo.matchAll(/on(?:click|change|input)="(?:event\.stopPropagation\(\); )?([a-zA-Z_]\w*)\(/g)].map(m=>m[1]));
  const definidas = new Set([...todo.matchAll(/function\s+([a-zA-Z_]\w*)\s*\(/g)].map(m=>m[1]));
  for(const f of llamadas){
    if(f === 'nube' || f === 'this' || f === 'document') continue;
    ok(definidas.has(f), `onclick llama a ${f}(), que no está definida`);
  }
}

console.log(`${chequeos} chequeos, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
