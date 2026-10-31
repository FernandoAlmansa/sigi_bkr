const LineaConsumo = require('./LineaConsumo');

/**
 * RD04 — Composición del consumo.
 * Recibe sólo egresos (MovimientoRepository.obtenerEgresos ya filtró por tipo
 * EGRESO, así que ingresos y ajustes nunca llegan acá) y arma una línea por
 * insumo activo del alcance. Parte de los insumos y no de los egresos: un
 * insumo sin egresos tiene que aparecer igual, con consumo cero (flujo A3).
 */
class CalculadorConsumo {
  /**
   * @param {{id_insumo:number, cantidad:number}[]} egresos  del período y alcance
   * @param {{id_insumo, nombre, unidad_medida, tipo_nombre, stock_actual}[]} stocks  insumos activos del alcance
   * @param {import('./PeriodoAnalisis')} periodo
   */
  calcularLineas(egresos, stocks, periodo) {
    const porInsumo = this._agruparPorInsumo(egresos);
    return stocks.map((s) => {
      const { total, cantidad } = porInsumo.get(Number(s.id_insumo)) || { total: 0, cantidad: 0 };
      return new LineaConsumo({
        idInsumo: Number(s.id_insumo),
        nombre: s.nombre,
        unidad: s.unidad_medida,
        tipoNombre: s.tipo_nombre,
        consumoTotal: total,
        cantidadEgresos: cantidad,
        promedioDiario: total / periodo.cantidadDias,
        stockAlGenerar: Number(s.stock_actual),
      });
    });
  }

  _agruparPorInsumo(egresos) {
    const mapa = new Map();
    egresos.forEach((e) => {
      const id = Number(e.id_insumo);
      const acum = mapa.get(id) || { total: 0, cantidad: 0 };
      // Se suma en milésimas (la base guarda 3 decimales) para no arrastrar error de coma flotante.
      acum.total = Math.round((acum.total + Number(e.cantidad)) * 1000) / 1000;
      acum.cantidad += 1;
      mapa.set(id, acum);
    });
    return mapa;
  }
}

module.exports = CalculadorConsumo;
