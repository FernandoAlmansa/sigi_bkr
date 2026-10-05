const Movimiento = require('../Movimiento');
const IngresoStrategy = require('./IngresoStrategy');
const EgresoStrategy = require('./EgresoStrategy');
const AjusteStrategy = require('./AjusteStrategy');
const { ErrorValidacion } = require('../errores');

/** Registro de estrategias disponibles: única fuente de verdad de los tipos. */
const REGISTRO = {
  [Movimiento.TIPOS.INGRESO]: new IngresoStrategy(),
  [Movimiento.TIPOS.EGRESO]: new EgresoStrategy(),
  [Movimiento.TIPOS.AJUSTE]: new AjusteStrategy(),
};

function obtenerStrategy(tipo) {
  const strategy = REGISTRO[String(tipo || '').toUpperCase()];
  if (!strategy) {
    throw new ErrorValidacion(`Tipo de movimiento inválido: ${tipo}. Válidos: ${Object.keys(REGISTRO).join(', ')}.`);
  }
  return strategy;
}

module.exports = { obtenerStrategy, TIPOS_VALIDOS: Object.keys(REGISTRO) };
