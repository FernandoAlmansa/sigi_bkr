const test = require('node:test');
const assert = require('node:assert');

const ClasificadorCobertura = require('../src/domain/reportes/ClasificadorCobertura');
const CalculadorConsumo = require('../src/domain/reportes/CalculadorConsumo');
const ValidadorPeriodo = require('../src/domain/reportes/ValidadorPeriodo');
const FiltroReporte = require('../src/domain/reportes/FiltroReporte');
const LineaConsumo = require('../src/domain/reportes/LineaConsumo');
const UmbralCobertura = require('../src/domain/reportes/UmbralCobertura');
const PeriodoAnalisis = require('../src/domain/reportes/PeriodoAnalisis');
const { EstadoCobertura: E } = require('../src/domain/reportes/enumeraciones');
const { estrategiasDeOrden } = require('../src/domain/strategies/orden');
const DirectorReporte = require('../src/domain/builders/reporte/DirectorReporte');
const ConstructorPlanilla = require('../src/domain/builders/reporte/ConstructorPlanilla');
const ConstructorPDF = require('../src/domain/builders/reporte/ConstructorPDF');
const FachadaReportes = require('../src/services/FachadaReportes');
const { ErrorPeriodoInvalido, ErrorValidacion } = require('../src/domain/errores');

// Umbrales y período del Anexo C: observación 30, criticidad 10, mínimo 5 egresos, 90 días.
const umbral = new UmbralCobertura({ id: 1, dias_observacion: 30, dias_criticidad: 10, egresos_minimos: 5 });
const DIAS = 90;
const linea = (nombre, consumo, egresos, stock) => new LineaConsumo({
  idInsumo: 1, nombre, unidad: 'u', consumoTotal: consumo, cantidadEgresos: egresos,
  promedioDiario: consumo / DIAS, stockAlGenerar: stock,
});
const clasificador = new ClasificadorCobertura();

/* ── Caja blanca: ClasificadorCobertura.clasificar(), rutas R1 a R5 ── */

test('R1 (1-2-10): consumo cero → SIN_ROTACION, sin promedio ni cobertura', () => {
  const l = linea('Arco talle 100', 0, 0, 35);
  assert.strictEqual(clasificador.clasificar(l, umbral), E.SIN_ROTACION);
  assert.strictEqual(l.promedioDiario, null);
  assert.strictEqual(l.diasCobertura, null);
});

test('R2 (1-3-4-10): menos egresos que el mínimo → MUESTRA_INSUFICIENTE, sin promedio ni cobertura', () => {
  const l = linea('Dije corpiño', 4, 3, 60);
  assert.strictEqual(clasificador.clasificar(l, umbral), E.MUESTRA_INSUFICIENTE);
  assert.strictEqual(l.promedioDiario, null);
  assert.strictEqual(l.diasCobertura, null);
});

test('R3 (1-3-5-6-10): cobertura <= crítico → CRITICA (4,67 m/día, 2,7 días)', () => {
  const l = linea('Tela lycra negra', 420, 28, 12.5);
  assert.strictEqual(clasificador.clasificar(l, umbral), E.CRITICA);
  assert.strictEqual(l.promedioDiario.toFixed(2), '4.67');
  assert.strictEqual(l.diasCobertura, 2.7);
});

test('R4 (1-3-5-7-8-10): entre crítico y observación → EN_OBSERVACION (2,00 u/día, 22,5 días)', () => {
  const l = linea('Taza 90 (M)', 180, 20, 45);
  assert.strictEqual(clasificador.clasificar(l, umbral), E.EN_OBSERVACION);
  assert.strictEqual(l.promedioDiario.toFixed(2), '2.00');
  assert.strictEqual(l.diasCobertura, 22.5);
});

test('R5 (1-3-5-7-9-10): más que observación → SUFICIENTE (2,89 u/día, 83,1 días)', () => {
  const l = linea('Herraje regulador', 260, 15, 240);
  assert.strictEqual(clasificador.clasificar(l, umbral), E.SUFICIENTE);
  assert.strictEqual(l.promedioDiario.toFixed(2), '2.89');
  assert.strictEqual(l.diasCobertura, 83.1);
});

test('Valores límite de cobertura: 10,0 crítica, 10,1 y 30,0 observación, 30,1 suficiente', () => {
  // 10 días de período, 5 egresos por 50 u → 5 u/día.
  const l = (stock) => new LineaConsumo({ idInsumo: 1, nombre: 'x', unidad: 'u', consumoTotal: 50, cantidadEgresos: 5, promedioDiario: 5, stockAlGenerar: stock });
  assert.strictEqual(clasificador.clasificar(l(50), umbral), E.CRITICA);
  assert.strictEqual(clasificador.clasificar(l(50.5), umbral), E.EN_OBSERVACION);
  assert.strictEqual(clasificador.clasificar(l(150), umbral), E.EN_OBSERVACION);
  assert.strictEqual(clasificador.clasificar(l(150.5), umbral), E.SUFICIENTE);
});

/* ── RD06: validación del período ── */

test('ValidadorPeriodo: período válido, límites y rechazos', () => {
  const v = new ValidadorPeriodo(() => '2026-10-30');
  assert.strictEqual(v.validar('2025-12-01', '2026-02-28').cantidadDias, 90);
  assert.strictEqual(v.validar('2026-10-30', '2026-10-30').cantidadDias, 1);
  assert.throws(() => v.validar('2026-10-01', '2026-10-31'), (e) => e instanceof ErrorPeriodoInvalido && e.extra.campo === 'hasta');
  assert.throws(() => v.validar('2026-10-11', '2026-10-10'), (e) => e instanceof ErrorPeriodoInvalido && e.extra.campo === 'desde');
  assert.throws(() => v.validar('', '2026-10-10'), (e) => e instanceof ErrorPeriodoInvalido && e.status === 400);
  assert.throws(() => v.validar('2026-02-30', '2026-03-10'), ErrorPeriodoInvalido);
});

test('FiltroReporte: criterio y tipo mal formados → 400; por defecto, criticidad', () => {
  assert.strictEqual(new FiltroReporte({}).criterioOrden, 'CRITICIDAD');
  assert.strictEqual(new FiltroReporte({ orden: 'consumo' }).criterioOrden, 'CONSUMO');
  assert.throws(() => new FiltroReporte({ orden: 'precio' }), ErrorValidacion);
  assert.throws(() => new FiltroReporte({ id_tipo: 'abc' }), ErrorValidacion);
});

/* ── RD04: composición del consumo ── */

test('CalculadorConsumo: suma egresos por insumo e incluye los insumos sin egresos', () => {
  const periodo = new PeriodoAnalisis('2026-10-01', '2026-10-10');
  const stocks = [
    { id_insumo: 1, nombre: 'Tela', unidad_medida: 'metros', tipo_nombre: 'Telas', stock_actual: 20 },
    { id_insumo: 2, nombre: 'Arco', unidad_medida: 'pares', tipo_nombre: 'Arcos', stock_actual: 7 },
  ];
  const egresos = [{ id_insumo: 1, cantidad: 0.1 }, { id_insumo: 1, cantidad: 0.2 }, { id_insumo: 1, cantidad: 2.7 }];
  const [tela, arco] = new CalculadorConsumo().calcularLineas(egresos, stocks, periodo);
  assert.strictEqual(tela.consumoTotal, 3);
  assert.strictEqual(tela.cantidadEgresos, 3);
  assert.strictEqual(tela.promedioDiario, 0.3);
  assert.strictEqual(arco.consumoTotal, 0);
  assert.strictEqual(arco.cantidadEgresos, 0);
});

/* ── Strategy: criterios de orden ── */

test('Orden por criticidad, por consumo y alfabético', () => {
  const l = (nombre, estado, dias, consumo) => Object.assign(new LineaConsumo({ idInsumo: 1, nombre, unidad: 'u', consumoTotal: consumo }), { estado, diasCobertura: dias });
  const lineas = [
    l('Arco', E.SIN_ROTACION, null, 0), l('Herraje', E.SUFICIENTE, 83.1, 260), l('Elástico', E.CRITICA, 2.3, 310),
    l('Dije', E.MUESTRA_INSUFICIENTE, null, 4), l('Taza', E.EN_OBSERVACION, 22.5, 180), l('Tela', E.CRITICA, 2.7, 420),
  ];
  const orden = estrategiasDeOrden();
  const nombres = (c) => orden.get(c).ordenar(lineas).map((x) => x.nombre).join(',');
  assert.strictEqual(nombres('CRITICIDAD'), 'Elástico,Tela,Taza,Herraje,Dije,Arco');
  assert.strictEqual(nombres('CONSUMO'), 'Tela,Elástico,Herraje,Taza,Dije,Arco');
  assert.strictEqual(nombres('NOMBRE'), 'Arco,Dije,Elástico,Herraje,Taza,Tela');
  assert.strictEqual(lineas[0].nombre, 'Arco', 'ordenar() no modifica la lista original');
});

/* ── Builder: el director arma cualquier representación con los mismos pasos ── */

function reporteDemo() {
  const lineas = [linea('Tela lycra negra', 420, 28, 12.5), linea('Arco talle 100', 0, 0, 35)];
  lineas.forEach((x) => clasificador.clasificar(x, umbral));
  const ReporteConsumo = require('../src/domain/reportes/ReporteConsumo');
  return new ReporteConsumo({
    id: 1, periodo: new PeriodoAnalisis('2025-12-01', '2026-02-28'), criterioOrden: 'CRITICIDAD', umbral, lineas,
  });
}

test('DirectorReporte invoca los pasos en orden: encabezado, líneas, gráfico, resumen', () => {
  const pasos = [];
  const espia = {
    construirEncabezado: () => pasos.push('encabezado'),
    construirLinea: (l) => pasos.push(`linea:${l.nombre}`),
    construirGrafico: () => pasos.push('grafico'),
    construirResumen: () => pasos.push('resumen'),
  };
  new DirectorReporte().construir(reporteDemo(), espia);
  assert.deepStrictEqual(pasos, ['encabezado', 'linea:Tela lycra negra', 'linea:Arco talle 100', 'grafico', 'resumen']);
});

test('ConstructorPlanilla: CSV con BOM, punto y coma y guion en las celdas sin proyección', () => {
  const c = new ConstructorPlanilla();
  new DirectorReporte().construir(reporteDemo(), c);
  const csv = c.obtenerResultado().toString('utf8');
  assert.ok(csv.startsWith('﻿Reporte de consumo'));
  assert.ok(csv.includes('Tela lycra negra;;u;420;28;4,67;12,5;2,7;CRÍTICA'));
  assert.ok(csv.includes('Arco talle 100;;u;0;0;—;35;—;SIN ROTACIÓN'));
  assert.ok(csv.includes('Insumos con cobertura crítica;1'));
});

test('ConstructorPDF: genera un PDF válido', async () => {
  const c = new ConstructorPDF();
  new DirectorReporte().construir(reporteDemo(), c);
  const pdf = await c.obtenerResultado();
  assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});

/* ── Facade con dobles de prueba (sin base de datos) ── */

function fachadaDemo({ tipoExiste = true } = {}) {
  const llamadas = { egresos: 0, guardado: null };
  const fachada = new FachadaReportes({
    validador: new ValidadorPeriodo(() => '2026-10-30'),
    umbrales: { obtenerVigente: async () => umbral },
    tipos: { obtenerPorId: async () => (tipoExiste ? { nombre: 'Telas' } : null) },
    movimientos: {
      obtenerEgresos: async () => {
        llamadas.egresos += 1;
        return Array.from({ length: 28 }, () => ({ id_insumo: 1, cantidad: 15 }));
      },
    },
    stocks: {
      obtenerStockActual: async () => [
        { id_insumo: 1, nombre: 'Tela lycra negra', unidad_medida: 'metros', tipo_nombre: 'Telas', stock_actual: 12.5 },
        { id_insumo: 2, nombre: 'Arco talle 100', unidad_medida: 'pares', tipo_nombre: 'Arcos', stock_actual: 35 },
      ],
    },
    reportes: { guardar: async (r) => { llamadas.guardado = r; return { id: 9, fecha_generacion: 'hoy' }; } },
    transacciones: async (fn) => fn({}),
  });
  return { fachada, llamadas };
}

test('Fachada: genera la vista, guarda el reporte y separa los insumos sin proyección', async () => {
  const { fachada, llamadas } = fachadaDemo();
  const vista = await fachada.generarReporteConsumo({ desde: '2025-12-01', hasta: '2026-02-28' });
  assert.strictEqual(vista.id_reporte, 9);
  assert.strictEqual(vista.encabezado.cantidad_dias, 90);
  assert.deepStrictEqual(vista.lineas.map((l) => l.estado), ['CRITICA', 'SIN_ROTACION']);
  assert.strictEqual(vista.grafico.serie.length, 1);
  assert.strictEqual(vista.grafico.sin_proyeccion[0].nombre, 'Arco talle 100');
  assert.strictEqual(vista.resumen.criticos, 1);
  assert.strictEqual(llamadas.guardado.lineas.length, 2);
});

test('Fachada: período inválido no consulta datos (A1); tipo inexistente → 400', async () => {
  const { fachada, llamadas } = fachadaDemo({ tipoExiste: false });
  await assert.rejects(fachada.generarReporteConsumo({ desde: '2026-10-05', hasta: '2026-10-01' }), ErrorPeriodoInvalido);
  assert.strictEqual(llamadas.egresos, 0);
  await assert.rejects(fachada.generarReporteConsumo({ desde: '2026-10-01', hasta: '2026-10-05', id_tipo: 999 }),
    (e) => e instanceof ErrorValidacion && e.status === 400);
  assert.strictEqual(llamadas.egresos, 0);
});

test('Umbrales: observación tiene que superar a criticidad; mínimo de egresos >= 1', () => {
  assert.throws(() => UmbralCobertura.crear({ dias_observacion: 10, dias_criticidad: 10, egresos_minimos: 5 }), ErrorValidacion);
  assert.throws(() => UmbralCobertura.crear({ dias_observacion: 30, dias_criticidad: 10, egresos_minimos: 0 }), ErrorValidacion);
  assert.strictEqual(UmbralCobertura.crear({ dias_observacion: '45', dias_criticidad: '15', egresos_minimos: '3' }).diasObservacion, 45);
});
