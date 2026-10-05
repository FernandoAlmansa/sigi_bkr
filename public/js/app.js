/* ============================================================
   SIGI-BKR | app.js
   Navegación + Dashboard + Historial + Catálogo + Ingreso
   ============================================================ */

// API se define en js/config.js
const METROS_POR_ROLLO = 20;

/* ── Atributos específicos por tipo ── */
const CAMPOS_POR_TIPO = {
  'Tazas/Copas': [
    { key: 'talle', label: 'Talle', opciones: ['85 (S)', '90 (M)', '95 (L)', '100 (XL)'] }
  ],
  'Elástico': [
    { key: 'ancho_mm', label: 'Ancho', opciones: ['5 mm', '7 mm', '14 mm', '25 mm'] }
  ],
  'Herrajes': [
    { key: 'subtipo', label: 'Tipo de herraje', opciones: ['Regulador', 'Argolla', 'Desmontable', 'Perchita', 'Gancho', 'Broche', 'Dadito', 'Unión'] },
    { key: 'detalle', label: 'Detalle', tipo: 'text', opcional: true }
  ],
  'Arcos': [
    { key: 'talle', label: 'Talle', opciones: ['90 (S)', '95 (M)', '100 (L)', '110 (XL)', '120 (XXL)'] }
  ],
  'Dijes': [
    { key: 'prenda', label: 'Prenda', opciones: ['Corpiño', 'Bombacha'] },
    { key: 'color',  label: 'Color', tipo: 'text', opcional: true }
  ],
  'Etiquetas': [
    { key: 'talle', label: 'Talle', tipo: 'text' }
  ],
  'Empaque': [
    { key: 'subtipo', label: 'Tipo de empaque', opciones: ['Sobre e-commerce', 'Bolsa playera', 'Estuche', 'Neceser', 'Caja', 'Loop', 'Cartón'] }
  ],
};

function renderCamposAtributos(tipoNombre, containerId, valores = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const campos = CAMPOS_POR_TIPO[tipoNombre] || [];
  if (!campos.length) { container.innerHTML = ''; return; }

  container.innerHTML = '<div class="form-row">' +
    campos.map(c => {
      const val      = valores[c.key] || '';
      const labelSfx = c.opcional ? ' <span class="optional">(opcional)</span>' : '';
      if (c.opciones) {
        return `
          <div class="form-group">
            <label class="form-label">${c.label}${labelSfx}</label>
            <select class="form-control form-select atributo-campo" data-key="${c.key}" ${!c.opcional ? 'required' : ''}>
              <option value="">— Seleccionar —</option>
              ${c.opciones.map(o => `<option value="${o}"${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
            </select>
          </div>`;
      }
      return `
        <div class="form-group">
          <label class="form-label">${c.label}${labelSfx}</label>
          <input type="text" class="form-control atributo-campo" data-key="${c.key}" value="${esc(val)}" placeholder="${c.label}..." ${!c.opcional ? 'required' : ''} />
        </div>`;
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

function esTela(insumo) {
  return !!insumo?.tipo_nombre?.toLowerCase().includes('tela');
}

/* Devuelve el stock de un insumo listo para mostrar.
   Para tela siempre trabaja en metros y agrega la conversión a rollos. */
function stockDisplay(insumo, campo = 'actual') {
  const valor = campo === 'minimo' ? parseFloat(insumo.stock_minimo) : parseFloat(insumo.stock_actual);
  if (esTela(insumo)) {
    const rollos = valor / METROS_POR_ROLLO;
    return `${num(valor)} m (${num(rollos)} ${rollos === 1 ? "rollo" : "rollos"})`;
  }
  return `${num(valor)} ${esc(insumo.unidad_medida)}`;
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
  if (pageId === 'historial') { /* manual via botón */ }
  if (pageId === 'egreso') refrescarAutocompletar();
  if (pageId === 'ingreso') poblarSelectIngreso();
  if (pageId === 'catalogo') cargarTipos();
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
  if (tiposCache.length === 0) {
    try {
      const res  = await fetch(`${API}/insumos/tipos`);
      tiposCache = await res.json();
    } catch { return; }
  }
  const sel = document.getElementById('dashboard-tipo');
  if (sel) {
    sel.innerHTML = '<option value="">— Todos los insumos —</option>' +
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

function renderTablaInsumos(insumos, emptyMsg = 'No hay insumos para este tipo.') {
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
        <td><div class="td-with-img">${thumb}<span>${esc(i.nombre)}${formatAtributos(i.atributos) ? `<br><small class="attr-sub">${esc(formatAtributos(i.atributos))}</small>` : ''}</span></div></td>
        <td>${esc(i.tipo_nombre || '—')}</td>
        <td class="stock-value ${critico ? 'stock-critico' : 'stock-normal'}">
          ${esTela(i) ? stockDisplay(i) : num(i.stock_actual)}
        </td>
        <td class="stock-value">${esTela(i) ? stockDisplay(i, 'minimo') : num(i.stock_minimo)}</td>
        <td>${esTela(i) ? 'metros' : esc(i.unidad_medida)}</td>
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
document.getElementById('btn-cargar-historial')?.addEventListener('click', cargarHistorial);

async function cargarHistorial() {
  const tipo  = document.getElementById('filtro-tipo').value;
  const tbody = document.getElementById('tbody-historial');
  tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Cargando...</td></tr>';

  try {
    const url   = `${API}/movimientos?limit=100${tipo ? `&tipo=${tipo}` : ''}`;
    const res   = await fetch(url);
    const datos = await res.json();

    if (datos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay movimientos registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = datos.map(m => `
      <tr>
        <td>${formatFecha(m.fecha)}</td>
        <td>${esc(m.insumo_nombre)}</td>
        <td><span class="badge badge-${m.tipo_movimiento.toLowerCase()}">${m.tipo_movimiento}</span></td>
        <td class="stock-value">${num(m.cantidad)} ${esc(m.unidad_medida)}</td>
        <td class="stock-value">${num(m.stock_resultante)} ${esc(m.unidad_medida)}</td>
        <td>${esc(m.usuario || '—')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Error al cargar historial.</td></tr>`;
  }
}

/* ── INGRESO ── */
function actualizarUiBadgeIngreso() {
  const id = parseInt(document.getElementById('select-ingreso-insumo')?.value);
  const insumo = ingresoCache.find(i => i.id === id);
  const badge = document.getElementById('ingreso-badge-unidad');
  const nota  = document.getElementById('ingreso-tela-nota');

  if (esTela(insumo)) {
    if (badge) badge.textContent = 'rollos';
    nota?.classList.remove('hidden');
  } else {
    if (badge) badge.textContent = insumo?.unidad_medida || 'unid.';
    nota?.classList.add('hidden');
  }
}

async function poblarSelectIngreso() {
  if (tiposCache.length === 0) {
    const res  = await fetch(`${API}/insumos/tipos`);
    tiposCache = await res.json();
  }

  const selTipo = document.getElementById('ingreso-tipo');
  selTipo.innerHTML = '<option value="">— Seleccionar tipo —</option>' +
    tiposCache.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');

  const selInsumo = document.getElementById('select-ingreso-insumo');
  selInsumo.innerHTML = '<option value="">— Primero seleccioná un tipo —</option>';
  selInsumo.disabled = true;
  ingresoCache = [];
  actualizarUiBadgeIngreso();
}

// Listener del select de tipo en ingreso
document.getElementById('ingreso-tipo')?.addEventListener('change', async () => {
  const tipoId    = parseInt(document.getElementById('ingreso-tipo').value);
  const selInsumo = document.getElementById('select-ingreso-insumo');

  if (!tipoId) {
    selInsumo.innerHTML = '<option value="">— Primero seleccioná un tipo —</option>';
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
    selInsumo.innerHTML = '<option value="">— Seleccionar insumo —</option>' +
      ingresoCache.map(i => {
        const stockStr = esTela(i)
          ? `${num(i.stock_actual / METROS_POR_ROLLO)} rollos`
          : `${num(i.stock_actual)} ${esc(i.unidad_medida)}`;
        return `<option value="${i.id}">${esc(i.nombre)} (${stockStr})</option>`;
      }).join('');
    selInsumo.disabled = false;
  } catch {
    selInsumo.innerHTML = '<option value="">Error al cargar</option>';
    ingresoCache = [];
  }
  actualizarUiBadgeIngreso();
});

// Listener del select de insumo en ingreso (definido una sola vez)
document.getElementById('select-ingreso-insumo')?.addEventListener('change', actualizarUiBadgeIngreso);

document.getElementById('form-ingreso')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id_insumo   = document.getElementById('select-ingreso-insumo').value;
  const cantidadRaw = parseFloat(document.getElementById('ingreso-cantidad').value);
  const obs         = document.getElementById('ingreso-obs').value;
  const div         = document.getElementById('resultado-ingreso');

  if (!id_insumo || !cantidadRaw) {
    mostrarResultado(div, 'error', 'Completá todos los campos requeridos.');
    return;
  }

  const insumo  = ingresoCache.find(i => i.id === parseInt(id_insumo));
  const tela    = esTela(insumo);
  const cantidad = tela ? cantidadRaw * METROS_POR_ROLLO : cantidadRaw;

  try {
    const res  = await fetch(`${API}/movimientos/ingreso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id_insumo, cantidad, observacion: obs, usuario: 'Admin' })
    });
    const data = await res.json();

    if (res.ok) {
      const extra = tela
        ? ` (${cantidadRaw} ${cantidadRaw === 1 ? 'rollo' : 'rollos'} = ${num(cantidad)} m)`
        : '';
      mostrarResultado(div, 'ok',
        `✓ Ingreso registrado. Nuevo stock de ${data.insumo}: ${num(data.nuevo_stock)} ${data.unidad}${extra}`
      );
      e.target.reset();
      ingresoCache = [];
      document.getElementById('select-ingreso-insumo').innerHTML = '<option value="">— Primero seleccioná un tipo —</option>';
      document.getElementById('select-ingreso-insumo').disabled = true;
      actualizarUiBadgeIngreso();
    } else {
      mostrarResultado(div, 'error', data.error || 'Error al registrar ingreso.');
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

async function abrirModalEditar(id) {
  const insumo = insumosCache.find(i => i.id === id);
  if (!insumo) return;

  // Cargar tipos si no están en cache
  if (tiposCache.length === 0) {
    const res  = await fetch(`${API}/insumos/tipos`);
    tiposCache = await res.json();
  }

  const sel = document.getElementById('edit-tipo');
  sel.innerHTML = '<option value="">— Seleccionar —</option>' +
    tiposCache.map(t =>
      `<option value="${t.id}" ${t.id === insumo.id_tipo ? 'selected' : ''}>${esc(t.nombre)}</option>`
    ).join('');

  document.getElementById('edit-id').value      = insumo.id;
  document.getElementById('edit-nombre').value  = insumo.nombre;
  document.getElementById('edit-unidad').value  = insumo.unidad_medida;

  // Si es tela, mostrar en rollos (el DB guarda metros)
  const esTelInsumo = esTela(insumo);
  document.getElementById('edit-stock').value  = esTelInsumo
    ? insumo.stock_actual / METROS_POR_ROLLO
    : insumo.stock_actual;
  document.getElementById('edit-minimo').value = esTelInsumo
    ? insumo.stock_minimo / METROS_POR_ROLLO
    : insumo.stock_minimo;

  const unidadHint = esTelInsumo ? 'rollos' : (insumo.unidad_medida || '');
  document.querySelector('label[for="edit-stock"]').textContent  = `Stock actual${unidadHint ? ` (${unidadHint})` : ''}`;
  document.querySelector('label[for="edit-minimo"]').textContent = `Stock mínimo${unidadHint ? ` (${unidadHint})` : ''}`;

  document.getElementById('edit-imagen').value  = '';

  const preview = document.getElementById('edit-imagen-preview');
  if (insumo.imagen_url && preview) {
    preview.src = insumo.imagen_url;
    preview.classList.remove('hidden');
  } else if (preview) {
    preview.classList.add('hidden');
  }

  renderCamposAtributos(insumo.tipo_nombre || '', 'edit-atributos-container', insumo.atributos || {});

  document.getElementById('resultado-editar')?.classList.add('hidden');
  document.getElementById('modal-editar').classList.remove('hidden');
  document.getElementById('edit-nombre').focus();
}

function cerrarModal() {
  document.getElementById('modal-editar').classList.add('hidden');
}

document.getElementById('edit-tipo')?.addEventListener('change', () => {
  const id   = parseInt(document.getElementById('edit-tipo').value);
  const tipo = tiposCache.find(t => t.id === id);
  renderCamposAtributos(tipo?.nombre || '', 'edit-atributos-container');
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

document.getElementById('form-editar-insumo')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id  = document.getElementById('edit-id').value;
  const div = document.getElementById('resultado-editar');

  const originalInsumo = insumosCache.find(i => i.id === parseInt(id));
  const esTelEdit      = esTela(originalInsumo);
  const stockVal       = parseFloat(document.getElementById('edit-stock').value);
  const minimoVal      = parseFloat(document.getElementById('edit-minimo').value);

  const body = {
    nombre:        document.getElementById('edit-nombre').value.trim(),
    id_tipo:       parseInt(document.getElementById('edit-tipo').value),
    unidad_medida: document.getElementById('edit-unidad').value,
    stock_actual:  esTelEdit ? stockVal  * METROS_POR_ROLLO : stockVal,
    stock_minimo:  esTelEdit ? minimoVal * METROS_POR_ROLLO : minimoVal,
    atributos:     recolectarAtributos('edit-atributos-container'),
  };

  if (!body.nombre || !body.id_tipo || !body.unidad_medida) {
    mostrarResultado(div, 'error', 'Completá todos los campos requeridos.');
    return;
  }

  try {
    const res  = await fetch(`${API}/insumos/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok) {
      const fileInput = document.getElementById('edit-imagen');
      if (fileInput?.files[0]) {
        const fd = new FormData();
        fd.append('imagen', fileInput.files[0]);
        try { await fetch(`${API}/insumos/${id}/imagen`, { method: 'POST', body: fd }); } catch {}
      }
      mostrarResultado(div, 'ok', `✓ "${data.nombre}" actualizado.`);
      insumosCache = [];
      await cargarDashboard(currentDashboardTipo);
      setTimeout(cerrarModal, 1200);
    } else {
      mostrarResultado(div, 'error', data.error || 'Error al actualizar.');
    }
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión.');
  }
});

/* ── CATÁLOGO: NUEVO INSUMO ── */
async function cargarTipos() {
  try {
    const res  = await fetch(`${API}/insumos/tipos`);
    tiposCache = await res.json();
    const sel  = document.getElementById('cat-tipo');
    sel.innerHTML = '<option value="">— Seleccionar —</option>' +
      tiposCache.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
  } catch (err) {
    console.error('Error cargando tipos:', err);
  }
}

function esTipoTela(tipoId) {
  const tipo = tiposCache.find(t => t.id === tipoId);
  return !!tipo?.nombre?.toLowerCase().includes('tela');
}

document.getElementById('cat-tipo')?.addEventListener('change', () => {
  const id     = parseInt(document.getElementById('cat-tipo').value);
  const tipo   = tiposCache.find(t => t.id === id);
  const nota   = document.getElementById('cat-stock-tela-nota');
  if (nota) nota.classList.toggle('hidden', !esTipoTela(id));
  renderCamposAtributos(tipo?.nombre || '', 'cat-atributos-container');
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

  const catTipoId  = parseInt(document.getElementById('cat-tipo').value);
  const esTelaCat  = esTipoTela(catTipoId);
  const stockRaw   = parseFloat(document.getElementById('cat-stock').value) || 0;
  const minimoRaw  = parseFloat(document.getElementById('cat-minimo').value) || 0;

  const body = {
    nombre:        document.getElementById('cat-nombre').value.trim(),
    id_tipo:       catTipoId,
    unidad_medida: document.getElementById('cat-unidad').value,
    stock_actual:  esTelaCat ? stockRaw  * METROS_POR_ROLLO : stockRaw,
    stock_minimo:  esTelaCat ? minimoRaw * METROS_POR_ROLLO : minimoRaw,
    atributos:     recolectarAtributos('cat-atributos-container'),
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
      // Subir imagen si se seleccionó una
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
      insumosCache = [];
    } else {
      mostrarResultado(div, 'error', data.error || 'Error al crear insumo.');
    }
  } catch {
    mostrarResultado(div, 'error', 'Error de conexión con el servidor.');
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