const db = require('../data/db');
const MovimientoRepository = require('../data/MovimientoRepository');
const StockRepository = require('../data/StockRepository');
const UmbralRepository = require('../data/UmbralRepository');
const ReporteRepository = require('../data/ReporteRepository');
const TipoInsumoRepository = require('../data/TipoInsumoRepository');
const FiltroReporte = require('../domain/reportes/FiltroReporte');
const ValidadorPeriodo = require('../domain/reportes/ValidadorPeriodo');
const CalculadorConsumo = require('../domain/reportes/CalculadorConsumo');
const ClasificadorCobertura = require('../domain/reportes/ClasificadorCobertura');
const ReporteConsumo = require('../domain/reportes/ReporteConsumo');
const UmbralCobertura = require('../domain/reportes/UmbralCobertura');
const { FormatoExportacion } = require('../domain/reportes/enumeraciones');
const { estrategiasDeOrden } = require('../domain/strategies/orden');
const DirectorReporte = require('../domain/builders/reporte/DirectorReporte');
const ConstructorVistaPantalla = require('../domain/builders/reporte/ConstructorVistaPantalla');
const ConstructorPDF = require('../domain/builders/reporte/ConstructorPDF');
const ConstructorPlanilla = require('../domain/builders/reporte/ConstructorPlanilla');
const { ErrorValidacion, ErrorNoEncontrado, ErrorReglaNegocio } = require('../domain/errores');

/** Constructor (Builder) y metadatos de archivo por formato de exportación. */
const EXPORTACIONES = {
  [FormatoExportacion.PDF]: { Constructor: ConstructorPDF, extension: 'pdf', tipo: 'application/pdf' },
  [FormatoExportacion.PLANILLA]: { Constructor: ConstructorPlanilla, extension: 'csv', tipo: 'text/csv; charset=utf-8' },
};

/**
 * PATRÓN FACADE (estructural, GoF) — módulo de reportes de la iteración 3.
 *
 * Único punto de entrada al subsistema de reportes: el controlador sólo
 * conoce estas cuatro operaciones y no sabe que existen el validador, el
 * calculador, el clasificador, las estrategias de orden, el director ni los
 * repositorios. Además es el contexto del Strategy de orden y el cliente del
 * Builder (elige el constructor según la operación).
 */
class FachadaReportes {
  constructor({
    validador = new ValidadorPeriodo(),
    calculador = new CalculadorConsumo(),
    clasificador = new ClasificadorCobertura(),
    director = new DirectorReporte(),
    estrategiasOrden = estrategiasDeOrden(),
    umbrales = new UmbralRepository(),
    movimientos = new MovimientoRepository(),
    stocks = new StockRepository(),
    reportes = new ReporteRepository(),
    tipos = new TipoInsumoRepository(),
    transacciones = db.enTransaccion,
  } = {}) {
    this.validador = validador;
    this.calculador = calculador;
    this.clasificador = clasificador;
    this.director = director;
    this.estrategiasOrden = estrategiasOrden;
    this.umbrales = umbrales;
    this.movimientos = movimientos;
    this.stocks = stocks;
    this.reportes = reportes;
    this.tipos = tipos;
    this.enTransaccion = transacciones;
  }

  /** CU-08: genera, guarda y devuelve la vista del reporte (tabla + serie del gráfico). */
  async generarReporteConsumo(datosFiltro, solicitante = 'Sistema') {
    const filtro = new FiltroReporte(datosFiltro);
    // RD06 / CU-09: si el período es inválido, no se consulta nada (flujo A1).
    const periodo = this.validador.validar(filtro.fechaDesde, filtro.fechaHasta);

    let tipoNombre = null;
    if (filtro.idTipoInsumo) {
      const tipo = await this.tipos.obtenerPorId(filtro.idTipoInsumo);
      if (!tipo) throw new ErrorValidacion('El tipo de insumo no existe.');
      tipoNombre = tipo.nombre;
    }

    const umbral = await this.umbrales.obtenerVigente();
    if (!umbral) throw new ErrorReglaNegocio('No hay umbrales de cobertura definidos.');

    const [egresos, stocks] = await Promise.all([
      this.movimientos.obtenerEgresos(periodo, filtro.idTipoInsumo),
      this.stocks.obtenerStockActual(filtro.idTipoInsumo), // «include» CU-07
    ]);
    if (!stocks.length) {
      throw new ErrorReglaNegocio('No hay insumos activos en ese tipo para analizar.');
    }

    const lineas = this.calculador.calcularLineas(egresos, stocks, periodo);
    lineas.forEach((linea) => this.clasificador.clasificar(linea, umbral));
    const ordenadas = this._seleccionarOrden(filtro.criterioOrden).ordenar(lineas);

    const reporte = new ReporteConsumo({
      periodo,
      idTipo: filtro.idTipoInsumo,
      tipoNombre,
      criterioOrden: filtro.criterioOrden,
      umbral,
      solicitante: FachadaReportes._solicitante(solicitante),
      lineas: ordenadas,
    });
    const guardado = await this.enTransaccion((client) => this.reportes.guardar(reporte, client));
    reporte.id = guardado.id;
    reporte.fechaGeneracion = guardado.fecha_generacion;

    const constructor = new ConstructorVistaPantalla();
    this.director.construir(reporte, constructor);
    return constructor.obtenerResultado();
  }

  /** CU-10: arma el archivo de un reporte ya generado con el constructor del formato pedido. */
  async exportarReporte(idReporte, formato) {
    const exportacion = EXPORTACIONES[String(formato || '').toUpperCase()];
    if (!exportacion) throw new ErrorValidacion('Formato de exportación inválido. Válidos: pdf o planilla.');
    const id = Number(idReporte);
    const reporte = Number.isInteger(id) && id > 0 ? await this.reportes.obtener(id) : null;
    if (!reporte) throw new ErrorNoEncontrado('Reporte');

    const constructor = new exportacion.Constructor();
    this.director.construir(reporte, constructor);
    const contenido = await constructor.obtenerResultado();
    return {
      contenido,
      tipo: exportacion.tipo,
      nombre: `reporte-consumo_${reporte.periodo.desde}_al_${reporte.periodo.hasta}.${exportacion.extension}`,
    };
  }

  /** CU-11 */
  async obtenerUmbralVigente() {
    const umbral = await this.umbrales.obtenerVigente();
    if (!umbral) throw new ErrorNoEncontrado('Umbral de cobertura');
    return umbral;
  }

  /** CU-11: los reportes ya generados conservan los umbrales con que se clasificaron. */
  async actualizarUmbrales(datos, definidoPor = 'Sistema') {
    const nuevo = UmbralCobertura.crear(datos || {}, FachadaReportes._solicitante(definidoPor));
    return this.enTransaccion((client) => this.umbrales.reemplazarVigente(nuevo, client));
  }

  _seleccionarOrden(criterio) {
    const estrategia = this.estrategiasOrden.get(criterio);
    if (!estrategia) throw new ErrorValidacion(`Criterio de orden inválido: ${criterio}.`);
    return estrategia;
  }

  static _solicitante(valor) {
    return String(valor || '').trim().slice(0, 60) || 'Sistema';
  }
}

module.exports = FachadaReportes;
