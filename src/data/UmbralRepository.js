const db = require('./db');
const UmbralCobertura = require('../domain/reportes/UmbralCobertura');

/**
 * Umbrales de cobertura (tabla umbral_cobertura). Nunca se sobrescriben: la
 * fila con vigente_hasta nulo es la vigente, y al cambiarlos se cierra esa y
 * se crea otra. Así cada reporte queda ligado a los valores con que se clasificó.
 */
class UmbralRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  async obtenerVigente(client) {
    const { rows } = await this._q(client)(
      'SELECT * FROM umbral_cobertura WHERE vigente_hasta IS NULL',
    );
    return UmbralCobertura.desdeFila(rows[0]);
  }

  /** Debe correr dentro de una transacción: cierra el vigente y crea el nuevo. */
  async reemplazarVigente(nuevo, client) {
    const q = this._q(client);
    await q('UPDATE umbral_cobertura SET vigente_hasta = NOW() WHERE vigente_hasta IS NULL');
    const { rows } = await q(
      `INSERT INTO umbral_cobertura (dias_observacion, dias_criticidad, egresos_minimos, definido_por)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nuevo.diasObservacion, nuevo.diasCriticidad, nuevo.egresosMinimos, nuevo.definidoPor],
    );
    return UmbralCobertura.desdeFila(rows[0]);
  }
}

module.exports = UmbralRepository;
