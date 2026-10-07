-- =====================================================================
-- SIGI-BKR — Modelo de datos (PostgreSQL)
-- Instalación limpia:  psql "$DATABASE_URL" -f db/schema.sql
-- =====================================================================

-- Catálogo controlado de unidades de medida (metros, unidades, pares...).
CREATE TABLE IF NOT EXISTS unidades (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(20) NOT NULL UNIQUE
);
INSERT INTO unidades (nombre)
VALUES ('unidades'), ('metros'), ('pares'), ('kg'), ('gramos'), ('cm'), ('litros')
ON CONFLICT DO NOTHING;

-- Categorías. `campos` define las características que se piden a sus insumos:
--   [{"clave":"talle","etiqueta":"Talle","tipo":"opciones|texto|numero",
--     "opciones":["S","M"],"obligatorio":true}]
-- `unidad_base` y `presentaciones` son sugerencias para los insumos nuevos.
CREATE TABLE IF NOT EXISTS tipos_insumo (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(60) NOT NULL UNIQUE,
  campos          JSONB       NOT NULL DEFAULT '[]',
  unidad_base     VARCHAR(20) CONSTRAINT fk_tipos_unidad_base
                  REFERENCES unidades(nombre) ON UPDATE CASCADE ON DELETE SET NULL,
  presentaciones  JSONB       NOT NULL DEFAULT '[]',
  activo          BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS insumos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(120)  NOT NULL,
  id_tipo         INTEGER       NOT NULL REFERENCES tipos_insumo(id),
  unidad_medida   VARCHAR(20)   NOT NULL CONSTRAINT fk_insumos_unidad
                  REFERENCES unidades(nombre) ON UPDATE CASCADE,
  stock_actual    NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  stock_minimo    NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  estado_critico  BOOLEAN       NOT NULL DEFAULT FALSE,
  activo          BOOLEAN       NOT NULL DEFAULT TRUE,
  imagen_url      VARCHAR(500),
  atributos       JSONB         NOT NULL DEFAULT '{}',
  creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Formas alternativas de contar un insumo: rollo = 20 metros, paquete = 100 u.
-- El stock se guarda siempre en insumos.unidad_medida (unidad base).
CREATE TABLE IF NOT EXISTS presentaciones (
  id         SERIAL PRIMARY KEY,
  id_insumo  INTEGER       NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  nombre     VARCHAR(40)   NOT NULL,
  factor     NUMERIC(12,3) NOT NULL CHECK (factor > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_presentacion_insumo_nombre ON presentaciones (id_insumo, lower(nombre));

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id                SERIAL PRIMARY KEY,
  id_insumo         INTEGER       NOT NULL REFERENCES insumos(id),
  tipo_movimiento   VARCHAR(10)   NOT NULL,
  cantidad          NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
  stock_resultante  NUMERIC(12,3) NOT NULL,
  observacion       TEXT,
  usuario           VARCHAR(60)   NOT NULL DEFAULT 'Sistema',
  fecha             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  presentacion          VARCHAR(40),
  cantidad_presentacion NUMERIC(12,3)
);

CREATE INDEX IF NOT EXISTS idx_insumos_tipo     ON insumos (id_tipo);
CREATE INDEX IF NOT EXISTS idx_insumos_critico  ON insumos (estado_critico) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_mov_insumo_fecha ON movimientos_stock (id_insumo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_fecha        ON movimientos_stock (fecha DESC);
