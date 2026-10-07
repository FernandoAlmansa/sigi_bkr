const test = require('node:test');
const assert = require('node:assert');

const Presentacion = require('../src/domain/Presentacion');
const Categoria = require('../src/domain/Categoria');
const Insumo = require('../src/domain/Insumo');
const CategoriaBuilder = require('../src/domain/builders/CategoriaBuilder');
const InsumoBuilder = require('../src/domain/builders/InsumoBuilder');
const InventarioFacade = require('../src/services/InventarioFacade');
const AlertaService = require('../src/services/AlertaService');
const Unidad = require('../src/domain/Unidad');
const { ErrorValidacion, ErrorReglaNegocio, ErrorStockInsuficiente } = require('../src/domain/errores');

// ---------- Presentaciones ----------

test('Presentación: normaliza nombre y convierte a unidad base', () => {
  const [rollo] = Presentacion.validarLista([{ nombre: '  Rollo ', factor: '20' }], 'metros');
  assert.strictEqual(rollo.nombre, 'rollo');
  assert.strictEqual(rollo.aBase(2.5), 50);
});

test('Presentación: rechaza factor inválido, repetidas y nombre igual a la unidad base', () => {
  const { errores } = Presentacion.normalizarLista([
    { nombre: 'paquete', factor: 0 },
    { nombre: 'caja', factor: 10 },
    { nombre: 'Caja', factor: 12 },
    { nombre: 'unidades', factor: 1 },
  ], 'unidades');
  assert.strictEqual(errores.length, 3);
});

test('Insumo.convertirABase: sin presentación la cantidad ya está en unidad base', () => {
  const insumo = new Insumo({ nombre: 'Gancho', id_tipo: 1, unidad_medida: 'unidades', presentaciones: [{ nombre: 'paquete', factor: 100 }] });
  assert.deepStrictEqual(insumo.convertirABase(30, null), { cantidadBase: 30, presentacion: null });
  assert.strictEqual(insumo.convertirABase(30, 'unidades').cantidadBase, 30);
  assert.strictEqual(insumo.convertirABase(2, 'Paquete').cantidadBase, 200);
  assert.throws(() => insumo.convertirABase(1, 'bolsa'), ErrorValidacion);
});

// ---------- Categorías ----------

test('Categoría: genera la clave desde la etiqueta y parte las opciones por coma', () => {
  const { campos, errores } = Categoria.normalizarCampos([
    { etiqueta: 'Tamaño (mm)', tipo: 'numero' },
    { etiqueta: 'Color', tipo: 'opciones', opciones: 'Dorado, Plateado, , Dorado', obligatorio: true },
  ]);
  assert.deepStrictEqual(errores, []);
  assert.strictEqual(campos[0].clave, 'tamano_mm');
  assert.deepStrictEqual(campos[1].opciones, ['Dorado', 'Plateado']);
});

test('Categoría: valida obligatorios, opciones y números de los atributos', () => {
  const cat = new Categoria({
    nombre: 'Ganchos',
    campos: Categoria.normalizarCampos([
      { etiqueta: 'Color', tipo: 'opciones', opciones: ['Dorado'], obligatorio: true },
      { etiqueta: 'Tamaño', tipo: 'numero' },
    ]).campos,
  });
  assert.deepStrictEqual(cat.validarAtributos({ color: 'Dorado', tamano: '10', extra: 'x' }), { color: 'Dorado', tamano: '10' });
  assert.throws(() => cat.validarAtributos({}), ErrorValidacion);
  assert.throws(() => cat.validarAtributos({ color: 'Rojo' }), ErrorValidacion);
  assert.throws(() => cat.validarAtributos({ color: 'Dorado', tamano: 'grande' }), ErrorValidacion);
});

test('CategoriaBuilder: acumula errores de nombre, campos y presentaciones', () => {
  try {
    CategoriaBuilder.desdeBody({
      nombre: '',
      campos: [{ etiqueta: 'Talle', tipo: 'opciones', opciones: '' }],
      presentaciones: [{ nombre: 'rollo', factor: -1 }],
    }).build();
    assert.fail('debía lanzar');
  } catch (err) {
    assert.ok(err instanceof ErrorValidacion);
    assert.strictEqual(err.extra.errores.length, 3);
  }
});

// ---------- Facade ----------

function entornoConCategorias(insumoInicial) {
  const estado = { insumo: insumoInicial, stockGuardado: null, movimientos: [], creados: [], presentaciones: {} };
  const categoria = new Categoria({
    id: 3, nombre: 'Ganchos', unidad_base: 'unidades',
    presentaciones: [{ nombre: 'paquete', factor: 100 }],
    campos: [{ clave: 'color', etiqueta: 'Color', tipo: 'opciones', opciones: ['Dorado'], obligatorio: true }],
  });
  const insumos = {
    obtenerParaActualizar: async () => estado.insumo,
    actualizarStock: async (id, stock) => { estado.stockGuardado = stock; },
    crear: async (ins) => { estado.creados.push(ins); return { id: 50 }; },
    reemplazarPresentaciones: async (id, lista) => { estado.presentaciones[id] = lista; },
    obtenerPorId: async (id) => ({ id }),
  };
  const movimientos = { registrar: async (m) => { estado.movimientos.push(m); return { id: 1, ...m }; } };
  const tipos = { obtenerPorId: async (id) => (Number(id) === 3 ? categoria : null) };
  const unidades = { existe: async (n) => ['unidades', 'metros'].includes(n) };
  const facade = new InventarioFacade({
    insumos, movimientos, tipos, unidades, alertas: new AlertaService([]), transacciones: (fn) => fn({}),
  });
  return { facade, estado };
}

test('Movimiento en presentación: "2 paquetes" descuenta 200 unidades y lo deja asentado', async () => {
  const insumo = new Insumo({ id: 9, nombre: 'Gancho', id_tipo: 3, unidad_medida: 'unidades', stock_actual: 500, presentaciones: [{ nombre: 'paquete', factor: 100 }] });
  const { facade, estado } = entornoConCategorias(insumo);

  const res = await facade.registrarMovimiento('EGRESO', { id_insumo: 9, cantidad: 2, presentacion: 'paquete' });

  assert.strictEqual(res.nuevo_stock, 300);
  assert.strictEqual(estado.movimientos[0].cantidad, 200);
  assert.strictEqual(estado.movimientos[0].presentacion, 'paquete');
  assert.strictEqual(estado.movimientos[0].cantidadPresentacion, 2);
});

test('RD01 en presentación: 6 paquetes con 500 unidades se rechaza', async () => {
  const insumo = new Insumo({ id: 9, nombre: 'Gancho', id_tipo: 3, unidad_medida: 'unidades', stock_actual: 500, presentaciones: [{ nombre: 'paquete', factor: 100 }] });
  const { facade } = entornoConCategorias(insumo);
  await assert.rejects(facade.registrarMovimiento('EGRESO', { id_insumo: 9, cantidad: 6, presentacion: 'paquete' }), ErrorStockInsuficiente);
});

test('Alta de insumo: hereda unidad y presentaciones de la categoría y valida atributos', async () => {
  const { facade, estado } = entornoConCategorias(null);

  await facade.altaInsumo({ nombre: 'Gancho dorado', id_tipo: 3, atributos: { color: 'Dorado' } });
  assert.strictEqual(estado.creados[0].unidad_medida, 'unidades');
  assert.strictEqual(estado.presentaciones[50][0].nombre, 'paquete');

  await assert.rejects(facade.altaInsumo({ nombre: 'Sin color', id_tipo: 3, atributos: {} }), ErrorValidacion);
});

test('InsumoBuilder: buildParcial incluye presentaciones validadas', () => {
  const campos = InsumoBuilder.desdeBody({ unidad_medida: 'metros', presentaciones: [{ nombre: 'Rollo', factor: 35 }] }).buildParcial();
  assert.strictEqual(campos.presentaciones[0].nombre, 'rollo');
  assert.strictEqual(campos.presentaciones[0].factor, 35);
});

test('Baja de categoría con insumos activos se rechaza', async () => {
  const facade = new InventarioFacade({
    tipos: {
      obtenerPorId: async () => new Categoria({ id: 1, nombre: 'Tela' }),
      contarReferencias: async () => ({ activos: 3, total: 3 }),
    },
    alertas: new AlertaService([]),
  });
  await assert.rejects(facade.bajaCategoria(1), ErrorReglaNegocio);
});

// ---------- Unidades controladas ----------

test('Unidad: detecta singular/plural, tildes y errores de tipeo', () => {
  const existentes = [{ nombre: 'metros' }, { nombre: 'unidades' }, { nombre: 'pares' }, { nombre: 'cm' }, { nombre: 'kg' }];
  assert.strictEqual(Unidad.parecida('metro', existentes)?.nombre, 'metros');
  assert.strictEqual(Unidad.parecida('metor', existentes)?.nombre, 'metros');
  assert.strictEqual(Unidad.parecida('Métros', existentes)?.nombre, 'metros');
  assert.strictEqual(Unidad.parecida('unidad', existentes)?.nombre, 'unidades');
  assert.strictEqual(Unidad.parecida('par', existentes)?.nombre, 'pares');
  // Abreviaturas distintas no se confunden entre sí.
  assert.strictEqual(Unidad.parecida('m', existentes), null);
  assert.strictEqual(Unidad.parecida('g', existentes), null);
  assert.strictEqual(Unidad.parecida('litros', existentes), null);
});

test('Unidad: una parecida se rechaza salvo confirmación; una igual, siempre', () => {
  const existentes = [{ nombre: 'metros' }];
  assert.throws(() => Unidad.verificarNoParecida('metro', existentes), ErrorReglaNegocio);
  assert.doesNotThrow(() => Unidad.verificarNoParecida('metro', existentes, true));
  assert.throws(() => Unidad.verificarNoParecida('Metros', existentes, true), ErrorReglaNegocio);
});

test('Alta de insumo con una unidad que no está en el catálogo se rechaza', async () => {
  const { facade } = entornoConCategorias(null);
  await assert.rejects(
    facade.altaInsumo({ nombre: 'Gancho', id_tipo: 3, unidad_medida: 'metor', atributos: { color: 'Dorado' } }),
    ErrorValidacion,
  );
});
