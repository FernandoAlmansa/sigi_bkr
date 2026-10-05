const MovimientoStrategy = require('./MovimientoStrategy');
const Movimiento = require('../Movimiento');
const { ErrorValidacion, ErrorReglaNegocio } = require('../errores');

/**
 * Recuento físico: la cantidad informada NO se suma ni se resta, pasa a ser
 * el stock real. En el historial se asienta la diferencia contra el sistema,
 * que es el dato con valor de auditoría.
 */
class AjusteStrategy extends MovimientoStrategy {
  get tipo() { return Movimiento.TIPOS.AJUSTE; }
  get usuarioPorDefecto() { return 'Admin'; }

  validar(insumo, cantidad) {
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      throw new ErrorValidacion('El stock contado debe ser un número mayor o igual a cero.');
    }
    if (cantidad === insumo.stock_actual) {
      throw new ErrorReglaNegocio('El stock contado coincide con el del sistema: no hay ajuste que registrar.');
    }
  }

  calcularStockResultante(insumo, cantidad) {
    return Number(cantidad.toFixed(3));
  }

  cantidadRegistrada(insumo, cantidad) {
    return Number(Math.abs(cantidad - insumo.stock_actual).toFixed(3));
  }
}

module.exports = AjusteStrategy;
