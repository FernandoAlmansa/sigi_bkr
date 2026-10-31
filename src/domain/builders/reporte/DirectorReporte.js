/**
 * PATRÓN BUILDER (creacional, GoF) — Director.
 * Define una sola vez el orden de armado del reporte (encabezado, líneas,
 * gráfico y resumen) y lo ejecuta sobre cualquier IConstructorReporte.
 * Un formato nuevo se resuelve con otro constructor, sin tocar esta clase.
 */
class DirectorReporte {
  /**
   * @param {import('../../reportes/ReporteConsumo')} reporte
   * @param {import('./IConstructorReporte')} constructor
   */
  construir(reporte, constructor) {
    constructor.construirEncabezado(reporte);
    reporte.lineas.forEach((linea) => constructor.construirLinea(linea));
    constructor.construirGrafico(reporte.lineas, reporte.umbral);
    constructor.construirResumen(reporte);
  }
}

module.exports = DirectorReporte;
