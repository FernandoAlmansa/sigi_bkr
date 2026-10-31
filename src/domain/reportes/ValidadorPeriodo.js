const PeriodoAnalisis = require('./PeriodoAnalisis');
const { esFechaValida, hoyEnTaller } = require('./fechas');
const { ErrorPeriodoInvalido } = require('../errores');

/**
 * RD06 (validez del análisis) — CU-09 Validar período de análisis.
 * El período es válido si desde <= hasta y hasta no es posterior a hoy.
 * Si no lo es, el reporte se rechaza antes de recuperar ningún dato (flujo A1).
 */
class ValidadorPeriodo {
  /** @param {() => string} hoy  fecha actual AAAA-MM-DD (inyectable en las pruebas) */
  constructor(hoy = hoyEnTaller) {
    this.hoy = hoy;
  }

  validar(desde, hasta) {
    this._fechaPresente(desde, 'desde');
    this._fechaPresente(hasta, 'hasta');

    if (hasta > this.hoy()) {
      throw new ErrorPeriodoInvalido('La fecha hasta no puede ser futura.', 'hasta');
    }
    if (desde > hasta) {
      throw new ErrorPeriodoInvalido('La fecha desde es posterior a la fecha hasta.', 'desde');
    }
    return new PeriodoAnalisis(desde, hasta);
  }

  _fechaPresente(valor, campo) {
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      throw new ErrorPeriodoInvalido(`Completá la fecha ${campo}.`, campo);
    }
    if (!esFechaValida(String(valor))) {
      throw new ErrorPeriodoInvalido(`La fecha ${campo} no es válida.`, campo);
    }
  }
}

module.exports = ValidadorPeriodo;
