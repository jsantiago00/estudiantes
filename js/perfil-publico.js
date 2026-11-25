/* =========================================================
   Estudiemos: el perfil público de un profe (profe.html?p=UID).
   Se ve sin cuenta. Desde acá se le escribe por chat o se elige un horario
   (eso pasa en estudiante.html, que pide entrar con Google).
   ========================================================= */
import { db, doc, getDoc } from './firebase.js';

const P = window.Plataforma;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const money = n => '$' + (Number(n) || 0).toLocaleString('es-AR', {maximumFractionDigits: 0});
const ICONS = {
  message:'<path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.6-4.6a8.5 8.5 0 1 1 15.9-4.3Z"/>',
  calendar:'<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  share:'<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  'map-pin':'<path d="M19 10c0 5.5-7 11.5-7 11.5S5 15.5 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove('show'), 2400); }
function estrellas(n){ const r = Math.round(n); return '★'.repeat(r) + '☆'.repeat(5 - r); }
function iniciales(n){ const p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }

const uid = new URLSearchParams(location.search).get('p');

async function cargar(){
  const cont = $('perfil');
  if(!uid){ cont.innerHTML = '<div class="card empty-pub"><h3>Falta el link completo</h3></div>'; return; }
  let p;
  try{
    const s = await getDoc(doc(db, 'perfiles', uid));
    if(!s.exists()){ cont.innerHTML = '<div class="card empty-pub"><h3>Este perfil no existe</h3><p>Puede que el profe lo haya sacado.</p><a class="btn outline" href="./?buscar">Ver otros profes</a></div>'; return; }
    p = s.data();
  }catch(e){
    console.error(e);
    cont.innerHTML = '<div class="card empty-pub"><h3>No se pudo cargar</h3><p>Revisá tu conexión y probá de nuevo.</p></div>';
    return;
  }
  if(['lila','azul','rojo','verde','celeste'].includes(p.paleta)) document.documentElement.setAttribute('data-palette', p.paleta);
  document.title = `${p.nombre || 'Profe'} · Estudiemos`;
  const rs = p.resenas || [];
  const prom = rs.length ? rs.reduce((t, r)=>t + (r.estrellas || 0), 0) / rs.length : 0;
  const zonas = (p.zonas || []).map(z=>(P.zona(z) || {}).nombre).filter(Boolean);
  const lugares = (p.lugares || []).map(l=>(P.lugar(l) || {}).nombre).filter(Boolean);
  const niveles = (p.niveles || []).map(n=>(P.nivel(n) || {}).label).filter(Boolean);
  const disp = p.disponibilidad || {};
  const diasDisp = [1, 2, 3, 4, 5, 6, 0].filter(d=>disp[d] && disp[d].activo);
  const duracion = Number(p.duracion) || 60;
  const durTxt = duracion % 60 ? (duracion > 60 ? `${Math.floor(duracion / 60)} h ${duracion % 60} min` : `${duracion} min`) : `${duracion / 60} h`.replace('1 h', '1 hora').replace('2 h', '2 horas');
  const oculto = p.visible === false;
  cont.innerHTML = `
    <div class="perfil-cab">
      ${p.foto ? `<img class="profe-foto" src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="profe-foto ini">${esc(iniciales(p.nombre))}</span>`}
      <h1>${esc(p.nombre || 'Profe')}</h1>
      <div class="profe-sub">${rs.length ? `<span class="stars">${estrellas(prom)}</span> ${prom.toLocaleString('es-AR', {maximumFractionDigits: 1})} · ${rs.length} reseña${rs.length !== 1 ? 's' : ''}` : '<span class="nuevo">Nuevo en Estudiemos</span>'}</div>
      ${zonas.length || p.barrio ? `<div class="profe-sub">${ic('map-pin')}${esc([p.barrio].concat(zonas).filter(Boolean).join(' · '))}</div>` : ''}
      <div class="profe-materias" style="margin-top:12px;">${(p.materias || []).map(m=>`<span>${esc(m)}</span>`).join('')}</div>
    </div>
    ${oculto ? '<div class="note">Este profe no está tomando alumnos nuevos por ahora.</div>' : `
    <div class="perfil-acciones">
      <a class="btn primary" href="estudiante.html?profe=${encodeURIComponent(uid)}">${ic('message')}Escribile</a>
      ${diasDisp.length ? `<a class="btn outline" href="estudiante.html?profe=${encodeURIComponent(uid)}&reservar=1">${ic('calendar')}Elegí un horario</a>` : ''}
      ${p.whatsapp ? `<a class="btn whatsapp" href="https://wa.me/${esc(p.whatsapp)}?text=${encodeURIComponent('¡Hola! Te vi en Estudiemos y quería consultarte por clases.')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
    </div>`}

    ${p.bio ? `<div class="card"><div class="card-head"><h2>Sobre mí</h2></div><p style="margin:0;line-height:1.55;white-space:pre-wrap;">${esc(p.bio)}</p></div>` : ''}

    <div class="card">
      <div class="perfil-datos">
        <div class="perfil-dato"><b>Precio</b><span>${p.precioHora ? `Desde ${money(p.precioHora)} la hora` : 'A consultar'}</span></div>
        <div class="perfil-dato"><b>Cada clase</b><span>${esc(durTxt)}</span></div>
        <div class="perfil-dato"><b>Dónde</b><span>${esc(lugares.join(', ') || 'A consultar')}</span></div>
        <div class="perfil-dato"><b>Niveles</b><span>${esc(niveles.join(', ') || 'Todos')}</span></div>
      </div>
      ${p.detalle ? `<p class="hint" style="margin-top:12px;font-size:14px;">${esc(p.detalle)}</p>` : ''}
    </div>

    ${diasDisp.length ? `<div class="card"><div class="card-head"><h2>Cuándo da clases</h2></div>
      <div class="semana-disp">${diasDisp.map(d=>`<div><span>${DIAS[d]}</span><span>${esc(disp[d].desde)} a ${esc(disp[d].hasta)}</span></div>`).join('')}</div>
    </div>` : ''}

    <div class="card"><div class="card-head"><h2>Si hay que cancelar</h2><span class="badge neutral">${esc(P.regla(p.regla).nombre)}</span></div>
      <p style="margin:0;line-height:1.5;font-size:14.5px;">${esc(P.textoRegla(p.regla))}</p>
    </div>

    <div class="card"><div class="card-head"><h2>Reseñas</h2></div>
      ${rs.length ? rs.map(r=>`<div class="resena"><span class="stars">${estrellas(r.estrellas || 5)}</span><div class="txt">«${esc(r.texto)}»</div><div class="who">— ${esc(r.autor)}</div></div>`).join('')
        : '<div class="empty-msg">Todavía no tiene reseñas publicadas.</div>'}
    </div>

    <div class="btn-row" style="margin-top:6px;">
      <button type="button" class="btn outline" id="btnCompartir">${ic('share')}Compartir este perfil</button>
    </div>
    <p style="text-align:center;margin-top:14px;"><a class="link-sutil" href="estudiante.html?profe=${encodeURIComponent(uid)}&denunciar=1">Denunciar este perfil</a></p>
  `;
  $('btnCompartir').addEventListener('click', async ()=>{
    const url = location.href, title = `${p.nombre} · Estudiemos`;
    try{
      if(navigator.share) await navigator.share({title, url});
      else{ await navigator.clipboard.writeText(url); toast('Link copiado'); }
    }catch(e){}
  });
}
cargar();
