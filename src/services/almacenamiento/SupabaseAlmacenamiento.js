const { StorageClient } = require('@supabase/storage-js');
const AlmacenamientoImagenes = require('./AlmacenamientoImagenes');

/**
 * Estrategia concreta para producción: Supabase Storage (bucket público).
 *
 * Cada carga usa un nombre nuevo (insumo-<id>-<timestamp>.<ext>) porque la URL
 * pública pasa por un CDN: si se pisara el mismo archivo, el navegador podría
 * seguir viendo la imagen vieja durante un buen rato.
 */
class SupabaseAlmacenamiento extends AlmacenamientoImagenes {
  constructor({ url, clave, bucket }) {
    super();
    this.bucket = bucket;
    this.storage = new StorageClient(`${url.replace(/\/$/, '')}/storage/v1`, {
      apikey: clave,
      Authorization: `Bearer ${clave}`,
    });
    this.bucketListo = null;
  }

  /** Crea el bucket público la primera vez; si ya existe, sigue de largo. */
  asegurarBucket() {
    if (!this.bucketListo) {
      this.bucketListo = (async () => {
        const { error } = await this.storage.getBucket(this.bucket);
        if (!error) return;
        const { error: errCrear } = await this.storage.createBucket(this.bucket, { public: true });
        if (errCrear && !/exist/i.test(errCrear.message)) throw errCrear;
      })().catch((err) => {
        this.bucketListo = null; // reintentar en la próxima carga
        throw new Error(`Supabase Storage: no se pudo preparar el bucket "${this.bucket}": ${err.message}`);
      });
    }
    return this.bucketListo;
  }

  async guardar(idInsumo, { buffer, extension, mimetype }) {
    await this.asegurarBucket();
    const prefijo = `insumo-${idInsumo}-`;
    const nombre = `${prefijo}${Date.now()}${extension}`;
    const archivos = this.storage.from(this.bucket);

    const { error } = await archivos.upload(nombre, buffer, { contentType: mimetype, upsert: true });
    if (error) throw new Error(`Supabase Storage: no se pudo subir la imagen: ${error.message}`);

    // Borrar las versiones anteriores de este insumo (best effort).
    try {
      const { data } = await archivos.list('', { search: prefijo, limit: 100 });
      const viejas = (data || []).map((f) => f.name).filter((n) => n.startsWith(prefijo) && n !== nombre);
      if (viejas.length) await archivos.remove(viejas);
    } catch { /* la limpieza no debe bloquear la carga */ }

    return archivos.getPublicUrl(nombre).data.publicUrl;
  }
}

module.exports = SupabaseAlmacenamiento;
