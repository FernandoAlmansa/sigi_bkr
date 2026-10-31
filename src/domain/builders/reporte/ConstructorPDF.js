const PDFDocument = require('pdfkit');
const IConstructorReporte = require('./IConstructorReporte');
const { ETIQUETA_ESTADO, EstadoCobertura } = require('../../reportes/enumeraciones');
const { fechaLegible } = require('../../reportes/fechas');
const { numero, dias } = require('./formato');

const MARGEN = 40;
const ANCHO = 595.28 - MARGEN * 2; // A4 vertical
const FONDO_PAGINA = 842 - MARGEN;
const FILA = 17;

const COLOR = {
  texto: '#4A2F3A',
  suave: '#865D70',
  marca: '#AD4279',
  borde: '#F0BCD3',
  fondoEncabezado: '#FCE4ED',
  [EstadoCobertura.CRITICA]: '#B83250',
  [EstadoCobertura.EN_OBSERVACION]: '#C28A1E',
  [EstadoCobertura.SUFICIENTE]: '#2F7A60',
  [EstadoCobertura.MUESTRA_INSUFICIENTE]: '#865D70',
  [EstadoCobertura.SIN_ROTACION]: '#865D70',
};

// Insumo, consumo, egresos, promedio, stock, cobertura, estado (suman ANCHO).
const COLUMNAS = [
  { titulo: 'Insumo', ancho: 112 },
  { titulo: 'Consumo', ancho: 64, derecha: true },
  { titulo: 'Egresos', ancho: 44, derecha: true },
  { titulo: 'Prom. diario', ancho: 60, derecha: true },
  { titulo: 'Stock actual', ancho: 72, derecha: true },
  { titulo: 'Cobertura', ancho: 52, derecha: true },
  { titulo: 'Estado', ancho: 111.28 },
];

/**
 * Constructor concreto: PDF del reporte, con la tabla, el gráfico de barras
 * de cobertura y el resumen. Usa las fuentes estándar del PDF (Helvetica),
 * que ya traen tildes y eñes, así que no hace falta embeber archivos.
 */
class ConstructorPDF extends IConstructorReporte {
  constructor() {
    super();
    this.documento = new PDFDocument({ size: 'A4', margin: MARGEN, info: { Title: 'Reporte de consumo — SIGI-BKR' } });
    this.partes = [];
    this.documento.on('data', (p) => this.partes.push(p));
    this.listo = new Promise((resolve, reject) => {
      this.documento.on('end', () => resolve(Buffer.concat(this.partes)));
      this.documento.on('error', reject);
    });
  }

  construirEncabezado(reporte) {
    const doc = this.documento;
    const { periodo, umbral } = reporte;
    doc.fillColor(COLOR.marca).font('Helvetica-Bold').fontSize(16).text('Reporte de consumo por período');
    doc.moveDown(0.3).fillColor(COLOR.texto).font('Helvetica').fontSize(10)
      .text(`Período: ${fechaLegible(periodo.desde)} al ${fechaLegible(periodo.hasta)} (${periodo.cantidadDias} días)`)
      .text(`Tipo de insumo: ${reporte.tipoNombre || 'Todos los tipos'}`)
      .text(`Umbrales: crítica hasta ${umbral.diasCriticidad} días · observación hasta ${umbral.diasObservacion} días · mínimo ${umbral.egresosMinimos} egresos para proyectar`);
    doc.moveDown(0.8);
    this._encabezadoTabla();
  }

  _encabezadoTabla() {
    const doc = this.documento;
    const y = doc.y;
    doc.rect(MARGEN, y, ANCHO, FILA).fill(COLOR.fondoEncabezado);
    this._celdas(COLUMNAS.map((c) => c.titulo), y, { fuente: 'Helvetica-Bold', color: COLOR.marca, tamano: 7.5 });
    doc.y = y + FILA;
  }

  /** Fuente de cada celda: el estado va en negrita; el resto, en la fuente pedida. */
  _fuente(i, fuente) {
    return i === COLUMNAS.length - 1 && fuente === 'Helvetica' ? 'Helvetica-Bold' : fuente;
  }

  /** Alto de la fila: si un texto no entra en su columna, baja de línea y la fila crece. */
  _altoFila(textos, { fuente = 'Helvetica', tamano = 8.5 } = {}) {
    const doc = this.documento;
    doc.fontSize(tamano);
    return Math.max(FILA, ...COLUMNAS.map((col, i) => doc.font(this._fuente(i, fuente))
      .heightOfString(String(textos[i]), { width: col.ancho - 8 }) + 9));
  }

  _celdas(textos, y, { fuente = 'Helvetica', color = COLOR.texto, colores = [], tamano = 8.5 } = {}) {
    const doc = this.documento;
    let x = MARGEN;
    doc.fontSize(tamano);
    COLUMNAS.forEach((col, i) => {
      doc.font(this._fuente(i, fuente))
        .fillColor(colores[i] || color)
        .text(String(textos[i]), x + 4, y + 5, { width: col.ancho - 8, align: col.derecha ? 'right' : 'left' });
      x += col.ancho;
    });
  }

  _espacio(alto, alCortar) {
    if (this.documento.y + alto > FONDO_PAGINA) {
      this.documento.addPage();
      if (alCortar) alCortar();
    }
  }

  construirLinea(l) {
    const doc = this.documento;
    const unidad = (v, dec) => (v === null ? '—' : `${numero(v, dec)} ${l.unidad}`);
    const textos = [
      l.nombre,
      unidad(l.consumoTotal, 3),
      l.cantidadEgresos,
      unidad(l.promedioDiario, 2),
      unidad(l.stockAlGenerar, 3),
      l.diasCobertura === null ? '—' : `${dias(l.diasCobertura)} d`,
      ETIQUETA_ESTADO[l.estado],
    ];
    const alto = this._altoFila(textos);
    this._espacio(alto, () => this._encabezadoTabla());
    const y = doc.y;
    this._celdas(textos, y, { colores: { 6: COLOR[l.estado] } });
    doc.moveTo(MARGEN, y + alto).lineTo(MARGEN + ANCHO, y + alto).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
    doc.y = y + alto;
  }

  construirGrafico(lineas, umbral) {
    const doc = this.documento;
    const serie = lineas.filter((l) => l.tieneProyeccion);
    const sinProyeccion = lineas.filter((l) => !l.tieneProyeccion);
    const ALTO_BARRA = 16;

    doc.moveDown(1.2);
    this._espacio(60 + Math.min(serie.length, 5) * ALTO_BARRA);
    doc.x = MARGEN;
    doc.fillColor(COLOR.marca).font('Helvetica-Bold').fontSize(12).text('Días de cobertura por insumo');
    doc.moveDown(0.4);

    if (!serie.length) {
      doc.fillColor(COLOR.suave).font('Helvetica').fontSize(9).text('Ningún insumo tiene proyección en este período.');
    } else {
      const ETIQUETA = 140;
      const VALOR = 110;
      const area = ANCHO - ETIQUETA - VALOR;
      const escala = escalaDelGrafico(serie.map((l) => l.diasCobertura), umbral.diasObservacion);
      const xDe = (d) => MARGEN + ETIQUETA + Math.min(d, escala) / escala * area;

      const dibujarReferencias = (y0, y1) => {
        [[umbral.diasCriticidad, COLOR[EstadoCobertura.CRITICA], 'crítica'],
          [umbral.diasObservacion, COLOR[EstadoCobertura.EN_OBSERVACION], 'observación']].forEach(([d, c, t]) => {
          doc.moveTo(xDe(d), y0).lineTo(xDe(d), y1).dash(3, { space: 3 }).lineWidth(0.8).strokeColor(c).stroke().undash();
          doc.fillColor(c).font('Helvetica').fontSize(7).text(`${t} ${d} d`, xDe(d) + 2, y1 + 2, { lineBreak: false });
        });
      };

      let inicio = doc.y;
      serie.forEach((l) => {
        if (doc.y + ALTO_BARRA > FONDO_PAGINA - 14) {
          dibujarReferencias(inicio, doc.y);
          doc.addPage();
          inicio = doc.y;
        }
        const y = doc.y;
        doc.fillColor(COLOR.texto).font('Helvetica').fontSize(8)
          .text(l.nombre, MARGEN, y + 4, { width: ETIQUETA - 8, height: 10, ellipsis: true, lineBreak: false, align: 'right' });
        const ancho = Math.max(xDe(l.diasCobertura) - (MARGEN + ETIQUETA), 1.5);
        doc.rect(MARGEN + ETIQUETA, y + 3, ancho, ALTO_BARRA - 6).fill(COLOR[l.estado]);
        doc.fillColor(COLOR.texto).fontSize(8)
          .text(`${dias(l.diasCobertura)} días · ${ETIQUETA_ESTADO[l.estado]}${l.diasCobertura > escala ? ' ›' : ''}`,
            MARGEN + ETIQUETA + ancho + 4, y + 4, { lineBreak: false });
        doc.y = y + ALTO_BARRA;
      });
      dibujarReferencias(inicio, doc.y);
      doc.y += 14;
    }

    if (sinProyeccion.length) {
      doc.moveDown(0.6);
      doc.x = MARGEN;
      doc.fillColor(COLOR.suave).font('Helvetica').fontSize(8.5).text(
        `Sin proyección (no se grafican): ${sinProyeccion.map((l) => `${l.nombre} — ${ETIQUETA_ESTADO[l.estado].toLowerCase()}`).join(' · ')}`,
        { width: ANCHO },
      );
    }
  }

  construirResumen(reporte) {
    const doc = this.documento;
    const conteo = reporte.conteoPorEstado;
    this._espacio(40);
    doc.moveDown(1);
    doc.x = MARGEN;
    doc.fillColor(COLOR.texto).font('Helvetica-Bold').fontSize(10)
      .text(`Insumos con cobertura crítica: ${reporte.cantidadCriticos}`);
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.suave).text(
      `En observación: ${conteo.EN_OBSERVACION} · Suficiente: ${conteo.SUFICIENTE} · `
      + `Muestra insuficiente: ${conteo.MUESTRA_INSUFICIENTE} · Sin rotación: ${conteo.SIN_ROTACION} · `
      + `Total: ${reporte.lineas.length} insumos`,
    );
  }

  obtenerResultado() {
    this.documento.end();
    return this.listo;
  }
}

/**
 * Hasta dónde llega el eje: el mayor valor, pero sin pasar de 4 veces el
 * umbral de observación, para que un insumo con 900 días no aplaste al resto.
 * Las barras que lo superan se cortan y llevan "›" junto al valor real.
 */
function escalaDelGrafico(valores, diasObservacion) {
  const maximo = Math.max(...valores, diasObservacion * 1.2);
  return Math.min(maximo, diasObservacion * 4);
}

ConstructorPDF.escalaDelGrafico = escalaDelGrafico;
module.exports = ConstructorPDF;
