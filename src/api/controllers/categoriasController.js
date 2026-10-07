const InventarioFacade = require('../../services/InventarioFacade');

const inventario = new InventarioFacade();

/** ABM de categorías de insumo. Sin reglas de negocio: todo pasa por la facade. */
const listar = async (req, res) => {
  res.json(await inventario.listarTipos());
};

const obtener = async (req, res) => {
  res.json(await inventario.obtenerCategoria(req.params.id));
};

const crear = async (req, res) => {
  res.status(201).json(await inventario.altaCategoria(req.body));
};

const actualizar = async (req, res) => {
  res.json(await inventario.modificarCategoria(req.params.id, req.body));
};

const eliminar = async (req, res) => {
  res.json(await inventario.bajaCategoria(req.params.id));
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
