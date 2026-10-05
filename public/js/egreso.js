/* ============================================================
   SIGI-BKR | egreso.js
   Flujo CORE: Registro de Egreso en máx. 3 interacciones
   RD01: validación stock insuficiente
   RD02: alerta visual + respuesta del servidor si fue crítico
   ============================================================ */

const inputTexto  = document.getElementById('input-insumo-texto');
const inputId     = document.getElementById('input-insumo-id');
const listaAC     = document.getElementById('autocomplete-lista');
const insumoInfo  = document.getElementById('insumo-info');
const infoStock   = document.getElementById('info-stock');
const infoMinimo  = document.getElementById('info-minimo');
const infoUnidad  = document.getElementById('info-unidad');
const infoEstado  = document.getElementById('info-estado');
const inputCant   = document.getElementById('input-cantidad');
const badgeUnidad = document.getElementById('badge-unidad');
const advertencia = document.getElementById('advertencia-stock');
const btnRegistrar = document.getElementById('btn-registrar');
const formEgreso  = document.getElementById('form-egreso');
const divResultado = document.getElementById('resultado-egreso');

// Paso actual
const step1 = document.getElementById('step-1-indicator');
const step2 = document.getElementById('step-2-indicator');
const step3 = document.getElementById('step-3-indicator');

let insumoSeleccionado = null;
let allInsumos = [];
let modoRollo = false;

/* ── Cargar insumos en memoria (para autocompletado offline) ── */
async function cargarInsumos() {
  try {
    const res = await fetch(`${API}/insumos`);
    allInsumos = await res.json();
    await poblarTiposEgreso();
  } catch (err) {
    console.error('Error cargando insumos para autocompletar:', err);
  }
}

async function poblarTiposEgreso() {
  const sel = document.getElementById('egreso-tipo');
  if (!sel) return;

  // Usar tiposCache de app.js; si está vacío, fetchear
  if (tiposCache.length === 0) {
    try {
      const res  = await fetch(`${API}/insumos/tipos`);
      tiposCache = await res.json();
    } catch { return; }
  }

  const valorActual = sel.value;
  sel.innerHTML = '<option value="">— Todos los tipos —</option>' +
    tiposCache.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
  sel.value = valorActual; // preservar selección si ya había una
}

// Sobreescribir el hook de app.js
window.refrescarAutocompletar = cargarInsumos;

cargarInsumos();

/* ── AUTOCOMPLETADO (filtrado local — sin llamada extra por keystroke) ── */
inputTexto?.addEventListener('input', () => {
  const q = inputTexto.value.toLowerCase().trim();
  limpiarSeleccion();

  if (q.length < 1) {
    ocultarLista();
    return;
  }

  const tipoId = parseInt(document.getElementById('egreso-tipo')?.value) || 0;
  const filtrados = allInsumos.filter(i =>
    (!tipoId || i.id_tipo === tipoId) &&
    (i.nombre.toLowerCase().includes(q) || i.tipo_nombre?.toLowerCase().includes(q))
  ).slice(0, 8);

  if (filtrados.length === 0) {
    ocultarLista();
    return;
  }

  listaAC.innerHTML = filtrados.map(i => {
    const critico = i.estado_critico;
    const thumb   = i.imagen_url
      ? `<img src="${i.imagen_url}" class="ac-thumbnail" alt="" />`
      : '';
    return `
      <li data-id="${i.id}" class="${critico ? 'critico' : ''}">
        ${thumb}
        <span class="autocomplete-nombre">${resaltar(i.nombre, q)}
          <small style="opacity:0.5;font-size:11px"> — ${i.tipo_nombre || ''}${formatAtributos(i.atributos) ? ' · ' + formatAtributos(i.atributos) : ''}</small>
        </span>
        <span class="autocomplete-stock ${critico ? 'critico' : ''}">
          ${esTela(i) ? stockDisplay(i) : `${parseFloat(i.stock_actual).toLocaleString('es-AR', {maximumFractionDigits:2})} ${i.unidad_medida}`}
        </span>
      </li>
    `;
  }).join('');

  listaAC.classList.remove('hidden');
});

// Selección de ítem de la lista — CLICK 1
listaAC?.addEventListener('click', e => {
  const li = e.target.closest('li');
  if (!li) return;

  const id = parseInt(li.dataset.id);
  const insumo = allInsumos.find(i => i.id === id);
  if (!insumo) return;

  seleccionarInsumo(insumo);
});

// Navegación con teclado
inputTexto?.addEventListener('keydown', e => {
  const items = listaAC.querySelectorAll('li');
  let focused = listaAC.querySelector('li.focused');
  const idx   = Array.from(items).indexOf(focused);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focused?.classList.remove('focused');
    const next = items[idx + 1] || items[0];
    next?.classList.add('focused');
    next?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focused?.classList.remove('focused');
    const prev = items[idx - 1] || items[items.length - 1];
    prev?.classList.add('focused');
    prev?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && focused) {
    e.preventDefault();
    focused.click();
  } else if (e.key === 'Escape') {
    ocultarLista();
  }
});

// Cerrar lista al hacer clic fuera
document.addEventListener('click', e => {
  if (!e.target.closest('.autocomplete-wrapper')) ocultarLista();
});

function seleccionarInsumo(insumo) {
  insumoSeleccionado = insumo;
  inputTexto.value   = insumo.nombre;
  inputId.value      = insumo.id;
  ocultarLista();

  // Mostrar info del insumo
  const critico = insumo.estado_critico;
  const metros  = parseFloat(insumo.stock_actual);

  if (esTela(insumo)) {
    const rollos = metros / METROS_POR_ROLLO;
    infoStock.textContent = `${metros.toLocaleString('es-AR', {maximumFractionDigits:2})} m (${rollos.toLocaleString('es-AR', {maximumFractionDigits:2})} rollos)`;
  } else {
    infoStock.textContent = `${metros.toLocaleString('es-AR', {maximumFractionDigits:2})} ${insumo.unidad_medida}`;
  }

  infoMinimo.textContent = `${parseFloat(insumo.stock_minimo).toLocaleString('es-AR', {maximumFractionDigits:2})} ${insumo.unidad_medida}`;

  // Para tela: la unidad la elige el usuario con el toggle, no se muestra fija
  const filaUnidad = infoUnidad?.closest('.info-row');
  if (esTela(insumo)) {
    if (filaUnidad) filaUnidad.classList.add('hidden');
  } else {
    if (filaUnidad) filaUnidad.classList.remove('hidden');
    infoUnidad.textContent = insumo.unidad_medida;
  }
  infoEstado.textContent = critico ? '⚠ Crítico' : '✓ Normal';
  infoEstado.className   = `info-value ${critico ? 'critico' : 'normal'}`;
  infoStock.className    = `info-value ${critico ? 'critico' : ''}`;
  // Características (atributos)
  const attrStr  = formatAtributos(insumo.atributos);
  const attrRow  = document.getElementById('info-atributos-row');
  const attrEl   = document.getElementById('info-atributos');
  if (attrStr && attrRow && attrEl) {
    attrEl.textContent = attrStr;
    attrRow.classList.remove('hidden');
  } else if (attrRow) {
    attrRow.classList.add('hidden');
  }

  // Imagen del insumo
  const imgEl  = document.getElementById('info-imagen');
  const imgRow = document.getElementById('info-imagen-row');
  if (insumo.imagen_url && imgEl && imgRow) {
    imgEl.src = insumo.imagen_url;
    imgRow.classList.remove('hidden');
  } else if (imgRow) {
    imgRow.classList.add('hidden');
  }

  insumoInfo.classList.remove('hidden');

  // Tela: mostrar toggle de modo
  const telaOpciones = document.getElementById('tela-egreso-opciones');
  if (esTela(insumo)) {
    telaOpciones?.classList.remove('hidden');
    setModoMetros();
  } else {
    telaOpciones?.classList.add('hidden');
    modoRollo = false;
    inputCant.disabled = false;
    badgeUnidad.textContent = insumo.unidad_medida;
  }

  setStep(2);
  setTimeout(() => inputCant?.focus(), 50);
}

/* ── TELA: TOGGLE METROS / ROLLO ── */
function setModoMetros() {
  modoRollo = false;
  document.getElementById('btn-modo-metros')?.classList.add('tela-toggle-active');
  document.getElementById('btn-modo-rollo')?.classList.remove('tela-toggle-active');
  inputCant.value    = '';
  inputCant.disabled = false;
  badgeUnidad.textContent = 'metros';
  advertencia.classList.add('hidden');
  btnRegistrar.disabled = true;
  setStep(2);
}

function setModoRollo() {
  modoRollo = true;
  document.getElementById('btn-modo-metros')?.classList.remove('tela-toggle-active');
  document.getElementById('btn-modo-rollo')?.classList.add('tela-toggle-active');
  inputCant.value    = '';
  inputCant.disabled = false;
  badgeUnidad.textContent = 'rollos';
  advertencia.classList.add('hidden');
  btnRegistrar.disabled = true;
  setStep(2);
  setTimeout(() => inputCant?.focus(), 50);
}

document.getElementById('egreso-tipo')?.addEventListener('change', () => {
  if (insumoSeleccionado) {
    limpiarSeleccion();
    inputTexto.value = '';
  }
  ocultarLista();
  inputTexto.focus();
});

document.getElementById('btn-modo-metros')?.addEventListener('click', setModoMetros);
document.getElementById('btn-modo-rollo')?.addEventListener('click', setModoRollo);

/* ── VALIDACIÓN EN TIEMPO REAL (RD01 frontend) ── */
function validarCantidad() {
  const cantidadInput  = parseFloat(inputCant.value);
  const cantidadMetros = modoRollo ? cantidadInput * METROS_POR_ROLLO : cantidadInput;

  if (!insumoSeleccionado || isNaN(cantidadInput) || cantidadInput <= 0) {
    btnRegistrar.disabled = true;
    advertencia.classList.add('hidden');
    setStep(insumoSeleccionado ? 2 : 1);
    return;
  }

  const stockMetros = parseFloat(insumoSeleccionado.stock_actual);
  const stockRollos = stockMetros / METROS_POR_ROLLO;

  if (cantidadMetros > stockMetros) {
    advertencia.classList.remove('hidden');
    advertencia.textContent = modoRollo
      ? `⚠ Stock insuficiente. Hay ${stockRollos.toLocaleString('es-AR', {maximumFractionDigits:2})} rollos disponibles.`
      : `⚠ Stock insuficiente. Hay ${stockMetros.toLocaleString('es-AR', {maximumFractionDigits:2})} metros disponibles.`;
    btnRegistrar.disabled = true;
    setStep(2);
  } else {
    advertencia.classList.add('hidden');
    btnRegistrar.disabled = false;
    setStep(3);
  }
}

inputCant?.addEventListener('input', validarCantidad);

/* ── SUBMIT: PASO 3 — Registrar ── */
formEgreso?.addEventListener('submit', async e => {
  e.preventDefault();

  if (!insumoSeleccionado || !inputId.value) {
    mostrarError('Seleccioná un insumo.');
    return;
  }

  const cantidadInput = parseFloat(inputCant.value);
  if (!cantidadInput || cantidadInput <= 0) {
    mostrarError('Ingresá una cantidad válida.');
    return;
  }

  const cantidad = modoRollo ? cantidadInput * METROS_POR_ROLLO : cantidadInput;
  const obs = document.getElementById('input-obs').value.trim();

  btnRegistrar.disabled    = true;
  btnRegistrar.textContent = 'Registrando...';

  try {
    const res  = await fetch(`${API}/movimientos/egreso`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id_insumo:   parseInt(inputId.value),
        cantidad,
        observacion: obs || null,
        usuario:     'Taller'
      })
    });

    const data = await res.json();

    if (res.ok) {
      mostrarOk(data, modoRollo ? cantidadInput : null);
      resetForm();

      // Refrescar cache de insumos para que el badge del navbar se actualice
      if (window.cargarDashboard) window.cargarDashboard();
      cargarInsumos();
    } else {
      // Error del servidor (incluyendo RD01 si pasó el frontend)
      mostrarError(data.detalle || data.error || 'Error al registrar egreso.');
      btnRegistrar.disabled    = false;
      btnRegistrar.textContent = 'Registrar egreso';
    }

  } catch (err) {
    mostrarError('Error de conexión. Verificá que el servidor esté activo.');
    btnRegistrar.disabled    = false;
    btnRegistrar.textContent = 'Registrar egreso';
  }
});

/* ── HELPERS ── */
function ocultarLista() {
  listaAC?.classList.add('hidden');
  listaAC?.querySelectorAll('.focused').forEach(el => el.classList.remove('focused'));
}

function limpiarSeleccion() {
  insumoSeleccionado = null;
  inputId.value      = '';
  insumoInfo?.classList.add('hidden');
  advertencia?.classList.add('hidden');
  btnRegistrar.disabled = true;
  modoRollo = false;
  inputCant.disabled = false;
  document.getElementById('tela-egreso-opciones')?.classList.add('hidden');
  document.getElementById('info-atributos-row')?.classList.add('hidden');
  infoUnidad?.closest('.info-row')?.classList.remove('hidden');
  setStep(1);
}

function setStep(n) {
  [step1, step2, step3].forEach((s, i) => {
    s?.classList.remove('active', 'done');
    if (i + 1 < n)  s?.classList.add('done');
    if (i + 1 === n) s?.classList.add('active');
  });
}

function resaltar(nombre, q) {
  if (!q) return nombre;
  const idx = nombre.toLowerCase().indexOf(q);
  if (idx === -1) return nombre;
  return (
    nombre.slice(0, idx) +
    `<mark style="background:rgba(212,168,83,0.25);color:inherit;border-radius:2px">${nombre.slice(idx, idx + q.length)}</mark>` +
    nombre.slice(idx + q.length)
  );
}

function mostrarOk(data, rollosUsados = null) {
  divResultado.className = 'resultado ok';
  divResultado.classList.remove('hidden');

  const stockMetros = parseFloat(data.nuevo_stock).toLocaleString('es-AR', {maximumFractionDigits:2});
  const stockRollos = (parseFloat(data.nuevo_stock) / METROS_POR_ROLLO).toLocaleString('es-AR', {maximumFractionDigits:2});
  const stockStr    = rollosUsados !== null
    ? `${stockMetros} m (${stockRollos} rollos)`
    : `${stockMetros} ${data.unidad}`;

  let html = `✓ Egreso registrado. Stock de <strong>${data.insumo}</strong>: ${stockStr}`;

  divResultado.innerHTML = html;

  // Si quedó en estado crítico — alerta visual adicional (RD02)
  if (data.estado_critico) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'resultado critico-alert';
    alertDiv.innerHTML = `⚠ Stock crítico detectado en <strong>${data.insumo}</strong>. Se envió notificación a Dirección.`;
    divResultado.insertAdjacentElement('afterend', alertDiv);
    setTimeout(() => alertDiv.remove(), 8000);
  }

  setTimeout(() => divResultado.classList.add('hidden'), 6000);
}

function mostrarError(msg) {
  divResultado.className   = 'resultado error';
  divResultado.textContent = `✕ ${msg}`;
  divResultado.classList.remove('hidden');
  setTimeout(() => divResultado.classList.add('hidden'), 6000);
}

function resetForm() {
  formEgreso.reset();
  limpiarSeleccion();
  inputTexto.value       = '';
  badgeUnidad.textContent = 'unid.';
  btnRegistrar.disabled  = false;
  btnRegistrar.textContent = 'Registrar egreso';
  setStep(1);
}