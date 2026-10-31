const { EstadoCobertura } = require('./enumeraciones');

/**
 * RD05 (proyección de cobertura) y RD06 (muestra mínima).
 * Es el método que se somete a la prueba de caja blanca: los números de los
 * comentarios son los nodos del grafo de flujo (Anexo C, Figura 17).
 *
 * El consumo nulo se evalúa ANTES que la muestra mínima: un insumo sin egresos
 * también tiene menos egresos que el mínimo y, en el orden inverso, nunca
 * llegaría a informarse como SIN_ROTACION.
 */
class ClasificadorCobertura {
  /**
   * @param {import('./LineaConsumo')} linea
   * @param {import('./UmbralCobertura')} umbral
   * @returns {string} EstadoCobertura asignado a la línea
   */
  clasificar(linea, umbral) {
    let estado;
    let dias = null;

    if (linea.consumoTotal === 0) {                                  // 1
      estado = EstadoCobertura.SIN_ROTACION;                         // 2 — cobertura indeterminada, nunca infinita
    } else if (linea.cantidadEgresos < umbral.egresosMinimos) {      // 3
      estado = EstadoCobertura.MUESTRA_INSUFICIENTE;                 // 4
    } else {
      dias = ClasificadorCobertura.diasDeCobertura(linea);           // 5
      if (dias <= umbral.diasCriticidad) {
        estado = EstadoCobertura.CRITICA;                            // 6
      } else if (dias <= umbral.diasObservacion) {                   // 7
        estado = EstadoCobertura.EN_OBSERVACION;                     // 8
      } else {
        estado = EstadoCobertura.SUFICIENTE;                         // 9
      }
    }

    linea.asignarClasificacion(estado, dias);
    return estado;                                                   // 10
  }

  /**
   * Stock actual / promedio diario, redondeado a un decimal. Se clasifica con
   * el valor redondeado, que es el que se muestra y se guarda: así un insumo
   * que figura con 10,0 días es CRÍTICO y no EN OBSERVACIÓN por un resto oculto.
   */
  static diasDeCobertura(linea) {
    return Math.round((linea.stockAlGenerar / linea.promedioDiario) * 10) / 10;
  }
}

module.exports = ClasificadorCobertura;
