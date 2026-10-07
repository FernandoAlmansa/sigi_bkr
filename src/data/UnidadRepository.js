const db = require('./db');
const Unidad = require('../domain/Unidad');

const SELECT_BASE = `
  SELECT u.*,
         (SELECT COUNT(*) FROM insumos i WHERE i.unidad_medida = u.nombre)::int AS insumos,
         (SELECT COUNT(*) FROM tipos_insumo t WHERE t.unidad_base = u.nombre AND t.activo)::int AS categorias
  FROM unidades u
`;

/** Catálogo de unidades de medida (tabla `unidades`). */
class UnidadRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  async listar(client) {
    const { rows } = await this._q(client)(`${SELECT_BASE} ORDER BY u.nombre`);
    return rows.map(Unidad.desdeFila);
  }

  async obtenerPorId(id, client) {
    const { rows } = await this._q(client)(`${SELECT_BASE} WHERE u.id = $1`, [id]);
    return Unidad.desdeFila(rows[0]);
  }

  async existe(nombre, client) {
    const { rows } = await this._q(client)('SELECT 1 FROM unidades WHERE nombre = $1', [nombre]);
    return rows.length > 0;
  }

  async crear(nombre, client) {
    const { rows } = await this._q(client)('INSERT INTO unidades (nombre) VALUES ($1) RETURNING id', [nombre]);
    return rows[0].id;
  }

  /** El FK con ON UPDATE CASCADE propaga el nuevo nombre a insumos y categorías. */
  async renombrar(id, nombre, client) {
    await this._q(client)('UPDATE unidades SET nombre = $1 WHERE id = $2', [nombre, id]);
  }

  /** Pasa todo lo que usa `origen` a `destino` y borra `origen`. */
  async fusionar(origen, destino, client) {
    const q = this._q(client);
    await q('UPDATE insumos SET unidad_medida = $1 WHERE unidad_medida = $2', [destino, origen]);
    await q('UPDATE tipos_insumo SET unidad_base = $1 WHERE unidad_base = $2', [destino, origen]);
    await q('DELETE FROM unidades WHERE nombre = $1', [origen]);
  }

  async eliminar(id, client) {
    const { rowCount } = await this._q(client)('DELETE FROM unidades WHERE id = $1', [id]);
    return rowCount > 0;
  }

  /** Nombres de presentaciones ya usados, para sugerirlos y evitar "rollo"/"rolo". */
  async nombresPresentaciones(client) {
    const { rows } = await this._q(client)(
      `SELECT lower(nombre) AS nombre, COUNT(*)::int AS usos FROM presentaciones
       GROUP BY lower(nombre) ORDER BY usos DESC, nombre`,
    );
    return rows.map((r) => r.nombre);
  }
}

module.exports = UnidadRepository;
