/**
 * Interfaz de los observadores de stock crítico (patrón Observer).
 * Un notificador nunca debe romper el flujo de negocio: si falla, loguea.
 */
class Notificador {
  get nombre() { return this.constructor.name; }
  async notificar(/* evento */) {
    throw new Error('Cada notificador debe implementar notificar().');
  }
}

module.exports = Notificador;
