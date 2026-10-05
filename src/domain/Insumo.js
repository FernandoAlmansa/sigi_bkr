/**
 * Entidad de dominio Insumo. Encapsula el estado y las reglas propias del
 * concepto; no sabe nada de SQL ni de HTTP.
 */
class Insumo {
  constructor({
    id = null, nombre, id_tipo, unidad_medida,
    stock_actual = 0, stock_minimo = 0,
    estado_critico = false, activo = true,
    imagen_url = null, atributos = {}, tipo_nombre = null,
  }) {
    this.id = id;
    this.nombre = nombre;
    this.id_tipo = id_tipo;
    this.unidad_medida = unidad_medida;
    this.stock_actual = Number(stock_actual);
    this.stock_minimo = Number(stock_minimo);
    this.estado_critico = Boolean(estado_critico);
    this.activo = Boolean(activo);
    this.imagen_url = imagen_url;
    this.atributos = atributos || {};
    this.tipo_nombre = tipo_nombre;
  }

  /** Reconstruye la entidad desde una fila de PostgreSQL. */
  static desdeFila(fila) {
    if (!fila) return null;
    return new Insumo(fila);
  }

  /** RD02 — un insumo está en estado crítico cuando perfora su umbral. */
  esCritico(stock = this.stock_actual) {
    return Number(stock) <= this.stock_minimo;
  }

  /** Representación que consume el frontend (contrato de la API). */
  toJSON() {
    return {
      id: this.id,
      nombre: this.nombre,
      id_tipo: this.id_tipo,
      unidad_medida: this.unidad_medida,
      stock_actual: this.stock_actual,
      stock_minimo: this.stock_minimo,
      estado_critico: this.estado_critico,
      activo: this.activo,
      imagen_url: this.imagen_url,
      atributos: this.atributos,
      tipo_nombre: this.tipo_nombre,
    };
  }
}

module.exports = Insumo;
