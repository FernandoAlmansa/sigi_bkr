/* ============================================================
   SIGI-BKR | app.js
   Navegación + Dashboard + Historial + Catálogo + Ingreso + Categorías
   ============================================================ */

// API se define en js/config.js

/* ── Unidades de medida (catálogo controlado: GET /api/unidades) ── */
let unidadesCache = [];

async function asegurarUnidades(forzar = false) {
  if (forzar || unidadesCache.length === 0) {
    const [resU, resP] = await Promise.all([fetch(`${API}/unidades`), fetch(`${API}/unidades/presentaciones`)]);
    if (!resU.ok) throw new Error(`Error ${resU.status} al cargar unidades`);
    unidadesCache = await resU.json();
    const nombres = resP.ok ? await resP.json() : [];
    const dl = document.getElementById('presentaciones-sugeridas');
    if (dl) dl.innerHTML = nombres.map(n => `<option value="${esc(n)}"></option>`).join('');
  }
  llenarSelectsUnidad();
  return unidadesCache;
}

/* Rellena todos los <select class="select-unidad"> conservando el valor elegido. */
function llenarSelectsUnidad() {
  document.querySelectorAll('select.select-unidad').forEach(sel => {
    const valor = sel.value;
    const vacio = sel.dataset.vacio || '— Elegí la unidad —';
    sel.innerHTML = `<option value="">${vacio}</option>` +
      unidadesCache.map(u => `<option value="${esc(u.nombre)}">${esc(u.nombre)}</option>`).join('');
    sel.value = valor;
  });
}

/* ── Categorías (vienen de la base: GET /api/categorias) ── */
async function asegurarTipos(forzar = false) {
  if (forzar || tiposCache.length === 0) {
    const res = await fetch(`${API}/categorias`);
    if (!res.ok) throw new Error(`Error ${res.status} al cargar categorías`);
    tiposCache = await res.json();
  }
  return tiposCache;
}

function categoriaDe(idTipo) {
  return tiposCache.find(t => t.id === Number(idTipo)) || null;
}

function opcionesCategorias(seleccionada = null, vacio = '— Seleccionar —') {
  return `<option value="">${vacio}</option>` +
    tiposCache.map(t => `<option value="${t.id}"${t.id === Number(seleccionada) ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('');
}

/* ── Características: el formulario se arma con los campos que define la categoría ── */
function renderCamposAtributos(idTipo, containerId, valores = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const campos = categoriaDe(idTipo)?.campos || [];
  if (!campos.length) { container.innerHTML = ''; return; }

  container.innerHTML = '<div class="form-row form-row-wrap">' +
    campos.map(c => {
      const val      = valores?.[c.clave] ?? '';
      const labelSfx = c.obligatorio ? '' : ' <span class="optional">(opcional)</span>';
      const req      = c.obligatorio ? 'required' : '';
      let control;
      if (c.tipo === 'opciones') {
        control = `
          <select class="form-control form-select atributo-campo" data-key="${esc(c.clave)}" ${req}>
            <option value="">— Seleccionar —</option>
            ${c.opciones.map(o => `<option value="${esc(o)}"${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
          </select>`;
      } else {
        const tipo = c.tipo === 'numero' ? 'number" step="any' : 'text';
        control = `<input type="${tipo}" class="form-control atributo-campo" data-key="${esc(c.clave)}" value="${esc(val)}" placeholder="${esc(c.etiqueta)}..." ${req} />`;
      }
      return `<div class="form-group"><label class="form-label">${esc(c.etiqueta)}${labelSfx}</label>${control}</div>`;
    }).join('') + '</div>';
}

function recolectarAtributos(containerId) {
  const atributos = {};
  document.getElementById(containerId)
    ?.querySelectorAll('.atributo-campo')
    .forEach(el => { if (el.value.trim()) atributos[el.dataset.key] = el.value.trim(); });
  return atributos;
}

function formatAtributos(atributos) {
  if (!atributos || typeof atributos !== 'object') return '';
  return Object.values(atributos).filter(Boolean).join(' · ');
}

/* Características para mostrar junto al nombre, sin repetir lo que el nombre
   ya dice ("Argolla grande níquel" no necesita abajo "Argolla"). */
function atributosVisibles(insumo) {
  const nombre = String(insumo?.nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const atr = insumo?.atributos;
  if (!atr || typeof atr !== 'object') return '';
  return Object.values(atr).filter(Boolean)
    .filter(v => !nombre.includes(String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()))
    .join(' · ');
}

/* ── Unidades y presentaciones ──
   El stock se guarda siempre en la unidad base del insumo (unidad_medida).
   Las presentaciones son otras formas de contarlo: rollo = 20 metros,
   paquete = 100 unidades. Las define cada insumo (y la categoría sugiere). */
function plural(nombre, n) {
  const s = String(nombre || '');
  if (Math.abs(Number(n)) === 1 || /s$/i.test(s)) return s;
  if (/z$/i.test(s)) return s.slice(0, -1) + 'ces';
  return /[aeiouáéíóú]$/i.test(s) ? s + 's' : s + 'es';
}

/** La presentación más grande que entra al menos una vez (si no, la más chica). */
function presentacionParaMostrar(insumo, valor) {
  const ps = (insumo?.presentaciones || []).filter(p => Number(p.factor) > 1)
    .sort((a, b) => a.factor - b.factor);
  if (!ps.length) return null;
  const entran = ps.filter(p => Math.abs(valor) >= p.factor);
  return entran.length ? entran[entran.length - 1] : ps[0];
}

/* Stock listo para mostrar: "400 metros (20 rollos)". */
function stockDisplay(insumo, campo = 'actual') {
  const valor = Number(campo === 'minimo' ? insumo.stock_minimo : insumo.stock_actual);
  return cantidadDisplay(insumo, valor);
}

/** Versión texto plano (para textContent / <option>). */
function cantidadTexto(insumo, valor) {
  const base = `${num(valor)} ${insumo?.unidad_medida || ''}`;
  const p = presentacionParaMostrar(insumo, valor);
  if (!p) return base;
  const enPres = valor / p.factor;
  return `${base} (${num(enPres)} ${plural(p.nombre, enPres)})`;
}

function cantidadDisplay(insumo, valor) {
  return esc(cantidadTexto(insumo, valor));
}

function factorDe(insumo, nombrePresentacion) {
  if (!nombrePresentacion) return 1;
  const p = (insumo?.presentaciones || []).find(x => x.nombre === nombrePresentacion);
  return p ? Number(p.factor) : 1;
}

function describirPresentaciones(insumo) {
  return (insumo?.presentaciones || [])
    .map(p => `1 ${esc(p.nombre)} = ${num(p.factor)} ${esc(insumo.unidad_medida)}`).join(' · ');
}

/* ── Editor de presentaciones (alta, edición y categorías) ── */
function renderEditorPresentaciones(containerId, lista = [], unidad = '') {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.dataset.unidad = unidad || '';
  c.innerHTML = `<div class="editor-lista"></div>
    <button type="button" class="btn-link editor-agregar">+ Agregar presentación</button>`;
  (lista || []).forEach(p => agregarFilaPresentacion(c, p));
  c.querySelector('.editor-agregar').addEventListener('click', () => {
    agregarFilaPresentacion(c, {});
    c.querySelector('.editor-fila:last-child .pres-nombre')?.focus();
  });
}

function agregarFilaPresentacion(c, p = {}) {
  const fila = document.createElement('div');
  fila.className = 'editor-fila';
  fila.innerHTML = `
    <span class="editor-texto">1</span>
    <input type="text" class="form-control pres-nombre" list="presentaciones-sugeridas" placeholder="rollo, paquete, caja..." maxlength="40" value="${esc(p.nombre || '')}" />
    <span class="editor-texto">=</span>
    <input type="number" class="form-control pres-factor" min="0.001" step="any" placeholder="20" value="${p.factor ?? ''}" />
    <span class="editor-texto pres-unidad">${esc(c.dataset.unidad || 'unid. base')}</span>
    <button type="button" class="editor-quitar" title="Quitar">✕</button>`;
  fila.querySelector('.editor-quitar').addEventListener('click', () => fila.remove());
  c.querySelector('.editor-lista').appendChild(fila);
}

function actualizarUnidadEditor(containerId, unidad) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.dataset.unidad = unidad || '';
  c.querySelectorAll('.pres-unidad').forEach(s => { s.textContent = unidad || 'unid. base'; });
}

function leerPresentaciones(containerId) {
  return [...(document.getElementById(containerId)?.querySelectorAll('.editor-fila') || [])]
    .map(f => ({
      nombre: f.querySelector('.pres-nombre').value.trim(),
      factor: f.querySelector('.pres-factor').value === '' ? null : Number(f.querySelector('.pres-factor').value),
    }))
    .filter(p => p.nombre || p.factor !== null);
}

/** Texto de ayuda bajo un campo de stock: "= 20 rollos". */
function hintConversion(elId, valor, unidad, presentaciones) {
  const el = document.getElementById(elId);
  if (!el) return;
  const v = Number(valor);
  const p = presentacionParaMostrar({ presentaciones }, v);
  el.textContent = (p && v > 0 && unidad) ? `= ${num(v / p.factor)} ${plural(p.nombre, v / p.factor)}` : '';
}

/** Mensaje de error del backend, con el detalle de validación si lo hay. */
function mensajeError(data, porDefecto) {
  const base = data?.error || porDefecto;
  return data?.errores?.length ? `${base} ${data.errores.join(' ')}` : base;
}

/* ── Estado global ── */
let insumosCache        = [];
let tiposCache          = [];
let ingresoCache        = [];
let currentDashboardTipo = null;
let filtroEstado = 'todos';
let filtroOrden  = 'default';

/* ── NAVEGACIÓN ── */
const pages    = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-link');

function showPage(pageId) {
  pages.forEach(p => p.classList.remove('active'));
  navLinks.forEach(l => l.classList.remove('active'));

  const page = document.getElementById(`page-${pageId}`);
  const link = document.querySelector(`[data-page="${pageId}"]`);
  if (page) page.classList.add('active');
  if (link) link.classList.add('active');

  // Acciones al cambiar de página
  if (pageId === 'dashboard') inicializarDashboard();
  if (pageId === 'historial') cargarHistorial({ inicial: true });
  if (pageId === 'egreso') refrescarAutocompletar();
  if (pageId === 'ingreso') poblarSelectIngreso();
  if (pageId === 'catalogo') cargarTipos();
  if (pageId === 'categorias') cargarPaginaCategorias();
}

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    showPage(link.dataset.page);
  });
});

/* ── DASHBOARD ── */
async function inicializarDashboard() {
  // Cargar tipos para el select
  try { await asegurarTipos(); } catch { return; }
  const sel = document.getElementById('dashboard-tipo');
  if (sel) {
    sel.innerHTML = '<option value="">— Todas las categorías —</option>' +
      tiposCache.map(t => `<option value="${t.id}"${t.id === currentDashboardTipo ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('');
  }

  // Cargar todos los insumos si no están en cache
  if (insumosCache.length === 0) {
    try {
      const res = await fetch(`${API}/insumos`);
      if (!res.ok) {
        renderTablaInsumos([], `Error del servidor (${res.status}). Verificá que la base de datos esté activa.`);
        actualizarStats([]);
        return;
      }
      insumosCache = await res.json();
      if (!Array.isArray(insumosCache)) insumosCache = [];
    } catch (err) {
      console.error('Error cargando insumos:', err);
      renderTablaInsumos([], 'No se pudo conectar al servidor.');
      actualizarStats([]);
      return;
    }
  }

  actualizarStats(insumosCache);
  aplicarFiltros();
  renderPanelAlertas(insumosCache);
}

async function cargarDashboard(tipoId) {
  currentDashboardTipo = tipoId ? parseInt(tipoId) : null;
  // Recargar desde servidor para tener datos frescos
  try {
    const url = tipoId ? `${API}/insumos?id_tipo=${tipoId}` : `${API}/insumos`;
    const res = await fetch(url);
    if (!res.ok) {
      renderTablaInsumos([], `Error del servidor (${res.status}). Verificá que la base de datos esté activa.`);
      actualizarStats([]);
      return;
    }
    insumosCache = await res.json();
    if (!Array.isArray(insumosCache)) insumosCache = [];
  } catch (err) {
    console.error('Error cargando dashboard:', err);
    renderTablaInsumos([], 'No se pudo conectar al servidor. Verificá que esté corriendo.');
    actualizarStats([]);
    return;
  }
  actualizarStats(insumosCache);
  aplicarFiltros();
  renderPanelAlertas(insumosCache);
}

function actualizarStats(insumos) {
  const criticos = insumos.filter(i => i.estado_critico);
  document.getElementById('stat-total').textContent    = insumos.length;
  document.getElementById('stat-criticos').textContent = criticos.length;
  document.getElementById('stat-normales').textContent = insumos.length - criticos.length;

  // Badge en navbar
  const badge = document.getElementById('alert-badge');
  const count = document.getElementById('alert-count');
  if (criticos.length > 0) {
    badge.classList.remove('hidden');
    count.textContent = criticos.length;
  } else {
    badge.classList.add('hidden');
  }
}

function renderPanelAlertas(insumos) {
  const criticos = insumos.filter(i => i.estado_critico);
  const panel    = document.getElementById('panel-alertas');
  const lista    = document.getElementById('lista-criticos');

  if (criticos.length === 0) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  lista.innerHTML = criticos.map(i => `
    <div class="alert-item">
      <div class="alert-item-name">${esc(i.nombre)}</div>
      <div class="alert-item-stock">
        ${stockDisplay(i)} / mín ${stockDisplay(i, 'minimo')}
      </div>
    </div>
  `).join('');
}

function renderTablaInsumos(insumos, emptyMsg = 'No hay insumos en esta categoría.') {
  const tbody = document.getElementById('tbody-insumos');

  if (insumos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = insumos.map(i => {
    const critico = i.estado_critico;
    const thumb   = i.imagen_url
      ? `<img src="${esc(i.imagen_url)}" class="table-thumbnail" alt="" loading="lazy" />`
      : '';
    return `
      <tr>
        <td><div class="td-with-img">${thumb}<span>${esc(i.nombre)}${atributosVisibles(i) ? `<br><small class="attr-sub">${esc(atributosVisibles(i))}</small>` : ''}</span></div></td>
        <td>${esc(i.tipo_nombre || '—')}</td>
        <td class="stock-value ${critico ? 'stock-critico' : 'stock-normal'}">${stockDisplay(i)}</td>
        <td class="stock-value">${stockDisplay(i, 'minimo')}</td>
        <td>${esc(i.unidad_medida)}</td>
        <td>
          <span class="badge ${critico ? 'badge-critico' : 'badge-normal'}">
            ${critico ? 'Crítico' : 'Normal'}
          </span>
        </td>
        <td>
          <button class="btn-editar" data-id="${i.id}" title="Editar insumo">✎</button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ── FILTROS Y ORDEN DEL DASHBOARD ── */
function aplicarFiltros() {
  const q = document.getElementById('buscador-tabla')?.value.toLowerCase() ?? '';
  let lista = [...insumosCache];

  if (q) {
    lista = lista.filter(i =>
      i.nombre.toLowerCase().includes(q) || i.tipo_nombre?.toLowerCase().includes(q)
    );
  }

  if (filtroEstado === 'critico') lista = lista.filter(i => i.estado_critico);
  if (filtroEstado === 'normal')  lista = lista.filter(i => !i.estado_critico);

  if (filtroOrden === 'menor-stock') {
    lista.sort((a, b) => parseFloat(a.stock_actual) - parseFloat(b.stock_actual));
  } else if (filtroOrden === 'mayor-stock') {
    lista.sort((a, b) => parseFloat(b.stock_actual) - parseFloat(a.stock_actual));
  } else if (filtroOrden === 'nombre') {
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  renderTablaInsumos(lista);
}

document.getElementById('dashboard-tipo')?.addEventListener('change', e => {
  currentDashboardTipo = e.target.value ? parseInt(e.target.value) : null;
  cargarDashboard(e.target.value);
});

document.getElementById('buscador-tabla')?.addEventListener('input', aplicarFiltros);

document.getElementById('select-orden')?.addEventListener('change', e => {
  filtroOrden = e.target.value;
  aplicarFiltros();
});

document.querySelectorAll('.filtro-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    filtroEstado = btn.dataset.estado;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('filtro-btn-active'));
    btn.classList.add('filtro-btn-active');
    aplicarFiltros();
  });
});

/* ── HISTORIAL ── */
document.getElementById('btn-cargar-historial')?.addEventListener('click', () => cargarHistorial());
document.getElementById('btn-historial-mas')?.addEventListener('click', () => cargarHistorial({ mas: true }));

/*
 * Historial paginado y acotado por fechas: al entrar trae sólo el mes en
 * curso (una consulta chica, sobre el índice por fecha). Para ver más,
 * eligen otras fechas y tocan "Buscar", o "Cargar más" pide la página siguiente.
 */
const HISTORIAL_PAGINA = 50;
let historialOffset = 0;

function fechaInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filaHistorial(m) {
  return `
      <tr>
        <td>${formatFecha(m.fecha)}</td>
        <td>${esc(m.insumo_nombre)}${m.observacion ? `<br><small class="attr-sub">${esc(m.observacion)}</small>` : ''}</td>
        <td><span class="badge badge-${m.tipo_movimiento.toLowerCase()}">${m.tipo_movimiento}</span></td>
        <td class="stock-value">${m.tipo_movimiento === 'AJUSTE'
          ? `contado: ${m.presentacion ? `${num(m.cantidad_presentacion)} ${esc(plural(m.presentacion, m.cantidad_presentacion))}` : `${num(m.stock_resultante)} ${esc(m.unidad_medida)}`} <small class="attr-sub">(dif. ${num(m.cantidad)} ${esc(m.unidad_medida)})</small>`
          : m.presentacion
            ? `${num(m.cantidad_presentacion)} ${esc(plural(m.presentacion, m.cantidad_presentacion))} <small class="attr-sub">(${num(m.cantidad)} ${esc(m.unidad_medida)})</small>`
            : `${num(m.cantidad)} ${esc(m.unidad_medida)}`}</td>
        <td class="stock-value">${num(m.stock_resultante)} ${esc(m.unidad_medida)}</td>
        <td>${esc(m.usuario || '—')}</td>
      </tr>`;
}

async function cargarHistorial({ inicial = false, mas = false } = {}) {
  const tbody = document.getElementById('tbody-historial');
  const desdeEl = document.getElementById('filtro-desde');
  const hastaEl = document.getElementById('filtro-hasta');
  const info = document.getElementById('historial-info');
  const btnMas = document.getElementById('btn-historial-mas');

  // Primera vez: del 1° del mes a hoy.
  if (inicial && !desdeEl.value) {
    const hoy = new Date();
    desdeEl.value = fechaInput(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    hastaEl.value = fechaInput(hoy);
  }

  const params = new URLSearchParams({ limit: HISTORIAL_PAGINA });
  const tipo = document.getElementById('filtro-tipo').value;
  if (tipo) params.set('tipo', tipo);
  // Las fechas se mandan como instantes de la hora local (Argentina), de 00:00 a 23:59.
  if (desdeEl.value) params.set('desde', new Date(`${desdeEl.value}T00:00:00`).toISOString());
  if (hastaEl.value) params.set('hasta', new Date(`${hastaEl.value}T23:59:59.999`).toISOString());

  historialOffset = mas ? historialOffset + HISTORIAL_PAGINA : 0;
  params.set('offset', historialOffset);

  if (!mas) tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Cargando...</td></tr>';
  btnMas.disabled = true;

  try {
    const res   = await fetch(`${API}/movimientos?${params}`);
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.error);

    if (!mas && datos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay movimientos en ese período. Probá ampliando las fechas.</td></tr>';
      info.textContent = '';
      btnMas.classList.add('hidden');
      return;
    }

    const html = datos.map(filaHistorial).join('');
    if (mas) tbody.insertAdjacentHTML('beforeend', html); else tbody.innerHTML = html;

    const mostrados = tbody.querySelectorAll('tr').length;
    const hayMas = datos.length === HISTORIAL_PAGINA;
    info.textContent = `${mostrados} movimiento${mostrados === 1 ? '' : 's'}${hayMas ? ' (hay más)' : ''}`;
    btnMas.classList.toggle('hidden', !hayMas);
  } catch (err) {
    if (!mas) tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Error al cargar historial.</td></tr>';
    info.textContent = 'Error al cargar historial.';
  } finally {
    btnMas.disabled = false;
  }
}

/* ── INGRESO ── */
function insumoIngreso() {
  const id = parseInt(document.getElementById('select-ingreso-insumo')?.value);
  return ingresoCache.find(i => i.id === id) || null;
}

/* Muestra el selector de presentación si el insumo tiene alguna, y la conversión. */
function actualizarUiBadgeIngreso() {
  const insumo = insumoIngreso();
  const badge  = document.getElementById('ingreso-badge-unidad');
  const sel    = document.getElementById('ingreso-presentacion');
  const tienePres = !!insumo?.presentaciones?.length;

  if (sel) {
    sel.innerHTML = insumo
      ? `<option value="">${esc(insumo.unidad_medida)}</option>` +
        insumo.presentaciones.map(p => `<option value="${esc(p.nombre)}">${esc(p.nombre)} (${num(p.factor)} ${esc(insumo.unidad_medida)})</option>`).join('')
      : '';
    sel.classList.toggle('hidden', !tienePres);
    // Por defecto, la presentación más grande (se suele comprar por rollo/paquete).
    if (tienePres) sel.value = insumo.presentaciones[insumo.presentaciones.length - 1].nombre;
  }
  if (badge) {
    badge.textContent = insumo?.unidad_medida || 'unid.';
    badge.classList.toggle('hidden', tienePres);
  }
  actualizarConversionIngreso();
}

function actualizarConversionIngreso() {
  const insumo = insumoIngreso();
  const nota   = document.getElementById('ingreso-conversion');
  if (!nota) return;
  const pres     = document.getElementById('ingreso-presentacion')?.value || '';
  const cantidad = parseFloat(document.getElementById('ingreso-cantidad')?.value);
  if (!insumo || !pres || !(cantidad > 0)) { nota.classList.add('hidden'); return; }
  nota.textContent = `= ${num(cantidad * factorDe(insumo, pres))} ${insumo.unidad_medida}`;
  nota.classList.remove('hidden');
}

async function poblarSelectIngreso() {
  try { await asegurarTipos(); } catch { return; }

  document.getElementById('ingreso-tipo').innerHTML = opcionesCategorias(null, '— Seleccionar categoría —');

  const selInsumo = document.getElementById('select-ingreso-insumo');
  selInsumo.innerHTML = '<option value="">— Primero seleccioná una categoría —</option>';
  selInsumo.disabled = true;
  ingresoCache = [];
  actualizarUiBadgeIngreso();
}

document.getElementById('ingreso-tipo')?.addEventListener('change', async () => {
  const tipoId    = parseInt(document.getElementById('ingreso-tipo').value);
  const selInsumo = document.getElementById('select-ingreso-insumo');

  if (!tipoId) {
    selInsumo.innerHTML = '<option value="">— Primero seleccioná una categoría —</option>';
    selInsumo.disabled  = true;
    ingresoCache = [];
    actualizarUiBadgeIngreso();
    return;
  }

  selInsumo.innerHTML = '<option value="">Cargando...</option>';
  selInsumo.disabled  = true;

  try {
    const res    = await fetch(`${API}/insumos?id_tipo=${tipoId}`);
    ingresoCache = await res.json();
    selInsumo.innerHTML = ingresoCache.length
      ? '<option value="">— Seleccionar insumo —</option>' +
        ingresoCache.map(i => `<option value="${i.id}">${esc(i.nombre)}${atributosVisibles(i) ? ` · ${esc(atributosVisibles(i))}` : ''} (${esc(cantidadTexto(i, i.stock_actual))})</option>`).join('')
      : '<option value="">No hay insumos en esta categoría</option>';
    selInsumo.disabled = !ingresoCache.length;
  } catch {
    selInsumo.innerHTML = '<option value="">Error al cargar</option>';
    ingresoCache = [];
  }
  actualizarUiBadgeIngreso();
});

document.getElementById('select-ingreso-insumo')?.addEventListener('change', actualizarUiBadgeIngreso);
document.getElementById('ingreso-presentacion')?.addEventListener('change', actualizarConversionIngreso);
document.getElementById('ingreso-cantidad')?.addEventListener('input', actualizarConversionIngreso);

document.getElementById('form-ingreso')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id_insumo    = document.getElementById('select-ingreso-insumo').value;
  const cantidad     = parseFloat(document.getElementById('ingreso-cantidad').value);
  const presentacion = document.getElementById('ingreso-presentacion')?.value || null;
  const obs          = document.getElementById('ingreso-obs').value;
  const div          = document.getElementById('resultado-ingreso');

  if (!id_insumo || !(cantidad > 0)) {
    mostrarResultado(div, 'error', 'Completá todos los campos requeridos.');
    return;
  }

  try {
    const res  = await fetch(`${API}/movimientos/ingreso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id_insumo, cantidad, presentacion, observacion: obs, usuario: 'Admin' })
    });
    const data = await res.json();

    if (res.ok) {
      const insumo = { unidad_medida: data.unidad, presentaciones: data.presentaciones };
      const cargado = data.presentacion
        ? `${num(data.cantidad_presentacion)} ${plural(data.presentacion, data.cantidad_presentacion)} = ${num(data.cantidad)} ${data.unidad}`
        : `${num(data.cantidad)} ${data.unidad}`;
      mostrarResultado(div, 'ok',
        `✓ Ingreso de ${cargado}. Nuevo stock de ${data.insumo}: ${cantidadTexto(insumo, data.nuevo_stock)}`
      );
      e.target.reset();
      ingresoCache = [];
      document.getElementById('select-ingreso-insumo').innerHTML = '<option value="">— Primero seleccioná una categoría —</option>';
      document.getElementById('select-ingreso-insumo').disabled = true;
      actualizarUiBadgeIngreso();
      insumosCache = [];
    } else {
      mostrarResultado(div, 'error', mensajeError(data, 'Error al registrar ingreso.'));
    }
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión con el servidor.');
  }
});

/* ── EDITAR INSUMO (modal desde dashboard) ── */

// Delegación: click en cualquier .btn-editar de la tabla
document.getElementById('tbody-insumos')?.addEventListener('click', e => {
  const btn = e.target.closest('.btn-editar');
  if (!btn) return;
  abrirModalEditar(parseInt(btn.dataset.id));
});

/* Etiquetas y ayudas de los campos de stock según la unidad base elegida. */
function actualizarFormStock(prefijo) {
  const unidad = document.getElementById(`${prefijo}-unidad`).value.trim();
  const pres   = leerPresentaciones(`${prefijo}-presentaciones`).filter(p => p.nombre && p.factor > 0);
  const sufijo = unidad ? ` (en ${unidad})` : '';
  document.getElementById(`${prefijo}-label-stock`).textContent  = (prefijo === 'cat' ? 'Stock inicial' : 'Stock actual') + sufijo;
  document.getElementById(`${prefijo}-label-minimo`).textContent = 'Stock mínimo (alerta)' + sufijo;
  hintConversion(`${prefijo}-stock-hint`,  document.getElementById(`${prefijo}-stock`).value,  unidad, pres);
  hintConversion(`${prefijo}-minimo-hint`, document.getElementById(`${prefijo}-minimo`).value, unidad, pres);
}

function enlazarFormStock(prefijo) {
  const refrescar = () => {
    actualizarUnidadEditor(`${prefijo}-presentaciones`, document.getElementById(`${prefijo}-unidad`).value.trim());
    actualizarFormStock(prefijo);
  };
  document.getElementById(`${prefijo}-unidad`)?.addEventListener('change', refrescar);
  ['stock', 'minimo'].forEach(c => document.getElementById(`${prefijo}-${c}`)?.addEventListener('input', () => actualizarFormStock(prefijo)));
  document.getElementById(`${prefijo}-presentaciones`)?.addEventListener('input', () => actualizarFormStock(prefijo));
  document.getElementById(`${prefijo}-presentaciones`)?.addEventListener('click', () => setTimeout(() => actualizarFormStock(prefijo), 0));
}
enlazarFormStock('edit');
enlazarFormStock('cat');

/* Aviso si el nombre repite la categoría: "Tela Lycra" en la categoría Tela. */
function sinTildes(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function avisoNombreCategoria(nombreId, tipoId, hintId) {
  const hint = document.getElementById(hintId);
  if (!hint) return;
  const cat    = categoriaDe(document.getElementById(tipoId)?.value);
  const nombre = sinTildes(document.getElementById(nombreId)?.value);
  const base   = sinTildes(cat?.nombre).replace(/(es|s)$/, '');
  const repite = cat && base.length >= 3 && nombre.split(/\s+/)[0].replace(/(es|s)$/, '') === base;
  hint.textContent = repite ? `No hace falta poner "${cat.nombre}" en el nombre: ya está en la categoría.` : '';
}
['cat', 'edit'].forEach(pref => {
  const refrescar = () => avisoNombreCategoria(`${pref}-nombre`, `${pref}-tipo`, `${pref}-nombre-hint`);
  document.getElementById(`${pref}-nombre`)?.addEventListener('input', refrescar);
  document.getElementById(`${pref}-tipo`)?.addEventListener('change', refrescar);
});

let insumoEditando = null;

async function abrirModalEditar(id) {
  const insumo = insumosCache.find(i => i.id === id);
  if (!insumo) return;
  try { await Promise.all([asegurarTipos(), asegurarUnidades()]); } catch { return; }
  insumoEditando = insumo;
  prepararAjuste(insumo);

  document.getElementById('edit-tipo').innerHTML = opcionesCategorias(insumo.id_tipo);
  document.getElementById('edit-id').value     = insumo.id;
  document.getElementById('edit-nombre').value = insumo.nombre;
  document.getElementById('edit-unidad').value = insumo.unidad_medida;
  document.getElementById('edit-stock').value  = insumo.stock_actual;
  document.getElementById('edit-minimo').value = insumo.stock_minimo;
  renderEditorPresentaciones('edit-presentaciones', insumo.presentaciones, insumo.unidad_medida);
  actualizarFormStock('edit');

  document.getElementById('edit-imagen').value = '';
  const preview = document.getElementById('edit-imagen-preview');
  if (insumo.imagen_url && preview) {
    preview.src = insumo.imagen_url;
    preview.classList.remove('hidden');
  } else if (preview) {
    preview.classList.add('hidden');
  }

  renderCamposAtributos(insumo.id_tipo, 'edit-atributos-container', insumo.atributos || {});
  avisoNombreCategoria('edit-nombre', 'edit-tipo', 'edit-nombre-hint');

  document.getElementById('resultado-editar')?.classList.add('hidden');
  document.getElementById('modal-editar').classList.remove('hidden');
  document.getElementById('edit-nombre').focus();
}

function cerrarModal() {
  document.getElementById('modal-editar').classList.add('hidden');
}

document.getElementById('edit-tipo')?.addEventListener('change', () => {
  const actuales = recolectarAtributos('edit-atributos-container');
  renderCamposAtributos(document.getElementById('edit-tipo').value, 'edit-atributos-container', actuales);
});

document.getElementById('modal-cerrar')?.addEventListener('click', cerrarModal);
document.getElementById('btn-cancelar-editar')?.addEventListener('click', cerrarModal);
document.getElementById('modal-editar')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modal-editar')) cerrarModal();
});

// Preview imagen en modal editar
document.getElementById('edit-imagen')?.addEventListener('change', e => {
  const file    = e.target.files[0];
  const preview = document.getElementById('edit-imagen-preview');
  if (!file || !preview) return;
  const reader  = new FileReader();
  reader.onload = ev => { preview.src = ev.target.result; preview.classList.remove('hidden'); };
  reader.readAsDataURL(file);
});

/* Compara presentaciones sin importar el orden ni mayúsculas. */
function firmaPresentaciones(lista) {
  return JSON.stringify((lista || [])
    .map(p => [String(p.nombre || '').trim().toLowerCase(), Number(p.factor)])
    .sort((x, y) => x[0].localeCompare(y[0])));
}

/*
 * El modal manda SOLO los campos que el usuario cambió, y nunca el stock
 * actual: si mientras alguien edita el nombre otra persona registra un
 * egreso, guardar no puede volver el stock al valor viejo. El stock se
 * corrige con un ajuste (abajo), que queda en el Historial.
 */
document.getElementById('form-editar-insumo')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id  = document.getElementById('edit-id').value;
  const div = document.getElementById('resultado-editar');
  const orig = insumoEditando;
  if (!orig) return;

  const actual = {
    nombre:         document.getElementById('edit-nombre').value.trim(),
    id_tipo:        parseInt(document.getElementById('edit-tipo').value),
    unidad_medida:  document.getElementById('edit-unidad').value.trim(),
    stock_minimo:   parseFloat(document.getElementById('edit-minimo').value),
    atributos:      recolectarAtributos('edit-atributos-container'),
    presentaciones: leerPresentaciones('edit-presentaciones'),
  };

  if (!actual.nombre || !actual.id_tipo || !actual.unidad_medida) {
    mostrarResultado(div, 'error', 'Completá todos los campos requeridos.');
    return;
  }

  const body = {};
  if (actual.nombre !== orig.nombre) body.nombre = actual.nombre;
  if (actual.id_tipo !== orig.id_tipo) body.id_tipo = actual.id_tipo;
  if (actual.unidad_medida !== orig.unidad_medida) body.unidad_medida = actual.unidad_medida;
  if (actual.stock_minimo !== Number(orig.stock_minimo)) body.stock_minimo = actual.stock_minimo;
  if (body.id_tipo || JSON.stringify(actual.atributos) !== JSON.stringify(orig.atributos || {})) body.atributos = actual.atributos;
  if (firmaPresentaciones(actual.presentaciones) !== firmaPresentaciones(orig.presentaciones)) body.presentaciones = actual.presentaciones;

  if (body.unidad_medida && Number(orig.stock_actual) > 0 &&
      !confirm(`Cambiar la unidad de "${orig.unidad_medida}" a "${body.unidad_medida}" no convierte el stock: ${num(orig.stock_actual)} ${orig.unidad_medida} pasarían a ser ${num(orig.stock_actual)} ${body.unidad_medida}. ¿Seguro?`)) {
    return;
  }

  const fileInput = document.getElementById('edit-imagen');
  if (!Object.keys(body).length && !fileInput?.files[0]) {
    mostrarResultado(div, 'error', 'No hay cambios para guardar.');
    return;
  }

  try {
    let data = orig;
    if (Object.keys(body).length) {
      const res = await fetch(`${API}/insumos/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      });
      data = await res.json();
      if (!res.ok) {
        mostrarResultado(div, 'error', mensajeError(data, 'Error al actualizar.'));
        return;
      }
    }

    if (fileInput?.files[0]) {
      const fd = new FormData();
      fd.append('imagen', fileInput.files[0]);
      try { await fetch(`${API}/insumos/${id}/imagen`, { method: 'POST', body: fd }); } catch {}
    }
    mostrarResultado(div, 'ok', `✓ "${data.nombre}" actualizado.`);
    insumosCache = [];
    await cargarDashboard(currentDashboardTipo);
    setTimeout(cerrarModal, 1200);
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión.');
  }
});

/* ── AJUSTE DE STOCK (recuento físico) ── */
function prepararAjuste(insumo) {
  document.getElementById('ajuste-campos').classList.add('hidden');
  document.getElementById('ajuste-cantidad').value = '';
  document.getElementById('ajuste-obs').value = '';
  document.getElementById('ajuste-hint').textContent = '';
  document.getElementById('resultado-ajuste').classList.add('hidden');
  const sel = document.getElementById('ajuste-presentacion');
  sel.innerHTML = `<option value="">${esc(insumo.unidad_medida)}</option>` +
    (insumo.presentaciones || []).map(p => `<option value="${esc(p.nombre)}">${esc(plural(p.nombre, 2))} (${num(p.factor)} ${esc(insumo.unidad_medida)})</option>`).join('');
  sel.classList.toggle('hidden', !(insumo.presentaciones || []).length);
}

function actualizarHintAjuste() {
  const ins = insumoEditando;
  const hint = document.getElementById('ajuste-hint');
  const v = parseFloat(document.getElementById('ajuste-cantidad').value);
  if (!ins || isNaN(v) || v < 0) { hint.textContent = ''; return; }
  const contado = v * factorDe(ins, document.getElementById('ajuste-presentacion').value);
  const dif = contado - Number(ins.stock_actual);
  hint.textContent = dif === 0
    ? 'Coincide con el sistema: no hay nada que ajustar.'
    : `El sistema tiene ${cantidadTexto(ins, Number(ins.stock_actual))}. Quedaría en ${cantidadTexto(ins, contado)} (${dif > 0 ? '+' : ''}${num(dif)} ${ins.unidad_medida}).`;
}

document.getElementById('btn-abrir-ajuste')?.addEventListener('click', () => {
  document.getElementById('ajuste-campos').classList.toggle('hidden');
  document.getElementById('ajuste-cantidad').focus();
});
document.getElementById('ajuste-cantidad')?.addEventListener('input', actualizarHintAjuste);
document.getElementById('ajuste-presentacion')?.addEventListener('change', actualizarHintAjuste);

document.getElementById('btn-registrar-ajuste')?.addEventListener('click', async () => {
  const ins = insumoEditando;
  const div = document.getElementById('resultado-ajuste');
  const cantidad = parseFloat(document.getElementById('ajuste-cantidad').value);
  if (!ins || isNaN(cantidad) || cantidad < 0) {
    mostrarResultado(div, 'error', 'Ingresá el stock contado.');
    return;
  }
  try {
    const res = await fetch(`${API}/movimientos/ajuste`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id_insumo:    ins.id,
        cantidad,
        presentacion: document.getElementById('ajuste-presentacion').value || null,
        observacion:  document.getElementById('ajuste-obs').value.trim() || null,
        usuario:      'Admin',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      mostrarResultado(div, 'error', mensajeError(data, 'No se pudo registrar el ajuste.'));
      return;
    }
    mostrarResultado(div, 'ok', `✓ Ajuste registrado. Stock de ${data.insumo}: ${cantidadTexto(ins, data.nuevo_stock)}.`);
    ins.stock_actual = data.nuevo_stock;
    document.getElementById('edit-stock').value = data.nuevo_stock;
    actualizarFormStock('edit');
    document.getElementById('ajuste-cantidad').value = '';
    document.getElementById('ajuste-hint').textContent = '';
    await cargarDashboard(currentDashboardTipo);
    insumoEditando = insumosCache.find(i => i.id === ins.id) || ins;
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión con el servidor.');
  }
});

/* ── CATÁLOGO: NUEVO INSUMO ── */
async function cargarTipos() {
  try {
    await Promise.all([asegurarTipos(true), asegurarUnidades(true)]);
    const sel   = document.getElementById('cat-tipo');
    const valor = sel.value;
    sel.innerHTML = opcionesCategorias(valor);
    if (!document.querySelector('#cat-presentaciones .editor-lista')) {
      renderEditorPresentaciones('cat-presentaciones', [], document.getElementById('cat-unidad').value.trim());
    }
    actualizarFormStock('cat');
  } catch (err) {
    console.error('Error cargando categorías:', err);
  }
}

/* Al elegir la categoría se sugieren su unidad base y sus presentaciones. */
document.getElementById('cat-tipo')?.addEventListener('change', () => {
  const cat = categoriaDe(document.getElementById('cat-tipo').value);
  renderCamposAtributos(cat?.id, 'cat-atributos-container');
  const unidadInput = document.getElementById('cat-unidad');
  if (cat?.unidad_base) unidadInput.value = cat.unidad_base;
  renderEditorPresentaciones('cat-presentaciones', cat?.presentaciones || [], unidadInput.value.trim());
  actualizarFormStock('cat');
});

// Preview al seleccionar imagen en catálogo
document.getElementById('cat-imagen')?.addEventListener('change', e => {
  const file    = e.target.files[0];
  const preview = document.getElementById('cat-imagen-preview');
  if (!file || !preview) return;
  const reader = new FileReader();
  reader.onload = ev => {
    preview.src = ev.target.result;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

document.getElementById('form-nuevo-insumo')?.addEventListener('submit', async e => {
  e.preventDefault();
  const div = document.getElementById('resultado-catalogo');

  const body = {
    nombre:         document.getElementById('cat-nombre').value.trim(),
    id_tipo:        parseInt(document.getElementById('cat-tipo').value),
    unidad_medida:  document.getElementById('cat-unidad').value.trim(),
    stock_actual:   parseFloat(document.getElementById('cat-stock').value) || 0,
    stock_minimo:   parseFloat(document.getElementById('cat-minimo').value) || 0,
    atributos:      recolectarAtributos('cat-atributos-container'),
    presentaciones: leerPresentaciones('cat-presentaciones'),
  };

  if (!body.nombre || !body.id_tipo || !body.unidad_medida) {
    mostrarResultado(div, 'error', 'Completá todos los campos requeridos.');
    return;
  }

  try {
    const res  = await fetch(`${API}/insumos`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok) {
      const fileInput = document.getElementById('cat-imagen');
      if (fileInput?.files[0]) {
        const fd = new FormData();
        fd.append('imagen', fileInput.files[0]);
        try {
          await fetch(`${API}/insumos/${data.id}/imagen`, { method: 'POST', body: fd });
        } catch { /* no bloquear el flujo si falla la imagen */ }
      }

      mostrarResultado(div, 'ok', `✓ Insumo "${data.nombre}" creado correctamente.`);
      e.target.reset();
      document.getElementById('cat-imagen-preview')?.classList.add('hidden');
      document.getElementById('cat-atributos-container').innerHTML = '';
      renderEditorPresentaciones('cat-presentaciones', [], '');
      actualizarFormStock('cat');
      insumosCache = [];
    } else {
      mostrarResultado(div, 'error', mensajeError(data, 'Error al crear insumo.'));
    }
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión con el servidor.');
  }
});

/* ── CATEGORÍAS: alta, edición y baja ── */
const TIPOS_CAMPO_LABEL = { texto: 'Texto libre', opciones: 'Lista de opciones', numero: 'Número' };

async function cargarPaginaCategorias() {
  const tbody = document.getElementById('tbody-categorias');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Cargando...</td></tr>';
  try {
    await Promise.all([asegurarTipos(true), asegurarUnidades(true)]);
  } catch {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No se pudo conectar al servidor.</td></tr>';
    return;
  }
  renderTablaCategorias();
  renderUnidades();
  if (!document.querySelector('#catg-presentaciones .editor-lista')) limpiarFormCategoria();
}

function renderTablaCategorias() {
  const tbody = document.getElementById('tbody-categorias');
  if (!tiposCache.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Todavía no hay categorías.</td></tr>';
    return;
  }
  tbody.innerHTML = tiposCache.map(t => `
    <tr>
      <td><strong>${esc(t.nombre)}</strong></td>
      <td>${esc(t.unidad_base || '—')}</td>
      <td>${t.presentaciones.length ? t.presentaciones.map(p => `1 ${esc(p.nombre)} = ${num(p.factor)}`).join('<br>') : '—'}</td>
      <td>${t.campos.length
        ? t.campos.map(c => `${esc(c.etiqueta)}${c.obligatorio ? ' *' : ''} <small class="attr-sub">${TIPOS_CAMPO_LABEL[c.tipo] || c.tipo}</small>`).join('<br>')
        : '—'}</td>
      <td class="stock-value">${t.cantidad_insumos ?? 0}</td>
      <td class="td-acciones">
        <button class="btn-editar btn-editar-categoria" data-id="${t.id}" title="Editar categoría">✎</button>
        <button class="btn-editar btn-borrar-categoria" data-id="${t.id}" title="Eliminar categoría">🗑</button>
      </td>
    </tr>`).join('');
}

function agregarFilaCampo(c = {}) {
  const fila = document.createElement('div');
  fila.className = 'editor-fila editor-fila-campo';
  if (c.clave) fila.dataset.clave = c.clave; // se conserva al renombrar, para no perder los datos cargados
  fila.innerHTML = `
    <input type="text" class="form-control campo-etiqueta" placeholder="Ej: Talle, Color, Ancho" maxlength="40" value="${esc(c.etiqueta || '')}" />
    <select class="form-control form-select campo-tipo">
      ${Object.entries(TIPOS_CAMPO_LABEL).map(([v, l]) => `<option value="${v}"${(c.tipo || 'texto') === v ? ' selected' : ''}>${l}</option>`).join('')}
    </select>
    <input type="text" class="form-control campo-opciones" placeholder="Opciones separadas por coma: S, M, L" value="${esc((c.opciones || []).join(', '))}" />
    <label class="campo-oblig"><input type="checkbox" class="campo-obligatorio"${c.obligatorio ? ' checked' : ''} /> Obligatorio</label>
    <button type="button" class="editor-quitar" title="Quitar">✕</button>`;
  const tipo = fila.querySelector('.campo-tipo');
  const opciones = fila.querySelector('.campo-opciones');
  const sync = () => opciones.classList.toggle('invisible', tipo.value !== 'opciones');
  tipo.addEventListener('change', sync);
  sync();
  fila.querySelector('.editor-quitar').addEventListener('click', () => fila.remove());
  document.querySelector('#catg-campos .editor-lista').appendChild(fila);
  return fila;
}

function leerCampos() {
  return [...document.querySelectorAll('#catg-campos .editor-fila-campo')]
    .map(f => ({
      clave:       f.dataset.clave || undefined,
      etiqueta:    f.querySelector('.campo-etiqueta').value.trim(),
      tipo:        f.querySelector('.campo-tipo').value,
      opciones:    f.querySelector('.campo-opciones').value,
      obligatorio: f.querySelector('.campo-obligatorio').checked,
    }))
    .filter(c => c.etiqueta || (c.tipo === 'opciones' && c.opciones.trim()));
}

function cargarFormCategoria(cat = null) {
  document.getElementById('catg-id').value     = cat?.id || '';
  document.getElementById('catg-nombre').value = cat?.nombre || '';
  document.getElementById('catg-unidad').value = cat?.unidad_base || '';
  document.getElementById('catg-form-titulo').textContent = cat ? `Editar categoría: ${cat.nombre}` : 'Nueva categoría';
  document.getElementById('btn-catg-cancelar').classList.toggle('hidden', !cat);
  renderEditorPresentaciones('catg-presentaciones', cat?.presentaciones || [], cat?.unidad_base || '');
  document.querySelector('#catg-campos .editor-lista').innerHTML = '';
  (cat?.campos || []).forEach(agregarFilaCampo);
  document.getElementById('resultado-categoria')?.classList.add('hidden');
}

function limpiarFormCategoria() {
  cargarFormCategoria(null);
}

document.getElementById('catg-agregar-campo')?.addEventListener('click', () => {
  agregarFilaCampo({}).querySelector('.campo-etiqueta').focus();
});
document.getElementById('catg-unidad')?.addEventListener('change', e => {
  actualizarUnidadEditor('catg-presentaciones', e.target.value.trim());
});
document.getElementById('btn-catg-cancelar')?.addEventListener('click', limpiarFormCategoria);

document.getElementById('tbody-categorias')?.addEventListener('click', async e => {
  const editar = e.target.closest('.btn-editar-categoria');
  const borrar = e.target.closest('.btn-borrar-categoria');
  if (editar) {
    cargarFormCategoria(categoriaDe(editar.dataset.id));
    document.getElementById('card-categoria').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('catg-nombre').focus();
  }
  if (borrar) {
    const cat = categoriaDe(borrar.dataset.id);
    if (!cat || !confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return;
    const res  = await fetch(`${API}/categorias/${cat.id}`, { method: 'DELETE' });
    const data = await res.json();
    const div  = document.getElementById('resultado-categoria');
    if (res.ok) {
      mostrarResultado(div, 'ok', `✓ ${data.mensaje}`);
      await asegurarTipos(true);
      renderTablaCategorias();
    } else {
      mostrarResultado(div, 'error', mensajeError(data, 'No se pudo eliminar la categoría.'));
    }
  }
});

document.getElementById('form-categoria')?.addEventListener('submit', async e => {
  e.preventDefault();
  const div = document.getElementById('resultado-categoria');
  const id  = document.getElementById('catg-id').value;
  const body = {
    nombre:         document.getElementById('catg-nombre').value.trim(),
    unidad_base:    document.getElementById('catg-unidad').value.trim(),
    presentaciones: leerPresentaciones('catg-presentaciones'),
    campos:         leerCampos(),
  };
  if (!body.nombre) {
    mostrarResultado(div, 'error', 'El nombre de la categoría es obligatorio.');
    return;
  }

  try {
    const res  = await fetch(id ? `${API}/categorias/${id}` : `${API}/categorias`, {
      method:  id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      mostrarResultado(div, 'ok', `✓ Categoría "${data.nombre}" ${id ? 'actualizada' : 'creada'}.`);
      await asegurarTipos(true);
      renderTablaCategorias();
      limpiarFormCategoria();
      document.getElementById('resultado-categoria').classList.remove('hidden');
    } else {
      mostrarResultado(div, 'error', mensajeError(data, 'No se pudo guardar la categoría.'));
    }
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión con el servidor.');
  }
});

/* ── UNIDADES DE MEDIDA: alta, renombre/unificación y baja ── */
function renderUnidades() {
  const cont = document.getElementById('lista-unidades');
  if (!cont) return;
  cont.innerHTML = unidadesCache.map(u => `
    <div class="unidad-item">
      <span class="unidad-nombre">${esc(u.nombre)}</span>
      <span class="attr-sub">${u.insumos} insumo${u.insumos === 1 ? '' : 's'}</span>
      <button type="button" class="btn-editar btn-renombrar-unidad" data-id="${u.id}" title="Renombrar o unificar">✎</button>
      <button type="button" class="btn-editar btn-borrar-unidad" data-id="${u.id}" title="Eliminar"${u.insumos ? ' disabled' : ''}>🗑</button>
    </div>`).join('');
}

/* Llama a la API; si la unidad se parece a otra o ya existe, pregunta y reintenta. */
async function guardarUnidad(url, metodo, nombre) {
  const div = document.getElementById('resultado-unidad');
  let body = { nombre };
  for (let intento = 0; intento < 3; intento++) {
    const res  = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) return data;

    if (data.codigo === 'UNIDAD_PARECIDA' &&
        confirm(`${data.error}\n\nAceptar: crearla igual (es otra unidad).\nCancelar: no crearla.`)) {
      body = { ...body, forzar: true };
      continue;
    }
    if (data.codigo === 'UNIDAD_EXISTENTE' && metodo === 'PATCH' && data.destino &&
        confirm(`${data.error}\n\n¿Unificarlas?`)) {
      body = { ...body, fusionar: true };
      continue;
    }
    mostrarResultado(div, 'error', mensajeError(data, 'No se pudo guardar la unidad.'));
    return null;
  }
  return null;
}

async function refrescarUnidadesYCategorias() {
  await Promise.all([asegurarUnidades(true), asegurarTipos(true)]);
  renderUnidades();
  renderTablaCategorias();
}

document.getElementById('form-unidad')?.addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('unidad-nueva');
  const nombre = input.value.trim();
  if (!nombre) return;
  const data = await guardarUnidad(`${API}/unidades`, 'POST', nombre);
  if (data) {
    input.value = '';
    mostrarResultado(document.getElementById('resultado-unidad'), 'ok', `✓ Unidad "${data.nombre}" agregada.`);
    await refrescarUnidadesYCategorias();
  }
});

document.getElementById('lista-unidades')?.addEventListener('click', async e => {
  const div = document.getElementById('resultado-unidad');
  const renombrar = e.target.closest('.btn-renombrar-unidad');
  const borrar    = e.target.closest('.btn-borrar-unidad');
  const unidad = unidadesCache.find(u => u.id === Number((renombrar || borrar)?.dataset.id));
  if (!unidad) return;

  if (renombrar) {
    const nombre = prompt(`Nuevo nombre para "${unidad.nombre}"\n(si escribís el de otra unidad existente, se unifican):`, unidad.nombre);
    if (!nombre || nombre.trim().toLowerCase() === unidad.nombre) return;
    const data = await guardarUnidad(`${API}/unidades/${unidad.id}`, 'PATCH', nombre);
    if (data) {
      mostrarResultado(div, 'ok', `✓ Listo: ahora es "${data.nombre}".`);
      insumosCache = [];
      await refrescarUnidadesYCategorias();
    }
  }
  if (borrar) {
    if (!confirm(`¿Eliminar la unidad "${unidad.nombre}"?`)) return;
    const res  = await fetch(`${API}/unidades/${unidad.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      mostrarResultado(div, 'ok', `✓ ${data.mensaje}`);
      await refrescarUnidadesYCategorias();
    } else {
      mostrarResultado(div, 'error', mensajeError(data, 'No se pudo eliminar la unidad.'));
    }
  }
});

/* ── HELPERS ── */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
  );
}

function num(val) {
  return parseFloat(val).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function formatFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function mostrarResultado(div, tipo, msg) {
  div.className = `resultado ${tipo}`;
  div.textContent = msg;
  div.classList.remove('hidden');
  setTimeout(() => div.classList.add('hidden'), 6000);
}

// Exponer para egreso.js.
// OJO: no reasignar window.cargarDashboard. En un script clásico la función
// global ES window.cargarDashboard; pisarla con un wrapper que la llama
// generaba una recursión infinita y el filtro por tipo nunca se aplicaba.
window.refrescarDashboard = () => cargarDashboard(currentDashboardTipo);
window.refrescarAutocompletar = () => {}; // se sobreescribe en egreso.js

/* ── INICIO ── */
inicializarDashboard();