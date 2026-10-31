const IOrdenReporte = require('./IOrdenReporte');
const { CriterioOrden } = require('../../reportes/enumeraciones');

/** Por nombre, para ubicar un insumo puntual. */
class OrdenAlfabetico extends IOrdenReporte {
  get criterio() {
    return CriterioOrden.NOMBRE;
  }

  ordenar(lineas) {
    return [...lineas].sort(IOrdenReporte.porNombre);
  }
}

module.exports = OrdenAlfabetico;
