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
  igual(aula.tareas[0].tema, 'Matemática', 'la tarea lleva el nombre del tema');
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

/* ---------- Códigos ---------- */
{
  const code = C.nuevoCodigoSala();
  ok(/^[A-HJKMNP-Z2-9]{6}$/.test(code), 'código de sala válido para las reglas de la pizarra: ' + code);
  ok(/^[a-z0-9]{20}$/.test(C.nuevoIdLargo(20)), 'id largo');
  igual(C.formatoCodigoSala('ABCDEF'), 'ABC-DEF', 'formato de código');
}

/* ---------- Archivos que referencian las páginas ---------- */
for(const pagina of ['index.html', 'estudiante.html', 'resenas.html']){
  const html = readFileSync(join(raiz, pagina), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="(?!https?:|#|data:)([^"?#]+)"/g)].map(m=>m[1]);
  refs.forEach(r=>ok(existsSync(join(raiz, r)), `${pagina} referencia ${r}, que no existe`));
}
{
  const js = readFileSync(join(raiz, 'js/estudiante.js'), 'utf8') + readFileSync(join(raiz, 'js/nube-profe.js'), 'utf8');
  ok(!/from ['"]\.\/(?!firebase\.js)/.test(js), 'los módulos solo importan ./firebase.js');
}
{
  // Las funciones que se llaman desde onclick="..." en index.html tienen que existir
  const html = readFileSync(join(raiz, 'index.html'), 'utf8');
  const todo = html + readFileSync(join(raiz, 'js/profe-aula.js'), 'utf8');
  const llamadas = new Set([...todo.matchAll(/on(?:click|change|input)="(?:event\.stopPropagation\(\); )?([a-zA-Z_]\w*)\(/g)].map(m=>m[1]));
  const definidas = new Set([...todo.matchAll(/function\s+([a-zA-Z_]\w*)\s*\(/g)].map(m=>m[1]));
  for(const f of llamadas){
    if(f === 'nube' || f === 'this' || f === 'document') continue;
    ok(definidas.has(f), `onclick llama a ${f}(), que no está definida`);
  }
}

console.log(`${chequeos} chequeos, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
