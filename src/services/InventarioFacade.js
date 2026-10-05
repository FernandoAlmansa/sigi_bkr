const db = require('../data/db');
const InsumoRepository = require('../data/InsumoRepository');
const MovimientoRepository = require('../data/MovimientoRepository');
const TipoInsumoRepository = require('../data/TipoInsumoRepository');
const AlertaService = require('./AlertaService');
const InsumoBuilder = require('../domain/builders/InsumoBuilder');
const { obtenerStrategy } = require('../domain/strategies');
const { ErrorNoEncontrado, ErrorValidacion } = require('../domain/errores');

/**
 * PATRÓN FACADE (estructural, GoF).
 *
 * Punto de entrada único al subsistema de inventario. Los controllers
 * (capa de presentación) hablan solamente con esta clase y desconocen
 * repositorios, transacciones, estrategias y notificadores.
 * Esto es lo que permite reusar el mismo caso de uso desde otra interfaz
 * —un job programado, una CLI o un futuro endpoint de importación— sin
 * duplicar reglas de negocio.
 */
class InventarioFacade {
  constructor({
    insumos = new InsumoRepository(),
    movimientos = new MovimientoRepository(),
    tipos = new TipoInsumoRepository(),
    alertas = AlertaService.porDefecto(),
    transacciones = db.enTransaccion,
  } = {}) {
    this.insumos = insumos;
    this.movimientos = movimientos;
    this.tipos = tipos;
    this.alertas = alertas;
    this.enTransaccion = transacciones;
  }

  // ---------- Catálogo ----------

  listarTipos() {
    return this.tipos.listar();
  }

  listarInsumos(filtros) {
    return this.insumos.listar(filtros);
  }

  async obtenerInsumo(id) {
    const insumo = await this.insumos.obtenerPorId(id);
    if (!insumo) throw new ErrorNoEncontrado('Insumo');
    return insumo;
  }

  async altaInsumo(body) {
    const insumo = InsumoBuilder.desdeBody(body).build();
    if (!(await this.tipos.existe(insumo.id_tipo))) {
      throw new ErrorValidacion('El tipo de insumo indicado no existe.');
    }
    const creado = await this.insumos.crear(insumo);
    return this.insumos.obtenerPorId(creado.id);
  }

  async modificarInsumo(id, body) {
    const campos = InsumoBuilder.desdeBody(body).buildParcial();
    if (campos.id_tipo && !(await this.tipos.existe(campos.id_tipo))) {
      throw new ErrorValidacion('El tipo de insumo indicado no existe.');
    }
    const actualizado = await this.insumos.actualizar(id, campos);
    if (!actualizado) throw new ErrorNoEncontrado('Insumo');
    return this.insumos.obtenerPorId(id);
  }

  async bajaInsumo(id) {
    const dado = await this.insumos.darDeBaja(id);
    if (!dado) throw new ErrorNoEncontrado('Insumo');
    return { mensaje: 'Insumo dado de baja correctamente.', id: Number(id) };
  }

  async asignarImagen(id, imagenUrl) {
    const actualizado = await this.insumos.actualizar(id, { imagen_url: imagenUrl });
    if (!actualizado) throw new ErrorNoEncontrado('Insumo');
    return { id: actualizado.id, imagen_url: actualizado.imagen_url };
  }

  // ---------- Movimientos (flujo core) ----------

  /**
   * Caso de uso central: registrar un movimiento de stock.
   *
   * 1. Abre transacción y bloquea la fila del insumo (FOR UPDATE).
   * 2. Delega el cálculo y las reglas en la Strategy del tipo pedido.
   * 3. Actualiza el stock y asienta el movimiento en el historial.
   * 4. Commitea y recién ahí dispara las alertas (RD02), fuera de la
   *    transacción: un SMTP lento no puede bloquear un lock de base.
   */
  async registrarMovimiento(tipo, { id_insumo, cantidad, observacion, usuario } = {}) {
    const strategy = obtenerStrategy(tipo);

    if (!id_insumo) throw new ErrorValidacion('id_insumo es requerido.');
    const cantidadNum = Number(cantidad);

    const resultado = await this.enTransaccion(async (client) => {
      const insumo = await this.insumos.obtenerParaActualizar(id_insumo, client);
      if (!insumo) throw new ErrorNoEncontrado('Insumo');

      const estabaCritico = insumo.estado_critico;
      const asiento = strategy.aplicar(insumo, cantidadNum);

      await this.insumos.actualizarStock(insumo.id, asiento.stockResultante, client);
      const movimiento = await this.movimientos.registrar({
        id_insumo: insumo.id,
        tipo: asiento.tipo,
        cantidad: asiento.cantidad,
        stockResultante: asiento.stockResultante,
        observacion,
        usuario: usuario || strategy.usuarioPorDefecto,
      }, client);

      return { insumo, asiento, movimiento, estabaCritico };
    });

    const { insumo, asiento, movimiento, estabaCritico } = resultado;

    // RD02 — evaluación de alerta post-commit.
    this.alertas
      .evaluar({ insumo, stockResultante: asiento.stockResultante, estabaCritico })
      .catch((err) => console.error('[alerta] error inesperado:', err.message));

    return {
      mensaje: `${asiento.tipo.charAt(0)}${asiento.tipo.slice(1).toLowerCase()} registrado correctamente.`,
      insumo: insumo.nombre,
      nuevo_stock: asiento.stockResultante,
      unidad: insumo.unidad_medida,
      estado_critico: insumo.esCritico(asiento.stockResultante),
      movimiento_id: movimiento.id,
    };
  }

  listarMovimientos(filtros) {
    return this.movimientos.listar(filtros);
  }

  // ---------- Reportes ----------

  async resumenInventario() {
    const [resumen, criticos] = await Promise.all([
      this.insumos.resumen(),
      this.insumos.listar({ estado: 'critico' }),
    ]);
    return { ...resumen, insumos_criticos: criticos };
  }
}

module.exports = InventarioFacade;
