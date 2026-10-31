/**
 * Prueba de caja negra del CU-08 (Anexo C.2): casos CN-01 a CN-17, contra la
 * API real y una base PostgreSQL de PRUEBA. No forma parte de `npm test`
 * porque necesita base y servidor levantados.
 *
 *   1. Base local de prueba con el esquema:  createdb sigi_bkr_it3_prueba
 *      psql -d sigi_bkr_it3_prueba -f db/schema.sql
 *   2. Servidor apuntando a esa base:  DATABASE_URL=... PORT=3101 node server.js
 *   3. DATABASE_URL=... node test/integracion/cu08-caja-negra.js http://localhost:3101
 *
 * BORRA todos los insumos y movimientos de la base: por eso se niega a correr
 * si la base no es local o si su nombre no contiene "prueba".
 */
const { Client } = require('pg');
const { hoyEnTaller } = require('../../src/domain/reportes/fechas');

const URL_BASE = process.argv[2] || 'http://localhost:3101';
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!/@?(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL) || !/prueba/.test(DATABASE_URL.split('/').pop())) {
  console.error('Esta prueba borra datos: sólo corre contra una base local cuyo nombre contenga "prueba".');
  process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(URL_BASE)) {
  console.error('El servidor bajo prueba tiene que ser local.');
  process.exit(1);
}

const PERIODO = { desde: '2025-12-01', hasta: '2026-02-28' };   // 90 días (prototipo, Figura 4)
const LIMITES = { desde: '2026-03-01', hasta: '2026-03-10' };   // 10 días

function sumarDias(aaaammdd, n) {
  const d = new Date(`${aaaammdd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** n egresos repartidos en el período, con las cantidades dadas. */
function egresos(cantidades, desde, dias) {
  return cantidades.map((c, i) => ({ tipo: 'EGRESO', cantidad: c, fecha: sumarDias(desde, Math.floor((i * dias) / cantidades.length)) }));
}

// Insumos del prototipo + insumos para los valores límite.
const DATOS = [
  { tipo: 'Telas', nombre: 'Tela lycra negra', unidad: 'metros', stock: 12.5,
    movs: [...egresos(Array(28).fill(15), PERIODO.desde, 90),
      // RD04: un ingreso y un ajuste en el período NO deben contar como consumo.
      { tipo: 'INGRESO', cantidad: 100, fecha: '2026-01-10' }, { tipo: 'AJUSTE', cantidad: 3, fecha: '2026-01-20' }] },
  { tipo: 'Elásticos', nombre: 'Elástico 10 mm', unidad: 'metros', stock: 8, movs: egresos(Array(20).fill(15.5), PERIODO.desde, 90) },
  { tipo: 'Tazas', nombre: 'Taza 90 (M)', unidad: 'unidades', stock: 45, movs: egresos(Array(20).fill(9), PERIODO.desde, 90) },
  { tipo: 'Herrajes', nombre: 'Herraje regulador', unidad: 'unidades', stock: 240, movs: egresos([...Array(14).fill(17), 22], PERIODO.desde, 90) },
  { tipo: 'Dijes', nombre: 'Dije corpiño', unidad: 'unidades', stock: 60, movs: egresos([1, 1, 2], PERIODO.desde, 90) },
  { tipo: 'Arcos', nombre: 'Arco talle 100', unidad: 'pares', stock: 35, movs: [] },
  // 10 días, 5 egresos de 10 → 5 por día. Cobertura = stock / 5.
  { tipo: 'Pruebas límite', nombre: 'Límite 4 egresos', unidad: 'unidades', stock: 100, movs: egresos(Array(4).fill(10), LIMITES.desde, 10) },
  { tipo: 'Pruebas límite', nombre: 'Límite 5 egresos', unidad: 'unidades', stock: 100, movs: egresos(Array(5).fill(10), LIMITES.desde, 10) },
  { tipo: 'Pruebas límite', nombre: 'Cobertura 10,0', unidad: 'unidades', stock: 50, movs: egresos(Array(5).fill(10), LIMITES.desde, 10) },
  { tipo: 'Pruebas límite', nombre: 'Cobertura 10,1', unidad: 'unidades', stock: 50.5, movs: egresos(Array(5).fill(10), LIMITES.desde, 10) },
  { tipo: 'Pruebas límite', nombre: 'Cobertura 30,0', unidad: 'unidades', stock: 150, movs: egresos(Array(5).fill(10), LIMITES.desde, 10) },
  { tipo: 'Pruebas límite', nombre: 'Cobertura 30,1', unidad: 'unidades', stock: 150.5, movs: egresos(Array(5).fill(10), LIMITES.desde, 10) },
];

async function cargarDatos(db) {
  await db.query('TRUNCATE linea_consumo, reporte_consumo, movimientos_stock, presentaciones, insumos, tipos_insumo RESTART IDENTITY CASCADE');
  await db.query('DELETE FROM umbral_cobertura');
  await db.query('INSERT INTO umbral_cobertura (dias_observacion, dias_criticidad, egresos_minimos) VALUES (30, 10, 5)');
  const tipos = {};
  for (const d of DATOS) {
    if (!tipos[d.tipo]) {
      tipos[d.tipo] = (await db.query('INSERT INTO tipos_insumo (nombre) VALUES ($1) RETURNING id', [d.tipo])).rows[0].id;
    }
    const { id } = (await db.query(
      `INSERT INTO insumos (nombre, id_tipo, unidad_medida, stock_actual, stock_minimo, estado_critico)
       VALUES ($1, $2, $3, $4, 0, FALSE) RETURNING id`, [d.nombre, tipos[d.tipo], d.unidad, d.stock],
    )).rows[0];
    for (const m of d.movs) {
      await db.query(
        `INSERT INTO movimientos_stock (id_insumo, tipo_movimiento, cantidad, stock_resultante, usuario, fecha)
         VALUES ($1, $2, $3, $4, 'Prueba CN', ($5::date + time '12:00') AT TIME ZONE 'America/Argentina/Buenos_Aires')`,
        [id, m.tipo, m.cantidad, d.stock, m.fecha],
      );
    }
  }
  return tipos;
}

async function pedir(params) {
  const res = await fetch(`${URL_BASE}/api/reportes/consumo?${new URLSearchParams(params)}`);
  return { status: res.status, cuerpo: await res.json() };
}

const resultados = [];
function caso(id, entrada, esperado, obtenido, ok) {
  resultados.push({ id, entrada, esperado, obtenido, ok });
}
const lineaDe = (r, nombre) => r.cuerpo.lineas.find((l) => l.nombre === nombre);
const describir = (l) => `${l.estado_texto}${l.dias_cobertura === null ? ', promedio y cobertura vacíos' : `, ${String(l.dias_cobertura).replace('.', ',')} días`}`;

async function main() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  const tipos = await cargarDatos(db);
  const reportesGuardados = async () => Number((await db.query('SELECT COUNT(*) FROM reporte_consumo')).rows[0].count);
  const hoy = hoyEnTaller();
  const activos = DATOS.length;

  let r = await pedir(PERIODO);
  const tela = r.status === 200 && lineaDe(r, 'Tela lycra negra');
  caso('CN-01', 'Desde 01/12/2025, hasta 28/02/2026, todos los tipos', 'Reporte de 90 días, una línea por insumo activo',
    `${r.status}: ${r.cuerpo.encabezado?.cantidad_dias} días, ${r.cuerpo.lineas?.length} líneas de ${activos} insumos activos; Tela lycra negra consumo ${tela?.consumo_total} m (ingreso y ajuste no suman)`,
    r.status === 200 && r.cuerpo.encabezado.cantidad_dias === 90 && r.cuerpo.lineas.length === activos && tela.consumo_total === 420);
  const base = r;

  r = await pedir({ desde: sumarDias(hoy, -29), hasta: hoy });
  caso('CN-02', `Hasta = hoy (${hoy})`, 'Válido, genera el reporte', `${r.status}: reporte de ${r.cuerpo.encabezado?.cantidad_dias} días`, r.status === 200);

  let antes = await reportesGuardados();
  r = await pedir({ desde: sumarDias(hoy, -29), hasta: sumarDias(hoy, 1) });
  caso('CN-03', 'Hasta = hoy + 1 día', 'Rechazo A1: fecha hasta futura',
    `${r.status}: "${r.cuerpo.error}" (campo ${r.cuerpo.campo}); reportes guardados sin cambio`,
    r.status === 400 && r.cuerpo.campo === 'hasta' && (await reportesGuardados()) === antes);

  r = await pedir({ desde: '2026-01-15', hasta: '2026-01-15' });
  caso('CN-04', 'Desde = hasta (15/01/2026)', 'Válido, período de 1 día', `${r.status}: ${r.cuerpo.encabezado?.cantidad_dias} día`, r.status === 200 && r.cuerpo.encabezado.cantidad_dias === 1);

  antes = await reportesGuardados();
  r = await pedir({ desde: '2026-01-16', hasta: '2026-01-15' });
  caso('CN-05', 'Desde = hasta + 1 día', 'Rechazo A1: desde posterior a hasta',
    `${r.status}: "${r.cuerpo.error}" (campo ${r.cuerpo.campo}); reportes guardados sin cambio`,
    r.status === 400 && r.cuerpo.campo === 'desde' && (await reportesGuardados()) === antes);

  antes = await reportesGuardados();
  r = await pedir({ desde: '', hasta: '2026-01-15' });
  caso('CN-06', 'Fecha desde vacía', 'Rechazo A1 sin recuperar datos',
    `${r.status}: "${r.cuerpo.error}"; reportes guardados sin cambio`,
    r.status === 400 && r.cuerpo.campo === 'desde' && (await reportesGuardados()) === antes);

  antes = await reportesGuardados();
  r = await pedir({ ...PERIODO, id_tipo: 99999 });
  caso('CN-07', 'Tipo de insumo inexistente (id 99999)', 'Respuesta 400, no se genera reporte',
    `${r.status}: "${r.cuerpo.error}"; reportes guardados sin cambio`, r.status === 400 && (await reportesGuardados()) === antes);

  const arco = lineaDe(base, 'Arco talle 100');
  caso('CN-08', 'Arco talle 100: 0 egresos', 'SIN ROTACIÓN, promedio y cobertura con guion',
    describir(arco), arco.estado === 'SIN_ROTACION' && arco.promedio_diario === null && arco.dias_cobertura === null);

  const lim = await pedir({ ...LIMITES, id_tipo: tipos['Pruebas límite'] });
  const l4 = lineaDe(lim, 'Límite 4 egresos');
  caso('CN-09', 'Insumo con 4 egresos (mínimo − 1)', 'MUESTRA INSUFICIENTE', describir(l4), l4.estado === 'MUESTRA_INSUFICIENTE');
  const l5 = lineaDe(lim, 'Límite 5 egresos');
  caso('CN-10', 'Insumo con 5 egresos (mínimo)', 'Con proyección y estado según cobertura', describir(l5), l5.dias_cobertura === 20 && l5.estado === 'EN_OBSERVACION');

  [['CN-11', 'Cobertura 10,0', 'CRITICA', 'CRÍTICA'], ['CN-12', 'Cobertura 10,1', 'EN_OBSERVACION', 'EN OBSERVACIÓN'],
    ['CN-13', 'Cobertura 30,0', 'EN_OBSERVACION', 'EN OBSERVACIÓN'], ['CN-14', 'Cobertura 30,1', 'SUFICIENTE', 'SUFICIENTE']]
    .forEach(([id, nombre, estado, texto]) => {
      const l = lineaDe(lim, nombre);
      caso(id, `${nombre} días`, texto, describir(l), l.estado === estado);
    });

  r = await pedir({ ...PERIODO, id_tipo: tipos.Telas });
  caso('CN-15', 'Tipo de insumo = Telas', 'Sólo líneas de insumos de ese tipo',
    `${r.status}: ${r.cuerpo.lineas?.length} línea(s): ${r.cuerpo.lineas?.map((l) => `${l.nombre} (${l.tipo})`).join(', ')}`,
    r.status === 200 && r.cuerpo.lineas.length > 0 && r.cuerpo.lineas.every((l) => l.tipo === 'Telas'));

  r = await pedir({ ...PERIODO, orden: 'consumo' });
  const consumos = r.cuerpo.lineas.map((l) => l.consumo_total);
  caso('CN-16', 'Ordenar por consumo', 'Líneas de mayor a menor consumo',
    `${r.status}: ${consumos.slice(0, 6).join(' ≥ ')} ≥ …`, r.status === 200 && consumos.every((c, i) => i === 0 || consumos[i - 1] >= c));

  antes = await reportesGuardados();
  r = await pedir({ ...PERIODO, orden: 'precio' });
  caso('CN-17', 'Criterio de orden "precio"', 'Respuesta 400, no se genera reporte',
    `${r.status}: "${r.cuerpo.error}"; reportes guardados sin cambio`, r.status === 400 && (await reportesGuardados()) === antes);

  await db.end();

  resultados.forEach((c) => console.log(`${c.ok ? 'OK   ' : 'FALLA'} ${c.id} | ${c.entrada} | esperado: ${c.esperado} | obtenido: ${c.obtenido}`));
  console.log(JSON.stringify({ hoy, resultados }));
  const fallas = resultados.filter((c) => !c.ok).length;
  console.log(`\n${resultados.length - fallas} de ${resultados.length} casos OK`);
  process.exit(fallas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
