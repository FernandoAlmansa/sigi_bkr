const { ErrorValidacion, ErrorReglaNegocio } = require('./errores');

/** "Métros " → "metros": minúsculas, sin espacios de más. */
function normalizar(nombre) {
  return String(nombre ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Para comparar: además sin tildes. */
function clave(nombre) {
  return normalizar(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Distancia de edición con transposiciones (metor ↔ metro = 1). */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** "metros" → "metro", "pares" → "par" (para comparar sin importar el plural). */
function singular(k) {
  if (k.length > 4 && /[^aeiou]es$/.test(k)) return k.slice(0, -2);
  if (k.length > 3 && k.endsWith('s')) return k.slice(0, -1);
  return k;
}

/**
 * Unidad de medida del catálogo controlado (tabla `unidades`). Los insumos y
 * las categorías sólo pueden usar unidades de este catálogo, así no aparecen
 * "metros", "metro" y "metor" como si fueran tres cosas distintas.
 */
class Unidad {
  constructor({ id = null, nombre, insumos = 0, categorias = 0 }) {
    this.id = id;
    this.nombre = nombre;
    this.insumos = Number(insumos);
    this.categorias = Number(categorias);
  }

  static desdeFila(fila) {
    return fila ? new Unidad(fila) : null;
  }

  static validarNombre(nombre) {
    const n = normalizar(nombre);
    if (!n) throw new ErrorValidacion('El nombre de la unidad es obligatorio.');
    if (n.length > 20) throw new ErrorValidacion('El nombre de la unidad no puede superar los 20 caracteres.');
    return n;
  }

  /**
   * Busca una unidad existente que probablemente sea la misma escrita de otra
   * forma: igual sin tildes, singular/plural (metro/metros, par/pares) o con
   * un error de tipeo (metor/metros). Las abreviaturas cortas (m, cm, kg, g)
   * no se comparan por tipeo porque difieren en una letra y son distintas.
   */
  static parecida(nombre, existentes) {
    const n = clave(nombre);
    for (const e of existentes) {
      const k = clave(e.nombre);
      if (k === n) return e;
      if ([`${n}s`, `${n}es`].includes(k) || [`${k}s`, `${k}es`].includes(n)) return e;
      const [sn, sk] = [singular(n), singular(k)];
      const largo = Math.min(sn.length, sk.length);
      if (largo >= 4 && distancia(sn, sk) <= (largo >= 7 ? 2 : 1)) return e;
    }
    return null;
  }

  /** Lanza si hay una parecida, salvo que el usuario confirme que es otra. */
  static verificarNoParecida(nombre, existentes, forzar = false) {
    const exacta = existentes.find((e) => clave(e.nombre) === clave(nombre));
    if (exacta) {
      throw new ErrorReglaNegocio(`Ya existe la unidad "${exacta.nombre}".`, { existente: exacta.nombre }, 'UNIDAD_EXISTENTE');
    }
    if (forzar) return;
    const parecida = Unidad.parecida(nombre, existentes);
    if (parecida) {
      throw new ErrorReglaNegocio(
        `"${normalizar(nombre)}" se parece a la unidad "${parecida.nombre}" que ya existe. ¿No es la misma?`,
        { sugerencia: parecida.nombre },
        'UNIDAD_PARECIDA',
      );
    }
  }

  toJSON() {
    return { id: this.id, nombre: this.nombre, insumos: this.insumos, categorias: this.categorias };
  }
}

Unidad.normalizar = normalizar;
Unidad.distancia = distancia;
module.exports = Unidad;
