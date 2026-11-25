/* =========================================================
   Estudiemos (profe): las materias (del catálogo fijo) y el perfil público del buscador.

   - Materias: se eligen del catálogo de js/plataforma.js (así el buscador filtra bien).
     Si falta una, se escribe como "otra": aparece en el perfil pero no es un filtro.
   - Perfil: niveles, dónde (en casa, a domicilio, virtual), zonas de Mendoza, regla de
     cancelación, duración de la clase y si se muestra el WhatsApp. Lo publica
     js/nube-profe.js en perfiles/{uid} (Plataforma.perfilPublico) cada vez que se guarda.

   Script clásico: comparte el ámbito global con app.html (db, saveDB, openSheet, ic...).
   Se carga antes que el script principal: acá arriba solo se declaran funciones.
   ========================================================= */

/* ---------- Materias ---------- */

/** Agrega una materia (id del catálogo o nombre escrito) si no estaba. Devuelve la de db.temas. */
function agregarMateria(idONombre){
  const m = Plataforma.materia(idONombre) || Plataforma.materiaPorNombre(idONombre);
  const nombre = m ? m.nombre : String(idONombre || '').trim().slice(0, 40);
  if(!nombre) return null;
  const ya = db.temas.find(t=>(m && t.catId === m.id) || Plataforma.normalizar(t.nombre) === Plataforma.normalizar(nombre));
  if(ya){ if(m && !ya.catId){ ya.catId = m.id; ya.nombre = m.nombre; } return ya; }
  const t = {id: uid(), nombre, catId: m ? m.id : null};
  db.temas.push(t);
  return t;
}

function materiaElegida(catId){ return db.temas.some(t=>t.catId === catId); }

/** Chips del catálogo, agrupados. onToggle recibe el id del catálogo. */
function catalogoMateriasHtml(onToggle){
  return Plataforma.GRUPOS.map(g=>{
    const ms = Plataforma.MATERIAS.filter(m=>m.grupo === g.id);
    return `<div class="cat-grupo"><div class="cat-grupo-t">${escapeHtml(g.nombre)}</div>
      <div class="dias-chips">${ms.map(m=>{
        const sel = materiaElegida(m.id);
        return `<button type="button" class="dia-chip ${sel?'sel':''}" onclick="${onToggle}('${m.id}')">${sel ? ic('check') : ''}${escapeHtml(m.nombre)}</button>`;
      }).join('')}</div></div>`;
  }).join('');
}

function otrasMateriasHtml(){
  const otras = db.temas.filter(t=>!t.catId);
  return `
    ${otras.length ? `<div class="dias-chips" style="margin-top:6px;">${otras.map(t=>`<span class="chip-x">${escapeHtml(t.nombre)}<button type="button" onclick="quitarMateria('${t.id}')" aria-label="Quitar">${ic('x')}</button></span>`).join('')}</div>` : ''}
    <div class="row2" style="margin-top:10px;">
      <input type="text" id="f_otraMateria" placeholder="¿Te falta una? Escribila" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();agregarOtraMateria();}">
      <button type="button" class="btn secondary" onclick="agregarOtraMateria()" aria-label="Agregar materia">${ic('plus')}</button>
    </div>`;
}

function abrirGestionTemas(){
  openSheet(`
    <h3>Tus materias</h3>
    <p class="sheet-sub">Tocá las que das. Son las mismas para todos los profes, así los estudiantes te encuentran en el buscador.</p>
    <div id="catalogoMaterias">${catalogoMateriasHtml('toggleMateriaGestion')}</div>
    <div id="otrasMaterias">${otrasMateriasHtml()}</div>
    <div class="sheet-footer"><button type="button" class="btn primary" onclick="closeSheet()">Listo</button></div>
  `);
}

function refrescarMaterias(onToggle){
  const c = document.getElementById('catalogoMaterias');
  if(c) c.innerHTML = catalogoMateriasHtml(onToggle || c.dataset.toggle || 'toggleMateriaGestion');
  const o = document.getElementById('otrasMaterias');
  if(o) o.innerHTML = otrasMateriasHtml();
}

async function toggleMateriaGestion(catId){
  const t = db.temas.find(x=>x.catId === catId);
  if(t){
    const usada = db.alumnos.some(a=>(a.temasIds || []).includes(t.id)) || db.tareas.some(x=>x.temaId === t.id) || db.tps.some(x=>x.temaId === t.id);
    if(usada){
      const ok = await confirmar({titulo: `¿Sacar ${t.nombre}?`, mensaje: 'Se quita de los alumnos y de las tareas que la usaban.', ok: 'Sacar', peligro: true});
      if(!ok) return;
    }
    borrarMateria(t.id);
  }else{
    agregarMateria(catId);
  }
  saveDB();
  refrescarMaterias();
  renderAll();
}

function agregarOtraMateria(){
  const input = document.getElementById('f_otraMateria');
  const nombre = input.value.trim();
  if(!nombre) return;
  const t = agregarMateria(nombre);
  saveDB();
  refrescarMaterias();
  renderAll();
  if(t && t.catId) showToast(`${t.nombre} ya está en la lista: la marcamos`);
  const nuevo = document.getElementById('f_otraMateria');
  if(nuevo) nuevo.focus();
}

async function quitarMateria(id){
  const t = db.temas.find(x=>x.id === id);
  if(!t) return;
  const ok = await confirmar({titulo: `¿Sacar ${t.nombre}?`, mensaje: 'Se quita de los alumnos y de las tareas que la usaban.', ok: 'Sacar', peligro: true});
  if(!ok) return;
  borrarMateria(id);
  saveDB();
  refrescarMaterias();
  renderAll();
}

function borrarMateria(id){
  db.temas = db.temas.filter(t=>t.id !== id);
  db.alumnos.forEach(a=>{ if(Array.isArray(a.temasIds)) a.temasIds = a.temasIds.filter(x=>x !== id); });
  db.tareas.forEach(t=>{ if(t.temaId === id) t.temaId = null; });
  db.tps.forEach(t=>{ if(t.temaId === id) t.temaId = null; });
}

/* ---------- Perfil público ---------- */

function perfilCfg(){
  if(!db.config.perfil) db.config.perfil = {};
  return db.config.perfil;
}

function textoEstadoPerfil(){
  const p = perfilCfg();
  if(p.visible === false) return 'Oculto: no aparecés en el buscador';
  const falta = Plataforma.faltaEnPerfil(db);
  if(falta.length) return 'Te falta: ' + falta.map(f=>({nombre: 'tu nombre', materias: 'materias', zona: 'zona', precio: 'precio'})[f]).join(', ');
  if(!firebaseUser) return 'Listo: iniciá sesión con Google para aparecer';
  return 'Aparecés en el buscador';
}

function urlPerfilPublico(){
  return firebaseUser ? new URL('profe.html?p=' + firebaseUser.uid, location.href).href : '';
}

function chipsHtml(lista, elegidos, fn){
  return `<div class="dias-chips">${lista.map(x=>{
    const sel = (elegidos || []).includes(x.id);
    return `<button type="button" class="dia-chip ${sel?'sel':''}" onclick="${fn}('${x.id}')">${sel ? ic('check') : ''}${escapeHtml(x.label || x.nombre)}</button>`;
  }).join('')}</div>`;
}

function abrirPerfilPublico(){
  const p = perfilCfg();
  const cfg = db.config;
  const lugares = Plataforma.LUGARES.map(l=>({id: l.id, nombre: l.corto}));
  const gran = Plataforma.ZONAS.filter(z=>z.gran), resto = Plataforma.ZONAS.filter(z=>!z.gran);
  const regla = Plataforma.REGLAS[p.regla] ? p.regla : Plataforma.REGLA_DEFAULT;
  const url = urlPerfilPublico();
  openSheet(`
    ${volverAjustesHtml()}
    <h3>Tu perfil en Estudiemos</h3>
    <p class="sheet-sub">Así te encuentran los estudiantes en el buscador. Solo se muestra lo que ves acá: nunca tus alumnos, sus datos ni tus clases.</p>

    <div class="note" id="perfilEstado">${ic('info')}<div>${escapeHtml(textoEstadoPerfil())}</div></div>
    ${!firebaseUser ? `<button type="button" class="btn outline" onclick="iniciarSesionGoogle()">${ic('cloud')}Iniciar sesión con Google</button>` : ''}
    ${url ? `<div class="btn-row" style="margin-top:10px;">
      <a class="btn outline" href="${escapeAttr(url)}" target="_blank" rel="noopener">${ic('globe')}Ver mi perfil</a>
      <button type="button" class="btn outline" onclick="copiarTexto('${jsArg(url)}')">${ic('copy')}Copiar link</button>
    </div>` : ''}

    <label class="switch-row" style="margin-top:14px;">
      <span>Aparecer en el buscador<small>Si lo apagás, nadie nuevo te encuentra. Tus alumnos siguen igual.</small></span>
      <input type="checkbox" class="switch" ${p.visible !== false ? 'checked' : ''} onchange="setPerfil('visible', this.checked)">
    </label>

    <div class="section-label">Materias</div>
    <div id="catalogoMaterias" data-toggle="toggleMateriaPerfil">${catalogoMateriasHtml('toggleMateriaPerfil')}</div>
    <div id="otrasMaterias">${otrasMateriasHtml()}</div>

    <div class="section-label">Niveles</div>
    <div id="perfilNiveles">${chipsHtml(Plataforma.NIVELES, p.niveles, 'togglePerfilNivel')}</div>

    <div class="section-label">Dónde das clases</div>
    <div id="perfilLugares">${chipsHtml(lugares, p.lugares, 'togglePerfilLugar')}</div>

    <div class="section-label">Zona</div>
    <p class="hint" style="margin-top:0;">Los departamentos donde das clases (en tu casa o a domicilio). En el mapa se ve la zona, nunca tu dirección.</p>
    <div id="perfilZonas">
      <div class="cat-grupo-t">Gran Mendoza</div>${chipsHtml(gran, p.zonas, 'togglePerfilZona')}
      <div class="cat-grupo-t">Resto de la provincia</div>${chipsHtml(resto, p.zonas, 'togglePerfilZona')}
    </div>
    <label for="f_pf_barrio">Barrio (opcional)</label>
    <input type="text" id="f_pf_barrio" value="${escapeAttr(p.barrio || '')}" placeholder="Ej: Quinta sección" maxlength="60" onchange="setPerfil('barrio', this.value.trim())">

    <div class="section-label">Precio</div>
    <button type="button" class="set-row" style="border-radius:var(--r-md);background:var(--surface-2);" onclick="abrirAjustesPrecios()">
      <div class="row-ic">${ic('dollar')}</div><div class="item-main">Desde ${money(cfg.tarifaHabitual)} la hora<div class="item-sub">Tocá para cambiarlo</div></div>${ic('chevron-right','chev')}
    </button>
    <label for="f_pf_detalle">Algún detalle (opcional)</label>
    <textarea id="f_pf_detalle" maxlength="300" placeholder="Ej: A domicilio cobro el pasaje aparte. Grupos de hasta 3." onchange="setPerfil('detalle', this.value.trim())">${escapeHtml(p.detalle || '')}</textarea>

    <div class="section-label">Clases</div>
    <label for="f_pf_duracion">Cuánto dura una clase</label>
    <select id="f_pf_duracion" onchange="setPerfil('duracion', Number(this.value))">
      ${[[30,'30 minutos'],[45,'45 minutos'],[60,'1 hora'],[90,'1 hora y media'],[120,'2 horas']].map(([v, t])=>`<option value="${v}" ${Number(p.duracion||60)===v?'selected':''}>${t}</option>`).join('')}
    </select>
    <button type="button" class="set-row" style="border-radius:var(--r-md);background:var(--surface-2);margin-top:10px;" onclick="abrirDisponibilidad()">
      <div class="row-ic">${ic('clock')}</div><div class="item-main">Tus horarios disponibles<div class="item-sub">Los estudiantes eligen un horario libre entre estos</div></div>${ic('chevron-right','chev')}
    </button>

    <label style="margin-top:14px;">Si alguien cancela</label>
    <div class="regla-opts" id="perfilRegla">${reglaOpcionesHtml(regla)}</div>

    <div class="section-label">Contacto</div>
    <label class="switch-row">
      <span>Mostrar mi WhatsApp<small>${cfg.telefonoProfe ? 'Si no, te escriben solo por el chat de la app' : 'Primero cargá tu WhatsApp en «Tus datos»'}</small></span>
      <input type="checkbox" class="switch" ${p.mostrarWhatsapp ? 'checked' : ''} ${cfg.telefonoProfe ? '' : 'disabled'} onchange="setPerfil('mostrarWhatsapp', this.checked)">
    </label>

    <div class="sheet-footer"><button type="button" class="btn primary" onclick="guardarPerfilYCerrar()">Listo</button></div>
  `);
}

function reglaOpcionesHtml(sel){
  return Object.values(Plataforma.REGLAS).map(r=>`
    <button type="button" class="regla-opt ${sel===r.id?'sel':''}" onclick="setPerfilRegla('${r.id}')">
      <b>${r.nombre}${r.id===Plataforma.REGLA_DEFAULT ? ' <small>(la más usada)</small>' : ''}</b>
      <span>${escapeHtml(Plataforma.textoRegla(r.id))}</span>
    </button>`).join('');
}

function setPerfil(clave, valor){
  perfilCfg()[clave] = valor;
  saveDB();
  const e = document.getElementById('perfilEstado');
  if(e) e.innerHTML = `${ic('info')}<div>${escapeHtml(textoEstadoPerfil())}</div>`;
}
function guardarPerfilYCerrar(){
  ['f_pf_barrio', 'f_pf_detalle'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) perfilCfg()[id === 'f_pf_barrio' ? 'barrio' : 'detalle'] = el.value.trim();
  });
  saveDB();
  abrirAjustes();
  showToast('Perfil guardado');
}

function toggleEnLista(clave, id){
  const p = perfilCfg();
  const l = Array.isArray(p[clave]) ? p[clave] : (p[clave] = []);
  const i = l.indexOf(id);
  if(i >= 0) l.splice(i, 1); else l.push(id);
  saveDB();
}
function togglePerfilNivel(id){
  toggleEnLista('niveles', id);
  document.getElementById('perfilNiveles').innerHTML = chipsHtml(Plataforma.NIVELES, perfilCfg().niveles, 'togglePerfilNivel');
  setPerfil('niveles', perfilCfg().niveles);
}
function togglePerfilLugar(id){
  toggleEnLista('lugares', id);
  document.getElementById('perfilLugares').innerHTML = chipsHtml(Plataforma.LUGARES.map(l=>({id: l.id, nombre: l.corto})), perfilCfg().lugares, 'togglePerfilLugar');
  setPerfil('lugares', perfilCfg().lugares);
}
function togglePerfilZona(id){
  toggleEnLista('zonas', id);
  const p = perfilCfg();
  document.getElementById('perfilZonas').innerHTML = `
    <div class="cat-grupo-t">Gran Mendoza</div>${chipsHtml(Plataforma.ZONAS.filter(z=>z.gran), p.zonas, 'togglePerfilZona')}
    <div class="cat-grupo-t">Resto de la provincia</div>${chipsHtml(Plataforma.ZONAS.filter(z=>!z.gran), p.zonas, 'togglePerfilZona')}`;
  setPerfil('zonas', p.zonas);
}
function setPerfilRegla(id){
  document.getElementById('perfilRegla').innerHTML = reglaOpcionesHtml(id);
  setPerfil('regla', id);
}
async function toggleMateriaPerfil(catId){
  await toggleMateriaGestion(catId);
  const e = document.getElementById('perfilEstado');
  if(e) e.innerHTML = `${ic('info')}<div>${escapeHtml(textoEstadoPerfil())}</div>`;
}
