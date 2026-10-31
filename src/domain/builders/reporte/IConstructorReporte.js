/**
 * PATRÓN BUILDER (creacional, GoF) — interfaz Builder del reporte de consumo.
 * Cada constructor concreto arma una representación distinta del mismo
 * reporte (pantalla, PDF, planilla) implementando estos pasos. El orden en
 * que se invocan lo fija DirectorReporte.
 */
class IConstructorReporte {
  /** Período, alcance y umbrales con que se clasificó. */
  construirEncabezado() {
    throw new Error('El constructor debe implementar construirEncabezado().');
  }

  /** Una fila por insumo. */
  construirLinea() {
    throw new Error('El constructor debe implementar construirLinea().');
  }

  /** Días de cobertura de los insumos con proyección, con los umbrales como referencia. */
  construirGrafico() {
    throw new Error('El constructor debe implementar construirGrafico().');
  }

  /** Totales al pie (insumos con cobertura crítica, etc.). */
  construirResumen() {
    throw new Error('El constructor debe implementar construirResumen().');
  }

  /** Producto terminado. Puede ser una promesa (el PDF se genera en un stream). */
  obtenerResultado() {
    throw new Error('El constructor debe implementar obtenerResultado().');
  }
}

module.exports = IConstructorReporte;
