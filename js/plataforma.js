/* =========================================================
   Estudiemos como plataforma: lo que comparten el profe, el estudiante y el buscador.
   Sin DOM ni Firebase (igual que comun.js): catálogos fijos, qué se publica del perfil,
   horarios libres, reglas de cancelación y filtros del buscador.
   En el navegador queda en window.Plataforma; en Node, con require().
   ========================================================= */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plataforma = factory();
})(typeof self !== 'undefined' ? self : this, function(){

  /* ---------- Texto ---------- */

  /** Minúsculas y sin tildes, para comparar ("Matemáticas" ~ "matematicas"). */
  function normalizar(s){
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Catálogo de materias (fijo, igual para todos) ----------
     Fijo para que el buscador filtre bien: si cada profe escribe la suya, "Mate" y
     "Matemáticas" no se encuentran. Si a alguien le falta una, la escribe como "otra"
     (se muestra en su perfil, pero no es un filtro). */

  const GRUPOS = [
    {id: 'exactas', nombre: 'Exactas'},
    {id: 'naturales', nombre: 'Naturales'},
    {id: 'sociales', nombre: 'Sociales y humanidades'},
    {id: 'idiomas', nombre: 'Idiomas'},
    {id: 'tecnologia', nombre: 'Tecnología'},
    {id: 'arte', nombre: 'Arte'},
    {id: 'general', nombre: 'General'}
  ];

  const MATERIAS = [
    {id: 'matematica', nombre: 'Matemática', grupo: 'exactas', alias: ['matematicas', 'mate', 'algebra', 'analisis matematico', 'calculo', 'geometria']},
    {id: 'fisica', nombre: 'Física', grupo: 'exactas'},
    {id: 'quimica', nombre: 'Química', grupo: 'exactas'},
    {id: 'estadistica', nombre: 'Estadística', grupo: 'exactas'},
    {id: 'contabilidad', nombre: 'Contabilidad', grupo: 'exactas'},
    {id: 'economia', nombre: 'Economía', grupo: 'sociales'},
    {id: 'biologia', nombre: 'Biología', grupo: 'naturales'},
    {id: 'naturales', nombre: 'Ciencias naturales', grupo: 'naturales', alias: ['cs naturales']},
    {id: 'lengua', nombre: 'Lengua y literatura', grupo: 'sociales', alias: ['lengua', 'literatura', 'practicas del lenguaje']},
    {id: 'historia', nombre: 'Historia', grupo: 'sociales'},
    {id: 'geografia', nombre: 'Geografía', grupo: 'sociales'},
    {id: 'sociales', nombre: 'Ciencias sociales', grupo: 'sociales', alias: ['cs sociales']},
    {id: 'filosofia', nombre: 'Filosofía', grupo: 'sociales'},
    {id: 'psicologia', nombre: 'Psicología', grupo: 'sociales'},
    {id: 'formacion-etica', nombre: 'Formación ética y ciudadana', grupo: 'sociales', alias: ['formacion etica', 'fec', 'civica']},
    {id: 'ingles', nombre: 'Inglés', grupo: 'idiomas'},
    {id: 'portugues', nombre: 'Portugués', grupo: 'idiomas'},
    {id: 'frances', nombre: 'Francés', grupo: 'idiomas'},
    {id: 'italiano', nombre: 'Italiano', grupo: 'idiomas'},
    {id: 'aleman', nombre: 'Alemán', grupo: 'idiomas'},
    {id: 'programacion', nombre: 'Programación', grupo: 'tecnologia'},
    {id: 'computacion', nombre: 'Computación', grupo: 'tecnologia', alias: ['informatica', 'excel', 'office']},
    {id: 'musica', nombre: 'Música', grupo: 'arte', alias: ['guitarra', 'piano', 'canto']},
    {id: 'dibujo', nombre: 'Dibujo y arte', grupo: 'arte', alias: ['dibujo', 'plastica', 'arte']},
    {id: 'apoyo-escolar', nombre: 'Apoyo escolar', grupo: 'general', alias: ['apoyo', 'tareas']},
    {id: 'ingreso', nombre: 'Ingreso a la facu', grupo: 'general', alias: ['ingreso universitario', 'preuniversitario']}
  ];

  function materia(id){ return MATERIAS.find(m=>m.id === id) || null; }

  /** La materia del catálogo que corresponde a un nombre escrito a mano, o null. */
  function materiaPorNombre(nombre){
    const n = normalizar(nombre);
    if(!n) return null;
    return MATERIAS.find(m=>normalizar(m.nombre) === n || normalizar(m.id) === n || (m.alias || []).includes(n)) || null;
  }

  /* ---------- Niveles ---------- */

  const NIVELES = [
    {id: 'primario', label: 'Primaria', corto: 'Primaria'},
    {id: 'secundario', label: 'Secundaria', corto: 'Secundaria'},
    {id: 'preuniversitario', label: 'Ingreso a la facu', corto: 'Ingreso'},
    {id: 'universitario', label: 'Universidad', corto: 'Universidad'},
    {id: 'adultos', label: 'Adultos', corto: 'Adultos'}
  ];
  function nivel(id){ return NIVELES.find(n=>n.id === id) || null; }

  /* ---------- Zonas: los departamentos de Mendoza ----------
     El punto es el centro aproximado del departamento: en el mapa se muestra un círculo
     por zona, nunca la dirección del profe. */

  const ZONAS = [
    {id: 'capital', nombre: 'Capital', lat: -32.8895, lng: -68.8458, gran: true},
    {id: 'godoy-cruz', nombre: 'Godoy Cruz', lat: -32.9253, lng: -68.8441, gran: true},
    {id: 'guaymallen', nombre: 'Guaymallén', lat: -32.9030, lng: -68.7810, gran: true},
    {id: 'las-heras', nombre: 'Las Heras', lat: -32.8500, lng: -68.8250, gran: true},
    {id: 'lujan', nombre: 'Luján de Cuyo', lat: -33.0367, lng: -68.8775, gran: true},
    {id: 'maipu', nombre: 'Maipú', lat: -32.9833, lng: -68.7833, gran: true},
    {id: 'lavalle', nombre: 'Lavalle', lat: -32.7206, lng: -68.5925},
    {id: 'san-martin', nombre: 'San Martín', lat: -33.0806, lng: -68.4681},
    {id: 'junin', nombre: 'Junín', lat: -33.1450, lng: -68.4908},
    {id: 'rivadavia', nombre: 'Rivadavia', lat: -33.1906, lng: -68.4614},
    {id: 'santa-rosa', nombre: 'Santa Rosa', lat: -33.2547, lng: -68.1497},
    {id: 'la-paz', nombre: 'La Paz', lat: -33.4608, lng: -67.5550},
    {id: 'tupungato', nombre: 'Tupungato', lat: -33.3667, lng: -69.1500},
    {id: 'tunuyan', nombre: 'Tunuyán', lat: -33.5667, lng: -69.0167},
    {id: 'san-carlos', nombre: 'San Carlos', lat: -33.7742, lng: -69.0447},
    {id: 'san-rafael', nombre: 'San Rafael', lat: -34.6177, lng: -68.3301},
    {id: 'general-alvear', nombre: 'General Alvear', lat: -34.9767, lng: -67.6900},
    {id: 'malargue', nombre: 'Malargüe', lat: -35.4750, lng: -69.5847}
  ];
  const CENTRO_MENDOZA = [-32.92, -68.83];
  function zona(id){ return ZONAS.find(z=>z.id === id) || null; }

  /* ---------- Dónde se dan las clases ---------- */

  const LUGARES = [
    {id: 'casa_mia', nombre: 'En casa del profe', corto: 'En mi casa'},
    {id: 'casa_alumno', nombre: 'A domicilio', corto: 'A domicilio'},
    {id: 'virtual', nombre: 'Virtual', corto: 'Virtual'}
  ];
  function lugar(id){ return LUGARES.find(l=>l.id === id) || null; }

  /* ---------- Reglas de cancelación ----------
     Cada profe elige una y se muestra en su perfil antes de arreglar la clase.
     - El alumno cancela con tiempo: no paga y le queda la clase para recuperar.
     - El alumno cancela tarde (o no viene): se cobra `tarde` (0.5 = la mitad, 1 = completa).
     - El profe cancela: nunca le cuesta al alumno, y le queda para recuperar.
     Es el piso: el profe siempre puede no cobrarla. */

  const REGLAS = {
    flexible: {id: 'flexible', nombre: 'Flexible', horas: 12, tarde: 0.5},
    normal: {id: 'normal', nombre: 'Normal', horas: 24, tarde: 1},
    estricta: {id: 'estricta', nombre: 'Estricta', horas: 48, tarde: 1}
  };
  const REGLA_DEFAULT = 'normal';
  /** Días que tiene el alumno para recuperar una clase cancelada a tiempo. */
  const DIAS_RECUPERO = 30;

  function regla(id){ return REGLAS[id] || REGLAS[REGLA_DEFAULT]; }

  function textoRegla(id){
    const r = regla(id);
    const tarde = r.tarde >= 1 ? 'se cobra completa' : r.tarde > 0 ? 'se cobra la mitad' : 'no se cobra';
    return `Cancelando hasta ${r.horas} h antes no pagás y la recuperás otro día. Más tarde (o si no venís) ${tarde}. Si cancela el profe, nunca pagás.`;
  }

  /** Instante de una clase cargada en hora argentina (UTC-3, sin horario de verano). */
  function instante(fecha, hora){
    return new Date(`${fecha}T${hora || '00:00'}:00-03:00`);
  }

  /**
   * Qué pasa si se cancela una clase. quien: 'alumno' | 'profe'. cuando: el momento del
   * aviso (Date). Devuelve {aTiempo, cobro (0, 0.5 o 1), recuperar, horasAntes}.
   */
  function evaluarCancelacion(clase, reglaId, quien, cuando){
    const r = regla(reglaId);
    const t = instante(clase.fecha, clase.horaEntrada).getTime();
    const horasAntes = (t - (cuando || new Date()).getTime()) / 3600000;
    if(quien === 'profe') return {aTiempo: true, cobro: 0, recuperar: true, horasAntes};
    const aTiempo = horasAntes >= r.horas;
    return {aTiempo, cobro: aTiempo ? 0 : r.tarde, recuperar: aTiempo, horasAntes};
  }

  /** Hasta qué fecha (YYYY-MM-DD) se puede recuperar una clase cancelada el día `desde`. */
  function vencimientoRecupero(desde){
    const d = new Date((desde || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + DIAS_RECUPERO);
    return d.toISOString().slice(0, 10);
  }

  /* ---------- Horarios libres ---------- */

  function aMin(h){ const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); }
  function aHora(m){ return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function sumarDias(iso, n){
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function diaSemana(iso){ return new Date(iso + 'T12:00:00Z').getUTCDay(); }

  /**
   * Turnos libres para reservar.
   *   disponibilidad: {0..6: {activo, desde, hasta}} (0 = domingo)
   *   ocupado: [{f: 'YYYY-MM-DD', d: 'HH:MM', h: 'HH:MM'}] (clases ya tomadas, sin nombres)
   *   opciones: {desde: 'YYYY-MM-DD', dias: 14, duracion: 60, paso: 30, ahora: Date, anticipacionH: 12}
   * Devuelve [{fecha, hora}] en orden.
   */
  function huecosLibres(disponibilidad, ocupado, opciones){
    const o = Object.assign({dias: 14, duracion: 60, paso: 30, anticipacionH: 12}, opciones || {});
    const ahora = o.ahora || new Date();
    const desde = o.desde || ahoraArg(ahora).fecha;
    const limite = ahora.getTime() + o.anticipacionH * 3600000;
    const porDia = {};
    (ocupado || []).forEach(x=>{ (porDia[x.f] = porDia[x.f] || []).push([aMin(x.d), aMin(x.h)]); });
    const out = [];
    for(let i = 0; i < o.dias; i++){
      const fecha = sumarDias(desde, i);
      const disp = (disponibilidad || {})[diaSemana(fecha)];
      if(!disp || !disp.activo) continue;
      const ini = aMin(disp.desde), fin = aMin(disp.hasta);
      const tomados = porDia[fecha] || [];
      for(let m = ini; m + o.duracion <= fin; m += o.paso){
        if(tomados.some(([a, b])=>m < b && a < m + o.duracion)) continue;
        if(instante(fecha, aHora(m)).getTime() < limite) continue;
        out.push({fecha, hora: aHora(m)});
      }
    }
    return out;
  }

  /** Fecha y hora de Argentina para un instante. */
  function ahoraArg(d){
    const a = new Date((d || new Date()).getTime() - 3 * 3600000);
    return {fecha: a.toISOString().slice(0, 10), hora: a.toISOString().slice(11, 16)};
  }

  /** Clases tomadas (de hoy en adelante, sin nombres) para publicar en el perfil. */
  function ocupadoDe(clases, ahora, dias){
    const hoy = ahoraArg(ahora).fecha, hasta = sumarDias(hoy, dias || 28);
    return (clases || [])
      .filter(c=>c.fecha >= hoy && c.fecha <= hasta && !c.cancelada && c.horaEntrada)
      .map(c=>({f: c.fecha, d: c.horaEntrada, h: c.horaSalida || aHora(aMin(c.horaEntrada) + (c.duracionMin || 60))}))
      .sort((a, b)=>(a.f + a.d).localeCompare(b.f + b.d))
      .slice(0, 300);
  }

  /* ---------- Perfil público del profe (perfiles/{uid}) ----------
     Lo arma la app del profe con sus datos. Nunca lleva alumnos, montos de clases,
     notas ni direcciones: solo lo que el profe eligió mostrar. */

  function perfilPublico(data, extra){
    const cfg = (data && data.config) || {};
    const p = cfg.perfil || {};
    const temas = (data && data.temas) || [];
    const materiaIds = [], otras = [];
    temas.forEach(t=>{
      const m = t.catId ? materia(t.catId) : materiaPorNombre(t.nombre);
      if(m){ if(!materiaIds.includes(m.id)) materiaIds.push(m.id); }
      else if(t.nombre && !otras.includes(t.nombre)) otras.push(String(t.nombre).slice(0, 40));
    });
    const resenas = (extra && extra.resenas) || [];
    const prom = resenas.length ? resenas.reduce((s, r)=>s + (Number(r.estrellas) || 0), 0) / resenas.length : 0;
    const disp = {};
    Object.entries(cfg.disponibilidad || {}).forEach(([d, v])=>{
      if(v && v.activo) disp[d] = {activo: true, desde: String(v.desde || ''), hasta: String(v.hasta || '')};
    });
    return {
      nombre: String(cfg.nombreProfe || (extra && extra.nombre) || '').slice(0, 60),
      bio: String(cfg.bioProfe || '').slice(0, 600),
      foto: String((extra && extra.foto) || '').slice(0, 500),
      paleta: cfg.paleta || 'lila',
      materias: materiaIds.map(id=>materia(id).nombre).concat(otras).slice(0, 30),
      materiaIds: materiaIds.slice(0, 30),
      otras: otras.slice(0, 10),
      niveles: (p.niveles || []).filter(nivel).slice(0, 6),
      zonas: (p.zonas || []).filter(zona).slice(0, 18),
      barrio: String(p.barrio || '').slice(0, 60),
      lugares: (p.lugares || []).filter(lugar).slice(0, 3),
      precioHora: Math.max(0, Math.round(Number(cfg.tarifaHabitual) || 0)),
      detalle: String(p.detalle || '').slice(0, 300),
      whatsapp: p.mostrarWhatsapp ? String(cfg.telefonoProfe || '').replace(/\D/g, '').slice(0, 20) : '',
      regla: REGLAS[p.regla] ? p.regla : REGLA_DEFAULT,
      duracion: [30, 45, 60, 90, 120].includes(Number(p.duracion)) ? Number(p.duracion) : 60,
      disponibilidad: disp,
      ocupado: ocupadoDe(data && data.clases, (extra && extra.ahora) || new Date()),
      visible: p.visible !== false && !!cfg.nombreProfe && materiaIds.length + otras.length > 0,
      resenas: resenas.slice(0, 60),
      promedio: Math.round(prom * 10) / 10,
      cantResenas: resenas.length
    };
  }

  /** Lo que le falta al perfil para aparecer en el buscador (vacío = está listo). */
  function faltaEnPerfil(data){
    const cfg = (data && data.config) || {};
    const p = cfg.perfil || {};
    const f = [];
    if(!cfg.nombreProfe) f.push('nombre');
    if(!((data && data.temas) || []).length) f.push('materias');
    if(!(p.zonas || []).length && !(p.lugares || []).includes('virtual')) f.push('zona');
    if(!(Number(cfg.tarifaHabitual) > 0)) f.push('precio');
    return f;
  }

  /* ---------- Buscador ---------- */

  /**
   * Filtra y ordena perfiles. filtros: {texto, materia, nivel, zona, lugar, precioMax, ocultos: Set|[]}
   * Los que tienen reseñas y más materias en común van primero.
   */
  function filtrarProfes(perfiles, filtros){
    const f = filtros || {};
    const ocultos = new Set(f.ocultos || []);
    const texto = normalizar(f.texto);
    return (perfiles || []).filter(p=>{
      if(!p || p.visible === false || ocultos.has(p.uid)) return false;
      if(f.materia && !(p.materiaIds || []).includes(f.materia)) return false;
      if(f.nivel && !(p.niveles || []).includes(f.nivel)) return false;
      if(f.lugar && !(p.lugares || []).includes(f.lugar)) return false;
      if(f.zona){
        const enZona = (p.zonas || []).includes(f.zona);
        if(!enZona && !(f.zona === 'virtual' && (p.lugares || []).includes('virtual'))) return false;
      }
      if(f.precioMax && p.precioHora && p.precioHora > f.precioMax) return false;
      if(texto){
        const hay = normalizar([p.nombre, p.bio, p.barrio, (p.materias || []).join(' '), (p.zonas || []).map(z=>(zona(z) || {}).nombre).join(' ')].join(' '));
        if(!texto.split(' ').every(w=>hay.includes(w))) return false;
      }
      return true;
    }).sort((a, b)=>
      (b.cantResenas > 0) - (a.cantResenas > 0) || (b.promedio || 0) - (a.promedio || 0) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  }

  /** Distancia en km entre dos [lat, lng]. */
  function distanciaKm(a, b){
    const r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /** Un punto cerca del centro de la zona, siempre el mismo para cada profe (para que no se tapen). */
  function puntoEnZona(uid, zonaId){
    const z = zona(zonaId);
    if(!z) return null;
    let h = 0;
    for(const ch of String(uid) + zonaId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ang = (h % 360) * Math.PI / 180, rad = 0.004 + (h % 1000) / 1000 * 0.012;
    return [z.lat + Math.sin(ang) * rad, z.lng + Math.cos(ang) * rad];
  }

  /* ---------- Chat ---------- */

  /** Id del chat entre un profe y un estudiante: siempre el mismo para el par. */
  function chatId(profeUid, estudianteUid){ return 'c_' + profeUid + '_' + estudianteUid; }

  /* ---------- Actividades ---------- */

  const TIPOS_ACTIVIDAD = [
    {id: 'ejercicio', nombre: 'Ejercicio', desc: 'Algo corto para practicar. Se corrige al toque y se puede rehacer.'},
    {id: 'tarea', nombre: 'Tarea', desc: 'Para hacer en casa, con fecha. La marca como hecha o responde.'},
    {id: 'tp', nombre: 'Trabajo práctico', desc: 'Algo más largo: responde con texto, fotos o un link.'},
    {id: 'evaluacion', nombre: 'Evaluación', desc: 'Una sola vez, y ve las respuestas recién cuando la corregís.'}
  ];
  function tipoActividad(id){ return TIPOS_ACTIVIDAD.find(t=>t.id === id) || TIPOS_ACTIVIDAD[1]; }

  return {
    normalizar,
    GRUPOS, MATERIAS, materia, materiaPorNombre,
    NIVELES, nivel, ZONAS, zona, CENTRO_MENDOZA, LUGARES, lugar,
    REGLAS, REGLA_DEFAULT, DIAS_RECUPERO, regla, textoRegla, evaluarCancelacion, vencimientoRecupero,
    huecosLibres, ocupadoDe, ahoraArg, sumarDias, diaSemana,
    perfilPublico, faltaEnPerfil, filtrarProfes, distanciaKm, puntoEnZona,
    chatId, TIPOS_ACTIVIDAD, tipoActividad
  };
});
