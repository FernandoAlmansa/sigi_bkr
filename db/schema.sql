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

-- ---------------------------------------------------------------------
-- Iteración 3 — reporte de consumo por período (migración 010)
-- ---------------------------------------------------------------------

-- Umbrales de cobertura. No se sobrescriben: la fila con vigente_hasta nulo
-- es la vigente; al cambiarlos se cierra esa y se crea otra.
CREATE TABLE IF NOT EXISTS umbral_cobertura (
  id                SERIAL PRIMARY KEY,
  dias_observacion  INTEGER     NOT NULL,
  dias_criticidad   INTEGER     NOT NULL CHECK (dias_criticidad > 0),
  egresos_minimos   INTEGER     NOT NULL CHECK (egresos_minimos >= 1),
  vigente_desde     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigente_hasta     TIMESTAMPTZ,
  definido_por      VARCHAR(60) NOT NULL DEFAULT 'Sistema',
  CONSTRAINT ck_umbral_observacion CHECK (dias_observacion > dias_criticidad)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_umbral_vigente ON umbral_cobertura ((vigente_hasta IS NULL))
  WHERE vigente_hasta IS NULL;
INSERT INTO umbral_cobertura (dias_observacion, dias_criticidad, egresos_minimos)
SELECT 30, 10, 5 WHERE NOT EXISTS (SELECT 1 FROM umbral_cobertura);

-- Cada reporte generado, con el período (fecha_desde, fecha_hasta, cantidad_dias),
-- el alcance (id_tipo nulo = todos los tipos) y el umbral con que se clasificó.
CREATE TABLE IF NOT EXISTS reporte_consumo (
  id                SERIAL PRIMARY KEY,
  fecha_generacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_desde       DATE        NOT NULL,
  fecha_hasta       DATE        NOT NULL,
  cantidad_dias     INTEGER     NOT NULL CHECK (cantidad_dias >= 1),
  criterio_orden    VARCHAR(15) NOT NULL CHECK (criterio_orden IN ('CRITICIDAD', 'CONSUMO', 'NOMBRE')),
  id_tipo           INTEGER     REFERENCES tipos_insumo(id),
  id_umbral         INTEGER     NOT NULL REFERENCES umbral_cobertura(id),
  solicitante       VARCHAR(60) NOT NULL DEFAULT 'Sistema',
  CONSTRAINT ck_reporte_periodo CHECK (fecha_hasta >= fecha_desde)
);

-- Una línea por insumo del reporte. promedio_diario y dias_cobertura quedan
-- nulos cuando no hay proyección (sin rotación o muestra insuficiente).
CREATE TABLE IF NOT EXISTS linea_consumo (
  id                SERIAL PRIMARY KEY,
  id_reporte        INTEGER       NOT NULL REFERENCES reporte_consumo(id) ON DELETE CASCADE,
  orden             INTEGER       NOT NULL,
  id_insumo         INTEGER       NOT NULL REFERENCES insumos(id),
  consumo_total     NUMERIC(12,3) NOT NULL CHECK (consumo_total >= 0),
  cantidad_egresos  INTEGER       NOT NULL CHECK (cantidad_egresos >= 0),
  promedio_diario   NUMERIC(12,4),
  stock_al_generar  NUMERIC(12,3) NOT NULL,
  dias_cobertura    NUMERIC(10,1),
  estado_cobertura  VARCHAR(25)   NOT NULL CHECK (estado_cobertura IN
                    ('CRITICA', 'EN_OBSERVACION', 'SUFICIENTE', 'MUESTRA_INSUFICIENTE', 'SIN_ROTACION')),
  CONSTRAINT uq_linea_reporte_insumo UNIQUE (id_reporte, id_insumo)
);

CREATE INDEX IF NOT EXISTS idx_movimiento_tipo_fecha ON movimientos_stock (tipo_movimiento, fecha);
