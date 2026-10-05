const test = require('node:test');
const assert = require('node:assert');

const InventarioFacade = require('../src/services/InventarioFacade');
const AlertaService = require('../src/services/AlertaService');
const Insumo = require('../src/domain/Insumo');
const { ErrorStockInsuficiente, ErrorNoEncontrado } = require('../src/domain/errores');

/** Dobles de prueba: la facade se testea sin base de datos. */
function armarEntorno(insumoInicial) {
  const estado = { insumo: insumoInicial, stockGuardado: null, movimientos: [], commits: 0, rollbacks: 0 };

  const insumos = {
    obtenerParaActualizar: async (id) => (estado.insumo && estado.insumo.id === Number(id) ? estado.insumo : null),
    actualizarStock: async (id, stock) => { estado.stockGuardado = stock; return estado.insumo; },
  };
  const movimientos = {
    registrar: async (mov) => { estado.movimientos.push(mov); return { id: estado.movimientos.length, ...mov }; },
  };
  const avisos = [];
  const alertas = new AlertaService([{ nombre: 'Espia', notificar: async (e) => { avisos.push(e); } }]);

  const transacciones = async (fn) => {
    try {
      const r = await fn({ query: async () => ({ rows: [] }) });
      estado.commits += 1;
      return r;
    } catch (err) {
      estado.rollbacks += 1;
      throw err;
    }
  };

  const facade = new InventarioFacade({ insumos, movimientos, tipos: {}, alertas, transacciones });
  return { facade, estado, avisos };
}

const insumoDemo = (over = {}) => new Insumo({
  id: 7, nombre: 'Tela sublimación', id_tipo: 1, unidad_medida: 'metros',
  stock_actual: 50, stock_minimo: 20, estado_critico: false, ...over,
});

test('Egreso válido: actualiza stock, asienta movimiento y commitea', async () => {
  const { facade, estado } = armarEntorno(insumoDemo());
  const res = await facade.registrarMovimiento('EGRESO', { id_insumo: 7, cantidad: 10, usuario: 'Fer' });

  assert.strictEqual(res.nuevo_stock, 40);
  assert.strictEqual(estado.stockGuardado, 40);
  assert.strictEqual(estado.movimientos[0].tipo, 'EGRESO');
  assert.strictEqual(estado.movimientos[0].usuario, 'Fer');
  assert.strictEqual(estado.commits, 1);
  assert.strictEqual(estado.rollbacks, 0);
});

test('RD01: el egreso excedido hace rollback y no toca el stock', async () => {
  const { facade, estado } = armarEntorno(insumoDemo({ stock_actual: 5 }));

  await assert.rejects(
    facade.registrarMovimiento('EGRESO', { id_insumo: 7, cantidad: 9 }),
    ErrorStockInsuficiente,
  );
  assert.strictEqual(estado.stockGuardado, null);
  assert.strictEqual(estado.movimientos.length, 0);
  assert.strictEqual(estado.rollbacks, 1);
});

test('RD02: la alerta se dispara al cruzar el umbral', async () => {
  const { facade, avisos } = armarEntorno(insumoDemo({ stock_actual: 25, stock_minimo: 20 }));
  await facade.registrarMovimiento('EGRESO', { id_insumo: 7, cantidad: 10 });
  await new Promise((r) => setImmediate(r));

  assert.strictEqual(avisos.length, 1);
  assert.strictEqual(avisos[0].stockResultante, 15);
});

test('RD02: no se re-notifica un insumo que ya estaba crítico', async () => {
  const { facade, avisos } = armarEntorno(insumoDemo({ stock_actual: 15, stock_minimo: 20, estado_critico: true }));
  await facade.registrarMovimiento('EGRESO', { id_insumo: 7, cantidad: 5 });
  await new Promise((r) => setImmediate(r));

  assert.strictEqual(avisos.length, 0);
});

test('Insumo inexistente devuelve 404 de dominio', async () => {
  const { facade } = armarEntorno(null);
  await assert.rejects(facade.registrarMovimiento('INGRESO', { id_insumo: 99, cantidad: 1 }), ErrorNoEncontrado);
});
