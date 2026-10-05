const db = require('./db');
const Insumo = require('../domain/Insumo');

const SELECT_BASE = `
  SELECT i.*, t.nombre AS tipo_nombre
  FROM insumos i
  JOIN tipos_insumo t ON t.id = i.id_tipo
`;

/**
 * Capa de acceso a datos: es el único lugar del sistema que escribe SQL sobre
 * insumos. Cada método acepta un `client` opcional para poder participar de
 * una transacción abierta por la capa de servicio.
 */
class InsumoRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  async listar({ id_tipo, estado, busqueda } = {}, client) {
    const condiciones = ['i.activo = TRUE'];
    const params = [];

    if (id_tipo) {
      params.push(id_tipo);
      condiciones.push(`i.id_tipo = $${params.length}`);
    }
    if (estado === 'critico') condiciones.push('i.estado_critico = TRUE');
    if (estado === 'normal') condiciones.push('i.estado_critico = FALSE');
    if (busqueda) {
      params.push(`%${busqueda}%`);
      condiciones.push(`i.nombre ILIKE $${params.length}`);
    }

    const sql = `${SELECT_BASE} WHERE ${condiciones.join(' AND ')}
                 ORDER BY i.estado_critico DESC, i.nombre ASC`;
    const { rows } = await this._q(client)(sql, params);
    return rows.map(Insumo.desdeFila);
  }

  async obtenerPorId(id, client) {
    const { rows } = await this._q(client)(`${SELECT_BASE} WHERE i.id = $1 AND i.activo = TRUE`, [id]);
    return Insumo.desdeFila(rows[0]);
  }

  /**
   * Lee el insumo bloqueando la fila hasta el fin de la transacción.
   * Evita que dos egresos simultáneos lean el mismo stock y lo dejen negativo.
   */
  async obtenerParaActualizar(id, client) {
    const { rows } = await client.query(
      'SELECT * FROM insumos WHERE id = $1 AND activo = TRUE FOR UPDATE',
      [id],
    );
    return Insumo.desdeFila(rows[0]);
  }

  async crear(insumo, client) {
    const { rows } = await this._q(client)(
      `INSERT INTO insumos (nombre, id_tipo, unidad_medida, stock_actual, stock_minimo, estado_critico, atributos)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [insumo.nombre, insumo.id_tipo, insumo.unidad_medida, insumo.stock_actual,
        insumo.stock_minimo, insumo.estado_critico, JSON.stringify(insumo.atributos)],
    );
    return Insumo.desdeFila(rows[0]);
  }

  /** UPDATE dinámico: sólo toca las columnas realmente enviadas. */
  async actualizar(id, campos, client) {
    const asignaciones = [];
    const params = [];
    // PostgreSQL evalúa todas las expresiones del SET contra la fila VIEJA,
    // así que el estado crítico se recalcula contra los valores entrantes.
    let expStockActual = 'stock_actual';
    let expStockMinimo = 'stock_minimo';

    for (const [columna, valor] of Object.entries(campos)) {
      params.push(columna === 'atributos' ? JSON.stringify(valor) : valor);
      asignaciones.push(`${columna} = $${params.length}`);
      if (columna === 'stock_actual') expStockActual = `$${params.length}`;
      if (columna === 'stock_minimo') expStockMinimo = `$${params.length}`;
    }
    asignaciones.push(`estado_critico = (${expStockActual} <= ${expStockMinimo})`);
    params.push(id);

    const { rows } = await this._q(client)(
      `UPDATE insumos SET ${asignaciones.join(', ')} WHERE id = $${params.length} AND activo = TRUE RETURNING *`,
      params,
    );
    return Insumo.desdeFila(rows[0]);
  }

  async actualizarStock(id, nuevoStock, client) {
    const { rows } = await this._q(client)(
      `UPDATE insumos SET stock_actual = $1, estado_critico = ($1 <= stock_minimo)
       WHERE id = $2 RETURNING *`,
      [nuevoStock, id],
    );
    return Insumo.desdeFila(rows[0]);
  }

  /** Baja lógica: el insumo deja de listarse pero conserva su historial. */
  async darDeBaja(id, client) {
    const { rows } = await this._q(client)(
      'UPDATE insumos SET activo = FALSE WHERE id = $1 AND activo = TRUE RETURNING id',
      [id],
    );
    return rows.length > 0;
  }

  async resumen(client) {
    const { rows } = await this._q(client)(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estado_critico)::int AS criticos,
              COUNT(DISTINCT id_tipo)::int AS tipos
       FROM insumos WHERE activo = TRUE`,
    );
    return rows[0];
  }
}

module.exports = InsumoRepository;
