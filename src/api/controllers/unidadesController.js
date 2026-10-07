const InventarioFacade = require('../../services/InventarioFacade');

const inventario = new InventarioFacade();

const listar = async (req, res) => {
  res.json(await inventario.listarUnidades());
};

const nombresPresentaciones = async (req, res) => {
  res.json(await inventario.nombresPresentaciones());
};

const crear = async (req, res) => {
  res.status(201).json(await inventario.altaUnidad(req.body));
};

const actualizar = async (req, res) => {
  res.json(await inventario.modificarUnidad(req.params.id, req.body));
};

const eliminar = async (req, res) => {
  res.json(await inventario.bajaUnidad(req.params.id));
};

module.exports = { listar, nombresPresentaciones, crear, actualizar, eliminar };
