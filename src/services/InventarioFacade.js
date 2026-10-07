const db = require('../data/db');
const InsumoRepository = require('../data/InsumoRepository');
const MovimientoRepository = require('../data/MovimientoRepository');
const TipoInsumoRepository = require('../data/TipoInsumoRepository');
const UnidadRepository = require('../data/UnidadRepository');
const Unidad = require('../domain/Unidad');
const AlertaService = require('./AlertaService');
const InsumoBuilder = require('../domain/builders/InsumoBuilder');
const CategoriaBuilder = require('../domain/builders/CategoriaBuilder');
const { obtenerStrategy } = require('../domain/strategies');
const { ErrorNoEncontrado, ErrorValidacion, ErrorReglaNegocio } = require('../domain/errores');

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
    unidades = new UnidadRepository(),
    alertas = AlertaService.porDefecto(),
    transacciones = db.enTransaccion,
  } = {}) {
    this.insumos = insumos;
    this.movimientos = movimientos;
    this.tipos = tipos;
    this.unidades = unidades;
    this.alertas = alertas;
    this.enTransaccion = transacciones;
  }

  // ---------- Unidades de medida ----------

  listarUnidades() {
    return this.unidades.listar();
  }

  nombresPresentaciones() {
    return this.unidades.nombresPresentaciones();
  }

  async _unidadValida(nombre) {
    if (!nombre) return;
    if (!(await this.unidades.existe(nombre))) {
      throw new ErrorValidacion(`La unidad "${nombre}" no existe. Agregala en Categorías → Unidades de medida.`);
    }
  }

  async altaUnidad({ nombre, forzar = false } = {}) {
    const n = Unidad.validarNombre(nombre);
    Unidad.verificarNoParecida(n, await this.unidades.listar(), forzar);
    const id = await this.unidades.crear(n);
    return this.unidades.obtenerPorId(id);
  }

  /**
   * Renombra una unidad (el cambio llega a todos los insumos por el FK). Si el
   * nombre nuevo ya existe y se pide `fusionar`, se unifican: todo lo que usaba
   * la vieja pasa a la existente. Sirve para corregir "metor" → "metros".
   */
  async modificarUnidad(id, { nombre, forzar = false, fusionar = false } = {}) {
    const unidad = await this.unidades.obtenerPorId(id);
    if (!unidad) throw new ErrorNoEncontrado('Unidad');
    const n = Unidad.validarNombre(nombre);
    if (n === unidad.nombre) return unidad;

    const otras = (await this.unidades.listar()).filter((u) => u.id !== unidad.id);
    const destino = otras.find((u) => u.nombre === n);
    if (destino) {
      if (!fusionar) {
        throw new ErrorReglaNegocio(
          `Ya existe la unidad "${destino.nombre}". Si son la misma, se pueden unificar: los ${unidad.insumos} insumo(s) en "${unidad.nombre}" pasan a "${destino.nombre}".`,
          { destino: destino.nombre, insumos: unidad.insumos },
          'UNIDAD_EXISTENTE',
        );
      }
      await this.enTransaccion((client) => this.unidades.fusionar(unidad.nombre, destino.nombre, client));
      return this.unidades.obtenerPorId(destino.id);
    }

    Unidad.verificarNoParecida(n, otras, forzar);
    await this.unidades.renombrar(id, n);
    return this.unidades.obtenerPorId(id);
  }

  async bajaUnidad(id) {
    const unidad = await this.unidades.obtenerPorId(id);
    if (!unidad) throw new ErrorNoEncontrado('Unidad');
    if (unidad.insumos > 0) {
      throw new ErrorReglaNegocio(
        `La unidad "${unidad.nombre}" la usan ${unidad.insumos} insumo(s). Si es un duplicado, renombrala con el nombre correcto para unificarlas.`,
        { insumos: unidad.insumos },
        'UNIDAD_EN_USO',
      );
    }
    await this.unidades.eliminar(id);
    return { mensaje: `Unidad "${unidad.nombre}" eliminada.`, id: Number(id) };
  }

  // ---------- Categorías ----------

  listarTipos() {
    return this.tipos.listar();
  }

  async obtenerCategoria(id) {
    const categoria = await this.tipos.obtenerPorId(id);
    if (!categoria) throw new ErrorNoEncontrado('Categoría');
    return categoria;
  }

  async altaCategoria(body) {
    const categoria = CategoriaBuilder.desdeBody(body).build();
    await this._unidadValida(categoria.unidad_base);
    const existente = await this.tipos.buscarPorNombre(categoria.nombre);
    if (existente?.activo) {
      throw new ErrorReglaNegocio(`Ya existe la categoría "${existente.nombre}".`, {}, 'DUPLICADO');
    }
    // Si existía dada de baja, se reactiva con la nueva definición
    // (el nombre es UNIQUE y puede tener insumos históricos asociados).
    let id;
    if (existente) {
      await this.tipos.actualizar(existente.id, { ...categoria.toJSON(), id: undefined, activo: true });
      id = existente.id;
    } else {
      id = await this.tipos.crear(categoria);
    }
    return this.tipos.obtenerPorId(id);
  }

  async modificarCategoria(id, body) {
    await this.obtenerCategoria(id);
    const campos = CategoriaBuilder.desdeBody(body).buildParcial();
    await this._unidadValida(campos.unidad_base);
    if (campos.nombre) {
      const otra = await this.tipos.buscarPorNombre(campos.nombre);
      if (otra && otra.id !== Number(id)) {
        throw new ErrorReglaNegocio(`Ya existe la categoría "${otra.nombre}".`, {}, 'DUPLICADO');
      }
    }
    await this.tipos.actualizar(id, campos);
    return this.tipos.obtenerPorId(id);
  }

  /**
   * Una categoría con insumos activos no se puede borrar. Si sólo tiene
   * insumos dados de baja, se da de baja ella también (para no perder el
   * historial); si no tiene ninguno, se elimina.
   */
  async bajaCategoria(id) {
    const categoria = await this.obtenerCategoria(id);
    const { activos, total } = await this.tipos.contarReferencias(id);
    if (activos > 0) {
      throw new ErrorReglaNegocio(
        `La categoría "${categoria.nombre}" tiene ${activos} insumo(s) activo(s). Movelos a otra categoría o dalos de baja primero.`,
        { insumos_activos: activos },
        'CATEGORIA_CON_INSUMOS',
      );
    }
    if (total > 0) await this.tipos.actualizar(id, { activo: false });
    else await this.tipos.eliminar(id);
    return { mensaje: `Categoría "${categoria.nombre}" eliminada.`, id: Number(id) };
  }

  // ---------- Insumos ----------

  listarInsumos(filtros) {
    return this.insumos.listar(filtros);
  }

  async obtenerInsumo(id) {
    const insumo = await this.insumos.obtenerPorId(id);
    if (!insumo) throw new ErrorNoEncontrado('Insumo');
    return insumo;
  }

  async _categoriaValida(idTipo) {
    const categoria = await this.tipos.obtenerPorId(idTipo);
    if (!categoria) throw new ErrorValidacion('La categoría indicada no existe.');
    return categoria;
  }

  /**
   * Alta de insumo. Lo que el cliente no informe se completa con lo que
   * sugiere la categoría (unidad base y presentaciones), y las
   * características se validan contra los campos que define la categoría.
   */
  async altaInsumo(body = {}) {
    const categoria = Number.isInteger(Number(body.id_tipo)) && Number(body.id_tipo) > 0
      ? await this._categoriaValida(body.id_tipo)
      : null;

    const conDefaults = {
      ...body,
      unidad_medida: body.unidad_medida || categoria?.unidad_base || undefined,
      presentaciones: body.presentaciones ?? categoria?.presentaciones ?? [],
    };
    const insumo = InsumoBuilder.desdeBody(conDefaults).build();
    insumo.atributos = categoria.validarAtributos(insumo.atributos);
    await this._unidadValida(insumo.unidad_medida);

    const id = await this.enTransaccion(async (client) => {
      const creado = await this.insumos.crear(insumo, client);
      await this.insumos.reemplazarPresentaciones(creado.id, insumo.presentaciones, client);
      return creado.id;
    });
    return this.insumos.obtenerPorId(id);
  }

  async modificarInsumo(id, body = {}) {
    const actual = await this.obtenerInsumo(id);
    // La unidad base vigente hace falta para validar los nombres de las presentaciones.
    const conUnidad = body.presentaciones !== undefined && body.unidad_medida === undefined
      ? { ...body, unidad_medida: actual.unidad_medida }
      : body;
    const { presentaciones, ...columnas } = InsumoBuilder.desdeBody(conUnidad).buildParcial();
    if (columnas.unidad_medida) await this._unidadValida(columnas.unidad_medida);

    if (columnas.id_tipo || columnas.atributos) {
      const categoria = await this._categoriaValida(columnas.id_tipo || actual.id_tipo);
      columnas.atributos = categoria.validarAtributos(columnas.atributos ?? actual.atributos);
    }

    await this.enTransaccion(async (client) => {
      const actualizado = await this.insumos.actualizar(id, columnas, client);
      if (!actualizado) throw new ErrorNoEncontrado('Insumo');
      if (presentaciones) await this.insumos.reemplazarPresentaciones(id, presentaciones, client);
    });
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
  async registrarMovimiento(tipo, {
    id_insumo, cantidad, presentacion: nombrePresentacion, observacion, usuario,
  } = {}) {
    const strategy = obtenerStrategy(tipo);

    if (!id_insumo) throw new ErrorValidacion('id_insumo es requerido.');
    const cantidadNum = Number(cantidad);

    const resultado = await this.enTransaccion(async (client) => {
      const insumo = await this.insumos.obtenerParaActualizar(id_insumo, client);
      if (!insumo) throw new ErrorNoEncontrado('Insumo');

      const estabaCritico = insumo.estado_critico;
      // "2 rollos" → "40 metros": las reglas y el stock trabajan en unidad base.
      const { cantidadBase, presentacion } = insumo.convertirABase(cantidadNum, nombrePresentacion);
      const asiento = strategy.aplicar(insumo, cantidadBase);

      await this.insumos.actualizarStock(insumo.id, asiento.stockResultante, client);
      const movimiento = await this.movimientos.registrar({
        id_insumo: insumo.id,
        tipo: asiento.tipo,
        cantidad: asiento.cantidad,
        stockResultante: asiento.stockResultante,
        observacion,
        usuario: usuario || strategy.usuarioPorDefecto,
        presentacion: presentacion?.nombre ?? null,
        cantidadPresentacion: presentacion ? cantidadNum : null,
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
      cantidad: asiento.cantidad,
      presentacion: movimiento.presentacion,
      cantidad_presentacion: movimiento.cantidad_presentacion,
      presentaciones: insumo.presentaciones.map((p) => p.toJSON()),
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
