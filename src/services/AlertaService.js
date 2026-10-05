const config = require('../config');
const LogNotificador = require('./notificadores/LogNotificador');
const EmailNotificador = require('./notificadores/EmailNotificador');

/**
 * PATRÓN OBSERVER (comportamiento, GoF).
 *
 * Sujeto observable de la regla RD02. Cuando un movimiento deja un insumo en
 * estado crítico, avisa a todos los notificadores suscriptos. Sumar un canal
 * nuevo (WhatsApp, push, panel interno) es suscribir otro observador: ni la
 * facade ni los controllers se enteran.
 */
class AlertaService {
  constructor(observadores = []) {
    this.observadores = observadores;
  }

  static porDefecto() {
    const observadores = [new LogNotificador()];
    if (config.mail.habilitado) observadores.push(new EmailNotificador());
    return new AlertaService(observadores);
  }

  suscribir(notificador) {
    this.observadores.push(notificador);
    return this;
  }

  /**
   * Notifica sólo en el flanco: cuando el insumo NO estaba crítico y pasa a
   * estarlo. Evita spamear un correo por cada egreso de un insumo ya agotado.
   */
  async evaluar({ insumo, stockResultante, estabaCritico }) {
    const critico = insumo.esCritico(stockResultante);
    if (!critico || estabaCritico) return false;

    await Promise.all(
      this.observadores.map((o) =>
        o.notificar({ insumo, stockResultante }).catch((err) =>
          console.error(`[alerta] falló ${o.nombre}: ${err.message}`)),
      ),
    );
    return true;
  }
}

module.exports = AlertaService;
