const { CriterioOrden } = require('./enumeraciones');
const { ErrorValidacion } = require('../errores');

/**
 * Parámetros de la consulta en un solo objeto: fechas, tipo de insumo
 * opcional y criterio de orden. Las fechas las valida ValidadorPeriodo (RD06);
 * acá sólo se controla que el tipo y el criterio estén bien formados.
 */
class FiltroReporte {
  constructor({ desde, hasta, id_tipo, orden } = {}) {
    this.fechaDesde = desde === undefined ? '' : String(desde).trim();
    this.fechaHasta = hasta === undefined ? '' : String(hasta).trim();
    this.idTipoInsumo = FiltroReporte._tipo(id_tipo);
    this.criterioOrden = FiltroReporte._orden(orden);
  }

  static _tipo(valor) {
    if (valor === undefined || valor === null || valor === '') return null; // todos los tipos
    const id = Number(valor);
    if (!Number.isInteger(id) || id < 1) throw new ErrorValidacion('El tipo de insumo no existe.');
    return id;
  }

  static _orden(valor) {
    if (valor === undefined || valor === null || valor === '') return CriterioOrden.CRITICIDAD;
    const criterio = String(valor).toUpperCase();
    if (!Object.values(CriterioOrden).includes(criterio)) {
      throw new ErrorValidacion(`Criterio de orden inválido: ${valor}. Válidos: criticidad, consumo o nombre.`);
    }
    return criterio;
  }
}

module.exports = FiltroReporte;
