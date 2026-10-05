/**
 * Errores de dominio. El middleware de errores los traduce a HTTP,
 * de modo que ni el dominio ni los servicios conocen Express.
 */
class ErrorApp extends Error {
  constructor(mensaje, status = 500, codigo = 'ERROR_INTERNO', extra = {}) {
    super(mensaje);
    this.name = this.constructor.name;
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ErrorValidacion extends ErrorApp {
  constructor(mensaje, errores = []) {
    super(mensaje, 400, 'VALIDACION', errores.length ? { errores } : {});
  }
}

class ErrorNoEncontrado extends ErrorApp {
  constructor(entidad = 'Recurso') {
    super(`${entidad} no encontrado.`, 404, 'NO_ENCONTRADO');
  }
}

/** Violación de una regla de negocio (RD01, RD02, etc.). */
class ErrorReglaNegocio extends ErrorApp {
  constructor(mensaje, extra = {}, codigo = 'REGLA_NEGOCIO') {
    super(mensaje, 422, codigo, extra);
  }
}

class ErrorStockInsuficiente extends ErrorReglaNegocio {
  constructor(insumo, solicitado) {
    super('Stock insuficiente.', {
      detalle: `Disponible: ${insumo.stock_actual} ${insumo.unidad_medida}. Solicitado: ${solicitado}.`,
      disponible: insumo.stock_actual,
      unidad: insumo.unidad_medida,
    }, 'RD01_STOCK_INSUFICIENTE');
  }
}

module.exports = {
  ErrorApp,
  ErrorValidacion,
  ErrorNoEncontrado,
  ErrorReglaNegocio,
  ErrorStockInsuficiente,
};
