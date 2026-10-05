require('dotenv').config();

/**
 * Configuración centralizada. Las variables obligatorias se verifican recién
 * cuando algo necesita la base (ver verificarRequeridas, usada por db.js):
 * así las pruebas unitarias, que no tocan la base, corren sin .env.
 */
const requeridas = ['DATABASE_URL'];

function verificarRequeridas() {
  const faltantes = requeridas.filter((k) => !process.env[k]);
  if (faltantes.length) {
    throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}. `
      + 'Creá el archivo .env a partir de .env.example.');
  }
}

const DATABASE_URL = process.env.DATABASE_URL || '';
const esLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);

// Si la cadena trae ?sslmode=..., pg la interpreta como verify-full y rechaza
// el certificado de Supabase (CA propia). Se quita y el SSL se configura abajo.
const connectionString = esLocal
  ? DATABASE_URL
  : DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');

module.exports = {
  verificarRequeridas,
  entorno: process.env.NODE_ENV || 'development',
  puerto: Number(process.env.PORT) || 3000,
  db: {
    connectionString,
    ssl: esLocal ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: 30000,
  },
  cors: {
    // En producción conviene limitar a los dominios propios: CORS_ORIGINS=https://a.com,https://b.com
    origins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  },
  uploads: {
    maxBytes: 2 * 1024 * 1024,
    extensiones: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  storage: {
    // Con SUPABASE_URL + SUPABASE_SECRET_KEY las imágenes van a Supabase Storage;
    // sin ellas, al disco local (public/uploads). Ver src/services/almacenamiento.
    supabase: {
      habilitado: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
      url: process.env.SUPABASE_URL,
      clave: process.env.SUPABASE_SECRET_KEY,
      bucket: process.env.SUPABASE_BUCKET || 'insumos',
    },
  },
  mail: {
    habilitado: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    destinatario: process.env.MAIL_DESTINATARIO,
  },
};
