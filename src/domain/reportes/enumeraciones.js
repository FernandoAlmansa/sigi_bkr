/** Estado de cobertura que el análisis de consumo asigna a cada insumo (Figura 2). */
const EstadoCobertura = Object.freeze({
  CRITICA: 'CRITICA',
  EN_OBSERVACION: 'EN_OBSERVACION',
  SUFICIENTE: 'SUFICIENTE',
  MUESTRA_INSUFICIENTE: 'MUESTRA_INSUFICIENTE',
  SIN_ROTACION: 'SIN_ROTACION',
});

/** Texto con que se muestra cada estado en pantalla, PDF y planilla. */
const ETIQUETA_ESTADO = Object.freeze({
  CRITICA: 'CRÍTICA',
  EN_OBSERVACION: 'EN OBSERVACIÓN',
  SUFICIENTE: 'SUFICIENTE',
  MUESTRA_INSUFICIENTE: 'MUESTRA INSUFICIENTE',
  SIN_ROTACION: 'SIN ROTACIÓN',
});

/** Criterios con que se puede ordenar el reporte (selector "Ordenar por"). */
const CriterioOrden = Object.freeze({
  CRITICIDAD: 'CRITICIDAD',
  CONSUMO: 'CONSUMO',
  NOMBRE: 'NOMBRE',
});

/** Formatos de exportación del CU-10. */
const FormatoExportacion = Object.freeze({
  PDF: 'PDF',
  PLANILLA: 'PLANILLA',
});

module.exports = { EstadoCobertura, ETIQUETA_ESTADO, CriterioOrden, FormatoExportacion };
