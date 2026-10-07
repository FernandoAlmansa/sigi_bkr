const db = require('./db');
const Movimiento = require('../domain/Movimiento');

class MovimientoRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  async registrar({
    id_insumo, tipo, cantidad, stockResultante, observacion, usuario,
    presentacion = null, cantidadPresentacion = null,
  }, client) {
    const { rows } = await this._q(client)(
      `INSERT INTO movimientos_stock
         (id_insumo, tipo_movimiento, cantidad, stock_resultante, observacion, usuario,
          presentacion, cantidad_presentacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id_insumo, tipo, cantidad, stockResultante, observacion || null, usuario,
        presentacion, cantidadPresentacion],
    );
    return Movimiento.desdeFila(rows[0]);
  }

  async listar({ id_insumo, tipo, desde, hasta, limit = 50, offset = 0 } = {}, client) {
    const condiciones = [];
    const params = [];

    if (id_insumo) {
      params.push(id_insumo);
      condiciones.push(`m.id_insumo = $${params.length}`);
    }
    if (tipo) {
      params.push(String(tipo).toUpperCase());
      condiciones.push(`m.tipo_movimiento = $${params.length}`);
    }
    if (desde) {
      params.push(desde);
      condiciones.push(`m.fecha >= $${params.length}`);
    }
    if (hasta) {
      params.push(hasta);
      condiciones.push(`m.fecha <= $${params.length}`);
    }

    params.push(Math.min(Number(limit) || 50, 500));
    const sqlLimit = `$${params.length}`;
    params.push(Math.max(Number(offset) || 0, 0));
    const sqlOffset = `$${params.length}`;

    const { rows } = await this._q(client)(
      `SELECT m.*, i.nombre AS insumo_nombre, i.unidad_medida
       FROM movimientos_stock m
       JOIN insumos i ON i.id = m.id_insumo
       ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
       ORDER BY m.fecha DESC, m.id DESC
       LIMIT ${sqlLimit} OFFSET ${sqlOffset}`,
      params,
    );
    return rows.map(Movimiento.desdeFila);
  }
}

module.exports = MovimientoRepository;
