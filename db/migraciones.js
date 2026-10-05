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
