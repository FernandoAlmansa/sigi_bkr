const { ErrorValidacion } = require('../errores');

/**
 * PATRÓN STRATEGY (comportamiento, GoF) — clase abstracta.
 *
 * Cada tipo de movimiento de stock (ingreso, egreso, ajuste) tiene su propia
 * forma de calcular el stock resultante y sus propias reglas de negocio.
 * Antes eso estaba duplicado en dos controllers casi idénticos; ahora el
 * contexto (InventarioFacade) recibe la estrategia y no conoce el detalle.
 * Agregar un tipo nuevo = agregar una clase, sin tocar el flujo transaccional.
 */
class MovimientoStrategy {
  /** @returns {string} valor persistido en movimientos_stock.tipo_movimiento */
  get tipo() {
    throw new Error('Cada estrategia debe definir su tipo.');
  }

  /** Usuario por defecto cuando el request no lo informa. */
  get usuarioPorDefecto() {
    return 'Sistema';
  }

  /** Validación común: cantidad numérica y positiva. */
  validar(insumo, cantidad) {
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ErrorValidacion('La cantidad debe ser un número mayor a cero.');
    }
  }

  /** @returns {number} stock que queda luego de aplicar el movimiento. */
  calcularStockResultante() {
    throw new Error('Cada estrategia debe calcular su stock resultante.');
  }

  /** Cantidad que se asienta en el historial (por defecto, la solicitada). */
  cantidadRegistrada(insumo, cantidad) {
    return cantidad;
  }

  /** Aplica la estrategia y devuelve el asiento a persistir. */
  aplicar(insumo, cantidad) {
    this.validar(insumo, cantidad);
    const stockResultante = this.calcularStockResultante(insumo, cantidad);
    return {
      tipo: this.tipo,
      cantidad: this.cantidadRegistrada(insumo, cantidad),
      stockResultante,
    };
  }
}

module.exports = MovimientoStrategy;
