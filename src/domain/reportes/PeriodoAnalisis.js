const { diasEntre } = require('./fechas');

/**
 * Rango de fechas sobre el que se analiza el consumo. Su extensión en días
 * es el divisor del promedio diario. Sólo lo crea ValidadorPeriodo (RD06).
 */
class PeriodoAnalisis {
  constructor(desde, hasta) {
    this.desde = desde;
    this.hasta = hasta;
    this.cantidadDias = diasEntre(desde, hasta);
    Object.freeze(this);
  }
}

module.exports = PeriodoAnalisis;
