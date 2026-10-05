const Notificador = require('./Notificador');

/** Deja rastro en el log del servidor. Sirve como pista de auditoría mínima. */
class LogNotificador extends Notificador {
  async notificar({ insumo, stockResultante }) {
    console.warn(
      `[ALERTA RD02] ${insumo.nombre} quedó en ${stockResultante} ${insumo.unidad_medida} ` +
      `(mínimo: ${insumo.stock_minimo}).`,
    );
  }
}

module.exports = LogNotificador;
