-- =====================================================================
-- SIGI-BKR — Modelo de datos (PostgreSQL)
-- Instalación limpia:  psql "$DATABASE_URL" -f db/schema.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS tipos_insumo (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS insumos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(120)  NOT NULL,
  id_tipo         INTEGER       NOT NULL REFERENCES tipos_insumo(id),
  unidad_medida   VARCHAR(20)   NOT NULL DEFAULT 'cantidad',
  stock_actual    NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo    NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  estado_critico  BOOLEAN       NOT NULL DEFAULT FALSE,
  activo          BOOLEAN       NOT NULL DEFAULT TRUE,
  imagen_url      VARCHAR(500),
  atributos       JSONB         NOT NULL DEFAULT '{}',
  creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id                SERIAL PRIMARY KEY,
  id_insumo         INTEGER       NOT NULL REFERENCES insumos(id),
  tipo_movimiento   VARCHAR(10)   NOT NULL,
  cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  stock_resultante  NUMERIC(12,3) NOT NULL,
  observacion       TEXT,
  usuario           VARCHAR(60)   NOT NULL DEFAULT 'Sistema',
  fecha             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_tipo     ON insumos (id_tipo);
CREATE INDEX IF NOT EXISTS idx_insumos_critico  ON insumos (estado_critico) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_mov_insumo_fecha ON movimientos_stock (id_insumo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_fecha        ON movimientos_stock (fecha DESC);
