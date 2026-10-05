const TIPOS = Object.freeze({
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
  AJUSTE: 'AJUSTE',
});

/** Asiento del historial de stock: inmutable una vez registrado. */
class Movimiento {
  constructor({
    id = null, id_insumo, tipo_movimiento, cantidad,
    stock_resultante, observacion = null, usuario = 'Sistema',
    fecha = null, insumo_nombre = null, unidad_medida = null,
  }) {
    this.id = id;
    this.id_insumo = id_insumo;
    this.tipo_movimiento = tipo_movimiento;
    this.cantidad = Number(cantidad);
    this.stock_resultante = Number(stock_resultante);
    this.observacion = observacion;
    this.usuario = usuario;
    this.fecha = fecha;
    this.insumo_nombre = insumo_nombre;
    this.unidad_medida = unidad_medida;
  }

  static desdeFila(fila) {
    return fila ? new Movimiento(fila) : null;
  }

  toJSON() {
    return { ...this };
  }
}

Movimiento.TIPOS = TIPOS;
module.exports = Movimiento;
