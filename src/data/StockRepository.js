const db = require('./db');

/**
 * Stock actual de los insumos activos del alcance (CU-07 incluido en el
 * CU-08): el historial dice cuánto se movió, no cuánto queda. En este modelo
 * el stock es la columna insumos.stock_actual, que sólo cambia por movimientos.
 */
class StockRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  async obtenerStockActual(idTipo = null, client) {
    const params = [];
    let filtroTipo = '';
    if (idTipo) {
      params.push(idTipo);
      filtroTipo = `AND i.id_tipo = $${params.length}`;
    }
    const { rows } = await this._q(client)(
      `SELECT i.id AS id_insumo, i.nombre, i.unidad_medida, i.stock_actual, t.nombre AS tipo_nombre
       FROM insumos i
       JOIN tipos_insumo t ON t.id = i.id_tipo
       WHERE i.activo ${filtroTipo}
       ORDER BY i.nombre`,
      params,
    );
    return rows.map((r) => ({ ...r, stock_actual: Number(r.stock_actual) }));
  }
}

module.exports = StockRepository;
