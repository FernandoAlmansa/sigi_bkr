const db = require('./db');

class TipoInsumoRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  async listar() {
    const { rows } = await this.db.query('SELECT * FROM tipos_insumo ORDER BY nombre');
    return rows;
  }

  async existe(id) {
    const { rows } = await this.db.query('SELECT 1 FROM tipos_insumo WHERE id = $1', [id]);
    return rows.length > 0;
  }
}

module.exports = TipoInsumoRepository;
