const { ErrorValidacion } = require('./errores');

/**
 * Presentación de un insumo: una forma de contarlo distinta de la unidad base,
 * con su factor de conversión. Ejemplos: rollo = 20 metros, paquete = 100
 * unidades, caja = 1000 unidades. El stock SIEMPRE se guarda en unidad base;
 * la presentación sólo traduce lo que el usuario carga.
 */
class Presentacion {
  constructor({ id = null, nombre, factor }) {
    this.id = id;
    this.nombre = nombre;
    this.factor = Number(factor);
  }

  /** Convierte una cantidad expresada en esta presentación a unidad base. */
  aBase(cantidad) {
    return Number((Number(cantidad) * this.factor).toFixed(3));
  }

  toJSON() {
    return { id: this.id, nombre: this.nombre, factor: this.factor };
  }

  /**
   * Valida y normaliza una lista de presentaciones recibida del cliente.
   * Devuelve { presentaciones, errores } en vez de lanzar, para que el
   * builder pueda acumular errores de varios campos.
   */
  static normalizarLista(lista, unidadBase = null) {
    const errores = [];
    if (lista === null || lista === undefined) return { presentaciones: [], errores };
    if (!Array.isArray(lista)) {
      return { presentaciones: [], errores: ['presentaciones debe ser una lista.'] };
    }

    const vistas = new Set();
    const presentaciones = [];
    lista.forEach((p, i) => {
      const n = i + 1;
      const nombre = String(p?.nombre ?? '').trim().toLowerCase();
      const factor = Number(p?.factor);
      if (!nombre) { errores.push(`Presentación ${n}: el nombre es obligatorio.`); return; }
      if (nombre.length > 40) { errores.push(`Presentación ${n}: el nombre no puede superar 40 caracteres.`); return; }
      if (!Number.isFinite(factor) || factor <= 0) {
        errores.push(`Presentación "${nombre}": la equivalencia debe ser un número mayor a cero.`);
        return;
      }
      if (unidadBase && nombre === String(unidadBase).trim().toLowerCase()) {
        errores.push(`Presentación "${nombre}": no puede llamarse igual que la unidad base.`);
        return;
      }
      if (vistas.has(nombre)) { errores.push(`Presentación "${nombre}" repetida.`); return; }
      vistas.add(nombre);
      presentaciones.push(new Presentacion({ nombre, factor: Number(factor.toFixed(3)) }));
    });

    return { presentaciones, errores };
  }

  static validarLista(lista, unidadBase) {
    const { presentaciones, errores } = Presentacion.normalizarLista(lista, unidadBase);
    if (errores.length) throw new ErrorValidacion('Presentaciones inválidas.', errores);
    return presentaciones;
  }
}

module.exports = Presentacion;
