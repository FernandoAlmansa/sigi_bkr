const db = require('./db');
const ReporteConsumo = require('../domain/reportes/ReporteConsumo');
const PeriodoAnalisis = require('../domain/reportes/PeriodoAnalisis');
const LineaConsumo = require('../domain/reportes/LineaConsumo');
const UmbralCobertura = require('../domain/reportes/UmbralCobertura');

// node-postgres devuelve DATE como Date en hora local; se pide como texto AAAA-MM-DD.
const SELECT_REPORTE = `
  SELECT r.id, r.fecha_generacion, r.fecha_desde::text AS fecha_desde, r.fecha_hasta::text AS fecha_hasta,
         r.criterio_orden, r.id_tipo, t.nombre AS tipo_nombre, r.solicitante,
         u.id AS umbral_id, u.dias_observacion, u.dias_criticidad, u.egresos_minimos,
         u.vigente_desde, u.definido_por
  FROM reporte_consumo r
  JOIN umbral_cobertura u ON u.id = r.id_umbral
  LEFT JOIN tipos_insumo t ON t.id = r.id_tipo
`;

/**
 * Reportes generados (reporte_consumo + linea_consumo). Guardarlos permite
 * exportar exactamente lo que se vio en pantalla y comparar reportes de un
 * mismo período.
 */
class ReporteRepository {
  constructor(ejecutor = db) {
    this.db = ejecutor;
  }

  _q(client) {
    return client ? client.query.bind(client) : this.db.query;
  }

  /**
   * Guarda el reporte y todas sus líneas. Las líneas van en un solo INSERT
   * (unnest de arreglos): con ~100 insumos, una consulta por línea sumaría
   * varios segundos de ida y vuelta entre Render y Supabase.
   * @returns {{id:number, fecha_generacion:Date}}
   */
  async guardar(reporte, client) {
    const q = this._q(client);
    const { rows } = await q(
      `INSERT INTO reporte_consumo
         (fecha_desde, fecha_hasta, cantidad_dias, criterio_orden, id_tipo, id_umbral, solicitante)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, fecha_generacion`,
      [reporte.periodo.desde, reporte.periodo.hasta, reporte.periodo.cantidadDias,
        reporte.criterioOrden, reporte.idTipo, reporte.umbral.id, reporte.solicitante],
    );
    const { id } = rows[0];
    const ls = reporte.lineas;
    await q(
      `INSERT INTO linea_consumo
         (id_reporte, orden, id_insumo, consumo_total, cantidad_egresos, promedio_diario,
          stock_al_generar, dias_cobertura, estado_cobertura)
       SELECT $1, o.orden, o.id_insumo, o.consumo, o.egresos, o.promedio, o.stock, o.dias, o.estado
       FROM unnest($2::int[], $3::int[], $4::numeric[], $5::int[], $6::numeric[], $7::numeric[], $8::numeric[], $9::text[])
            AS o(orden, id_insumo, consumo, egresos, promedio, stock, dias, estado)`,
      [id, ls.map((_, i) => i + 1), ls.map((l) => l.idInsumo), ls.map((l) => l.consumoTotal),
        ls.map((l) => l.cantidadEgresos), ls.map((l) => l.promedioDiario), ls.map((l) => l.stockAlGenerar),
        ls.map((l) => l.diasCobertura), ls.map((l) => l.estado)],
    );
    return rows[0];
  }

  /** Reconstruye un reporte guardado, con sus líneas en el orden en que se mostró. */
  async obtener(idReporte, client) {
    const q = this._q(client);
    const { rows } = await q(`${SELECT_REPORTE} WHERE r.id = $1`, [idReporte]);
    const r = rows[0];
    if (!r) return null;

    const lineas = await q(
      `SELECT l.*, i.nombre, i.unidad_medida, t.nombre AS tipo_nombre
       FROM linea_consumo l
       JOIN insumos i ON i.id = l.id_insumo
       JOIN tipos_insumo t ON t.id = i.id_tipo
       WHERE l.id_reporte = $1
       ORDER BY l.orden`,
      [idReporte],
    );

    return new ReporteConsumo({
      id: r.id,
      fechaGeneracion: r.fecha_generacion,
      periodo: new PeriodoAnalisis(r.fecha_desde, r.fecha_hasta),
      idTipo: r.id_tipo,
      tipoNombre: r.tipo_nombre,
      criterioOrden: r.criterio_orden,
      solicitante: r.solicitante,
      umbral: new UmbralCobertura({ ...r, id: r.umbral_id }),
      lineas: lineas.rows.map((l) => new LineaConsumo({
        idInsumo: l.id_insumo,
        nombre: l.nombre,
        unidad: l.unidad_medida,
        tipoNombre: l.tipo_nombre,
        consumoTotal: l.consumo_total,
        cantidadEgresos: l.cantidad_egresos,
        promedioDiario: l.promedio_diario,
        stockAlGenerar: l.stock_al_generar,
        diasCobertura: l.dias_cobertura,
        estado: l.estado_cobertura,
      })),
    });
  }
}

module.exports = ReporteRepository;
