const fs = require('fs/promises');
const path = require('path');
const AlmacenamientoImagenes = require('./AlmacenamientoImagenes');

/**
 * Estrategia concreta para desarrollo: escribe en public/uploads y Express la
 * sirve como archivo estático. No sirve en Render (disco efímero).
 */
class DiscoLocalAlmacenamiento extends AlmacenamientoImagenes {
  constructor(directorio = path.join(__dirname, '../../../public/uploads')) {
    super();
    this.directorio = directorio;
  }

  async guardar(idInsumo, { buffer, extension }) {
    await fs.mkdir(this.directorio, { recursive: true });
    const nombre = `insumo-${idInsumo}${extension}`;

    // Limpieza de la imagen anterior si cambió la extensión.
    try {
      const previas = (await fs.readdir(this.directorio))
        .filter((f) => f.startsWith(`insumo-${idInsumo}.`) && f !== nombre);
      await Promise.all(previas.map((f) => fs.unlink(path.join(this.directorio, f))));
    } catch { /* la limpieza no debe bloquear la carga */ }

    await fs.writeFile(path.join(this.directorio, nombre), buffer);
    return `/uploads/${nombre}?v=${Date.now()}`;
  }
}

module.exports = DiscoLocalAlmacenamiento;
