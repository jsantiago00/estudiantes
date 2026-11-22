/* =========================================================
   Estudiemos: lógica compartida, sin DOM ni Firebase.
   La usan la app del profe (index.html), la del estudiante (estudiante.html),
   el notificador (scripts/notificador.mjs) y los tests (tests/run-tests.mjs).
   En el navegador queda en window.Comun; en Node, con require().
   ========================================================= */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.Comun = factory();
})(typeof self !== 'undefined' ? self : this, function(){

  /* ---------- Identificadores ---------- */

  // Mismo alfabeto que los códigos de sala de la pizarra (sin 0/O ni 1/I/L)
  const ALFABETO_SALA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const ALFABETO_ID = 'abcdefghijklmnopqrstuvwxyz0123456789';

  function azar(n, alfabeto){
    const a = new Uint8Array(n);
    (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a);
    return Array.from(a, b => alfabeto[b % alfabeto.length]).join('');
  }
  /** Código de sala de la pizarra: 6 caracteres. */
  function nuevoCodigoSala(){ return azar(6, ALFABETO_SALA); }
  /** Id largo (no adivinable): para aulas y claves de administración. */
  function nuevoIdLargo(n){ return azar(n || 20, ALFABETO_ID); }
  function formatoCodigoSala(code){ return code ? code.slice(0,3) + '-' + code.slice(3) : ''; }

  /* ---------- Fechas ---------- */

  /** Argentina no tiene horario de verano: UTC-3 todo el año. */
  const OFFSET_ARG = '-03:00';

  /** La fecha y hora de una clase (cargadas en hora argentina) como instante absoluto. */
  function instanteArg(fecha, hora){
    return new Date(`${fecha}T${hora || '00:00'}:00${OFFSET_ARG}`);
  }
  /** Fecha local (YYYY-MM-DD) sin pasar por UTC, para no correrse de día a la noche. */
  function isoLocal(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  /* ---------- Trabajos prácticos: formato rápido de preguntas ----------

     Se escriben (o se pegan, por ejemplo desde una IA) así:

       ? ¿Cuánto es 7 × 8?
       - 54
       * 56
       - 58

       ? La Tierra es plana.
       = F

       ? ¿Cuánto vale π con dos decimales?
       = 3.14 ± 0.01

       ? Explicá con tus palabras qué es una fracción.

     "?" abre una pregunta (las líneas siguientes sin marca se suman al enunciado),
     "*" es una opción correcta, "-" una incorrecta, "= V" / "= F" verdadero o falso,
     "= número" una respuesta numérica (con "±" opcional), y sin nada es una pregunta
     abierta que corrige el profe. "#" al principio de la línea es un comentario. */

  function parsearPreguntas(texto){
    const preguntas = [];
    const errores = [];
    let actual = null;
    const cerrar = () => {
      if(!actual) return;
      const p = actual;
      if(p.opciones.length){
        const correctas = p.opciones.filter(o=>o.ok);
        if(correctas.length !== 1) errores.push(`"${recortar(p.enunciado)}": tiene que haber exactamente una opción con *`);
        preguntas.push({id: p.id, tipo:'opcion', enunciado: p.enunciado, opciones: p.opciones.map(o=>o.texto), correcta: p.opciones.findIndex(o=>o.ok)});
      }else if(p.igual !== null){
        const v = p.igual.trim();
        if(/^(v|verdadero)$/i.test(v)) preguntas.push({id: p.id, tipo:'vf', enunciado: p.enunciado, correcta: true});
        else if(/^(f|falso)$/i.test(v)) preguntas.push({id: p.id, tipo:'vf', enunciado: p.enunciado, correcta: false});
        else{
          const m = /^(-?[\d.,]+)\s*(?:(?:±|\+-|\+\/-)\s*([\d.,]+))?$/.exec(v);
          if(!m){ errores.push(`"${recortar(p.enunciado)}": no entiendo la respuesta "= ${v}" (usá V, F o un número)`); }
          else preguntas.push({id: p.id, tipo:'numero', enunciado: p.enunciado, correcta: numero(m[1]), tolerancia: m[2] ? numero(m[2]) : 0});
        }
      }else{
        preguntas.push({id: p.id, tipo:'texto', enunciado: p.enunciado});
      }
      actual = null;
    };
    String(texto || '').split(/\r?\n/).forEach((linea, i)=>{
      const l = linea.trim();
      if(!l || l.startsWith('#')) return;
      const marca = l[0];
      const resto = l.slice(1).trim();
      if(marca === '?'){
        cerrar();
        actual = {id: 'p' + (preguntas.length + 1), enunciado: resto, opciones: [], igual: null};
        return;
      }
      if(!actual){ errores.push(`Línea ${i+1}: antes de las opciones va la pregunta, empezando con "?"`); return; }
      if(marca === '*' || marca === '-'){
        if(resto) actual.opciones.push({texto: resto, ok: marca === '*'});
      }else if(marca === '='){
        actual.igual = resto;
      }else{
        // Continuación del enunciado (preguntas de varias líneas)
        actual.enunciado += '\n' + l;
      }
    });
    cerrar();
    preguntas.forEach((p, i)=>{ p.id = 'p' + (i+1); });
    return {preguntas, errores};
  }

  function preguntasATexto(preguntas){
    return (preguntas || []).map(p=>{
      const cab = '? ' + p.enunciado;
      if(p.tipo === 'opcion') return cab + '\n' + p.opciones.map((o,i)=>(i===p.correcta ? '* ' : '- ') + o).join('\n');
      if(p.tipo === 'vf') return cab + '\n= ' + (p.correcta ? 'V' : 'F');
      if(p.tipo === 'numero') return cab + '\n= ' + p.correcta + (p.tolerancia ? ' ± ' + p.tolerancia : '');
      return cab;
    }).join('\n\n');
  }

  function numero(s){ return parseFloat(String(s).replace(',', '.')); }
  function recortar(s){ s = String(s||''); return s.length > 40 ? s.slice(0,40) + '…' : s; }

  /** true / false si se corrige sola; null si la corrige el profe (o no hay respuesta). */
  function corregir(pregunta, respuesta){
    if(respuesta === undefined || respuesta === null || respuesta === '') return null;
    if(pregunta.tipo === 'opcion') return Number(respuesta) === pregunta.correcta;
    if(pregunta.tipo === 'vf') return (respuesta === true || respuesta === 'true') === pregunta.correcta;
    if(pregunta.tipo === 'numero'){
      const v = numero(respuesta);
      if(isNaN(v)) return false;
      return Math.abs(v - pregunta.correcta) <= (pregunta.tolerancia || 0) + 1e-9;
    }
    return null;
  }

  /** Cuántas automáticas bien sobre cuántas automáticas hay. */
  function puntaje(preguntas, respuestas){
    let ok = 0, total = 0, abiertas = 0;
    (preguntas || []).forEach(p=>{
      if(p.tipo === 'texto'){ abiertas++; return; }
      total++;
      if(corregir(p, (respuestas || {})[p.id]) === true) ok++;
    });
    return {ok, total, abiertas};
  }

  /* ---------- Estado de cuenta ---------- */

  function claseTerminada(c, ahora){
    return instanteArg(c.fecha, c.horaSalida || c.horaEntrada) <= ahora;
  }

  /** Lo que el estudiante ve de sus pagos: cuántas clases ya dadas falta abonar. */
  function estadoCuenta(clases, ahora){
    const adeudadas = (clases || []).filter(c => !c.pagada && claseTerminada(c, ahora));
    const monto = adeudadas.reduce((s,c)=> s + (typeof c.monto === 'number' ? c.monto : 0), 0);
    return {clasesAdeudadas: adeudadas.length, monto, alDia: adeudadas.length === 0};
  }

  /* ---------- Aula: lo que se publica para cada estudiante ----------

     El profe sigue teniendo todos sus datos en un solo documento privado (users/{uid}).
     Para cada estudiante invitado se publica aparte, en aulas/{aulaId}, solo lo suyo:
     sus clases (sin las notas privadas), sus tareas (db.tps), avisos y materias.
     Los pendientes del profe (db.tareas) no se publican. */

  const MAX_CLASES_PASADAS = 60;
  const MAX_CLASES_FUTURAS = 60;
  const MAX_AVISOS = 30;

  function construirAula(db, alumno, ahora){
    const mostrarMontos = alumno.mostrarMontos === true;
    const temaNombre = id => { const t = (db.temas||[]).find(t=>t.id===id); return t ? t.nombre : ''; };
    const suyas = (db.clases || []).filter(c => c.alumnoId === alumno.id)
      .slice().sort((a,b)=> (a.fecha + a.horaEntrada).localeCompare(b.fecha + b.horaEntrada));
    const pasadas = suyas.filter(c => claseTerminada(c, ahora)).slice(-MAX_CLASES_PASADAS);
    const futuras = suyas.filter(c => !claseTerminada(c, ahora)).slice(0, MAX_CLASES_FUTURAS);
    const clases = pasadas.concat(futuras).map(c=>{
      const o = {
        id: c.id, fecha: c.fecha, horaEntrada: c.horaEntrada, horaSalida: c.horaSalida || null,
        duracionMin: c.duracionMin || 0, pagada: !!c.pagada,
        resumen: c.resumen || '',
        pizarra: c.pizarra && c.pizarra.codigo ? {codigo: c.pizarra.codigo} : null
      };
      // total de la clase: precio + pasajes (si el profe va a su casa)
      if(mostrarMontos) o.monto = Number(c.monto || 0) + Number(c.viatico || 0);
      return o;
    });
    // Las tareas del alumno son db.tps. db.tareas son los pendientes del profe: no se publican.
    const tps = (db.tps || []).filter(tp => tp.alumnoId === alumno.id && tp.publicado).map(tp=>({
      id: tp.id, titulo: tp.titulo || tituloDeTexto(tp.consigna), consigna: tp.consigna || '', tema: tp.temaId ? temaNombre(tp.temaId) : '',
      fechaEntrega: tp.fechaEntrega || null, claseId: tp.claseId || null,
      preguntas: tp.preguntas || [], publicadoEn: tp.publicadoEn || null
    }));
    const cfg = db.config || {};
    const perfil = cfg.perfil || {};
    return {
      alumnoNombre: alumno.nombre,
      alumnoTipo: alumno.tipo || 'nino',
      color: alumno.color || '#c1673b',
      profeNombre: cfg.nombreProfe || perfil.nombre || '',
      temas: (alumno.temasIds || []).map(temaNombre).filter(Boolean),
      mostrarMontos,
      tarifa: mostrarMontos ? Number(alumno.tarifa || 0) : null,
      telefonoProfe: cfg.telefonoProfe || perfil.telefono || '',
      clases, tps,
      avisos: (alumno.avisos || []).slice(-MAX_AVISOS)
    };
  }

  /* ---------- Recordatorios (los usa el notificador) ---------- */

  /**
   * Clases que empiezan dentro de los próximos `antesMin` minutos (y todavía no empezaron).
   * El notificador corre cada ~10 minutos: con una ventana así, cada clase entra en alguna
   * corrida; que no se repita lo garantiza el registro de enviados.
   */
  function clasesPorEmpezar(clases, ahora, antesMin){
    const limite = ahora.getTime() + antesMin * 60000;
    return (clases || []).filter(c=>{
      const t = instanteArg(c.fecha, c.horaEntrada).getTime();
      return t > ahora.getTime() && t <= limite;
    });
  }

  /** Clases que terminaron hace menos de `ventanaMin` minutos. */
  function clasesRecienTerminadas(clases, ahora, ventanaMin){
    return (clases || []).filter(c=>{
      if(!c.horaSalida) return false;
      const t = instanteArg(c.fecha, c.horaSalida).getTime();
      return t <= ahora.getTime() && t > ahora.getTime() - ventanaMin * 60000;
    });
  }

  function horaLinda(hora){ return hora ? hora.replace(/^0/, '') : ''; }

  /* ---------- Carga rápida de alumnos ----------
     Un alumno por renglón; si después del nombre hay un número, es su WhatsApp:
       Sofi 2611234567
       Juli Pérez, 261 555-0000
       Tomi                                                     */
  function parsearListaAlumnos(texto){
    const vistos = new Set();
    const out = [];
    String(texto || '').split(/\r?\n/).forEach(linea=>{
      const l = linea.trim().replace(/^(?:[-•*]\s*|\d+[.)]\s+)/, '');   // viñetas o "1. "
      if(!l) return;
      const m = /^(.*?)[\s,;:–-]*(\+?\d[\d\s().-]{5,}\d)?\s*$/.exec(l);
      const nombre = (m ? m[1] : l).trim().replace(/[\s,;:–-]+$/, '');
      const telefono = m && m[2] ? m[2].replace(/[^\d+]/g, '') : '';
      if(!nombre) return;
      const clave = nombre.toLowerCase();
      if(vistos.has(clave)) return;
      vistos.add(clave);
      out.push({nombre: nombre.slice(0, 80), telefono});
    });
    return out;
  }

  /** Un título corto a partir del texto de la tarea (su primer renglón). */
  function tituloDeTexto(texto){
    const primera = String(texto || '').split(/\r?\n/).map(s=>s.trim()).find(Boolean) || '';
    return primera.length > 70 ? primera.slice(0, 67).trimEnd() + '…' : primera;
  }

  return {
    ALFABETO_SALA, nuevoCodigoSala, nuevoIdLargo, formatoCodigoSala,
    instanteArg, isoLocal,
    parsearPreguntas, preguntasATexto, corregir, puntaje,
    claseTerminada, estadoCuenta, construirAula,
    clasesPorEmpezar, clasesRecienTerminadas, horaLinda,
    parsearListaAlumnos, tituloDeTexto
  };
});
