#!/usr/bin/env bash
# Copia un backup de producción a tu Postgres LOCAL (Mac), para desarrollar
# con los datos reales. No toca producción.
#
#   bash scripts/restaurar-en-local.sh base/sigi_bkr.sql
#
# La base local actual NO se borra: se renombra a sigi_bkr_viejo_<fecha>.
# Antes de correrlo, cortá `npm run dev` (no puede haber nadie conectado).
set -euo pipefail

ARCHIVO="${1:?Indicá el archivo de backup, ej: base/sigi_bkr.sql}"
DB="${DB_LOCAL:-sigi_bkr}"
OWNER="${DB_OWNER:-sigi_user}"
VIEJA="${DB}_viejo_$(date +%Y%m%d_%H%M%S)"
H=(-h "${HOST_LOCAL:-localhost}")   # igual que tu DATABASE_URL local

[ -s "$ARCHIVO" ] || { echo "No existe o está vacío: $ARCHIVO"; exit 1; }
grep -q 'CREATE TABLE public.insumos' "$ARCHIVO" || { echo "No parece un backup de SIGI-BKR"; exit 1; }

if psql "${H[@]}" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1; then
  echo "Guardando la base local actual como $VIEJA ..."
  psql "${H[@]}" -d postgres -qc "ALTER DATABASE \"$DB\" RENAME TO \"$VIEJA\""
fi

echo "Creando $DB (dueño: $OWNER) y cargando $ARCHIVO ..."
createdb "${H[@]}" -O "$OWNER" "$DB"
# Errores esperables e inofensivos: parámetros que sólo existen en Postgres 17
# (transaction_timeout) cuando el Postgres local es más viejo.
psql "${H[@]}" -q -U "$OWNER" -d "$DB" -f "$ARCHIVO" > /dev/null 2> restaurar-errores.log || true
grep -v -i 'transaction_timeout' restaurar-errores.log | grep -i 'error' && echo "⚠ Revisá los errores de arriba (restaurar-errores.log)" || echo "Carga sin errores relevantes."

psql "${H[@]}" -U "$OWNER" -d "$DB" -At -F ' | ' -c "
  SELECT 'insumos activos', COUNT(*)::text FROM insumos WHERE activo
  UNION ALL SELECT 'movimientos', COUNT(*)::text FROM movimientos_stock
  UNION ALL SELECT 'categorías', COUNT(*)::text FROM tipos_insumo
  UNION ALL SELECT 'último movimiento', COALESCE(MAX(fecha)::text, '-') FROM movimientos_stock"
echo
echo "Listo. Tu base anterior quedó como $VIEJA (borrala cuando confirmes que todo anda: dropdb $VIEJA)."
