/**
 * Fechas de calendario (sin hora) en formato AAAA-MM-DD. El período de un
 * reporte se expresa en días del taller, así que "hoy" es el día de Argentina
 * aunque el servidor (Render) corra en UTC.
 */
const ZONA_TALLER = 'America/Argentina/Buenos_Aires';
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;
const MS_DIA = 24 * 60 * 60 * 1000;

/** true si `texto` es una fecha real (descarta 2026-02-30). */
function esFechaValida(texto) {
  if (typeof texto !== 'string' || !FORMATO.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function hoyEnTaller(ahora = new Date()) {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_TALLER }).format(ahora);
}

/** Días entre dos fechas con ambos extremos incluidos: del 1 al 1 es 1 día. */
function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA) + 1;
}

/** 2026-02-28 → 28/02/2026 */
function fechaLegible(texto) {
  const [a, m, d] = String(texto).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

module.exports = { ZONA_TALLER, esFechaValida, hoyEnTaller, diasEntre, fechaLegible };
