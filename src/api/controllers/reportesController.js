const FachadaReportes = require('../../services/FachadaReportes');

const fachada = new FachadaReportes();

/** GET /api/reportes/consumo?desde&hasta&id_tipo&orden */
const getReporteConsumo = async (req, res) => {
  const { desde, hasta, id_tipo, orden, usuario } = req.query;
  res.json(await fachada.generarReporteConsumo({ desde, hasta, id_tipo, orden }, usuario));
};

/** POST /api/reportes/consumo/:id/exportar  { formato: 'pdf' | 'planilla' } */
const postExportar = async (req, res) => {
  const archivo = await fachada.exportarReporte(req.params.id, req.body?.formato);
  res.set('Content-Type', archivo.tipo);
  res.set('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
  res.send(archivo.contenido);
};

const getUmbrales = async (req, res) => {
  res.json(await fachada.obtenerUmbralVigente());
};

/** PUT /api/reportes/umbrales  { dias_observacion, dias_criticidad, egresos_minimos, usuario? } */
const putUmbrales = async (req, res) => {
  res.json(await fachada.actualizarUmbrales(req.body, req.body?.usuario));
};

module.exports = { getReporteConsumo, postExportar, getUmbrales, putUmbrales };
