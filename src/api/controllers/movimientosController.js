const InventarioFacade = require('../../services/InventarioFacade');
const Movimiento = require('../../domain/Movimiento');

const inventario = new InventarioFacade();

const listarMovimientos = async (req, res) => {
  const { id_insumo, tipo, desde, hasta, limit, offset } = req.query;
  res.json(await inventario.listarMovimientos({ id_insumo, tipo, desde, hasta, limit, offset }));
};

/** Un solo handler parametrizado: la Strategy resuelve las diferencias. */
const registrar = (tipo) => async (req, res) => {
  res.status(201).json(await inventario.registrarMovimiento(tipo, req.body));
};

module.exports = {
  listarMovimientos,
  registrarIngreso: registrar(Movimiento.TIPOS.INGRESO),
  registrarEgreso: registrar(Movimiento.TIPOS.EGRESO),
  registrarAjuste: registrar(Movimiento.TIPOS.AJUSTE),
};
