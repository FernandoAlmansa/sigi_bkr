const MovimientoStrategy = require('./MovimientoStrategy');
const Movimiento = require('../Movimiento');

/** Reposición de insumo (compra o devolución al depósito). */
class IngresoStrategy extends MovimientoStrategy {
  get tipo() { return Movimiento.TIPOS.INGRESO; }
  get usuarioPorDefecto() { return 'Admin'; }

  calcularStockResultante(insumo, cantidad) {
    return Number((insumo.stock_actual + cantidad).toFixed(3));
  }
}

module.exports = IngresoStrategy;
