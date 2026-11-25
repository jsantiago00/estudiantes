/* =========================================================
   Estudiemos: el buscador de profes (la portada, index.html).
   Se ve sin cuenta. Lee perfiles/{uid} (los que publica cada profe con
   Plataforma.perfilPublico) y moderacion/{uid} (los que ocultó la administración).
   Lista y mapa (Leaflet, como el mapa de talleres): en el mapa se ve la ZONA de cada profe,
   nunca una dirección.
   ========================================================= */
import { db, collection, query, where, getDocs } from './firebase.js';

const P = window.Plataforma;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const money = n => '$' + (Number(n) || 0).toLocaleString('es-AR', {maximumFractionDigits: 0});

const ICONS = {
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  'map-pin':'<path d="M19 10c0 5.5-7 11.5-7 11.5S5 15.5 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  star:'<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  home:'<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1Z"/>',
  bus:'<rect x="4.5" y="3" width="15" height="14.5" rx="3"/><path d="M4.5 10.5h15M8 17.5V20M16 17.5V20"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  message:'<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.6a8.5 8.5 0 1 1 15.9-4.3Z"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
document.querySelectorAll('[data-ic]').forEach(el=>{ el.outerHTML = ic(el.dataset.ic); });

function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('show'), 2600);
}

/* ---------- Filtros (los catálogos son fijos: ver js/plataforma.js) ---------- */

const params = new URLSearchParams(location.search);
const filtros = {
  texto: params.get('q') || '', materia: params.get('materia') || '', nivel: params.get('nivel') || '',
  zona: params.get('zona') || '', lugar: params.get('lugar') || '', precioMax: Number(params.get('precio')) || 0
};
let perfiles = [], ocultos = [], miPosicion = null, vista = 'lista';

function opciones(sel, lista){ sel.insertAdjacentHTML('beforeend', lista.map(([v, t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')); }
opciones($('fMateria'), P.MATERIAS.slice().sort((a, b)=>a.nombre.localeCompare(b.nombre, 'es')).map(m=>[m.id, m.nombre]));
opciones($('fNivel'), P.NIVELES.map(n=>[n.id, n.label]));
opciones($('fZona'), [['virtual', 'Virtual (desde cualquier lado)']].concat(P.ZONAS.map(z=>[z.id, z.nombre])));
opciones($('fLugar'), [['casa_mia', 'En la casa del profe'], ['casa_alumno', 'A domicilio'], ['virtual', 'Virtual']]);
opciones($('fPrecio'), [8000, 10000, 12000, 15000, 20000].map(v=>[v, 'Hasta ' + money(v) + ' la hora']));
$('q').value = filtros.texto;
[['fMateria', 'materia'], ['fNivel', 'nivel'], ['fZona', 'zona'], ['fLugar', 'lugar'], ['fPrecio', 'precioMax']].forEach(([id, k])=>{
  $(id).value = filtros[k] || '';
  $(id).addEventListener('change', ()=>{ filtros[k] = k === 'precioMax' ? Number($(id).value) || 0 : $(id).value; actualizar(); });
});
let tq = null;
$('q').addEventListener('input', ()=>{ clearTimeout(tq); tq = setTimeout(()=>{ filtros.texto = $('q').value; actualizar(); }, 200); });

/** La URL lleva los filtros, para compartir una búsqueda ("profes de inglés en Maipú"). */
function guardarEnUrl(){
  const q = new URLSearchParams();
  q.set('buscar', '');
  if(filtros.texto) q.set('q', filtros.texto);
  ['materia', 'nivel', 'zona', 'lugar'].forEach(k=>{ if(filtros[k]) q.set(k, filtros[k]); });
  if(filtros.precioMax) q.set('precio', filtros.precioMax);
  history.replaceState(null, '', '?' + q.toString().replace('buscar=&', 'buscar&').replace(/buscar=$/, 'buscar'));
}

/* ---------- Lista ---------- */

function estrellas(n){ const r = Math.round(n); return '★'.repeat(r) + '☆'.repeat(5 - r); }
function iniciales(n){ const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }

function zonasTexto(p){
  const zs = (p.zonas || []).map(z=>(P.zona(z) || {}).nombre).filter(Boolean);
  if(p.barrio) zs.unshift(p.barrio);
  if((p.lugares || []).includes('virtual')) zs.push('Virtual');
  return zs.slice(0, 4).join(' · ');
}

function distanciaA(p){
  if(!miPosicion) return null;
  const ds = (p.zonas || []).map(z=>P.zona(z)).filter(Boolean).map(z=>P.distanciaKm(miPosicion, [z.lat, z.lng]));
  return ds.length ? Math.min(...ds) : null;
}

function tarjetaHtml(p){
  const d = distanciaA(p);
  const lugares = (p.lugares || []).map(l=>`<span class="badge neutral">${ic({casa_mia:'home', casa_alumno:'bus', virtual:'globe'}[l])}${esc((P.lugar(l) || {}).nombre || '')}</span>`).join('');
  return `<a class="profe-card" href="profe.html?p=${encodeURIComponent(p.uid)}">
    <div class="profe-top">
      ${p.foto ? `<img class="profe-foto" src="${esc(p.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="profe-foto ini">${esc(iniciales(p.nombre))}</span>`}
      <div class="profe-datos">
        <div class="profe-nombre">${esc(p.nombre)}</div>
        <div class="profe-sub">${p.cantResenas ? `<span class="stars">${estrellas(p.promedio)}</span> ${String(p.promedio).replace('.', ',')} (${p.cantResenas})` : '<span class="nuevo">Nuevo</span>'}</div>
        <div class="profe-sub">${ic('map-pin')}${esc(zonasTexto(p) || 'Mendoza')}${d != null ? ` · a ${d < 1 ? 'menos de 1' : Math.round(d)} km` : ''}</div>
      </div>
      ${p.precioHora ? `<div class="profe-precio"><small>desde</small>${money(p.precioHora)}<small>la hora</small></div>` : ''}
    </div>
    <div class="profe-materias">${(p.materias || []).slice(0, 6).map(m=>`<span>${esc(m)}</span>`).join('')}${(p.materias || []).length > 6 ? `<span>+${p.materias.length - 6}</span>` : ''}</div>
    ${p.bio ? `<p class="profe-bio">${esc(p.bio.length > 140 ? p.bio.slice(0, 137) + '…' : p.bio)}</p>` : ''}
    <div class="profe-pie">${lugares}${(p.niveles || []).map(n=>`<span class="badge neutral">${esc((P.nivel(n) || {}).corto || '')}</span>`).join('')}</div>
  </a>`;
}

function resultados(){
  let lista = P.filtrarProfes(perfiles, {...filtros, ocultos});
  if(miPosicion) lista = lista.slice().sort((a, b)=>(distanciaA(a) ?? 9999) - (distanciaA(b) ?? 9999));
  return lista;
}

function actualizar(){
  guardarEnUrl();
  const lista = resultados();
  $('cuenta').textContent = perfiles.length ? `${lista.length} profe${lista.length !== 1 ? 's' : ''}` : '';
  const hayFiltros = filtros.texto || filtros.materia || filtros.nivel || filtros.zona || filtros.lugar || filtros.precioMax;
  $('lista').innerHTML = lista.length ? lista.map(tarjetaHtml).join('')
    : `<div class="card empty-pub">
        <h3>${perfiles.length ? 'No encontramos profes con eso' : 'Todavía no hay profes publicados'}</h3>
        <p>${perfiles.length ? 'Probá con menos filtros, o con otra zona.' : 'Si das clases, sé el primero en sumarte.'}</p>
        ${hayFiltros ? '<button type="button" class="btn outline" id="btnLimpiar">Ver todos</button>' : ''}
      </div>`;
  const bl = $('btnLimpiar');
  if(bl) bl.addEventListener('click', ()=>{
    Object.assign(filtros, {texto: '', materia: '', nivel: '', zona: '', lugar: '', precioMax: 0});
    $('q').value = ''; ['fMateria', 'fNivel', 'fZona', 'fLugar', 'fPrecio'].forEach(id=>{ $(id).value = ''; });
    actualizar();
  });
  pintarMapa(lista);
}

/* ---------- Mapa (opcional: si Leaflet no cargó, queda la lista) ---------- */

let mapa = null, capaProfes = null;
const STADIA = 'https://tiles.stadiamaps.com/tiles/';
const ATRIB_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function crearMapa(){
  if(mapa || !window.L) return;
  const L = window.L;
  mapa = L.map('mapa', {zoomControl: false, minZoom: 7, maxZoom: 16}).setView(P.CENTRO_MENDOZA, 11);
  L.control.zoom({position: 'bottomleft', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar'}).addTo(mapa);
  const oscuro = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const osm = ()=>L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: ATRIB_OSM}).addTo(mapa);
  // Stadia (el mismo del mapa de talleres) responde una imagen de "401" si el dominio no está
  // anotado: se prueba antes y, si no, OpenStreetMap
  Promise.race([
    fetch(STADIA + 'alidade_smooth/0/0/0.png', {cache: 'no-store'}).then(r=>r.ok).catch(()=>false),
    new Promise(r=>setTimeout(()=>r(false), 4000))
  ]).then(ok=>{
    if(!ok) return osm();
    L.tileLayer(STADIA + (oscuro ? 'alidade_smooth_dark' : 'alidade_smooth') + '/{z}/{x}/{y}{r}.png', {maxZoom: 19,
      attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' + ATRIB_OSM}).addTo(mapa);
  });
  capaProfes = L.markerClusterGroup ? L.markerClusterGroup({showCoverageOnHover: false, maxClusterRadius: 44,
    iconCreateFunction: c=>L.divIcon({className: 'grupo-profes', html: `<span>${c.getChildCount()}</span>`, iconSize: [44, 44]})}) : L.featureGroup();
  capaProfes.addTo(mapa);
}

function pintarMapa(lista){
  if(vista !== 'mapa' || !window.L) return;
  crearMapa();
  const L = window.L;
  capaProfes.clearLayers();
  const puntos = [];
  lista.forEach(p=>{
    (p.zonas || []).forEach(z=>{
      const pt = P.puntoEnZona(p.uid, z);
      if(!pt) return;
      puntos.push(pt);
      const m = L.marker(pt, {icon: L.divIcon({className: 'pin-profe', html: p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(iniciales(p.nombre))}</span>`, iconSize: [40, 40], iconAnchor: [20, 20]}), title: p.nombre});
      m.bindPopup(`<div class="pop-profe">${tarjetaHtml(p)}</div>`, {maxWidth: 320, minWidth: 260});
      capaProfes.addLayer(m);
    });
  });
  if(miPosicion){
    L.circleMarker(miPosicion, {radius: 8, color: '#fff', weight: 3, fillColor: '#2a7fbf', fillOpacity: 1}).addTo(capaProfes);
    puntos.push(miPosicion);
  }
  setTimeout(()=>{
    mapa.invalidateSize();
    if(puntos.length) mapa.fitBounds(L.latLngBounds(puntos).pad(0.2), {maxZoom: 13});
  }, 50);
}

function setVista(v){
  vista = v;
  document.querySelectorAll('#vista button').forEach(b=>b.classList.toggle('active', b.dataset.vista === v));
  $('cuerpo').dataset.vista = v;
  if(v === 'mapa' && !window.L){ toast('El mapa no cargó: revisá tu conexión'); return setVista('lista'); }
  if(v === 'mapa') pintarMapa(resultados());
}
document.querySelectorAll('#vista button').forEach(b=>b.addEventListener('click', ()=>setVista(b.dataset.vista)));
$('cuerpo').dataset.vista = 'lista';
// En pantallas grandes, lista y mapa van juntos
if(matchMedia('(min-width: 980px)').matches && window.L){ vista = 'mapa'; $('cuerpo').dataset.vista = 'ambos'; document.getElementById('vista').hidden = true; }

$('btnCerca').addEventListener('click', ()=>{
  if(!navigator.geolocation){ toast('Tu navegador no permite saber dónde estás'); return; }
  $('btnCerca').disabled = true;
  navigator.geolocation.getCurrentPosition(pos=>{
    $('btnCerca').disabled = false;
    miPosicion = [pos.coords.latitude, pos.coords.longitude];
    $('btnCerca').classList.add('activo');
    $('btnCerca').lastChild.textContent = 'Ordenado por cercanía';
    actualizar();
  }, ()=>{
    $('btnCerca').disabled = false;
    toast('No pudimos saber dónde estás. Revisá el permiso de ubicación.');
  }, {timeout: 10000, maximumAge: 300000});
});

/* ---------- Datos ---------- */

async function cargar(){
  try{
    const [snap, mod] = await Promise.all([
      getDocs(query(collection(db, 'perfiles'), where('visible', '==', true))),
      getDocs(collection(db, 'moderacion')).catch(()=>({docs: []}))
    ]);
    perfiles = snap.docs.map(d=>({uid: d.id, ...d.data()}));
    ocultos = mod.docs.filter(d=>d.data().oculto).map(d=>d.id);
  }catch(e){
    console.error(e);
    $('lista').innerHTML = '<div class="card empty-pub"><h3>No se pudieron cargar los profes</h3><p>Revisá tu conexión y probá de nuevo.</p></div>';
    return;
  }
  actualizar();
}
cargar();
