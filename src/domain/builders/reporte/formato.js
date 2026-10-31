/** Formatos de número compartidos por los constructores que generan archivos (PDF y planilla). */

/** 4.6667 → "4,67" (coma decimal, como lee el taller). */
function numero(valor, decimales = 2) {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('es-AR', { maximumFractionDigits: decimales });
}

/** Días de cobertura con un decimal fijo: 22,5 / 10,0. */
function dias(valor) {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

module.exports = { numero, dias };
