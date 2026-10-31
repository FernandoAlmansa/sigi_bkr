/**
 * PATRÓN STRATEGY (comportamiento, GoF) — interfaz de los criterios de orden
 * del reporte de consumo. El contexto es FachadaReportes, que elige la
 * estrategia según el criterio que pidió la Dirección. Agregar un criterio
 * nuevo = agregar una clase, sin tocar la fachada.
 */
class IOrdenReporte {
  /** @returns {string} CriterioOrden que implementa */
  get criterio() {
    throw new Error('Cada estrategia de orden debe definir su criterio.');
  }

  /**
   * @param {import('../../reportes/LineaConsumo')[]} lineas
   * @returns {import('../../reportes/LineaConsumo')[]} una lista nueva, ordenada
   */
  ordenar() {
    throw new Error('Cada estrategia de orden debe implementar ordenar().');
  }

  /** Desempate común: por nombre, como en el resto del sistema. */
  static porNombre(a, b) {
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  }
}

module.exports = IOrdenReporte;
