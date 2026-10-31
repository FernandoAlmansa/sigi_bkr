const db = require('./db');
const Movimiento = require('../domain/Movimiento');
const { ZONA_TALLER } = require('../domain/reportes/fechas');

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

  /**
   * Set de datos del reporte de consumo. Los tres filtros van en la misma
   * consulta: sólo EGRESO (RD04: ingresos y ajustes no son consumo), fecha
   * dentro del período (días de Argentina, ambos extremos incluidos) y, si se
   * eligió, tipo de insumo. Sólo cuentan los insumos activos. Usa el índice
   * idx_movimiento_tipo_fecha (RNF05).
   */
  async obtenerEgresos(periodo, idTipo = null, client) {
    const params = [periodo.desde, periodo.hasta, ZONA_TALLER];
    let filtroTipo = '';
    if (idTipo) {
      params.push(idTipo);
      filtroTipo = `AND i.id_tipo = $${params.length}`;
    }
    const { rows } = await this._q(client)(
      `SELECT m.id_insumo, m.cantidad, m.fecha
       FROM movimientos_stock m
       JOIN insumos i ON i.id = m.id_insumo
       WHERE m.tipo_movimiento = 'EGRESO'
         AND m.fecha >= ($1::date)::timestamp AT TIME ZONE $3
         AND m.fecha <  ($2::date + 1)::timestamp AT TIME ZONE $3
         AND i.activo ${filtroTipo}`,
      params,
    );
    return rows.map((r) => ({ id_insumo: r.id_insumo, cantidad: Number(r.cantidad), fecha: r.fecha }));
  }
}

module.exports = MovimientoRepository;
