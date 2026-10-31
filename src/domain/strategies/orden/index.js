const OrdenPorCriticidad = require('./OrdenPorCriticidad');
const OrdenPorConsumo = require('./OrdenPorConsumo');
const OrdenAlfabetico = require('./OrdenAlfabetico');

/** Mapa CriterioOrden → estrategia que usa FachadaReportes como contexto. */
function estrategiasDeOrden() {
  return new Map([new OrdenPorCriticidad(), new OrdenPorConsumo(), new OrdenAlfabetico()]
    .map((e) => [e.criterio, e]));
}

module.exports = { estrategiasDeOrden };
