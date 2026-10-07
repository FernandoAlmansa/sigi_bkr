const Presentacion = require('./Presentacion');
const { ErrorValidacion } = require('./errores');

/**
 * Entidad de dominio Insumo. Encapsula el estado y las reglas propias del
 * concepto; no sabe nada de SQL ni de HTTP.
 */
class Insumo {
  constructor({
    id = null, nombre, id_tipo, unidad_medida,
    stock_actual = 0, stock_minimo = 0,
    estado_critico = false, activo = true,
    imagen_url = null, atributos = {}, tipo_nombre = null, presentaciones = [],
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
    // El stock se guarda en unidad_medida (unidad base); las presentaciones
    // son formas alternativas de contarlo (rollo = 20 m, paquete = 100 u...).
    this.presentaciones = (Array.isArray(presentaciones) ? presentaciones : [])
      .map((p) => (p instanceof Presentacion ? p : new Presentacion(p)));
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

  buscarPresentacion(nombre) {
    const buscado = String(nombre ?? '').trim().toLowerCase();
    return this.presentaciones.find((p) => p.nombre.toLowerCase() === buscado) || null;
  }

  /**
   * Traduce lo que cargó el usuario ("2 rollos") a unidad base ("40 metros").
   * Sin presentación (o con el nombre de la unidad base) la cantidad ya está
   * en unidad base.
   */
  convertirABase(cantidad, nombrePresentacion) {
    const nombre = String(nombrePresentacion ?? '').trim().toLowerCase();
    if (!nombre || nombre === String(this.unidad_medida).toLowerCase()) {
      return { cantidadBase: Number(cantidad), presentacion: null };
    }
    const presentacion = this.buscarPresentacion(nombre);
    if (!presentacion) {
      const validas = [this.unidad_medida, ...this.presentaciones.map((p) => p.nombre)].join(', ');
      throw new ErrorValidacion(`"${nombrePresentacion}" no es una presentación de ${this.nombre}. Válidas: ${validas}.`);
    }
    return { cantidadBase: presentacion.aBase(cantidad), presentacion };
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
      presentaciones: this.presentaciones.map((p) => p.toJSON()),
    };
  }
}

module.exports = Insumo;
