const test = require('node:test');
const assert = require('node:assert');

const Insumo = require('../src/domain/Insumo');
const InsumoBuilder = require('../src/domain/builders/InsumoBuilder');
const { obtenerStrategy } = require('../src/domain/strategies');
const { ErrorValidacion, ErrorStockInsuficiente, ErrorReglaNegocio } = require('../src/domain/errores');

const insumoDemo = (over = {}) => new Insumo({
  id: 1, nombre: 'Elástico 10mm', id_tipo: 2, unidad_medida: 'metros',
  stock_actual: 100, stock_minimo: 20, ...over,
});

// ---------- Builder ----------

test('Builder arma un insumo válido y deriva el estado crítico', () => {
  const insumo = InsumoBuilder.desdeBody({
    nombre: '  Taza 90  ', id_tipo: '3', unidad_medida: 'CANTIDAD',
    stock_actual: 5, stock_minimo: 10, atributos: { talle: '90', color: '  ' },
  }).build();

  assert.strictEqual(insumo.nombre, 'Taza 90');
  assert.strictEqual(insumo.id_tipo, 3);
  assert.strictEqual(insumo.unidad_medida, 'cantidad');
  assert.strictEqual(insumo.estado_critico, true);
  assert.deepStrictEqual(insumo.atributos, { talle: '90' });
});

test('Builder acumula todos los errores de validación', () => {
  assert.throws(
    () => InsumoBuilder.desdeBody({ nombre: '', id_tipo: 'x', unidad_medida: '', stock_actual: -5 }).build(),
    (err) => err instanceof ErrorValidacion && err.extra.errores.length === 4,
  );
});

test('buildParcial devuelve sólo los campos enviados', () => {
  const campos = InsumoBuilder.desdeBody({ stock_minimo: 30 }).buildParcial();
  assert.deepStrictEqual(campos, { stock_minimo: 30 });
});

// ---------- Strategies ----------

test('EgresoStrategy descuenta el stock', () => {
  const asiento = obtenerStrategy('EGRESO').aplicar(insumoDemo(), 25);
  assert.deepStrictEqual(asiento, { tipo: 'EGRESO', cantidad: 25, stockResultante: 75 });
});

test('RD01: el egreso no puede dejar el stock negativo', () => {
  assert.throws(
    () => obtenerStrategy('EGRESO').aplicar(insumoDemo({ stock_actual: 10 }), 25),
    (err) => err instanceof ErrorStockInsuficiente && err.status === 422,
  );
});

test('IngresoStrategy suma el stock', () => {
  assert.strictEqual(obtenerStrategy('INGRESO').aplicar(insumoDemo(), 50).stockResultante, 150);
});

test('AjusteStrategy fija el stock contado y asienta la diferencia', () => {
  const asiento = obtenerStrategy('ajuste').aplicar(insumoDemo(), 82);
  assert.strictEqual(asiento.stockResultante, 82);
  assert.strictEqual(asiento.cantidad, 18);
});

test('El ajuste sin diferencia se rechaza', () => {
  assert.throws(() => obtenerStrategy('AJUSTE').aplicar(insumoDemo(), 100), ErrorReglaNegocio);
});

test('Cantidad no positiva rechazada en cualquier movimiento', () => {
  for (const tipo of ['INGRESO', 'EGRESO']) {
    assert.throws(() => obtenerStrategy(tipo).aplicar(insumoDemo(), 0), ErrorValidacion);
  }
});

test('Tipo de movimiento inexistente rechazado', () => {
  assert.throws(() => obtenerStrategy('ROBO'), ErrorValidacion);
});
