const { ErrorValidacion } = require('./errores');

const TIPOS_CAMPO = Object.freeze(['texto', 'opciones', 'numero']);

/** "Tipo de herraje" → "tipo_de_herraje" (clave estable para guardar en atributos). */
function aClave(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Categoría de insumo (tabla tipos_insumo). Además del nombre, define:
 *  - campos: las características que se le piden a sus insumos (talle,
 *    color, ancho...), con su tipo y si son obligatorias;
 *  - unidad_base y presentaciones: lo que se sugiere al dar de alta un
 *    insumo nuevo de esta categoría (cada insumo después puede ajustarlo).
 */
class Categoria {
  constructor({
    id = null, nombre, campos = [], unidad_base = null,
    presentaciones = [], activo = true, cantidad_insumos = undefined,
  }) {
    this.id = id;
    this.nombre = nombre;
    this.campos = Array.isArray(campos) ? campos : [];
    this.unidad_base = unidad_base || null;
    this.presentaciones = Array.isArray(presentaciones) ? presentaciones : [];
    this.activo = Boolean(activo);
    if (cantidad_insumos !== undefined) this.cantidad_insumos = Number(cantidad_insumos);
  }

  static desdeFila(fila) {
    return fila ? new Categoria(fila) : null;
  }

  /**
   * Valida los atributos de un insumo contra los campos de la categoría:
   * obligatorios presentes, opción dentro de la lista, números válidos.
   * Las claves que la categoría no define se descartan.
   */
  validarAtributos(atributos = {}) {
    const errores = [];
    const limpio = {};
    for (const campo of this.campos) {
      const valor = String(atributos?.[campo.clave] ?? '').trim();
      if (!valor) {
        if (campo.obligatorio) errores.push(`"${campo.etiqueta}" es obligatorio para ${this.nombre}.`);
        continue;
      }
      if (campo.tipo === 'opciones' && campo.opciones.length && !campo.opciones.includes(valor)) {
        errores.push(`"${campo.etiqueta}": "${valor}" no es una opción válida.`);
        continue;
      }
      if (campo.tipo === 'numero' && !Number.isFinite(Number(valor.replace(',', '.')))) {
        errores.push(`"${campo.etiqueta}" debe ser un número.`);
        continue;
      }
      limpio[campo.clave] = valor.slice(0, 100);
    }
    if (errores.length) throw new ErrorValidacion('Características del insumo inválidas.', errores);
    return limpio;
  }

  /** Normaliza la definición de campos enviada desde la pantalla de categorías. */
  static normalizarCampos(lista) {
    const errores = [];
    if (lista === null || lista === undefined) return { campos: [], errores };
    if (!Array.isArray(lista)) return { campos: [], errores: ['campos debe ser una lista.'] };

    const claves = new Set();
    const campos = [];
    lista.forEach((c, i) => {
      const n = i + 1;
      const etiqueta = String(c?.etiqueta ?? '').trim();
      if (!etiqueta) { errores.push(`Campo ${n}: el nombre es obligatorio.`); return; }
      if (etiqueta.length > 40) { errores.push(`Campo "${etiqueta}": máximo 40 caracteres.`); return; }

      const clave = aClave(c?.clave || etiqueta);
      if (!clave) { errores.push(`Campo "${etiqueta}": nombre inválido.`); return; }
      if (claves.has(clave)) { errores.push(`Campo "${etiqueta}" repetido.`); return; }

      const tipo = TIPOS_CAMPO.includes(c?.tipo) ? c.tipo : 'texto';
      let opciones = [];
      if (tipo === 'opciones') {
        const crudas = Array.isArray(c?.opciones) ? c.opciones : String(c?.opciones ?? '').split(',');
        opciones = [...new Set(crudas.map((o) => String(o).trim()).filter(Boolean))].map((o) => o.slice(0, 60));
        if (!opciones.length) { errores.push(`Campo "${etiqueta}": cargá al menos una opción.`); return; }
      }

      claves.add(clave);
      campos.push({ clave, etiqueta, tipo, opciones, obligatorio: Boolean(c?.obligatorio) });
    });
    return { campos, errores };
  }

  toJSON() {
    const json = {
      id: this.id,
      nombre: this.nombre,
      campos: this.campos,
      unidad_base: this.unidad_base,
      presentaciones: this.presentaciones,
      activo: this.activo,
    };
    if (this.cantidad_insumos !== undefined) json.cantidad_insumos = this.cantidad_insumos;
    return json;
  }
}

Categoria.TIPOS_CAMPO = TIPOS_CAMPO;
Categoria.aClave = aClave;
module.exports = Categoria;
