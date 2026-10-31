/* ============================================================
   SIGI-BKR | reporte.js
   Reporte de consumo por período (iteración 3 — CU-08, CU-10, CU-11).
   La pantalla sólo pide y dibuja: el cálculo, la clasificación y el orden
   los hace el servidor (FachadaReportes). Usa helpers de app.js:
   esc, num, ocupado, mostrarResultado, fechaInput, asegurarTipos.
   ============================================================ */

let reporteActual = null;   // vista del último reporte generado (para exportar)
let umbralVigente = null;
let reporteIniciado = false;

const CLASE_ESTADO = {
  CRITICA: 'cob-critica',
  EN_OBSERVACION: 'cob-observacion',
  SUFICIENTE: 'cob-suficiente',
  MUESTRA_INSUFICIENTE: 'cob-sin-dato',
  SIN_ROTACION: 'cob-sin-dato',
};

// Orden y texto del resumen ("2 críticas · 1 en observación...").
const RESUMEN_ESTADOS = [
  ['CRITICA', 'crítica', 'críticas'],
  ['EN_OBSERVACION', 'en observación', 'en observación'],
  ['SUFICIENTE', 'suficiente', 'suficientes'],
  ['MUESTRA_INSUFICIENTE', 'muestra insuficiente', 'muestra insuficiente'],
  ['SIN_ROTACION', 'sin rotación', 'sin rotación'],
];

/* 2026-02-28 → 28/02/2026 (las fechas del reporte son días, sin hora) */
function fechaCorta(aaaammdd) {
  const [a, m, d] = aaaammdd.split('-');
  return `${d}/${m}/${a}`;
}

function diasTexto(v) {
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/* ── Al entrar a la sección ── */
async function inicializarReporte() {
  const desde = document.getElementById('reporte-desde');
  const hasta = document.getElementById('reporte-hasta');
  const hoy = new Date();
  hasta.max = fechaInput(hoy);
  desde.max = fechaInput(hoy);

  if (!reporteIniciado) {
    reporteIniciado = true;
    // Por defecto, los últimos 30 días (hoy incluido).
    hasta.value = fechaInput(hoy);
    desde.value = fechaInput(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29));
  }

  cargarUmbrales();
  try {
    const tipos = await asegurarTipos();
    const select = document.getElementById('reporte-tipo');
    const elegido = select.value;
    select.innerHTML = '<option value="">Todos los tipos</option>'
      + tipos.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
    select.value = elegido;
  } catch (_) { /* sin categorías igual se puede generar con "Todos los tipos" */ }
}

/* ── Umbrales (CU-11) ── */
function textoUmbrales(u) {
  return `Crítica: hasta ${u.dias_criticidad} días · Observación: hasta ${u.dias_observacion} días · `
    + `Se proyecta con ${u.egresos_minimos} egresos o más`;
}

async function cargarUmbrales() {
  const texto = document.getElementById('umbrales-texto');
  try {
    const res = await fetch(`${API}/reportes/umbrales`);
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.error);
    umbralVigente = datos;
    texto.textContent = textoUmbrales(datos);
  } catch (_) {
    texto.textContent = 'No se pudieron cargar los umbrales.';
  }
}

function abrirFormUmbrales(abrir) {
  const form = document.getElementById('form-umbrales');
  const btn = document.getElementById('btn-modificar-umbrales');
  form.classList.toggle('hidden', !abrir);
  btn.setAttribute('aria-expanded', String(abrir));
  if (abrir && umbralVigente) {
    document.getElementById('umbral-criticidad').value = umbralVigente.dias_criticidad;
    document.getElementById('umbral-observacion').value = umbralVigente.dias_observacion;
    document.getElementById('umbral-minimo').value = umbralVigente.egresos_minimos;
    document.getElementById('umbral-criticidad').focus();
  }
  if (!abrir) btn.focus();
}

document.getElementById('btn-modificar-umbrales').addEventListener('click', () => {
  abrirFormUmbrales(document.getElementById('form-umbrales').classList.contains('hidden'));
});
document.getElementById('btn-cancelar-umbrales').addEventListener('click', () => abrirFormUmbrales(false));

document.getElementById('form-umbrales').addEventListener('submit', async (e) => {
  e.preventDefault();
  const div = document.getElementById('resultado-umbrales');
  const listo = ocupado(e.submitter || e.target.querySelector('[type="submit"]'));
  try {
    const res = await fetch(`${API}/reportes/umbrales`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dias_criticidad: document.getElementById('umbral-criticidad').value,
        dias_observacion: document.getElementById('umbral-observacion').value,
        egresos_minimos: document.getElementById('umbral-minimo').value,
      }),
    });
    const datos = await res.json();
    if (!res.ok) throw new Error(mensajeError(datos, 'No se pudieron guardar los umbrales.'));
    umbralVigente = datos;
    document.getElementById('umbrales-texto').textContent = textoUmbrales(datos);
    abrirFormUmbrales(false);
    mostrarResultado(div, 'ok', 'Umbrales guardados. Se aplican desde el próximo reporte.');
  } catch (err) {
    mostrarResultado(div, 'error', err.message);
  } finally {
    listo();
  }
});

/* ── Generar (CU-08) ── */
function limpiarErroresPeriodo() {
  ['desde', 'hasta'].forEach(c => {
    document.getElementById(`reporte-${c}-error`).textContent = '';
    document.getElementById(`reporte-${c}`).removeAttribute('aria-invalid');
  });
  document.getElementById('reporte-error').classList.add('hidden');
}

/* Flujo A1: el motivo queda junto a la fecha a corregir y lo ingresado se conserva. */
function mostrarErrorPeriodo(campo, mensaje) {
  const input = document.getElementById(`reporte-${campo}`);
  document.getElementById(`reporte-${campo}-error`).textContent = mensaje;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

document.getElementById('form-reporte').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarErroresPeriodo();
  const params = new URLSearchParams({
    desde: document.getElementById('reporte-desde').value,
    hasta: document.getElementById('reporte-hasta').value,
    orden: document.getElementById('reporte-orden').value,
  });
  const tipo = document.getElementById('reporte-tipo').value;
  if (tipo) params.set('id_tipo', tipo);

  const listo = ocupado(document.getElementById('btn-generar-reporte'), 'Generando...');
  try {
    const res = await fetch(`${API}/reportes/consumo?${params}`);
    const datos = await res.json();
    if (!res.ok) {
      if (datos.campo) return mostrarErrorPeriodo(datos.campo, datos.error);
      throw new Error(mensajeError(datos, 'No se pudo generar el reporte.'));
    }
    reporteActual = datos;
    renderReporte(datos);
  } catch (err) {
    const div = document.getElementById('reporte-error');
    div.textContent = err.message || 'No se pudo generar el reporte.';
    div.classList.remove('hidden');
  } finally {
    listo();
  }
});

function renderReporte(v) {
  const enc = v.encabezado;
  document.getElementById('reporte-vacio').classList.add('hidden');
  document.getElementById('reporte-resultado').classList.remove('hidden');
  document.getElementById('reporte-exportar-info').textContent = '';

  document.getElementById('reporte-periodo').innerHTML =
    `<strong>${fechaCorta(enc.desde)} al ${fechaCorta(enc.hasta)}</strong> · ${enc.cantidad_dias} día${enc.cantidad_dias === 1 ? '' : 's'}`
    + ` · ${esc(enc.tipo || 'Todos los tipos')}<br><small class="attr-sub">${esc(textoUmbrales(enc.umbral))}</small>`;

  document.getElementById('reporte-resumen').innerHTML = RESUMEN_ESTADOS
    .filter(([e]) => v.resumen.por_estado[e] > 0)
    .map(([e, uno, varios]) => {
      const n = v.resumen.por_estado[e];
      return `<li class="resumen-chip ${CLASE_ESTADO[e]}"><strong>${n}</strong> ${n === 1 ? uno : varios}</li>`;
    }).join('');

  document.getElementById('tbody-reporte').innerHTML = v.lineas.map(filaReporte).join('');
  renderGrafico(v.grafico);
}

function filaReporte(l) {
  const u = esc(l.unidad);
  const sinDato = '<span class="sin-dato" title="Sin proyección: ver el estado">—</span>';
  return `
    <tr class="${l.estado === 'CRITICA' ? 'fila-critica' : ''}">
      <td class="c-nombre">${esc(l.nombre)}${l.tipo ? `<br><small class="attr-sub">${esc(l.tipo)}</small>` : ''}</td>
      <td class="c-consumo stock-value" data-label="Consumo">${num(l.consumo_total)} ${u}</td>
      <td class="c-egresos stock-value" data-label="Egresos">${l.cantidad_egresos}</td>
      <td class="c-promedio stock-value" data-label="Promedio diario">${l.promedio_diario === null ? sinDato : `${num(l.promedio_diario)} ${u}`}</td>
      <td class="c-stock stock-value" data-label="Stock actual">${num(l.stock_actual)} ${u}</td>
      <td class="c-cobertura stock-value" data-label="Cobertura">${l.dias_cobertura === null ? sinDato : `${diasTexto(l.dias_cobertura)} días`}</td>
      <td class="c-estado"><span class="badge badge-${CLASE_ESTADO[l.estado]}">${esc(l.estado_texto)}</span></td>
    </tr>`;
}

/* Mismo criterio que el PDF (ConstructorPDF.escalaDelGrafico): el eje llega
   al mayor valor, pero no pasa de 4 veces el umbral de observación. */
function escalaGrafico(valores, observacion) {
  return Math.min(Math.max(...valores, observacion * 1.2), observacion * 4);
}

function renderGrafico(g) {
  const cont = document.getElementById('grafico-cobertura');
  const pie = document.getElementById('grafico-sin-proyeccion');

  pie.innerHTML = g.sin_proyeccion.length
    ? `<strong>Sin proyección (no se grafican):</strong> ${g.sin_proyeccion.map(s => `${esc(s.nombre)} — ${esc(s.estado_texto.toLowerCase())}`).join(' · ')}`
    : '';

  if (!g.serie.length) {
    cont.removeAttribute('role');
    cont.innerHTML = '<p class="grafico-vacio">Ningún insumo tiene proyección en este período.</p>';
    return;
  }

  const { criticidad, observacion } = g.umbrales;
  const escala = escalaGrafico(g.serie.map(s => s.dias), observacion);
  const pct = d => `${(Math.min(d, escala) / escala) * 100}%`;
  const referencias = `
    <span class="grafico-ref ref-critica" style="left:${pct(criticidad)}"></span>
    <span class="grafico-ref ref-observacion" style="left:${pct(observacion)}"></span>`;

  // La tabla de arriba es la versión accesible de los mismos datos; el gráfico se describe en una frase.
  const criticos = g.serie.filter(s => s.estado === 'CRITICA').length;
  cont.setAttribute('role', 'img');
  cont.setAttribute('aria-label', `Gráfico de barras con los días de cobertura de ${g.serie.length} insumos. `
    + `${criticos} por debajo del umbral crítico de ${criticidad} días. Los valores están en la tabla.`);

  cont.innerHTML = g.serie.map(s => `
    <div class="grafico-fila">
      <span class="grafico-nombre">${esc(s.nombre)}</span>
      <div class="grafico-pista">
        ${referencias}
        <span class="grafico-barra ${CLASE_ESTADO[s.estado]}${s.dias > escala ? ' cortada' : ''}" style="width:${pct(s.dias)}"></span>
      </div>
      <span class="grafico-valor" style="--p:${pct(s.dias)}">${diasTexto(s.dias)} días · ${esc(s.estado_texto)}${s.dias > escala ? ' ›' : ''}</span>
    </div>`).join('') + `
    <div class="grafico-fila grafico-eje" aria-hidden="true">
      <span class="grafico-nombre"></span>
      <div class="grafico-pista">
        <span class="grafico-ref-texto ref-critica" style="left:${pct(criticidad)}">crítica ${criticidad} d</span>
        <span class="grafico-ref-texto ref-observacion" style="left:${pct(observacion)}">observación ${observacion} d</span>
      </div>
      <span class="grafico-valor"></span>
    </div>`;
}

/* ── Exportar (CU-10): el archivo se arma en el servidor con el mismo reporte guardado ── */
async function exportarReporte(boton) {
  if (!reporteActual) return;
  const formato = boton.dataset.formato;
  const info = document.getElementById('reporte-exportar-info');
  const listo = ocupado(boton, 'Preparando...');
  try {
    const res = await fetch(`${API}/reportes/consumo/${reporteActual.id_reporte}/exportar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formato }),
    });
    if (!res.ok) {
      const datos = await res.json().catch(() => ({}));
      throw new Error(datos.error || 'No se pudo exportar.');
    }
    const blob = await res.blob();
    const enc = reporteActual.encabezado;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-consumo_${enc.desde}_al_${enc.hasta}.${formato === 'pdf' ? 'pdf' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    info.textContent = `Listo: ${a.download}`;
  } catch (err) {
    info.textContent = err.message;
  } finally {
    listo();
  }
}

document.querySelectorAll('.reporte-acciones [data-formato]').forEach(b =>
  b.addEventListener('click', () => exportarReporte(b)));

// Si se abrió la app directo en #reporte, app.js mostró la sección antes de que este archivo cargara.
if (location.hash === '#reporte') inicializarReporte();
