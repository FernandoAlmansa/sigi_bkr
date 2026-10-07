const db = require('./db');
const Categoria = require('../domain/Categoria');

const SELECT_BASE = `
  SELECT t.*,
         (SELECT COUNT(*) FROM insumos i WHERE i.id_tipo = t.id AND i.activo)::int AS cantidad_insumos
  FROM tipos_insumo t
`;

/** Acceso a datos de categorías de insumo (tabla tipos_insumo). */
class TipoInsumoRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  async listar(client) {
    const { rows } = await this._q(client)(`${SELECT_BASE} WHERE t.activo ORDER BY t.nombre`);
    return rows.map(Categoria.desdeFila);
  }

  async obtenerPorId(id, client) {
    const { rows } = await this._q(client)(`${SELECT_BASE} WHERE t.id = $1 AND t.activo`, [id]);
    return Categoria.desdeFila(rows[0]);
  }

  async existe(id, client) {
    const { rows } = await this._q(client)('SELECT 1 FROM tipos_insumo WHERE id = $1 AND activo', [id]);
    return rows.length > 0;
  }

  /** Busca por nombre (sin distinguir mayúsculas), incluidas las dadas de baja. */
  async buscarPorNombre(nombre, client) {
    const { rows } = await this._q(client)(
      `${SELECT_BASE} WHERE lower(t.nombre) = lower($1)`,
      [nombre],
    );
    return Categoria.desdeFila(rows[0]);
  }

  async crear(categoria, client) {
    const { rows } = await this._q(client)(
      `INSERT INTO tipos_insumo (nombre, campos, unidad_base, presentaciones)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [categoria.nombre, JSON.stringify(categoria.campos), categoria.unidad_base,
        JSON.stringify(categoria.presentaciones)],
    );
    return rows[0].id;
  }

  /** UPDATE dinámico sobre las columnas enviadas. `activo` permite reactivar. */
  async actualizar(id, campos, client) {
    const columnas = ['nombre', 'campos', 'unidad_base', 'presentaciones', 'activo'];
    const asignaciones = [];
    const params = [];
    for (const col of columnas) {
      if (campos[col] === undefined) continue;
      const valor = ['campos', 'presentaciones'].includes(col) ? JSON.stringify(campos[col]) : campos[col];
      params.push(valor);
      asignaciones.push(`${col} = $${params.length}`);
    }
    if (!asignaciones.length) return true;
    params.push(id);
    const { rowCount } = await this._q(client)(
      `UPDATE tipos_insumo SET ${asignaciones.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    return rowCount > 0;
  }

  /** Cantidad de insumos que referencian la categoría (activos y dados de baja). */
  async contarReferencias(id, client) {
    const { rows } = await this._q(client)(
      `SELECT COUNT(*) FILTER (WHERE activo)::int AS activos, COUNT(*)::int AS total
       FROM insumos WHERE id_tipo = $1`,
      [id],
    );
    return rows[0];
  }

  async eliminar(id, client) {
    const { rowCount } = await this._q(client)('DELETE FROM tipos_insumo WHERE id = $1', [id]);
    return rowCount > 0;
  }
}

module.exports = TipoInsumoRepository;
