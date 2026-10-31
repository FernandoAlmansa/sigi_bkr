const { ErrorValidacion } = require('../errores');

/**
 * Valores con que se clasifica la cobertura (RF08): días para considerar un
 * insumo crítico, días para considerarlo en observación y cantidad mínima de
 * egresos para proyectar. No se sobrescriben: cada cambio crea un registro
 * nuevo y cierra la vigencia del anterior.
 */
class UmbralCobertura {
  constructor({
    id = null, dias_observacion, dias_criticidad, egresos_minimos,
    vigente_desde = null, definido_por = 'Sistema',
  }) {
    this.id = id;
    this.diasObservacion = Number(dias_observacion);
    this.diasCriticidad = Number(dias_criticidad);
    this.egresosMinimos = Number(egresos_minimos);
    this.vigenteDesde = vigente_desde;
    this.definidoPor = definido_por;
  }

  static desdeFila(fila) {
    return fila ? new UmbralCobertura(fila) : null;
  }

  /** Crea umbrales nuevos a partir de lo que cargó la Dirección, acumulando todos los errores. */
  static crear({ dias_observacion, dias_criticidad, egresos_minimos }, definidoPor = 'Sistema') {
    const errores = [];
    const entero = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
    const obs = entero(dias_observacion);
    const crit = entero(dias_criticidad);
    const min = entero(egresos_minimos);

    if (!Number.isInteger(crit) || crit < 1) errores.push('Los días de criticidad tienen que ser un número entero mayor a 0.');
    if (!Number.isInteger(obs) || obs < 1) errores.push('Los días de observación tienen que ser un número entero mayor a 0.');
    else if (Number.isInteger(crit) && obs <= crit) errores.push('Los días de observación tienen que ser más que los de criticidad.');
    if (!Number.isInteger(min) || min < 1) errores.push('La cantidad mínima de egresos tiene que ser un número entero mayor o igual a 1.');

    if (errores.length) throw new ErrorValidacion('Umbrales inválidos.', errores);
    return new UmbralCobertura({
      dias_observacion: obs, dias_criticidad: crit, egresos_minimos: min, definido_por: definidoPor,
    });
  }

  toJSON() {
    return {
      id: this.id,
      dias_observacion: this.diasObservacion,
      dias_criticidad: this.diasCriticidad,
      egresos_minimos: this.egresosMinimos,
      vigente_desde: this.vigenteDesde,
      definido_por: this.definidoPor,
    };
  }
}

module.exports = UmbralCobertura;
