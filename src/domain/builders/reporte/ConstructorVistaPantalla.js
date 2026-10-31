const IConstructorReporte = require('./IConstructorReporte');
const { ETIQUETA_ESTADO } = require('../../reportes/enumeraciones');

/**
 * Constructor concreto: VistaReporte para la pantalla (JSON). Trae la tabla y
 * la serie del gráfico ya calculadas, de modo que la pantalla sólo dibuja y
 * el gráfico refleja exactamente los mismos datos que la tabla.
 */
class ConstructorVistaPantalla extends IConstructorReporte {
  constructor() {
    super();
    this.vista = { id_reporte: null, generado_en: null, encabezado: null, lineas: [], grafico: null, resumen: null };
  }

  construirEncabezado(reporte) {
    this.vista.id_reporte = reporte.id;
    this.vista.generado_en = reporte.fechaGeneracion;
    this.vista.encabezado = {
      desde: reporte.periodo.desde,
      hasta: reporte.periodo.hasta,
      cantidad_dias: reporte.periodo.cantidadDias,
      id_tipo: reporte.idTipo,
      tipo: reporte.tipoNombre,
      criterio_orden: reporte.criterioOrden,
      umbral: reporte.umbral.toJSON(),
    };
  }

  construirLinea(linea) {
    this.vista.lineas.push({
      id_insumo: linea.idInsumo,
      nombre: linea.nombre,
      tipo: linea.tipoNombre,
      unidad: linea.unidad,
      consumo_total: linea.consumoTotal,
      cantidad_egresos: linea.cantidadEgresos,
      promedio_diario: linea.promedioDiario,
      stock_actual: linea.stockAlGenerar,
      dias_cobertura: linea.diasCobertura,
      estado: linea.estado,
      estado_texto: ETIQUETA_ESTADO[linea.estado],
    });
  }

  construirGrafico(lineas, umbral) {
    const conProyeccion = lineas.filter((l) => l.tieneProyeccion);
    this.vista.grafico = {
      umbrales: { criticidad: umbral.diasCriticidad, observacion: umbral.diasObservacion },
      serie: conProyeccion.map((l) => ({
        nombre: l.nombre, dias: l.diasCobertura, estado: l.estado, estado_texto: ETIQUETA_ESTADO[l.estado],
      })),
      sin_proyeccion: lineas.filter((l) => !l.tieneProyeccion).map((l) => ({
        nombre: l.nombre, estado: l.estado, estado_texto: ETIQUETA_ESTADO[l.estado],
      })),
    };
  }

  construirResumen(reporte) {
    this.vista.resumen = {
      total_insumos: reporte.lineas.length,
      criticos: reporte.cantidadCriticos,
      por_estado: reporte.conteoPorEstado,
    };
  }

  obtenerResultado() {
    return this.vista;
  }
}

module.exports = ConstructorVistaPantalla;
