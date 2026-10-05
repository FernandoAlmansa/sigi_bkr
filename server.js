const config = require('./src/config');
const { crearApp } = require('./src/app');
const { ejecutarMigraciones } = require('./db/migraciones');
const db = require('./src/data/db');

async function iniciar() {
  await ejecutarMigraciones();

  const servidor = crearApp().listen(config.puerto, () => {
    console.log(`SIGI-BKR [${config.entorno}] escuchando en http://localhost:${config.puerto}`);
  });

  const apagar = async (senal) => {
    console.log(`\n${senal} recibida, cerrando...`);
    servidor.close(async () => {
      await db.cerrar();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

iniciar().catch((err) => {
  console.error('No se pudo iniciar SIGI-BKR:', err.message);
  process.exit(1);
});
