const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const rutas = require('./api/routes');
const { errorHandler, noEncontrado } = require('./api/middlewares/errorHandler');

/**
 * Construcción de la aplicación Express, separada del arranque del servidor
 * para poder instanciarla en las pruebas sin abrir un puerto.
 */
function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  // El front vive en otro dominio (GitHub Pages): sus recursos se piden cross-origin.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.cors.origins.includes('*') ? '*' : config.cors.origins }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', rutas);

  // SPA: cualquier ruta no-API devuelve el index.
  app.use(noEncontrado);
  app.get('/{*ruta}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { crearApp };
