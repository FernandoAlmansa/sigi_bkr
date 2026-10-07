/**
 * Carga inicial de insumos desde un CSV (exportado de la planilla del taller).
 *
 *   node scripts/importar-planilla.js <archivo.csv> [--api URL] [--confirmar]
 *
 * Sin --confirmar NO cambia nada: muestra qué haría (vista previa).
 * --api por defecto es tu servidor local (http://localhost:3000/api).
 *
 * Usa la API pública del sistema (las mismas validaciones que la app), así
 * que no necesita credenciales de la base. Se puede correr dos veces sin
 * duplicar: los insumos que ya existen (misma categoría y nombre) se omiten.
 *
 * Columnas del CSV (separado por ;):
 *   codigo_planilla; accion (crear|actualizar); categoria; nombre;
 *   caracteristicas ("Talle=85 (S) | Color=Negro"); unidad;
 *   presentaciones ("caja=300; rollo=100"); stock; stock_minimo;
 *   nombre_actual_en_sistema (sólo para actualizar)
 */
const fs = require('fs');

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const API = (args.includes('--api') ? args[args.indexOf('--api') + 1] : 'http://localhost:3000/api').replace(/\/$/, '');
const CONFIRMAR = args.includes('--confirmar');
const OBS_CARGA = 'Carga inicial (stock según planilla)';
const USUARIO = 'Carga inicial';

if (!archivo) {
  console.error('Uso: node scripts/importar-planilla.js <archivo.csv> [--api URL] [--confirmar]');
  process.exit(1);
}

// ---------- utilidades ----------
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const numero = (t) => (String(t ?? '').trim() === '' ? 0 : Number(String(t).trim().replace(/\./g, '').replace(',', '.')));

function leerCsv(ruta) {
  const texto = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '');
  const filas = [];
  let campo = '', fila = [], comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false; else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((v) => v.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); if (fila.some((v) => v.trim() !== '')) filas.push(fila); }
  const [cab, ...datos] = filas;
  return datos.map((f) => Object.fromEntries(cab.map((k, i) => [k.trim(), (f[i] ?? '').trim()])));
}

async function api(metodo, ruta, body) {
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const det = data.errores ? ` ${data.errores.join(' ')}` : '';
    throw new Error(`${metodo} ${ruta}: ${data.error || res.status}${det}`);
  }
  return data;
}

function presentaciones(texto) {
  return String(texto || '').split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [nombre, factor] = p.split('=');
    return { nombre: nombre.trim().toLowerCase(), factor: numero(factor) };
  });
}

// ---------- cambios de categorías acordados ----------
function cambiosDeCategorias(cats) {
  const cambios = [];
  const porNombre = (n) => cats.find((c) => norm(c.nombre) === norm(n));

  const tela = porNombre('Tela');
  if (tela && !tela.campos.some((c) => norm(c.etiqueta) === norm('Rinde (m por kg)'))) {
    cambios.push({ desc: 'Tela: agregar característica "Rinde (m por kg)" (número, opcional)', id: tela.id,
      body: { campos: [...tela.campos, { clave: 'rinde_m_por_kg', etiqueta: 'Rinde (m por kg)', tipo: 'numero', opciones: [], obligatorio: false }] } });
  }
  const emp = porNombre('Empaque');
  const tipoEmp = emp?.campos.find((c) => norm(c.etiqueta) === norm('Tipo de empaque'));
  if (tipoEmp && !tipoEmp.opciones.some((o) => norm(o) === norm('Sobre de envío'))) {
    cambios.push({ desc: 'Empaque: agregar la opción "Sobre de envío" a "Tipo de empaque"', id: emp.id,
      body: { campos: emp.campos.map((c) => (c === tipoEmp ? { ...c, opciones: [...c.opciones, 'Sobre de envío'] } : c)) } });
  }
  const arcos = porNombre('Arcos');
  if (arcos && (arcos.unidad_base !== 'pares' || !arcos.presentaciones.some((p) => p.nombre === 'pack'))) {
    cambios.push({ desc: 'Arcos: unidad base sugerida "pares" y presentación pack = 40', id: arcos.id,
      body: { unidad_base: 'pares', presentaciones: [{ nombre: 'pack', factor: 40 }] } });
  }
  const broche = porNombre('Broche');
  if (broche) {
    cambios.push({ desc: `Broche: eliminar la categoría (${broche.cantidad_insumos} insumos)`, id: broche.id, borrar: true,
      error: broche.cantidad_insumos > 0 ? 'tiene insumos, no se borra' : null });
  }
  return cambios;
}

/** Aplica en memoria los cambios de campos, para validar el CSV contra lo que va a quedar. */
function categoriasResultantes(cats, cambios) {
  return cats.map((c) => {
    const cam = cambios.find((x) => x.id === c.id && x.body);
    return cam ? { ...c, ...cam.body } : c;
  });
}

function armarAtributos(texto, cat) {
  const atributos = {};
  const errores = [];
  for (const par of String(texto || '').split('|').map((p) => p.trim()).filter(Boolean)) {
    const [etiqueta, ...resto] = par.split('=');
    const valor = resto.join('=').trim();
    const campo = cat.campos.find((c) => norm(c.etiqueta) === norm(etiqueta) || norm(c.clave) === norm(etiqueta));
    if (!campo) { errores.push(`"${etiqueta.trim()}" no es una característica de ${cat.nombre}`); continue; }
    if (campo.tipo === 'opciones' && !campo.opciones.includes(valor)) errores.push(`"${valor}" no es una opción de ${campo.etiqueta}`);
    atributos[campo.clave] = valor;
  }
  for (const c of cat.campos) if (c.obligatorio && !atributos[c.clave]) errores.push(`falta "${c.etiqueta}"`);
  return { atributos, errores };
}

// ---------- principal ----------
(async () => {
  console.log(`\nAPI: ${API}   Modo: ${CONFIRMAR ? 'APLICAR CAMBIOS' : 'vista previa (no cambia nada)'}\n`);
  const filas = leerCsv(archivo);
  const [cats, unidades, insumos] = await Promise.all([api('GET', '/categorias'), api('GET', '/unidades'), api('GET', '/insumos')]);

  const cambios = cambiosDeCategorias(cats);
  const catsFinal = categoriasResultantes(cats, cambios);
  const unidadesOk = new Set(unidades.map((u) => u.nombre));

  const plan = [];
  for (const f of filas) {
    const cat = catsFinal.find((c) => norm(c.nombre) === norm(f.categoria));
    const p = { f, cat, errores: [], tarea: null };
    if (!cat) { p.errores.push(`no existe la categoría "${f.categoria}"`); plan.push(p); continue; }
    if (!unidadesOk.has(f.unidad)) p.errores.push(`no existe la unidad "${f.unidad}"`);
    const { atributos, errores } = armarAtributos(f.caracteristicas, cat);
    p.errores.push(...errores);
    p.datos = {
      nombre: f.nombre, id_tipo: cat.id, unidad_medida: f.unidad, atributos,
      presentaciones: presentaciones(f.presentaciones), stock_minimo: numero(f.stock_minimo),
    };
    p.stock = numero(f.stock);

    if (f.accion === 'actualizar') {
      const buscado = f.nombre_actual_en_sistema || f.nombre;
      p.existente = insumos.find((i) => norm(i.nombre) === norm(buscado) || norm(i.nombre) === norm(f.nombre));
      if (!p.existente) p.errores.push(`no encontré "${buscado}" en el sistema para actualizar`);
      else {
        const e = p.existente;
        const firma = (l) => JSON.stringify((l || []).map((x) => [x.nombre, Number(x.factor)]).sort());
        const igual = e.nombre === p.datos.nombre && e.unidad_medida === p.datos.unidad_medida
          && Number(e.stock_actual) === p.stock && Number(e.stock_minimo) === p.datos.stock_minimo
          && firma(e.presentaciones) === firma(p.datos.presentaciones)
          && JSON.stringify(e.atributos || {}) === JSON.stringify(p.datos.atributos);
        p.tarea = igual ? 'omitir' : 'actualizar';
      }
    } else {
      const dup = insumos.find((i) => i.id_tipo === cat.id && norm(i.nombre) === norm(f.nombre));
      p.tarea = dup ? 'omitir' : 'crear';
    }
    plan.push(p);
  }

  // ---------- vista previa ----------
  console.log('CATEGORÍAS');
  if (!cambios.length) console.log('  (sin cambios)');
  for (const c of cambios) console.log(`  • ${c.desc}${c.error ? `  ⚠ ${c.error}` : ''}`);

  const conError = plan.filter((p) => p.errores.length);
  const crear = plan.filter((p) => !p.errores.length && p.tarea === 'crear');
  const act = plan.filter((p) => !p.errores.length && p.tarea === 'actualizar');
  const omitir = plan.filter((p) => !p.errores.length && p.tarea === 'omitir');

  console.log(`\nINSUMOS: ${crear.length} a crear · ${act.length} a actualizar · ${omitir.length} ya existen (se omiten) · ${conError.length} con errores\n`);
  for (const p of crear) {
    const pres = p.datos.presentaciones.map((x) => `${x.nombre}=${x.factor}`).join(', ');
    console.log(`  + [${p.cat.nombre}] ${p.datos.nombre} — stock ${p.stock} ${p.datos.unidad_medida}${pres ? ` (${pres})` : ''}${p.datos.stock_minimo ? `, mín. ${p.datos.stock_minimo}` : ''}`);
  }
  for (const p of act) {
    console.log(`  ~ [${p.cat.nombre}] "${p.existente.nombre}" → "${p.datos.nombre}": stock ${p.existente.stock_actual} → ${p.stock} ${p.datos.unidad_medida}`);
  }
  for (const p of omitir) console.log(`  = [${p.cat.nombre}] ${p.datos.nombre} (ya está cargado)`);
  for (const p of conError) console.log(`  ✗ [${p.f.categoria}] ${p.f.nombre}: ${p.errores.join('; ')}`);

  if (!CONFIRMAR) {
    console.log('\nNo se cambió nada. Si está todo bien, volvé a correrlo agregando --confirmar.\n');
    return;
  }
  if (conError.length) {
    console.error('\nHay filas con errores: corregí el CSV antes de confirmar. No se cambió nada.\n');
    process.exit(1);
  }

  // ---------- aplicar ----------
  console.log('\nAplicando...');
  for (const c of cambios) {
    if (c.error) { console.log(`  ⚠ ${c.desc}: ${c.error}`); continue; }
    if (c.borrar) await api('DELETE', `/categorias/${c.id}`);
    else await api('PATCH', `/categorias/${c.id}`, c.body);
    console.log(`  ✓ ${c.desc}`);
  }

  let ok = 0, fallas = 0;
  for (const p of [...crear, ...act]) {
    try {
      if (p.tarea === 'crear') {
        const nuevo = await api('POST', '/insumos', { ...p.datos, stock_actual: 0 });
        if (p.stock > 0) {
          await api('POST', '/movimientos/ingreso', { id_insumo: nuevo.id, cantidad: p.stock, observacion: OBS_CARGA, usuario: USUARIO });
        }
      } else {
        await api('PATCH', `/insumos/${p.existente.id}`, p.datos);
        if (Number(p.existente.stock_actual) !== p.stock) {
          await api('POST', '/movimientos/ajuste', { id_insumo: p.existente.id, cantidad: p.stock, observacion: OBS_CARGA, usuario: USUARIO });
        }
      }
      ok++;
      process.stdout.write('.');
    } catch (err) {
      fallas++;
      console.log(`\n  ✗ ${p.datos.nombre}: ${err.message}`);
    }
  }
  console.log(`\n\nListo: ${ok} insumos cargados/actualizados, ${fallas} con error.`);
  if (fallas) console.log('Corregí los que fallaron y volvé a correrlo: los ya cargados se omiten solos.');
})().catch((err) => {
  console.error(`\nError: ${err.message}\n`);
  process.exit(1);
});
