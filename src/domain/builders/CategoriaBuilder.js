const Categoria = require('../Categoria');
const Presentacion = require('../Presentacion');
const { ErrorValidacion } = require('../errores');

/**
 * PATRÓN BUILDER (creacional, GoF) — producto: Categoria.
 * Mismo esquema que InsumoBuilder: acumula errores de todos los campos y
 * ofrece build() para el alta y buildParcial() para la modificación.
 */
class CategoriaBuilder {
  constructor() {
    this.datos = {};
    this.errores = [];
  }

  static desdeBody(body = {}) {
    const b = new CategoriaBuilder();
    if (body.nombre !== undefined) b.conNombre(body.nombre);
    if (body.unidad_base !== undefined) b.conUnidadBase(body.unidad_base);
    if (body.campos !== undefined) b.conCampos(body.campos);
    if (body.presentaciones !== undefined) b.conPresentaciones(body.presentaciones, body.unidad_base);
    return b;
  }

  conNombre(valor) {
    const nombre = String(valor ?? '').trim();
    if (!nombre) this.errores.push('El nombre de la categoría es obligatorio.');
    else if (nombre.length > 60) this.errores.push('El nombre no puede superar los 60 caracteres.');
    else this.datos.nombre = nombre;
    return this;
  }

  conUnidadBase(valor) {
    const unidad = String(valor ?? '').trim().toLowerCase();
    if (unidad.length > 20) this.errores.push('La unidad base no puede superar los 20 caracteres.');
    else this.datos.unidad_base = unidad || null;
    return this;
  }

  conCampos(lista) {
    const { campos, errores } = Categoria.normalizarCampos(lista);
    this.errores.push(...errores);
    this.datos.campos = campos;
    return this;
  }

  conPresentaciones(lista, unidadBase) {
    const { presentaciones, errores } = Presentacion.normalizarLista(lista, unidadBase);
    this.errores.push(...errores);
    this.datos.presentaciones = presentaciones.map((p) => ({ nombre: p.nombre, factor: p.factor }));
    return this;
  }

  build() {
    if (this.datos.nombre === undefined && !this.errores.length) {
      this.errores.push('El nombre de la categoría es obligatorio.');
    }
    this._verificar();
    return new Categoria({ campos: [], presentaciones: [], ...this.datos });
  }

  buildParcial() {
    this._verificar();
    if (!Object.keys(this.datos).length) throw new ErrorValidacion('No se enviaron campos para actualizar.');
    return { ...this.datos };
  }

  _verificar() {
    if (this.errores.length) throw new ErrorValidacion('Datos de la categoría inválidos.', this.errores);
  }
}

module.exports = CategoriaBuilder;
