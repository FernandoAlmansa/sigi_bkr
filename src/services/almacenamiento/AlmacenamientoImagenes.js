/**
 * PATRÓN STRATEGY (comportamiento, GoF) — interfaz de la estrategia.
 *
 * Dónde se guardan las imágenes de los insumos depende del entorno: en
 * desarrollo alcanza con el disco local; en producción (Render) el disco es
 * efímero y se borra en cada despliegue, así que se usa Supabase Storage.
 * El controller trabaja contra esta interfaz y no sabe cuál está activa.
 */
class AlmacenamientoImagenes {
  get nombre() {
    return this.constructor.name;
  }

  /**
   * Guarda la imagen de un insumo y borra las anteriores de ese insumo.
   * @param {number|string} idInsumo
   * @param {{ buffer: Buffer, extension: string, mimetype: string }} archivo
   * @returns {Promise<string>} URL con la que el cliente puede mostrar la imagen
   */
  // eslint-disable-next-line no-unused-vars
  async guardar(idInsumo, archivo) {
    throw new Error(`${this.nombre} no implementa guardar()`);
  }
}

module.exports = AlmacenamientoImagenes;
