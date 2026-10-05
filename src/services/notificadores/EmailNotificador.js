const nodemailer = require('nodemailer');
const Notificador = require('./Notificador');
const config = require('../../config');

/** Envía el aviso de stock crítico a la Dirección por SMTP. */
class EmailNotificador extends Notificador {
  constructor() {
    super();
    this.transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: { user: config.mail.user, pass: config.mail.pass },
    });
  }

  async notificar({ insumo, stockResultante }) {
    if (!config.mail.destinatario) return;

    await this.transporter.sendMail({
      from: `"SIGI-BKR Alertas" <${config.mail.user}>`,
      to: config.mail.destinatario,
      subject: `Stock crítico: ${insumo.nombre}`,
      html: this._cuerpo(insumo, stockResultante),
    });
  }

  _cuerpo(insumo, stockResultante) {
    const fila = (etiqueta, valor, color = '#333') => `
      <tr>
        <td style="padding:8px;border:1px solid #f0d9e2;"><strong>${etiqueta}</strong></td>
        <td style="padding:8px;border:1px solid #f0d9e2;color:${color};">${valor}</td>
      </tr>`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#c2185b;">Alerta de stock crítico — SIGI-BKR</h2>
        <p>El insumo <strong>${insumo.nombre}</strong> perforó su umbral de seguridad.</p>
        <table style="border-collapse:collapse;width:100%;">
          ${fila('Insumo', insumo.nombre)}
          ${fila('Stock actual', `<strong>${stockResultante} ${insumo.unidad_medida}</strong>`, '#c2185b')}
          ${fila('Stock mínimo', `${insumo.stock_minimo} ${insumo.unidad_medida}`)}
        </table>
        <p style="margin-top:16px;">Se recomienda gestionar la reposición a la brevedad.</p>
        <p style="color:#888;font-size:12px;">Sistema SIGI-BKR — Bikinis Río</p>
      </div>`;
  }
}

module.exports = EmailNotificador;
