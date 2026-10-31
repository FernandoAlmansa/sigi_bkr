const IOrdenReporte = require('./IOrdenReporte');
const { CriterioOrden, EstadoCobertura } = require('../../reportes/enumeraciones');

// Lo que exige decisión de compra va arriba; lo que no tiene proyección, al final.
const PRIORIDAD = {
  [EstadoCobertura.CRITICA]: 0,
  [EstadoCobertura.EN_OBSERVACION]: 1,
  [EstadoCobertura.SUFICIENTE]: 2,
  [EstadoCobertura.MUESTRA_INSUFICIENTE]: 3,
  [EstadoCobertura.SIN_ROTACION]: 4,
};

/** Criterio predeterminado: por estado y, dentro de cada estado, menos días de cobertura primero. */
class OrdenPorCriticidad extends IOrdenReporte {
  get criterio() {
    return CriterioOrden.CRITICIDAD;
  }

  ordenar(lineas) {
    return [...lineas].sort((a, b) => (PRIORIDAD[a.estado] - PRIORIDAD[b.estado])
      || ((a.diasCobertura ?? 0) - (b.diasCobertura ?? 0))
      || IOrdenReporte.porNombre(a, b));
  }
}

module.exports = OrdenPorCriticidad;
