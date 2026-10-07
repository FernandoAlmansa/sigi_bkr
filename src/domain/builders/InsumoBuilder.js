const Insumo = require('../Insumo');
const Presentacion = require('../Presentacion');
const { ErrorValidacion } = require('../errores');

/**
 * PATRÓN BUILDER (creacional, GoF).
 *
 * Producto: Insumo. Un insumo se arma con muchos campos opcionales
 * (atributos dinámicos según el tipo, imagen, stock inicial) y con reglas de
 * validación que antes estaban desparramadas entre el controller y el SQL.
 * El builder acumula los errores en vez de cortar en el primero, y expone dos
 * salidas: `build()` para el alta y `buildParcial()` para el PATCH, que
 * devuelve sólo los campos efectivamente enviados.
 */
class InsumoBuilder {
  constructor() {
    this.datos = {};
    this.errores = [];
  }

  /** Director de conveniencia: arma el builder a partir del body del request. */
  static desdeBody(body = {}) {
    const b = new InsumoBuilder();
    if (body.nombre !== undefined) b.conNombre(body.nombre);
    if (body.id_tipo !== undefined) b.conTipo(body.id_tipo);
    if (body.unidad_medida !== undefined) b.conUnidad(body.unidad_medida);
    if (body.stock_actual !== undefined) b.conStockActual(body.stock_actual);
    if (body.stock_minimo !== undefined) b.conStockMinimo(body.stock_minimo);
    if (body.atributos !== undefined) b.conAtributos(body.atributos);
    if (body.imagen_url !== undefined) b.conImagen(body.imagen_url);
    if (body.presentaciones !== undefined) b.conPresentaciones(body.presentaciones, body.unidad_medida);
    return b;
  }

  conNombre(valor) {
    const nombre = String(valor ?? '').trim();
    if (!nombre) this.errores.push('El nombre es obligatorio.');
    else if (nombre.length > 120) this.errores.push('El nombre no puede superar los 120 caracteres.');
    else this.datos.nombre = nombre;
    return this;
  }

  conTipo(valor) {
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) this.errores.push('Elegí una categoría.');
    else this.datos.id_tipo = id;
    return this;
  }

  conUnidad(valor) {
    const unidad = String(valor ?? '').trim().toLowerCase();
    if (!unidad) this.errores.push('La unidad base es obligatoria.');
    else if (unidad.length > 20) this.errores.push('La unidad de medida no puede superar los 20 caracteres.');
    else this.datos.unidad_medida = unidad;
    return this;
  }

  conStockActual(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) this.errores.push('stock_actual debe ser un número mayor o igual a cero.');
    else this.datos.stock_actual = n;
    return this;
  }

  conStockMinimo(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) this.errores.push('stock_minimo debe ser un número mayor o igual a cero.');
    else this.datos.stock_minimo = n;
    return this;
  }

  conAtributos(valor) {
    if (valor === null) { this.datos.atributos = {}; return this; }
    if (typeof valor !== 'object' || Array.isArray(valor)) {
      this.errores.push('atributos debe ser un objeto clave/valor.');
      return this;
    }
    const limpio = {};
    for (const [k, v] of Object.entries(valor)) {
      const texto = String(v ?? '').trim();
      if (texto) limpio[String(k).trim()] = texto.slice(0, 100);
    }
    this.datos.atributos = limpio;
    return this;
  }

  conPresentaciones(lista, unidadBase) {
    const { presentaciones, errores } = Presentacion.normalizarLista(lista, unidadBase);
    this.errores.push(...errores);
    this.datos.presentaciones = presentaciones;
    return this;
  }

  conImagen(url) {
    this.datos.imagen_url = url ? String(url) : null;
    return this;
  }

  /** Valida y arma un Insumo completo (alta). */
  build() {
    const nombres = { nombre: 'El nombre', id_tipo: 'La categoría', unidad_medida: 'La unidad base' };
    for (const campo of ['nombre', 'id_tipo', 'unidad_medida']) {
      if (this.datos[campo] === undefined && !this.errores.length) {
        this.errores.push(`${nombres[campo]} es obligatorio/a.`);
      }
    }
    this._verificar();

    const stockActual = this.datos.stock_actual ?? 0;
    const stockMinimo = this.datos.stock_minimo ?? 0;

    return new Insumo({
      ...this.datos,
      stock_actual: stockActual,
      stock_minimo: stockMinimo,
      atributos: this.datos.atributos ?? {},
      presentaciones: this.datos.presentaciones ?? [],
      estado_critico: stockActual <= stockMinimo,
    });
  }

  /** Devuelve sólo los campos enviados, ya validados (modificación parcial). */
  buildParcial() {
    this._verificar();
    if (!Object.keys(this.datos).length) {
      throw new ErrorValidacion('No se enviaron campos para actualizar.');
    }
    return { ...this.datos };
  }

  _verificar() {
    if (this.errores.length) {
      throw new ErrorValidacion('Datos del insumo inválidos.', this.errores);
    }
  }
}

module.exports = InsumoBuilder;
