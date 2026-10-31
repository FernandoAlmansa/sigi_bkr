const IConstructorReporte = require('./IConstructorReporte');
const { ETIQUETA_ESTADO, EstadoCobertura } = require('../../reportes/enumeraciones');
const { fechaLegible } = require('../../reportes/fechas');
const { numero, dias } = require('./formato');

// Excel en español separa columnas con punto y coma (la coma es el decimal).
const SEP = ';';
// BOM: sin él, Excel abre el archivo como Latin-1 y rompe las tildes.
const BOM = '﻿';

function celda(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Constructor concreto: planilla CSV que abre Excel o Google Sheets, para armar la orden de compra. */
class ConstructorPlanilla extends IConstructorReporte {
  constructor() {
    super();
    this.filas = [];
  }

  _fila(...valores) {
    this.filas.push(valores.map(celda).join(SEP));
  }

  construirEncabezado(reporte) {
    const { periodo, umbral } = reporte;
    this._fila('Reporte de consumo por período');
    this._fila('Período', `${fechaLegible(periodo.desde)} al ${fechaLegible(periodo.hasta)}`, `${periodo.cantidadDias} días`);
    this._fila('Tipo de insumo', reporte.tipoNombre || 'Todos los tipos');
    this._fila('Umbrales', `crítica hasta ${umbral.diasCriticidad} días`,
      `observación hasta ${umbral.diasObservacion} días`, `mínimo ${umbral.egresosMinimos} egresos`);
    this._fila();
    this._fila('Insumo', 'Tipo', 'Unidad', 'Consumo del período', 'Egresos', 'Promedio diario',
      'Stock actual', 'Cobertura (días)', 'Estado');
  }

  construirLinea(l) {
    this._fila(l.nombre, l.tipoNombre, l.unidad, numero(l.consumoTotal, 3), l.cantidadEgresos,
      numero(l.promedioDiario), numero(l.stockAlGenerar, 3), dias(l.diasCobertura), ETIQUETA_ESTADO[l.estado]);
  }

  /** En la planilla el gráfico no se dibuja: los días ya están en la columna Cobertura. */
  construirGrafico() {}

  construirResumen(reporte) {
    const conteo = reporte.conteoPorEstado;
    this._fila();
    this._fila('Insumos con cobertura crítica', reporte.cantidadCriticos);
    [EstadoCobertura.EN_OBSERVACION, EstadoCobertura.SUFICIENTE,
      EstadoCobertura.MUESTRA_INSUFICIENTE, EstadoCobertura.SIN_ROTACION]
      .forEach((e) => this._fila(`Insumos en ${ETIQUETA_ESTADO[e].toLowerCase()}`, conteo[e]));
  }

  obtenerResultado() {
    return Buffer.from(BOM + this.filas.join('\r\n'), 'utf8');
  }
}

module.exports = ConstructorPlanilla;
