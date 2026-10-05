/**
 * Migración única: sube a Supabase Storage las imágenes que hoy están en
 * public/uploads y actualiza insumos.imagen_url con la URL pública nueva.
 *
 * Uso (desde la raíz del proyecto, con el .env apuntando a Supabase):
 *   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run migrar-imagenes
 */
const fs = require('fs/promises');
const path = require('path');
const config = require('../src/config');
const db = require('../src/data/db');
const SupabaseAlmacenamiento = require('../src/services/almacenamiento/SupabaseAlmacenamiento');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  if (!config.storage.supabase.habilitado) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY.');
  }
  const storage = new SupabaseAlmacenamiento(config.storage.supabase);
  console.log(`Base: ${new URL(config.db.connectionString).host}`);
  const { rows: [totales] } = await db.query(
    'SELECT count(*)::int AS insumos, count(imagen_url)::int AS con_imagen FROM insumos',
  );
  console.log(`Insumos: ${totales.insumos} (con imagen_url: ${totales.con_imagen})`);

  // Acepta '/uploads/x', 'uploads/x' o 'http://localhost:3000/uploads/x'; ignora las que ya están en Storage.
  const { rows } = await db.query(
    "SELECT id, imagen_url FROM insumos WHERE imagen_url LIKE '%uploads/%' AND imagen_url NOT LIKE '%supabase.co%' ORDER BY id",
  );
  console.log(`${rows.length} insumo(s) con imagen local.`);

  for (const { id, imagen_url: urlVieja } of rows) {
    const relativo = urlVieja.split('?')[0].replace(/^.*uploads\//, 'uploads/');
    const archivo = path.join(__dirname, '..', 'public', relativo);
    try {
      const buffer = await fs.readFile(archivo);
      const extension = path.extname(archivo).toLowerCase();
      const url = await storage.guardar(id, { buffer, extension, mimetype: MIME[extension] || 'application/octet-stream' });
      await db.query('UPDATE insumos SET imagen_url = $1 WHERE id = $2', [url, id]);
      console.log(`  insumo ${id}: ${urlVieja} -> ${url}`);
    } catch (err) {
      console.error(`  insumo ${id}: NO migrado (${err.message})`);
    }
  }
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => db.cerrar());
