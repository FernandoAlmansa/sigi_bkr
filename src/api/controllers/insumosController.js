const path = require('path');
const InventarioFacade = require('../../services/InventarioFacade');
const { crearAlmacenamiento } = require('../../services/almacenamiento');

const inventario = new InventarioFacade();
const almacenamiento = crearAlmacenamiento();

/**
 * Capa de presentación: traduce HTTP a llamadas de la facade y viceversa.
 * Sin SQL, sin reglas de negocio, sin try/catch (lo cubre asyncHandler).
 */
const listarTipos = async (req, res) => {
  res.json(await inventario.listarTipos());
};

const listarInsumos = async (req, res) => {
  const { id_tipo, estado, q } = req.query;
  res.json(await inventario.listarInsumos({ id_tipo, estado, busqueda: q }));
};

const obtenerInsumo = async (req, res) => {
  res.json(await inventario.obtenerInsumo(req.params.id));
};

const crearInsumo = async (req, res) => {
  res.status(201).json(await inventario.altaInsumo(req.body));
};

const actualizarInsumo = async (req, res) => {
  res.json(await inventario.modificarInsumo(req.params.id, req.body));
};

const eliminarInsumo = async (req, res) => {
  res.json(await inventario.bajaInsumo(req.params.id));
};

const subirImagen = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió imagen.' });

  // Primero se valida que el insumo exista, para no subir imágenes huérfanas.
  await inventario.obtenerInsumo(req.params.id);

  const url = await almacenamiento.guardar(req.params.id, {
    buffer: req.file.buffer,
    extension: path.extname(req.file.originalname).toLowerCase(),
    mimetype: req.file.mimetype,
  });
  res.json(await inventario.asignarImagen(req.params.id, url));
};

const resumen = async (req, res) => {
  res.json(await inventario.resumenInventario());
};

module.exports = {
  listarTipos, listarInsumos, obtenerInsumo, crearInsumo,
  actualizarInsumo, eliminarInsumo, subirImagen, resumen,
};
