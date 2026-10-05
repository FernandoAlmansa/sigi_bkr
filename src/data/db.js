const { Pool } = require('pg');
const config = require('../config');

/**
 * PATRÓN SINGLETON (creacional, GoF).
 * Toda la aplicación comparte un único pool de conexiones: abrir un pool por
 * request agotaría las conexiones del servidor PostgreSQL.
 */
let instancia = null;

function getPool() {
  if (!instancia) {
    config.verificarRequeridas(); // falla rápido si no hay DATABASE_URL
    instancia = new Pool(config.db);
    instancia.on('error', (err) => console.error('[db] error en cliente inactivo:', err.message));
  }
  return instancia;
}

/** Consulta suelta (fuera de transacción). */
function query(texto, params) {
  return getPool().query(texto, params);
}

/**
 * Ejecuta `fn(client)` dentro de una transacción: COMMIT si resuelve,
 * ROLLBACK si lanza. Centraliza el manejo del client para que ninguna capa
 * superior tenga que acordarse de liberarlo.
 */
async function enTransaccion(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function cerrar() {
  if (instancia) {
    await instancia.end();
    instancia = null;
  }
}

module.exports = { getPool, query, enTransaccion, cerrar };
