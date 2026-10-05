const MovimientoStrategy = require('./MovimientoStrategy');
const Movimiento = require('../Movimiento');
const { ErrorStockInsuficiente } = require('../errores');

/** Consumo de insumo por producción. Implementa RD01. */
class EgresoStrategy extends MovimientoStrategy {
  get tipo() { return Movimiento.TIPOS.EGRESO; }
  get usuarioPorDefecto() { return 'Taller'; }

  validar(insumo, cantidad) {
    super.validar(insumo, cantidad);
    // RD01 — el stock nunca puede quedar negativo.
    if (cantidad > insumo.stock_actual) {
      throw new ErrorStockInsuficiente(insumo, cantidad);
    }
  }

  calcularStockResultante(insumo, cantidad) {
    return Number((insumo.stock_actual - cantidad).toFixed(3));
  }
}

module.exports = EgresoStrategy;
