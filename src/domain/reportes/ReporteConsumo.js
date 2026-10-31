const { EstadoCobertura } = require('./enumeraciones');

/**
 * Resultado completo de un análisis de consumo. Conserva con qué período,
 * alcance, umbrales y orden se generó, para que dos reportes sean comparables.
 */
class ReporteConsumo {
  constructor({
    id = null, fechaGeneracion = null, periodo, idTipo = null, tipoNombre = null,
    criterioOrden, umbral, solicitante = 'Sistema', lineas = [],
  }) {
    this.id = id;
    this.fechaGeneracion = fechaGeneracion;
    this.periodo = periodo;
    this.idTipo = idTipo;
    this.tipoNombre = tipoNombre;
    this.criterioOrden = criterioOrden;
    this.umbral = umbral;
    this.solicitante = solicitante;
    this.lineas = lineas;
  }

  get cantidadCriticos() {
    return this.lineas.filter((l) => l.estado === EstadoCobertura.CRITICA).length;
  }

  /** Cantidad de líneas por estado, para el resumen al pie. */
  get conteoPorEstado() {
    const conteo = Object.fromEntries(Object.values(EstadoCobertura).map((e) => [e, 0]));
    this.lineas.forEach((l) => { conteo[l.estado] += 1; });
    return conteo;
  }
}

module.exports = ReporteConsumo;
