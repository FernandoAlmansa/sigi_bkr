const db = require('../src/data/db');

/**
 * Migraciones versionadas e idempotentes. Reemplazan los ALTER TABLE sueltos
 * que antes se ejecutaban a ciegas en cada arranque: ahora quedan registradas
 * en la tabla `_migraciones` y sólo corren una vez.
 */
const MIGRACIONES = [
  {
    id: '001_columnas_imagen_atributos',
    sql: `
      ALTER TABLE insumos ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(500);
      ALTER TABLE insumos ADD COLUMN IF NOT EXISTS atributos JSONB DEFAULT '{}';
      UPDATE insumos SET atributos = '{}' WHERE atributos IS NULL;
    `,
  },
  {
    id: '002_normalizar_unidades',
    sql: `UPDATE insumos SET unidad_medida = 'cantidad' WHERE unidad_medida = 'unidades';`,
  },
  {
    id: '003_tipo_movimiento_ajuste',
    sql: `
      ALTER TABLE movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_tipo_movimiento_check;
      ALTER TABLE movimientos_stock ADD CONSTRAINT movimientos_stock_tipo_movimiento_check
        CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO', 'AJUSTE'));
    `,
  },
  {
    id: '004_indices',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_insumos_tipo     ON insumos (id_tipo);
      CREATE INDEX IF NOT EXISTS idx_mov_insumo_fecha ON movimientos_stock (id_insumo, fecha DESC);
      CREATE INDEX IF NOT EXISTS idx_mov_fecha        ON movimientos_stock (fecha DESC);
    `,
  },
  {
    id: '005_estado_critico_consistente',
    sql: `UPDATE insumos SET estado_critico = (stock_actual <= stock_minimo);`,
  },
  {
    // En Supabase las tablas del schema public quedan expuestas por su API REST
    // a cualquiera con la clave pública. Activar RLS sin políticas la cierra;
    // el backend no se ve afectado porque se conecta como dueño de las tablas.
    // Sólo aplica si existe el rol 'anon' (es decir, si la base es Supabase).
    id: '006_rls_supabase',
    sql: `
      DO $$
      DECLARE t TEXT;
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          FOREACH t IN ARRAY ARRAY['tipos_insumo', 'insumos', 'movimientos_stock', '_migraciones'] LOOP
            BEGIN
              EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
            EXCEPTION WHEN insufficient_privilege THEN
              RAISE NOTICE 'Sin permiso para activar RLS en %', t;
            END;
          END LOOP;
        END IF;
      END $$;
    `,
  },
  {
    // Categorías configurables: cada categoría define sus propios campos
    // (antes estaban fijos en public/js/app.js como CAMPOS_POR_TIPO), una
    // unidad base sugerida y presentaciones sugeridas para sus insumos.
    id: '007_categorias_configurables',
    sql: `
      ALTER TABLE tipos_insumo ADD COLUMN IF NOT EXISTS campos         JSONB       NOT NULL DEFAULT '[]';
      ALTER TABLE tipos_insumo ADD COLUMN IF NOT EXISTS unidad_base    VARCHAR(20);
      ALTER TABLE tipos_insumo ADD COLUMN IF NOT EXISTS presentaciones JSONB       NOT NULL DEFAULT '[]';
      ALTER TABLE tipos_insumo ADD COLUMN IF NOT EXISTS activo         BOOLEAN     NOT NULL DEFAULT TRUE;

      -- Se trasladan los campos que estaban escritos a mano en el front.
      UPDATE tipos_insumo SET campos = '[{"clave":"talle","etiqueta":"Talle","tipo":"opciones","opciones":["85 (S)","90 (M)","95 (L)","100 (XL)"],"obligatorio":true}]'
        WHERE lower(nombre) IN ('tazas', 'tazas/copas', 'copas') AND campos = '[]';
      UPDATE tipos_insumo SET campos = '[{"clave":"ancho_mm","etiqueta":"Ancho","tipo":"opciones","opciones":["5 mm","7 mm","14 mm","25 mm"],"obligatorio":true}]'
        WHERE lower(nombre) IN ('elástico', 'elastico', 'elásticos', 'elasticos') AND campos = '[]';
      UPDATE tipos_insumo SET campos = '[{"clave":"subtipo","etiqueta":"Tipo de herraje","tipo":"opciones","opciones":["Regulador","Argolla","Desmontable","Perchita","Gancho","Broche","Dadito","Unión"],"obligatorio":true},{"clave":"detalle","etiqueta":"Detalle","tipo":"texto","opciones":[],"obligatorio":false}]'
        WHERE lower(nombre) = 'herrajes' AND campos = '[]';
      UPDATE tipos_insumo SET campos = '[{"clave":"talle","etiqueta":"Talle","tipo":"opciones","opciones":["90 (S)","95 (M)","100 (L)","110 (XL)","120 (XXL)"],"obligatorio":true}]'
        WHERE lower(nombre) = 'arcos' AND campos = '[]';
      UPDATE tipos_insumo SET campos = '[{"clave":"prenda","etiqueta":"Prenda","tipo":"opciones","opciones":["Corpiño","Bombacha"],"obligatorio":true},{"clave":"color","etiqueta":"Color","tipo":"texto","opciones":[],"obligatorio":false}]'
        WHERE lower(nombre) = 'dijes' AND campos = '[]';
      UPDATE tipos_insumo SET campos = '[{"clave":"talle","etiqueta":"Talle","tipo":"texto","opciones":[],"obligatorio":true}]'
        WHERE lower(nombre) = 'etiquetas' AND campos = '[]';
      UPDATE tipos_insumo SET campos = '[{"clave":"subtipo","etiqueta":"Tipo de empaque","tipo":"opciones","opciones":["Sobre e-commerce","Bolsa playera","Estuche","Neceser","Caja","Loop","Cartón"],"obligatorio":true}]'
        WHERE lower(nombre) = 'empaque' AND campos = '[]';

      -- Telas: se cuentan en metros y se compran por rollo (sugerido 20 m).
      UPDATE tipos_insumo
         SET unidad_base = 'metros', presentaciones = '[{"nombre":"rollo","factor":20}]'
       WHERE nombre ILIKE '%tela%' AND presentaciones = '[]';
    `,
  },
  {
    // Presentaciones por insumo: cada insumo guarda su stock en una unidad
    // base y puede tener presentaciones con su factor de conversión
    // (rollo = 20 m, paquete = 100 unidades...). Reemplaza el METROS_POR_ROLLO
    // fijo del front y la detección de telas por nombre.
    id: '008_presentaciones_insumo',
    sql: `
      CREATE TABLE IF NOT EXISTS presentaciones (
        id         SERIAL PRIMARY KEY,
        id_insumo  INTEGER       NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
        nombre     VARCHAR(40)   NOT NULL,
        factor     NUMERIC(12,3) NOT NULL CHECK (factor > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_presentacion_insumo_nombre
        ON presentaciones (id_insumo, lower(nombre));

      -- Las telas ya guardaban el stock en metros (aunque la unidad dijera 'rollos').
      UPDATE insumos i SET unidad_medida = 'metros'
        FROM tipos_insumo t
       WHERE t.id = i.id_tipo AND t.nombre ILIKE '%tela%';
      INSERT INTO presentaciones (id_insumo, nombre, factor)
      SELECT i.id, 'rollo', 20
        FROM insumos i JOIN tipos_insumo t ON t.id = i.id_tipo
       WHERE t.nombre ILIKE '%tela%'
      ON CONFLICT DO NOTHING;

      -- El historial guarda también lo que el usuario cargó ("2 rollos"),
      -- además de la cantidad en unidad base.
      ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS presentacion          VARCHAR(40);
      ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS cantidad_presentacion NUMERIC(12,3);

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          BEGIN
            ALTER TABLE presentaciones ENABLE ROW LEVEL SECURITY;
          EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Sin permiso para activar RLS en presentaciones';
          END;
        END IF;
      END $$;
    `,
  },
  {
    // Catálogo controlado de unidades: insumos y categorías sólo pueden usar
    // unidades de esta tabla (FK), así no conviven "metros", "metro" y
    // "metor". ON UPDATE CASCADE permite renombrar una unidad y que el cambio
    // llegue a todos los insumos que la usan.
    id: '009_unidades_controladas',
    sql: `
      CREATE TABLE IF NOT EXISTS unidades (
        id      SERIAL PRIMARY KEY,
        nombre  VARCHAR(20) NOT NULL UNIQUE
      );

      UPDATE insumos SET unidad_medida = lower(trim(unidad_medida));
      UPDATE tipos_insumo SET unidad_base = NULLIF(lower(trim(unidad_base)), '');

      INSERT INTO unidades (nombre)
      VALUES ('unidades'), ('metros'), ('pares'), ('kg'), ('gramos'), ('cm'), ('litros')
      ON CONFLICT DO NOTHING;
      INSERT INTO unidades (nombre)
      SELECT DISTINCT unidad_medida FROM insumos WHERE unidad_medida <> ''
      ON CONFLICT DO NOTHING;
      INSERT INTO unidades (nombre)
      SELECT DISTINCT unidad_base FROM tipos_insumo WHERE unidad_base IS NOT NULL
      ON CONFLICT DO NOTHING;

      ALTER TABLE insumos ALTER COLUMN unidad_medida DROP DEFAULT;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_insumos_unidad') THEN
          ALTER TABLE insumos ADD CONSTRAINT fk_insumos_unidad
            FOREIGN KEY (unidad_medida) REFERENCES unidades(nombre) ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tipos_unidad_base') THEN
          ALTER TABLE tipos_insumo ADD CONSTRAINT fk_tipos_unidad_base
            FOREIGN KEY (unidad_base) REFERENCES unidades(nombre) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          BEGIN
            ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
          EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Sin permiso para activar RLS en unidades';
          END;
        END IF;
      END $$;
    `,
  },
];

async function ejecutarMigraciones() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      id          VARCHAR(80) PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const { rows } = await db.query('SELECT id FROM _migraciones');
  const aplicadas = new Set(rows.map((r) => r.id));

  for (const migracion of MIGRACIONES) {
    if (aplicadas.has(migracion.id)) continue;
    try {
      await db.enTransaccion(async (client) => {
        await client.query(migracion.sql);
        await client.query('INSERT INTO _migraciones (id) VALUES ($1)', [migracion.id]);
      });
      console.log(`[migracion] aplicada ${migracion.id}`);
    } catch (err) {
      console.error(`[migracion] falló ${migracion.id}: ${err.message}`);
      throw err;
    }
  }
}

module.exports = { ejecutarMigraciones, MIGRACIONES };
