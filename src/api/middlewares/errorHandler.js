const { ErrorApp } = require('../../domain/errores');
const config = require('../../config');

function noEncontrado(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint inexistente.' });
  }
  return next();
}

/** Traduce errores de dominio a HTTP. Único lugar donde se arma la respuesta de error. */
function errorHandler(err, req, res, _next) {
  if (err instanceof ErrorApp) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo, ...err.extra });
  }

  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.', codigo: 'DUPLICADO' });
  }
  if (err && err.code === '23503') {
    return res.status(409).json({ error: 'El registro está referenciado por otros datos.', codigo: 'FK' });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'La imagen supera el tamaño máximo permitido.' });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res.status(500).json({
    error: 'Error interno del servidor.',
    ...(config.entorno !== 'production' ? { detalle: err.message } : {}),
  });
}

module.exports = { errorHandler, noEncontrado };
