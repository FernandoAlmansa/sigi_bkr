const IOrdenReporte = require('./IOrdenReporte');
const { CriterioOrden } = require('../../reportes/enumeraciones');

/** Mayor consumo del período primero: identifica los materiales de más rotación. */
class OrdenPorConsumo extends IOrdenReporte {
  get criterio() {
    return CriterioOrden.CONSUMO;
  }

  ordenar(lineas) {
    return [...lineas].sort((a, b) => (b.consumoTotal - a.consumoTotal) || IOrdenReporte.porNombre(a, b));
  }
}

module.exports = OrdenPorConsumo;
