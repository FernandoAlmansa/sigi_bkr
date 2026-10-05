const config = require('../../config');
const DiscoLocalAlmacenamiento = require('./DiscoLocalAlmacenamiento');
const SupabaseAlmacenamiento = require('./SupabaseAlmacenamiento');

/**
 * Elige la estrategia de almacenamiento según la configuración: si están las
 * variables de Supabase se usa Storage; si no, el disco local.
 */
function crearAlmacenamiento(cfg = config.storage) {
  if (cfg.supabase.habilitado) return new SupabaseAlmacenamiento(cfg.supabase);
  return new DiscoLocalAlmacenamiento();
}

module.exports = { crearAlmacenamiento };
