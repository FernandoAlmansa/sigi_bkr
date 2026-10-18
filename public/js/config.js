/* ============================================================
   SIGI-BKR | config.js
   Dónde está la API. Se carga antes que app.js y egreso.js.
   - Servido por Express (local): misma URL → '/api'
   - Servido por GitHub Pages: el backend vive en Render
   ============================================================ */

// ⚠️ Si Render te asigna otra URL (p. ej. sigi-bkr-x1y2.onrender.com), cambiala acá.
const BACKEND_PRODUCCION = 'https://sigi-bkr.onrender.com';

const API = location.hostname.endsWith('github.io')
  ? `${BACKEND_PRODUCCION}/api`
  : '/api';

/* ── Aviso de arranque en frío ──
   Render free apaga el servicio tras 15 min sin tráfico y tarda 30-60 s en
   volver. Si /health no responde rápido, se muestra un aviso para que nadie
   piense que el sistema no anda. */
(function avisoArranque() {
  let aviso = null;
  const timer = setTimeout(() => {
    aviso = document.createElement('div');
    aviso.textContent = 'Iniciando el servidor… puede tardar hasta un minuto. No cierres la página.';
    aviso.setAttribute('role', 'status');
    aviso.className = 'aviso-arranque'; // estilos en styles.css
    document.body.appendChild(aviso);
  }, 2500);

  const listo = () => {
    clearTimeout(timer);
    if (aviso) {
      aviso.textContent = 'Servidor listo ✔';
      setTimeout(() => aviso.remove(), 1500);
    }
  };
  fetch(`${API}/health`).then(listo, listo);
})();
